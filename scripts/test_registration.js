import mongoose from "mongoose";
import dotenv from "dotenv";
import Hamlet from "../models/Hamlet.js";
import Street from "../models/Street.js";
import Crp from "../models/Crp.js";
import User from "../models/User.js";

dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 5000}/api`;

async function testRegistration() {
  console.log("🔌 Connecting to DB to seed test data...");
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ Connected.");

  // Clean up any stale test data first
  await User.deleteMany({ phone: { $in: ["9999900001", "9999900002", "9999900003"] } });
  await Crp.deleteMany({ phone: "9999999991" });
  await Hamlet.deleteMany({ name: { $in: ["Test Hamlet A", "Test Hamlet B"] } });
  await Street.deleteMany({ name: { $in: ["Test Street 1", "Test Street 2"] } });

  let testCrp, testHamletA, testHamletB, testStreet1, testStreet2;

  try {
    // 1. Create a test CRP
    testCrp = await Crp.create({
      name: "Test CRP Registration",
      phone: "9999999991",
      designation: "CRP",
      assignedLocation: "Test Area",
      status: "Active",
    });
    console.log("👤 Seeded test CRP.");

    // 2. Create Hamlets
    testHamletA = await Hamlet.create({
      name: "Test Hamlet A",
      crpId: testCrp._id,
    });
    testHamletB = await Hamlet.create({
      name: "Test Hamlet B",
      crpId: null, // Hamlet with no CRP assigned
    });
    console.log("🏡 Seeded test Hamlets.");

    // 3. Create Streets
    testStreet1 = await Street.create({
      name: "Test Street 1",
      hamletId: testHamletA._id,
    });
    testStreet2 = await Street.create({
      name: "Test Street 2",
      hamletId: testHamletB._id,
    });
    console.log("🛣️  Seeded test Streets.");

    // Now, perform POST requests
    console.log("\n🧪 Running API Registration Tests...");

    // Test Case 1: Missing hamletId and streetId
    console.log("\nTest Case 1: Missing hamletId and streetId");
    try {
      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: "9999900001",
          name: "Test Farmer 1",
          houseNo: "123",
          shg_name: "Test SHG",
        }),
      });
      const data = await res.json();
      console.log(`Status: ${res.status}`);
      console.log(`Message: ${data.message}`);
      if (res.status === 400 && data.message.includes("required")) {
        console.log("✅ Passed");
      } else {
        console.log("❌ Failed");
      }
    } catch (err) {
      console.error("Test Case 1 Error:", err);
    }

    // Test Case 2: Invalid hamletId
    console.log("\nTest Case 2: Invalid hamletId");
    try {
      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: "9999900001",
          name: "Test Farmer 1",
          hamletId: new mongoose.Types.ObjectId().toString(),
          streetId: testStreet1._id.toString(),
          houseNo: "123",
          shg_name: "Test SHG",
        }),
      });
      const data = await res.json();
      console.log(`Status: ${res.status}`);
      console.log(`Message: ${data.message}`);
      if (res.status === 400 && data.message.includes("Invalid Hamlet")) {
        console.log("✅ Passed");
      } else {
        console.log("❌ Failed");
      }
    } catch (err) {
      console.error("Test Case 2 Error:", err);
    }

    // Test Case 3: Street belongs to a different hamlet
    console.log("\nTest Case 3: Street does not belong to Hamlet");
    try {
      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: "9999900001",
          name: "Test Farmer 1",
          hamletId: testHamletA._id.toString(),
          streetId: testStreet2._id.toString(), // belongs to Hamlet B
          houseNo: "123",
          shg_name: "Test SHG",
        }),
      });
      const data = await res.json();
      console.log(`Status: ${res.status}`);
      console.log(`Message: ${data.message}`);
      if (res.status === 400 && data.message.includes("does not belong")) {
        console.log("✅ Passed");
      } else {
        console.log("❌ Failed");
      }
    } catch (err) {
      console.error("Test Case 3 Error:", err);
    }

    // Test Case 4: Successful Registration & CRP Auto-assignment
    console.log("\nTest Case 4: Successful Registration & CRP Auto-assignment");
    try {
      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: "9999900001",
          name: "Test Farmer 1",
          hamletId: testHamletA._id.toString(),
          streetId: testStreet1._id.toString(),
          houseNo: "123",
          shg_name: "Test SHG",
        }),
      });
      const data = await res.json();
      console.log(`Status: ${res.status}`);
      console.log("Response user fields:", {
        name: data.user?.name,
        hamletId: data.user?.hamletId,
        streetId: data.user?.streetId,
        crpId: data.user?.crpId,
        hamlet: data.user?.hamlet,
        street: data.user?.street,
      });

      if (res.status === 201 && data.success) {
        // Query DB to verify
        const dbUser = await User.findOne({ phone: "9999900001" });
        if (
          dbUser &&
          dbUser.crpId &&
          dbUser.crpId.toString() === testCrp._id.toString() &&
          dbUser.hamlet === "Test Hamlet A" &&
          dbUser.street === "Test Street 1"
        ) {
          console.log("✅ Passed (Successfully registered and assigned to correct CRP)");
        } else {
          console.log("❌ Failed DB Verification", dbUser);
        }
      } else {
        console.log("❌ Failed API call");
      }
    } catch (err) {
      console.error("Test Case 4 Error:", err);
    }

  } catch (err) {
    console.error("Setup Error:", err);
  } finally {
    console.log("\n🧹 Cleaning up seeded test data...");
    if (testCrp) await Crp.deleteOne({ _id: testCrp._id });
    if (testHamletA) await Hamlet.deleteOne({ _id: testHamletA._id });
    if (testHamletB) await Hamlet.deleteOne({ _id: testHamletB._id });
    if (testStreet1) await Street.deleteOne({ _id: testStreet1._id });
    if (testStreet2) await Street.deleteOne({ _id: testStreet2._id });
    await User.deleteMany({ phone: { $in: ["9999900001", "9999900002", "9999900003"] } });
    console.log("🧹 Cleanup complete.");

    await mongoose.disconnect();
    console.log("🔌 Disconnected from DB.");
  }
}

testRegistration();
