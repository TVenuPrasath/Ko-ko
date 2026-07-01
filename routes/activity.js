import express from "express";
import BirdUpdate from "../models/BirdUpdate.js";
import ServiceDemand from "../models/ServiceDemand.js";
import DiseaseReport from "../models/DiseaseReport.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// GET /api/activity — CRP gets recent activity feed
router.get("/", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP") return res.status(403).json({ message: "Forbidden" });

    const [birds, demands, disease] = await Promise.all([
      BirdUpdate.find().sort({ createdAt: -1 }).limit(30).populate("userId", "name hamlet"),
      ServiceDemand.find().sort({ createdAt: -1 }).limit(30).populate("userId", "name hamlet"),
      DiseaseReport.find().sort({ reportedAt: -1 }).limit(30).populate("userId", "name hamlet"),
    ]);

    const feed = [
      ...birds.map((b) => ({
        _id: b._id,
        farmerName: b.userId?.name || "—",
        hamlet: b.userId?.hamlet || "—",
        action: `கோழி எண்ணிக்கை புதுப்பித்தார் (குஞ்சு: ${b.chicks}, வளர்ச்சி: ${b.growers}, முட்டை: ${b.layers}, கறி: ${b.broilers})`,
        type: "bird",
        createdAt: b.createdAt,
      })),
      ...demands.map((d) => ({
        _id: d._id,
        farmerName: d.userId?.name || d.farmerName || "—",
        hamlet: d.userId?.hamlet || d.hamlet || "—",
        action: `${d.type} கோரிக்கை அனுப்பினார்${d.amount ? ` (₹${d.amount.toLocaleString()})` : d.quantity ? ` (Qty: ${d.quantity})` : ""}`,
        type: "service",
        createdAt: d.createdAt,
      })),
      ...disease.map((r) => ({
        _id: r._id,
        farmerName: r.userId?.name || "—",
        hamlet: r.userId?.hamlet || "—",
        action: `நோய் அறிக்கை அனுப்பினார்`,
        type: "disease",
        createdAt: r.reportedAt,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
     .slice(0, 50);

    res.json(feed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
