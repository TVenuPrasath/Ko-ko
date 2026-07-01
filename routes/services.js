import express from "express";
import ServiceDemand from "../models/ServiceDemand.js";
import User from "../models/User.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// POST /api/services — farmer requests a service
router.post("/", verifyToken, async (req, res) => {
  try {
    const { type, quantity, amount, notes, option } = req.body;
    if (!type || !quantity) return res.status(400).json({ message: "type and quantity are required" });

    const user = await User.findById(req.user.userId);

    const demand = await ServiceDemand.create({
      userId: req.user.userId,
      farmerName: user?.name || "",
      hamlet: user?.hamlet || "",
      type,
      option: option || "",
      quantity,
      amount: amount || null,
      notes: notes || "",
    });

    res.status(201).json(demand);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/services — farmer gets their own demands
router.get("/", verifyToken, async (req, res) => {
  try {
    const demands = await ServiceDemand.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(demands);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/services/all — CRP gets all demands
router.get("/all", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    const demands = await ServiceDemand.find()
      .populate("userId", "name phone hamlet street houseNo shg_name")
      .sort({ createdAt: -1 });
    res.json(demands);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/services/:id/complete — CRP marks demand as completed
router.patch("/:id/complete", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    const demand = await ServiceDemand.findByIdAndUpdate(
      req.params.id,
      { status: "Completed" },
      { new: true }
    );
    if (!demand) return res.status(404).json({ message: "Demand not found" });
    res.json(demand);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/services/:id/reject — CRP rejects a loan/demand
router.patch("/:id/reject", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    const demand = await ServiceDemand.findByIdAndUpdate(
      req.params.id,
      { status: "Rejected" },
      { new: true }
    );
    if (!demand) return res.status(404).json({ message: "Demand not found" });
    res.json(demand);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
