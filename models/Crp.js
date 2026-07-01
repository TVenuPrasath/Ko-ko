import mongoose from "mongoose";

const crpSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  phone:       { type: String, required: true, unique: true },
  designation: { type: String, enum: ["CRP", "PLF Representative", "Animal Husbandry Officer"], default: "CRP" },
  assignedLocation: { type: String },
  assignedHamlets: [{ type: mongoose.Schema.Types.ObjectId, ref: "Hamlet" }],
  status:      { type: String, enum: ["Active", "Inactive"], default: "Active" },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
});

export default mongoose.model("Crp", crpSchema);
