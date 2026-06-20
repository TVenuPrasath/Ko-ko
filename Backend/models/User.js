import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: String,
  phone: { type: String, required: true, unique: true },
  password: { type: String },
  role: {
    type: String,
    enum: ["ADMIN", "CRP", "SHG Member"],
    default: "SHG Member"
  },
  // CRP reference (for CRP users — links to Crp collection)
  crpProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "Crp" },
  // Farmer address references
  hamletId:  { type: mongoose.Schema.Types.ObjectId, ref: "Hamlet" },
  streetId:  { type: mongoose.Schema.Types.ObjectId, ref: "Street" },
  crpId:     { type: mongoose.Schema.Types.ObjectId, ref: "Crp" },
  // Legacy string fields — kept for backward compat
  hamlet:   String,
  street:   String,
  houseNo:  String,
  shg_name: String,
  approved: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
});

export default mongoose.model("User", userSchema);