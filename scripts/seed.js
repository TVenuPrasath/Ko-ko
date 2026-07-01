import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../models/User.js";
import Crp from "../models/Crp.js";
import Hamlet from "../models/Hamlet.js";

dotenv.config();

const CRP_HAMLET_MAP = [
  { name: "Thamarai Selvi", phone: "8883694239", designation: "CRP", assignedLocation: "Namakkal",        hamlets: ["Namakkal"] },
  { name: "Jayanthi",       phone: "9655792497", designation: "CRP", assignedLocation: "Mohanur",         hamlets: ["Mohanur"] },
  { name: "Vennila",        phone: "7402506372", designation: "CRP", assignedLocation: "Mallasamudram",   hamlets: ["Mallasamudram"] },
  { name: "Palaniyammal",   phone: "9688765143", designation: "CRP", assignedLocation: "Pallipalayam",   hamlets: ["Pallipalayam"] },
  { name: "Kalaiselvi",     phone: "9500365785", designation: "CRP", assignedLocation: "Konangipatti",   hamlets: ["Konangipatti"] },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  // 1. Create Admin
  if (!(await User.findOne({ role: "ADMIN" }))) {
    const password = await bcrypt.hash("Admin@123", 10);
    const admin = await User.create({ name: "Admin", phone: "0000000000", password, role: "ADMIN", approved: true });
    console.log("✅ Admin created — Phone: 0000000000 | Password: Admin@123");
    console.log("   ⚠️  Change password after first login!");
  } else {
    console.log("Admin already exists — skipping");
  }

  // 2. Seed CRPs + Hamlet assignments
  for (const entry of CRP_HAMLET_MAP) {
    let crp = await Crp.findOne({ phone: entry.phone });
    if (!crp) {
      crp = await Crp.create({ name: entry.name, phone: entry.phone, designation: entry.designation, assignedLocation: entry.assignedLocation, status: "Active" });
      console.log(`✅ CRP created: ${entry.name} (${entry.phone})`);
    } else {
      console.log(`CRP exists: ${entry.name} — skipping`);
    }

    // Create CRP User account if missing
    if (!(await User.findOne({ phone: entry.phone }))) {
      const hashed = await bcrypt.hash("changeme123", 10);
      await User.create({ name: entry.name, phone: entry.phone, password: hashed, role: "CRP", crpProfileId: crp._id, approved: true });
      console.log(`   CRP login created for ${entry.phone}`);
    }

    // Create hamlets and assign CRP
    for (const hamletName of entry.hamlets) {
      let hamlet = await Hamlet.findOne({ name: hamletName });
      if (!hamlet) {
        hamlet = await Hamlet.create({ name: hamletName, crpId: crp._id });
        console.log(`   Hamlet created: ${hamletName} → ${entry.name}`);
      } else if (!hamlet.crpId) {
        hamlet.crpId = crp._id;
        await hamlet.save();
        console.log(`   Hamlet updated: ${hamletName} → ${entry.name}`);
      }
    }
  }

  console.log("\n✅ Seed complete.");
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
