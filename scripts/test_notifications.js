import mongoose from "mongoose";
import dotenv from "dotenv";
import BirdBatch from "../models/BirdBatch.js";
import Vaccination from "../models/Vaccination.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { generateSchedule, getNotificationType, getFarmerMessage, getCrpMessage } from "../utils/scheduleEngine.js";
import { notifyUsers } from "../utils/notificationService.js";

dotenv.config();

function normalizeDate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function runTest() {
  console.log("🔌 Connecting to Database...");
  if (!process.env.MONGO_URI) {
    console.error("❌ MONGO_URI not found in env variables!");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected to Database.");

  try {
    // 1. Create or find test users
    console.log("\n👤 Checking test users...");
    let testFarmer = await User.findOne({ phone: "9999999999" });
    if (!testFarmer) {
      testFarmer = await User.create({
        name: "Test Farmer",
        phone: "9999999999",
        role: "SHG Member",
        approved: true,
        hamlet: "Test Hamlet",
        street: "Test Street",
        houseNo: "123",
        shg_name: "Test SHG",
      });
      console.log("➕ Created test farmer user.");
    } else {
      console.log("👍 Found existing test farmer user.");
    }

    let testCrp = await User.findOne({ phone: "8888888888" });
    if (!testCrp) {
      testCrp = await User.create({
        name: "Test CRP",
        phone: "8888888888",
        role: "CRP",
        approved: true,
      });
      console.log("➕ Created test CRP user.");
    } else {
      console.log("👍 Found existing test CRP user.");
    }

    // 2. Clean up any prior test batches/notifications for this farmer
    await BirdBatch.deleteMany({ userId: testFarmer._id });
    await Vaccination.deleteMany({ userId: testFarmer._id });
    await Notification.deleteMany({ recipient_ids: testFarmer._id });

    // 3. Create a test bird batch with batchDate = 11 days ago
    // This makes day 14 (IBD Vaccine) scheduled for 3 days from now
    const batchDate = new Date();
    batchDate.setDate(batchDate.getDate() - 11);
    
    console.log(`\n📦 Creating a test batch starting 11 days ago (${batchDate.toDateString()})...`);
    const batch = await BirdBatch.create({
      userId: testFarmer._id,
      batchName: "Test Notification Batch",
      numberOfChicks: 100,
      activeBirdCount: 100,
      batchDate: batchDate,
    });
    console.log("✅ Test batch created.");

    // 4. Generate Vaccination schedule for this batch
    console.log("\n📅 Generating schedule...");
    const schedule = generateSchedule(batch.batchDate);
    console.log(`Generated schedule with ${schedule.length} events.`);

    const today = normalizeDate(new Date());
    const crpIds = [testCrp._id.toString()];

    let triggeredNotificationsCount = 0;

    // 5. Run the notification checks for this batch
    for (const event of schedule) {
      const eventDate = normalizeDate(event.scheduledDate);
      const diffDays = Math.round((eventDate - today) / 86400000);
      
      console.log(`Checking Event: ${event.type} | Scheduled: ${eventDate.toDateString()} | Days Until: ${diffDays}`);

      const notificationType = getNotificationType(event.type, diffDays);
      if (!notificationType) {
        continue;
      }

      console.log(`🎯 Match found! Notification type: ${notificationType}`);

      const title = notificationType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const farmerMsg = getFarmerMessage(event, diffDays);
      const crpMsg = getCrpMessage(event, diffDays, testFarmer);

      const payload = {
        batchId: batch._id.toString(),
        vaccinationType: event.type,
        scheduledDate: eventDate.toISOString(),
        reminderType: notificationType,
      };

      if (farmerMsg) {
        console.log(`  Farmer Message: "${farmerMsg}"`);
        const sent = await notifyUsers([testFarmer._id.toString()], {
          batchId: batch._id,
          type: notificationType,
          title,
          message: `[${batch.batchName}] ${farmerMsg}`,
          hamlet: testFarmer.hamlet,
          shg_name: testFarmer.shg_name,
          payload,
        });
        console.log(`  Notification sent status:`, sent.length ? "Saved to DB" : "Skipped (likely duplicate)");
        if (sent.length) triggeredNotificationsCount++;
      }

      if (crpMsg && crpIds.length) {
        console.log(`  CRP Message: "${crpMsg}"`);
        const sent = await notifyUsers(crpIds, {
          batchId: batch._id,
          type: notificationType,
          title,
          message: `[${batch.batchName}] ${crpMsg}`,
          hamlet: testFarmer.hamlet,
          shg_name: testFarmer.shg_name,
          payload,
        });
        console.log(`  CRP Notification status:`, sent.length ? "Saved to DB" : "Skipped");
      }
    }

    console.log(`\n🎉 Verification finished. Triggered notifications saved to DB: ${triggeredNotificationsCount}`);

    // Query DB to see the saved notifications
    const dbNotifs = await Notification.find({ batch_id: batch._id });
    console.log(`\n🔍 Verifying stored notifications in DB count: ${dbNotifs.length}`);
    dbNotifs.forEach((n) => {
      console.log(`  - Title: "${n.title}"`);
      console.log(`    Message: "${n.message}"`);
      console.log(`    Status: "${n.status}"`);
    });

    // Cleanup test data
    console.log("\n🧹 Cleaning up test batch and notifications...");
    await BirdBatch.deleteOne({ _id: batch._id });
    await Notification.deleteMany({ batch_id: batch._id });
    console.log("🧹 Cleanup complete.");

  } catch (error) {
    console.error("❌ Error running test:", error);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from Database.");
  }
}

runTest();
