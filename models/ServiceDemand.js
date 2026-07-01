import mongoose from "mongoose";

const serviceDemandSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  farmerName: { type: String },
  hamlet: { type: String },
  type: {
    type: String,
    enum: ["Vaccination", "Deworming", "Feed Stock", "Loan", "Equipment"],
    required: true,
  },
  option: { type: String },        // selected feed/equipment option
  quantity: { type: Number, required: true },
  amount: { type: Number },        // for Loan requests — amount in ₹
  notes: { type: String },         // purpose / extra details
  status: { type: String, enum: ["Pending", "Completed", "Rejected"], default: "Pending" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("ServiceDemand", serviceDemandSchema);
