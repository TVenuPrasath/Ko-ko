import mongoose from "mongoose";

const birdBatchSchema = new mongoose.Schema({
  userId:          { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  batchName:       { type: String, default: "Batch 1" },   // default so old docs don't break
  numberOfChicks:  { type: Number, default: 0 },
  activeBirdCount: { type: Number, default: 0 },
  mortalityCount:  { type: Number, default: 0 },
  batchDate:       { type: Date, required: true },
  batchStatus:     { type: String, enum: ["active", "inactive"], default: "active" },
  createdAt:       { type: Date, default: Date.now },
  updatedAt:       { type: Date, default: Date.now },
});

export default mongoose.model("BirdBatch", birdBatchSchema);
