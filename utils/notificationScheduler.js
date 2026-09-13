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

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// Client is in Tamil Nadu — "Day 1 of the month" / "Friday" must follow the India
// calendar regardless of the server host's own timezone (e.g. Render runs UTC).
function getIstDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day), weekday: map.weekday };
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

    const activeFarmers = await User.find({ role: "SHG Member", approved: true });

    // Monthly vaccination-stock entry reminder — Day 1 of the month, India calendar (Asia/Kolkata).
    // Separate from the 30-day age-progression logic and the 14-day resubmission nudge below.
    if (getIstDateParts(new Date()).day === 1 && activeFarmers.length) {
      await notifyUsers(
        activeFarmers.map((farmer) => farmer._id.toString()),
        {
          type: "vaccination_stock_monthly_reminder",
          title: "Vaccination Stock Update",
          message: "இன்று மாதத்தின் முதல் நாள் — உங்கள் தடுப்பூசி இருப்பு விவரங்களை பதிவு செய்யவும் / Today is the 1st of the month — please enter/update your vaccination stock.",
        }
      );
    }

    // Weekly stock entry reminder — every Friday, India calendar (Asia/Kolkata).
    // Client requirement #4. Separate feature from vaccination-stock reminders above
    // and from BirdUpdate/SaleStock submission logic (neither is modified by this).
    if (getIstDateParts(new Date()).weekday === "Fri" && activeFarmers.length) {
      await notifyUsers(
        activeFarmers.map((farmer) => farmer._id.toString()),
        {
          type: "weekly_stock_reminder",
          title: "Weekly Stock Update",
          message: "இன்று வெள்ளிக்கிழமை — உங்கள் தற்போதைய வாராந்திர இருப்பு எண்ணிக்கையை பதிவு செய்யவும். இது ஞாயிற்றுக்கிழமை விற்பனையை திட்டமிட உதவும் / Today is Friday — please enter/update your current weekly stock numbers. This helps plan sales for Sunday.",
        }
      );
    }

    // Remind farmers to enter vaccination stock once in 2 weeks
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

    // Auto-progress monthly vaccination stock categories every 30 days
    const CATEGORY_ORDER = ["withinMonth", "month2", "month3", "month4Plus"];
    const CATEGORY_LABELS = {
      withinMonth: "Within 1 month -- Lasota",
      month2: "2 months old -- Fowl Pox",
      month3: "3 months old -- Infectious Coryza",
      month4Plus: "4 to 7 months & above -- RDVK + Deworming",
    };
    const CATEGORY_TAMIL = {
      withinMonth: "1 மாதத்திற்குள் -- Lasota",
      month2: "2 மாத வயது -- Fowl Pox",
      month3: "3 மாத வயது -- Infectious Coryza",
      month4Plus: "4 முதல் 7 மாதங்கள் மேல் -- RDVK + Deworming",
    };

    const allStocks = await VaccinationStock.find().populate("userId");
    for (const stock of allStocks) {
      const lastProgressed = new Date(stock.lastProgressedAt || stock.entryDate);
      const daysSince = Math.floor((today - lastProgressed) / 86400000);
      if (daysSince < 30) continue;

      const updated = {
        withinMonth: 0,
        month2: stock.withinMonth || 0,
        month3: stock.month2 || 0,
        month4Plus: (stock.month3 || 0) + (stock.month4Plus || 0),
      };
      updated.lastProgressedAt = new Date();
      updated.updatedAt = new Date();

      // Birds actually moved into a new category — that category now needs its own
      // vaccination action, so a stale "completed" status from the previous category
      // must not hide it from the CRP.
      const hadMovement = (stock.withinMonth || 0) + (stock.month2 || 0) + (stock.month3 || 0) > 0;
      if (hadMovement) updated.status = "pending";

      await VaccinationStock.findByIdAndUpdate(stock._id, updated);

      // Send notifications for each newly progressed category
      const farmer = stock.userId;
      if (!farmer) continue;
      for (let i = 1; i < CATEGORY_ORDER.length; i++) {
        const nextCat = CATEGORY_ORDER[i];
        const count = stock[CATEGORY_ORDER[i - 1]] || 0; // birds moving into nextCat
        if (!count) continue;
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

    // RDVK (month4Plus) 3-month recurrence — client requirement #3.
    // Independent of the age-progression above and completely separate from
    // scheduleEngine.js / System B (BirdBatch, R2B, 120-day booster schedule).
    const rdvkStocks = await VaccinationStock.find({ month4Plus: { $gt: 0 } }).populate("userId");
    for (const stock of rdvkStocks) {
      if (!stock.rdvkNextDueAt) {
        // First time this farmer has RDVK-eligible (month4Plus) birds. Anchor the
        // recurrence to the same "vaccination date" already used elsewhere in this
        // workflow (entryDate + 3 days), then RDVK repeats every 3 months from there.
        const firstRdvkDate = new Date(stock.entryDate);
        firstRdvkDate.setDate(firstRdvkDate.getDate() + 3);
        await VaccinationStock.findByIdAndUpdate(stock._id, {
          rdvkNextDueAt: addMonths(firstRdvkDate, 3),
        });
        continue;
      }

      if (today < normalizeDate(stock.rdvkNextDueAt)) continue;

      // Advance the stored due date before/with the notification so a re-run of this
      // check (same day or later) can never fire the same RDVK cycle twice.
      const nextDueAt = addMonths(stock.rdvkNextDueAt, 3);
      await VaccinationStock.findByIdAndUpdate(stock._id, {
        status: "pending",
        rdvkNextDueAt: nextDueAt,
      });

      const farmer = stock.userId;
      if (!farmer) continue;

      await notifyUsers([farmer._id.toString()], {
        type: "vaccination_reminder",
        title: "RDVK + Deworming Due",
        message: `${stock.month4Plus} birds are now due for RDVK + Deworming (4 to 7 months & above -- repeats every 3 months)`,
        payload: { category: "month4Plus", count: stock.month4Plus, vaccine: "RDVK + Deworming" },
      });
      if (crpIds.length) {
        await notifyUsers(crpIds, {
          type: "vaccination_reminder",
          title: "RDVK + Deworming Due",
          message: `${farmer.name || "Farmer"}'s ${stock.month4Plus} birds are now due for RDVK + Deworming (repeat)`,
          payload: { category: "month4Plus", count: stock.month4Plus, vaccine: "RDVK + Deworming", farmerId: farmer._id.toString() },
        });
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
