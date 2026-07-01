import mongoose from "mongoose";

const deviceTokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  token: { type: String, required: true, unique: true },
  platform: { type: String, enum: ["android", "ios", "web", "unknown"], default: "unknown" },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

deviceTokenSchema.index({ userId: 1, token: 1 }, { unique: true });

deviceTokenSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model("DeviceToken", deviceTokenSchema);
