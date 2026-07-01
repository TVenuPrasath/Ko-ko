import mongoose from "mongoose";

const diseaseReportSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  description: { type: String, required: true },
  photo: { type: String },
  status: { type: String, enum: ["Pending", "Reviewed"], default: "Pending" },
  reportedAt: { type: Date, default: Date.now },
});

export default mongoose.model("DiseaseReport", diseaseReportSchema);
