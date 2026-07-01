import mongoose from "mongoose";

const buyerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  type: {
    type: String,
    enum: ["Individual", "Broker", "Retailer", "Hotel industry"],
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Buyer", buyerSchema);
