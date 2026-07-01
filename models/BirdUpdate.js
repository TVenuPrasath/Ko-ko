import mongoose from "mongoose";

const birdUpdateSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  weekDate: { type: String, required: true },
  chicks: { type: Number, default: 0 },
  growers: { type: Number, default: 0 },
  layers: { type: Number, default: 0 },
  broilers: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

// One update per user per week
birdUpdateSchema.index({ userId: 1, weekDate: 1 }, { unique: true });

export default mongoose.model("BirdUpdate", birdUpdateSchema);
