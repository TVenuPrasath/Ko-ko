import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./models/User.js";
import BirdUpdate from "./models/BirdUpdate.js";
import ServiceDemand from "./models/ServiceDemand.js";
import Vaccination from "./models/Vaccination.js";
import DiseaseReport from "./models/DiseaseReport.js";
import Notification from "./models/Notification.js";
import MarketPrice from "./models/MarketPrice.js";
import SaleStock from "./models/SaleStock.js";
import Shg from "./models/Shg.js";

dotenv.config();

async function clearDb() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ MongoDB Connected");

  const args = process.argv.slice(2);
  const keepCrp = !args.includes("--all");

  if (keepCrp) {
    // Default: clear only farmers and all records, keep CRP accounts
    const farmers = await User.deleteMany({ role: "SHG Member" });
    const birds    = await BirdUpdate.deleteMany({});
    const demands  = await ServiceDemand.deleteMany({});
    const vax      = await Vaccination.deleteMany({});
    const disease  = await DiseaseReport.deleteMany({});
    const notifs   = await Notification.deleteMany({});
    const stocks   = await SaleStock.deleteMany({});

    console.log(`🗑️  Farmers deleted:        ${farmers.deletedCount}`);
    console.log(`🗑️  Bird updates deleted:   ${birds.deletedCount}`);
    console.log(`🗑️  Service demands deleted:${demands.deletedCount}`);
    console.log(`🗑️  Vaccinations deleted:   ${vax.deletedCount}`);
    console.log(`🗑️  Disease reports deleted:${disease.deletedCount}`);
    console.log(`🗑️  Notifications deleted:  ${notifs.deletedCount}`);
    console.log(`🗑️  Sale stocks deleted:    ${stocks.deletedCount}`);
    console.log("\n✅ Cleared all data (CRP accounts kept)");
    console.log("💡 To also delete CRP accounts run: node clearDb.js --all");
  } else {
    // --all flag: wipe everything including CRP
    await User.deleteMany({});
    await BirdUpdate.deleteMany({});
    await ServiceDemand.deleteMany({});
    await Vaccination.deleteMany({});
    await DiseaseReport.deleteMany({});
    await Notification.deleteMany({});
    await MarketPrice.deleteMany({});
    await SaleStock.deleteMany({});
    await Shg.deleteMany({});
    console.log("🗑️  ALL collections wiped including CRP accounts and SHG groups");
    console.log("✅ Database is now completely empty");
  }

  process.exit(0);
}

clearDb().catch((err) => { console.error(err); process.exit(1); });
