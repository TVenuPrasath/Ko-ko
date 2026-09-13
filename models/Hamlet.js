import mongoose from "mongoose";

const hamletSchema = new mongoose.Schema({
  // Deprecated — kept for backward compatibility until callers migrate to nameTa/nameEn.
  name:    { type: String, required: true, unique: true },
  nameTa:  { type: String, required: true },
  // sparse: existing documents have no nameEn yet; without sparse, MongoDB's unique
  // index build would fail on the second document sharing a missing (null) key.
  nameEn:  { type: String, required: true, unique: true, sparse: true },
  crpId:   { type: mongoose.Schema.Types.ObjectId, ref: "Crp" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Hamlet", hamletSchema);
