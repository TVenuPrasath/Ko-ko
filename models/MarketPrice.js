import mongoose from "mongoose";

const marketPriceSchema = new mongoose.Schema({
  broiler: { type: Number, required: true },
  chick: { type: Number, required: true },
  egg: { type: Number, required: true },
  updatedBy: { type: String },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.model("MarketPrice", marketPriceSchema);
