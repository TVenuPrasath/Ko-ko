import mongoose from "mongoose";

// Each category maps to a vaccine/medicine
// Birds auto-progress to next category every 14 days
const vaccinationStockSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  // counts per age category
  week0:  { type: Number, default: 0 }, // under 1 week  → F Strain
  week2:  { type: Number, default: 0 }, // 2-3 weeks     → IBD
  week4:  { type: Number, default: 0 }, // 4-5 weeks     → LaSota
  week6:  { type: Number, default: 0 }, // 6-7 weeks     → Fowl Pox
  week8:  { type: Number, default: 0 }, // 8-9 weeks     → Dewormer
  week10: { type: Number, default: 0 }, // 10-11 weeks   → R2B + Dewormer
  week12: { type: Number, default: 0 }, // 12-13 weeks   → Multivitamins
  month4: { type: Number, default: 0 }, // 4 months      → Monitor
  month5: { type: Number, default: 0 }, // 5+ months     → R2B Booster + Dewormer
  entryDate: { type: Date, default: Date.now },
  lastProgressedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model("VaccinationStock", vaccinationStockSchema);
