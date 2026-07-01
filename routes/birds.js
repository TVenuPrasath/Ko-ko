import express from "express";
import BirdUpdate from "../models/BirdUpdate.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

function getWeekString(date = new Date()) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split("T")[0];
}

// POST /api/birds — submit weekly update
router.post("/", verifyToken, async (req, res) => {
  try {
    const { chicks, growers, layers, broilers } = req.body;
    const weekDate = getWeekString();

    const existing = await BirdUpdate.findOne({ userId: req.user.userId, weekDate });
    if (existing) {
      return res.status(400).json({ message: "Already submitted this week" });
    }

    const update = await BirdUpdate.create({
      userId: req.user.userId,
      weekDate,
      chicks: chicks || 0,
      growers: growers || 0,
      layers: layers || 0,
      broilers: broilers || 0,
    });

    res.status(201).json(update);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/birds — get my bird updates
router.get("/", verifyToken, async (req, res) => {
  try {
    const updates = await BirdUpdate.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(updates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/birds/check-week — has user submitted this week?
router.get("/check-week", verifyToken, async (req, res) => {
  try {
    const weekDate = getWeekString();
    const existing = await BirdUpdate.findOne({ userId: req.user.userId, weekDate });
    res.json({ submitted: !!existing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/birds/all — CRP: get all farmers' latest updates
router.get("/all", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    const updates = await BirdUpdate.find()
      .populate("userId", "name phone hamlet street houseNo shg_name role")
      .sort({ createdAt: -1 });
    res.json(updates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
