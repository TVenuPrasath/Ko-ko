import { generateSchedule, getNotificationType, getFarmerMessage, getCrpMessage } from "../utils/scheduleEngine.js";

// Mock data for verification
const mockFarmers = [
  { name: "Farmer Anbu", hamlet: "Konangipatti", street: "South Street", houseNo: "45A" },
  { name: "Farmer Banu", hamlet: "Kattur", street: "North Street", houseNo: "12B" },
];

const mockBatches = [
  { batchName: "Batch Alpha", batchDate: new Date("2026-06-01T00:00:00Z") },
  { batchName: "Batch Beta", batchDate: new Date("2026-06-15T00:00:00Z") },
];

const EXPECTED_SCHEDULE_OFFSETS = {
  F_vaccine: 14,
  IBD: 28,
  LaSota: 42,
  fowl_pox: 56,
  deworming: 70,
  R2B: 84,
  multivitamin: 98,
};

function normalizeDate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function runScheduleTests() {
  console.log("🧪 Starting Vaccination Schedule Engine Tests...");
  let overallPassed = true;

  for (const farmer of mockFarmers) {
    console.log(`\n👤 Testing for Farmer: ${farmer.name} (${farmer.hamlet})`);

    for (const batch of mockBatches) {
      console.log(`  📦 Testing for Batch: ${batch.batchName} (Base Date: ${batch.batchDate.toISOString().split("T")[0]})`);
      
      const base = normalizeDate(batch.batchDate);
      const schedule = generateSchedule(base, 5); // generate first 5 boosters

      // Verify basic events
      for (const [type, expectedOffset] of Object.entries(EXPECTED_SCHEDULE_OFFSETS)) {
        const event = schedule.find((e) => e.type === type);
        if (!event) {
          console.error(`  ❌ Error: Missing event type ${type}`);
          overallPassed = false;
          continue;
        }

        const actualDate = normalizeDate(event.scheduledDate);
        const expectedDate = new Date(base);
        expectedDate.setDate(expectedDate.getDate() + expectedOffset);
        const actualOffset = Math.round((actualDate - base) / (1000 * 60 * 60 * 24));

        if (actualOffset !== expectedOffset) {
          console.error(`  ❌ Error: ${type} day offset expected ${expectedOffset}, got ${actualOffset}`);
          overallPassed = false;
        } else {
          console.log(`  ✅ ${type}: Day ${actualOffset} (Date: ${actualDate.toISOString().split("T")[0]})`);
        }

        // Verify Notification Types
        if (type === "F_vaccine") {
          // should have no advance notification
          const notif = getNotificationType(type, 3);
          if (notif !== null) {
            console.error(`  ❌ Error: F_vaccine triggered notification reminder: ${notif}`);
            overallPassed = false;
          }
        } else if (type === "R2B") {
          // deworming at 3 days, r2b at 2 days
          const dewormNotif = getNotificationType(type, 3);
          const r2bNotif = getNotificationType(type, 2);
          if (dewormNotif !== "deworming_reminder" || r2bNotif !== "r2b_reminder") {
            console.error(`  ❌ Error: R2B notification type mismatch: 3d -> ${dewormNotif}, 2d -> ${r2bNotif}`);
            overallPassed = false;
          } else {
            console.log(`    🔔 R2B Notifications: 3 days -> deworming_reminder, 2 days -> r2b_reminder`);
          }
        } else {
          // other vaccines remind at 3 days
          const notif = getNotificationType(type, 3);
          if (notif !== "vaccination_reminder") {
            console.error(`  ❌ Error: ${type} did not trigger vaccination_reminder at 3 days (got ${notif})`);
            overallPassed = false;
          } else {
            console.log(`    🔔 ${type} Notification: 3 days -> vaccination_reminder`);
          }
        }
      }

      // Verify Booster repeats (first 5 boosters)
      console.log("  🔄 Verifying R2B Boosters...");
      const boosters = schedule.filter((e) => e.type === "R2B_booster");
      if (boosters.length !== 5) {
        console.error(`  ❌ Error: Expected 5 boosters, found ${boosters.length}`);
        overallPassed = false;
      }

      boosters.forEach((booster, index) => {
        const expectedOffset = 150 + 120 * index;
        const actualDate = normalizeDate(booster.scheduledDate);
        const actualOffset = Math.round((actualDate - base) / (1000 * 60 * 60 * 24));

        if (actualOffset !== expectedOffset) {
          console.error(`    ❌ Booster #${index + 1}: Expected offset ${expectedOffset}, got ${actualOffset}`);
          overallPassed = false;
        } else {
          console.log(`    ✅ Booster #${index + 1}: Day ${actualOffset} (Date: ${actualDate.toISOString().split("T")[0]})`);
        }
      });
    }
  }

  if (overallPassed) {
    console.log("\n🎉 ALL TESTS PASSED! Vaccination Schedule Engine works perfectly.");
  } else {
    console.error("\n❌ TESTS FAILED! Some schedule issues were found.");
    process.exit(1);
  }
}

runScheduleTests();
