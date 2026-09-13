import mongoose from "mongoose";

const vaccinationStockSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  withinMonth: { type: Number, default: 0 },
  month2:      { type: Number, default: 0 },
  month3:      { type: Number, default: 0 },
  month4Plus:  { type: Number, default: 0 },
  entryDate:   { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ["pending", "completed"],
    default: "pending",
  },
  completedAt:       { type: Date },
  completedBy:       { type: String },
  lastProgressedAt:  { type: Date, default: Date.now },
  updatedAt:         { type: Date, default: Date.now },
  // Next due date for the RDVK (month4Plus) 3-month recurrence. Null until month4Plus first has birds.
  rdvkNextDueAt:     { type: Date, default: null },
});

export default mongoose.model("VaccinationStock", vaccinationStockSchema);
