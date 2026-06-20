import express from "express";
import User from "../models/User.js";
import { verifyToken, requireCrpOrAdmin } from "../middleware/auth.js";
import { notifyUsers } from "../utils/notificationService.js";

const router = express.Router();

const POPULATE = [
  { path: "hamletId", select: "name" },
  { path: "streetId", select: "name" },
  { path: "crpId",    select: "name phone designation assignedLocation" },
];

// GET /api/farmers
router.get("/", verifyToken, requireCrpOrAdmin, async (req, res) => {
  try {
    const filter = { role: "SHG Member" };
    if (req.query.approved === "false") filter.approved = false;

    // CRP only sees their own farmers
    if (req.user.role === "CRP") {
      const crpUser = await User.findById(req.user.userId);
      if (crpUser?.crpProfileId) filter.crpId = crpUser.crpProfileId;
    }

    const farmers = await User.find(filter).populate(POPULATE).sort({ created_at: -1 });
    res.json(farmers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/farmers/:id/approve
router.patch("/:id/approve", verifyToken, requireCrpOrAdmin, async (req, res) => {
  try {
    const farmer = await User.findByIdAndUpdate(req.params.id, { approved: true }, { new: true }).populate(POPULATE);
    if (!farmer) return res.status(404).json({ message: "Farmer not found" });

    await notifyUsers([farmer._id.toString()], {
      type: "user_approved",
      title: "Account Approved",
      message: "Your account has been approved. You can now log in.",
      payload: { userId: farmer._id.toString() },
    });

    res.json(farmer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/farmers/:id/reject
router.delete("/:id/reject", verifyToken, requireCrpOrAdmin, async (req, res) => {
  try {
    const farmer = await User.findById(req.params.id);
    if (!farmer) return res.status(404).json({ message: "Farmer not found" });

    await notifyUsers([farmer._id.toString()], {
      type: "user_rejected",
      title: "Registration Rejected",
      message: "Your registration has been rejected. Please contact your CRP.",
      payload: { userId: farmer._id.toString() },
    });

    await farmer.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/farmers/:id
router.delete("/:id", verifyToken, requireCrpOrAdmin, async (req, res) => {
  try {
    const farmer = await User.findByIdAndDelete(req.params.id);
    if (!farmer) return res.status(404).json({ message: "Farmer not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
