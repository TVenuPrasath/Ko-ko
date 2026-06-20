import mongoose from "mongoose";

const hamletSchema = new mongoose.Schema({
  name:    { type: String, required: true, unique: true },
  crpId:   { type: mongoose.Schema.Types.ObjectId, ref: "Crp" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Hamlet", hamletSchema);
