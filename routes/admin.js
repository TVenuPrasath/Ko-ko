import express from "express";
import User from "../models/User.js";
import Crp from "../models/Crp.js";
import Hamlet from "../models/Hamlet.js";
import BirdBatch from "../models/BirdBatch.js";
import Buyer from "../models/Buyer.js";
import DiseaseReport from "../models/DiseaseReport.js";
import Notification from "../models/Notification.js";
import { verifyToken, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// GET /api/admin/stats — Retrieve aggregated dashboard statistics
router.get("/stats", verifyToken, requireAdmin, async (req, res) => {
  try {
    const totalFarmers = await User.countDocuments({ role: "SHG Member" });
    const totalCrps = await Crp.countDocuments();
    const totalHamlets = await Hamlet.countDocuments();

    const activeBatches = await BirdBatch.find({ batchStatus: "active" });
    const totalBirds = activeBatches.reduce((acc, b) => acc + (b.activeBirdCount || 0), 0);

    const totalBuyers = await Buyer.countDocuments();
    const totalDiseaseReports = await DiseaseReport.countDocuments();
    const totalNotifications = await Notification.countDocuments();

    res.json({
      totalFarmers,
      totalCrps,
      totalHamlets,
      totalBirds,
      totalBuyers,
      totalDiseaseReports,
      totalNotifications,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users — Retrieve all user profiles populated with references
router.get("/users", verifyToken, requireAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .populate("crpProfileId")
      .populate("hamletId")
      .populate("streetId")
      .populate("crpId")
      .sort({ created_at: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/toggle-approve — Approve or suspend user account
router.patch("/users/:id/toggle-approve", verifyToken, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.approved = !user.approved;
    await user.save();

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
