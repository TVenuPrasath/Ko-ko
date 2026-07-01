import mongoose from "mongoose";

const saleStockSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  farmerName: String,
  hamlet: String,
  phone: String,
  broilers: { type: Number, default: 0 },
  chicks: { type: Number, default: 0 },
  eggs: { type: Number, default: 0 },
  status: { type: String, enum: ["available", "sold"], default: "available" },
  createdAt: { type: Date, default: Date.now },
  soldAt: { type: Date },
});

export default mongoose.model("SaleStock", saleStockSchema);
