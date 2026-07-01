import mongoose from "mongoose";

const streetSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  hamletId: { type: mongoose.Schema.Types.ObjectId, ref: "Hamlet", required: true },
  createdAt: { type: Date, default: Date.now },
});

streetSchema.index({ name: 1, hamletId: 1 }, { unique: true });

export default mongoose.model("Street", streetSchema);
