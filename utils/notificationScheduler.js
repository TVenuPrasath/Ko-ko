import cron from "node-cron";
import BirdBatch from "../models/BirdBatch.js";
import Vaccination from "../models/Vaccination.js";
import User from "../models/User.js";
import VaccinationStock from "../models/VaccinationStock.js";
import Notification from "../models/Notification.js";
import { generateSchedule, getNotificationType, getFarmerMessage, getCrpMessage } from "./scheduleEngine.js";
import { notifyUsers, notifyUsersByRole, retryFailedNotifications } from "./notificationService.js";

function normalizeDate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

async function runDailyCheck() {
  try {
    const today = normalizeDate(new Date());
    const crpUsers = await User.find({ role: "CRP" }, { _id: 1 });
    const crpIds = crpUsers.map((user) => user._id.toString());

    const batches = await BirdBatch.find({ batchStatus: "active" }).populate("userId");

    for (const batch of batches) {
      const farmer = batch.userId;
      if (!farmer) continue;

      const schedule = generateSchedule(batch.batchDate);

      for (const event of schedule) {
        const eventDate = normalizeDate(event.scheduledDate);
        const diffDays = Math.round((eventDate - today) / 86400000);
        const notificationType = getNotificationType(event.type, diffDays);
        if (!notificationType) continue;

        const existed = await Vaccination.findOne({
          batchId: batch._id,
          type: event.type,
          scheduledDate: eventDate,
          status: { $in: ["completed", "missed"] },
        });
        if (existed) continue;

        const title = notificationType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const farmerMsg = getFarmerMessage(event, diffDays);
        const crpMsg = getCrpMessage(event, diffDays, farmer);
        if (!farmerMsg && !crpMsg) continue;

        const payload = {
          batchId: batch._id.toString(),
          vaccinationType: event.type,
          scheduledDate: eventDate.toISOString(),
          reminderType: notificationType,
        };

        // Notify farmer
        if (farmerMsg) {
          await notifyUsers([farmer._id.toString()], {
            batchId: batch._id,
            type: notificationType,
            title,
            message: `[${batch.batchName}] ${farmerMsg}`,
            hamlet: farmer.hamlet,
            shg_name: farmer.shg_name,
            payload,
          });
        }

        // Notify CRP separately with CRP-specific message
        if (crpMsg && crpIds.length) {
          await notifyUsers(crpIds, {
            batchId: batch._id,
            type: notificationType,
            title,
            message: `[${batch.batchName}] ${crpMsg}`,
            hamlet: farmer.hamlet,
            shg_name: farmer.shg_name,
            payload,
          });
        }
      }
    }

    const overdueRecords = await Vaccination.find({
      status: "scheduled",
      scheduledDate: { $lt: today },
      batchId: { $exists: true },
    }).populate("userId");

    for (const record of overdueRecords) {
      const farmer = record.userId;
      const title = "Vaccine Overdue";
      const message = `Vaccination ${record.type} scheduled on ${formatDate(record.scheduledDate)} is overdue.`;
      await notifyUsers(
        crpIds,
        {
          batchId: record.batchId,
          type: "vaccine_overdue",
          title,
          message,
          hamlet: farmer?.hamlet,
          shg_name: farmer?.shg_name,
          payload: {
            batchId: record.batchId?.toString?.(),
            vaccinationId: record._id.toString(),
          },
        }
      );
    }

    const mortalityThreshold = Number(process.env.MORTALITY_THRESHOLD || 5);
    const mortalityBatches = await BirdBatch.find({ mortalityCount: { $gte: mortalityThreshold } }).populate("userId");

    for (const batch of mortalityBatches) {
      const farmer = batch.userId;
      const title = "Mortality Alert";
      const message = `Mortality count for ${batch.batchName} has exceeded threshold (${batch.mortalityCount}).`;
      await notifyUsers(
        crpIds,
        {
          batchId: batch._id,
          type: "mortality_alert",
          title,
          message,
          hamlet: farmer?.hamlet,
          shg_name: farmer?.shg_name,
          payload: {
            batchId: batch._id.toString(),
            mortalityCount: batch.mortalityCount,
          },
        }
      );
    }

    const pendingCount = await User.countDocuments({ role: "SHG Member", approved: false });
    if (pendingCount > 0) {
      await notifyUsersByRole(
        ["CRP"],
        {
          type: "approval_reminder",
          title: "Pending Approval Reminder",
          message: `There are ${pendingCount} farmer registrations pending approval. Please review them.`,
          payload: { pendingCount },
        }
      );
    }

    // Remind farmers to enter vaccination stock once in 2 weeks
    const activeFarmers = await User.find({ role: "SHG Member", approved: true });
    for (const farmer of activeFarmers) {
      const latestStock = await VaccinationStock.findOne({ userId: farmer._id }).sort({ createdAt: -1 });
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      if (!latestStock || latestStock.createdAt < fourteenDaysAgo) {
        const recentReminder = await Notification.findOne({
          type: "vaccination_stock_reminder",
          recipient_ids: farmer._id,
          created_at: { $gte: fourteenDaysAgo },
        });
        if (recentReminder) continue;

        await notifyUsers([farmer._id.toString()], {
          type: "vaccination_stock_reminder",
          title: "Vaccination Stock Update",
          message: "தயவுசெய்து உங்கள் தடுப்பூசி இருப்பு விவரங்களை சமர்ப்பிக்கவும் (2 வாரங்களுக்கு ஒருமுறை) / Please submit your vaccination stock update (once in 2 weeks)",
          payload: { userId: farmer._id.toString() },
        });
      }
    }

    // Auto-progress vaccination stock categories every 14 days
    const CATEGORY_ORDER = ["week0", "week2", "week4", "week6", "week8", "week10", "week12", "month4", "month5"];
    const CATEGORY_LABELS = {
      week0: "F Strain Vaccine", week2: "IBD Vaccine", week4: "LaSota Vaccine",
      week6: "Fowl Pox Vaccine", week8: "Dewormer", week10: "R2B + Dewormer",
      week12: "Multivitamins", month4: "Monitor (Booster Soon)", month5: "R2B Booster + Dewormer",
    };
    const CATEGORY_TAMIL = {
      week0: "1 வார வயதுக்குள்", week2: "2-3 வார வயது", week4: "4-5 வார வயது",
      week6: "6-7 வார வயது", week8: "8-9 வார வயது", week10: "10-11 வார வயது",
      week12: "12-13 வார வயது", month4: "4 மாதங்கள் ஆனவை", month5: "5 மாதங்கள் ஆனவை",
    };

    const allStocks = await VaccinationStock.find().populate("userId");
    for (const stock of allStocks) {
      const lastProgressed = new Date(stock.lastProgressedAt || stock.entryDate);
      const daysSince = Math.floor((today - lastProgressed) / 86400000);
      if (daysSince < 14) continue;

      // Shift each category to the next one
      const updated = {};
      for (let i = 0; i < CATEGORY_ORDER.length; i++) {
        const current = CATEGORY_ORDER[i];
        const next = CATEGORY_ORDER[i + 1];
        updated[current] = next ? (stock[next] || 0) : 0;
      }
      // Last category (month5) birds have completed the cycle — set to 0
      updated["month5"] = 0;
      updated.lastProgressedAt = new Date();
      updated.updatedAt = new Date();

      await VaccinationStock.findByIdAndUpdate(stock._id, updated);

      // Send notifications for each newly progressed category
      const farmer = stock.userId;
      if (!farmer) continue;
      for (let i = 0; i < CATEGORY_ORDER.length - 1; i++) {
        const nextCat = CATEGORY_ORDER[i];
        const count = stock[CATEGORY_ORDER[i + 1]] || 0; // birds moving into nextCat
        if (!count || nextCat === "month4") continue;
        const label = CATEGORY_LABELS[nextCat];
        const tamil = CATEGORY_TAMIL[nextCat];
        await notifyUsers([farmer._id.toString()], {
          type: "vaccination_reminder",
          title: label,
          message: `${count} birds are now due for ${label} (${tamil})`,
          payload: { category: nextCat, count, vaccine: label },
        });
        if (crpIds.length) {
          await notifyUsers(crpIds, {
            type: "vaccination_reminder",
            title: label,
            message: `${farmer.name || "Farmer"}'s ${count} birds are now due for ${label} (${tamil})`,
            payload: { category: nextCat, count, vaccine: label, farmerId: farmer._id.toString() },
          });
        }
      }
    }

    await retryFailedNotifications();
    console.log("✅ Notification scheduler check complete");
  } catch (err) {
    console.error("❌ Notification scheduler error:", err.message);
  }
}

export function startNotificationScheduler() {
  cron.schedule("0 8 * * *", runDailyCheck);
  console.log("📅 Vaccination notification scheduler started");
}
