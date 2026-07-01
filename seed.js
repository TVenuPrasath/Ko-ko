import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "./models/User.js";
import BirdUpdate from "./models/BirdUpdate.js";
import ServiceDemand from "./models/ServiceDemand.js";
import Vaccination from "./models/Vaccination.js";
import DiseaseReport from "./models/DiseaseReport.js";

dotenv.config();

// ── Helpers ───────────────────────────────────────────────────────────────────
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
function weekDate(daysBack) {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split("T")[0];
}

// ── Data ──────────────────────────────────────────────────────────────────────
const FIRST_NAMES = [
  "லக்ஷ்மி", "கவிதா", "மீனா", "சரோஜா", "கீதா", "அனிதா", "ரேவதி",
  "புஷ்பா", "செல்வி", "உமா", "தேவி", "பிரியா", "கமலா", "வசந்தி", "பாரதி",
  "ராணி", "மாலதி", "சுமதி", "ஜெயா", "நிர்மலா", "பத்மா", "வள்ளி", "சித்ரா",
  "மாலா", "இந்திரா", "ராதா", "சாந்தா", "பார்வதி", "கல்பனா", "தீபா",
  "ரேகா", "உஷா", "லதா", "விஜயா", "சரஸ்வதி", "நளினி", "ஹேமா",
  "பிரேமா", "சாந்தி", "அம்பிகா",
];
const LAST_NAMES = ["முருகன்", "ராஜன்", "குமார்", "செல்வம்", "வேலு", "கண்ணன்", "பாண்டி", "அரசு", "நாதன்", "சுந்தர்"];

const HAMLETS = ["கோணாங்கிபட்டி குக்கிராமம்", "காட்டூர் குக்கிராமம்"];

const STREETS = {
  "கோணாங்கிபட்டி குக்கிராமம்": ["வடக்கு தெரு", "கிழக்கு தெரு", "அம்பேத்கர் தெரு", "தெற்கு தெரு"],
  "காட்டூர் குக்கிராமம்": ["மேற்கு கல்லாங்குத்து தெரு", "காட்டூர் அரச மர தெரு", "காட்டூர் அங்கன் வாடி தெரு"],
};

const SHG_NAMES = [
  "சக்தி மகளிர் சுய உதவி குழு", "காட்டூர் 1", "காட்டூர் 2",
  "தாமரை மகளிர் சுய உதவி குழு", "சரஸ்வதி மகளிர் சுய உதவி குழு",
  "ஓம் சக்தி மகளிர் சுய உதவி குழு", "முல்லை மகளிர் சுய குழு",
  "ஶ்ரீ பாரதி மகளிர் சுய உதவி குழு", "அஞ்சலி மகளிர் சுய உதவி குழு",
  "அல்லி மகளிர் சுய உதவி குழு", "வசந்தம் மகளிர் சுய உதவி குழு",
  "தென்றல் மகளிர் சுய உதவி குழு", "குறிஞ்சி மகளிர் சுய உதவி குழு",
  "கோணாங்கிபட்டி 1", "கோணாங்கிபட்டி 2", "கோணாங்கிபட்டி 6", "கோணாங்கிபட்டி 7",
  "சாமந்தி மகளிர் சுய உதவி குழு", "பசும்பொன் மகளிர் சுய உதவி குழு",
  "தாழம்பூ மகளிர் சுய உதவி குழு", "புதுமைப்பெண் மகளிர் சுய உதவி குழு",
  "செம்பருத்தி மகளிர் சுய உதவி குழு", "வெண்ணிலா மகளிர் சுய உதவி குழு",
  "குங்குமம் மகளிர் சுய உதவி குழு",
];

const DEMAND_NOTES = {
  Loan:        ["குஞ்சுகள் வாங்க கடன் தேவை", "கொட்டகை கட்ட கடன் தேவை", "தீவனம் வாங்க கடன் தேவை", "உபகரணம் வாங்க கடன் தேவை"],
  "Feed Stock":["5 bags layer mash தேவை", "3 bags chick starter தேவை", "10 bags grower feed தேவை"],
  Equipment:   ["Water drinker உடைந்தது", "Feeder tray சேதமானது", "Cage repair தேவை"],
  Vaccination: ["வெள்ளை கழிச்சல் தடுப்பூசி தேவை", "அம்மை தடுப்பூசி தேவை", "Newcastle vaccine தேவை"],
  Deworming:   ["குடற்புழு நீக்கம் தேவை", "Deworming medicine தேவை"],
};

