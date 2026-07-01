import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";
import Crp from "../models/Crp.js";
import Hamlet from "../models/Hamlet.js";
import Street from "../models/Street.js";

dotenv.config();

// Known CRP-Hamlet mapping — extend as needed
const HAMLET_CRP_PHONE = {
  "Namakkal":      "8883694239",
  "Mohanur":       "9655792497",
  "Mallasamudram": "7402506372",
  "Pallipalayam":  "9688765143",
  "Konangipatti":  "9500365785",
};

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const farmers = await User.find({ role: "SHG Member", hamletId: { $exists: false } });
  console.log(`Found ${farmers.length} farmers without hamletId`);

  let updated = 0;

  for (const farmer of farmers) {
    if (!farmer.hamlet) continue;

    // Find or create hamlet
    let hamlet = await Hamlet.findOne({ name: farmer.hamlet });
    if (!hamlet) {
      // Try to find matching CRP
      const crpPhone = HAMLET_CRP_PHONE[farmer.hamlet];
      const crp = crpPhone ? await Crp.findOne({ phone: crpPhone }) : null;
      hamlet = await Hamlet.create({ name: farmer.hamlet, crpId: crp?._id || null });
      console.log(`Created hamlet: ${farmer.hamlet}${crp ? ` → CRP: ${crp.name}` : ""}`);
    }

    // Find or create street
    let street = null;
    if (farmer.street) {
      street = await Street.findOne({ name: farmer.street, hamletId: hamlet._id });
      if (!street) {
        street = await Street.create({ name: farmer.street, hamletId: hamlet._id });
      }
    }

    await User.findByIdAndUpdate(farmer._id, {
      hamletId: hamlet._id,
      streetId: street?._id || null,
      crpId: hamlet.crpId || null,
    });

    updated++;
  }

  // Also fix farmers with hamletId but no crpId
  const unassigned = await User.find({ role: "SHG Member", hamletId: { $exists: true }, crpId: { $exists: false } });
  for (const farmer of unassigned) {
    const hamlet = await Hamlet.findById(farmer.hamletId);
    if (hamlet?.crpId) {
      await User.findByIdAndUpdate(farmer._id, { crpId: hamlet.crpId });
      updated++;
    }
  }

  console.log(`✅ Migration complete. Updated ${updated} farmers.`);
  process.exit(0);
}

migrate().catch((err) => { console.error(err); process.exit(1); });