const DISEASE_DESCRIPTIONS = [
  "அறிகுறிகள்: வெள்ளை கழிச்சல் | நோய்வாய்: 3 | இறப்பு: 0",
  "அறிகுறிகள்: இறகு உதிர்வு, சோர்வு | நோய்வாய்: 5 | இறப்பு: 1",
  "அறிகுறிகள்: தீவனம் சாப்பிடவில்லை | நோய்வாய்: 2 | இறப்பு: 0",
  "அறிகுறிகள்: கழுத்து வளைவு | நோய்வாய்: 4 | இறப்பு: 0",
  "அறிகுறிகள்: சுவாச சிரமம் | நோய்வாய்: 6 | இறப்பு: 1",
  "திடீரென இறந்தன | நோய்வாய்: 1 | இறப்பு: 3",
];

// ── Main Seed ─────────────────────────────────────────────────────────────────
async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("✅ MongoDB Connected");

  // Clear only SHG Member farmers (keep CRP accounts)
  const deleted = await User.deleteMany({ role: "SHG Member" });
  await BirdUpdate.deleteMany({});
  await ServiceDemand.deleteMany({});
  await Vaccination.deleteMany({});
  await DiseaseReport.deleteMany({});
  console.log(`🗑️  Cleared ${deleted.deletedCount} existing farmers and all records`);

  const users = [];
  for (let i = 0; i < 100; i++) {
    const hamlet = HAMLETS[i % 2];
    users.push({
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      phone: `98421${String(10000 + i).padStart(5, "0")}`,
      role: "SHG Member",
      hamlet,
      street: pick(STREETS[hamlet]),
      houseNo: `${rand(1, 99)}`,
      shg_name: SHG_NAMES[i % SHG_NAMES.length],
      approved: true,
    });
  }

  const createdUsers = await User.insertMany(users);
  console.log(`👩‍🌾 Inserted ${createdUsers.length} farmers`);

  const birdUpdates = [];
  const demands = [];
  const vaccinations = [];
  const diseaseReports = [];

  for (const user of createdUsers) {
    // Bird updates — last 8 weeks (skip 1-2 randomly)
    const skipWeeks = new Set([rand(0, 1) === 0 ? 0 : -1, rand(0, 1) === 0 ? rand(1, 3) : -1]);
    for (let w = 0; w < 8; w++) {
      if (skipWeeks.has(w)) continue;
      birdUpdates.push({
        userId: user._id,
        weekDate: weekDate(w * 7),
        chicks:   rand(3, 20),
        growers:  rand(2, 15),
        layers:   rand(5, 25),
        broilers: rand(2, 12),
        createdAt: daysAgo(w * 7),
      });
    }

    // Service demands — 1 to 3 per farmer
    const demandTypes = ["Loan", "Feed Stock", "Equipment", "Vaccination", "Deworming"];
    const numDemands = rand(1, 3);
    for (let d = 0; d < numDemands; d++) {
      const type = pick(demandTypes);
      const isLoan = type === "Loan";
      demands.push({
        userId: user._id,
        farmerName: user.name,
        hamlet: user.hamlet,
        type,
        quantity: isLoan ? 1 : rand(1, 10),
        amount: isLoan ? rand(3, 20) * 1000 : undefined,
        notes: pick(DEMAND_NOTES[type]),
        status: pick(["Pending", "Pending", "Completed", "Rejected"]),
        createdAt: daysAgo(rand(1, 60)),
      });
    }

    // Vaccinations — 1 to 3 records
    const vaxTypes = ["white_diarrhea", "smallpox", "deworming"];
    const numVax = rand(1, 3);
    const usedTypes = new Set();
    for (let v = 0; v < numVax; v++) {
      const type = pick(vaxTypes.filter((t) => !usedTypes.has(t)));
      if (!type) break;
      usedTypes.add(type);
      const givenDaysAgo = rand(20, 90);
      vaccinations.push({
        userId: user._id,
        type,
        ageGroup: type === "white_diarrhea" ? "0-7 days" : type === "smallpox" ? "above 60 days" : undefined,
        dateGiven: daysAgo(givenDaysAgo),
        nextDueDate: rand(0, 1) === 0 ? daysFromNow(rand(5, 45)) : daysAgo(rand(1, 15)),
        status: "completed",
        createdAt: daysAgo(givenDaysAgo),
      });
    }

    // Disease reports — 30% chance of having 1
    if (rand(1, 10) <= 3) {
      diseaseReports.push({
        userId: user._id,
        description: pick(DISEASE_DESCRIPTIONS),
        status: pick(["Pending", "Pending", "Reviewed"]),
        reportedAt: daysAgo(rand(1, 60)),
      });
    }
  }

  await BirdUpdate.insertMany(birdUpdates);
  await ServiceDemand.insertMany(demands);
  await Vaccination.insertMany(vaccinations);
  await DiseaseReport.insertMany(diseaseReports);

  console.log(`🐦 Bird updates:    ${birdUpdates.length}`);
  console.log(`📋 Service demands: ${demands.length}`);
  console.log(`💉 Vaccinations:    ${vaccinations.length}`);
  console.log(`🦠 Disease reports: ${diseaseReports.length}`);
  console.log("\n✅ Seed complete!");
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
