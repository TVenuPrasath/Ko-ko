import express from "express";
import User from "../models/User.js";
import Hamlet from "../models/Hamlet.js";
import Street from "../models/Street.js";
import { verifyToken, requireAdmin, requireCrpOrAdmin } from "../middleware/auth.js";
import { notifyUsers } from "../utils/notificationService.js";

const router = express.Router();

const POPULATE = [
  { path: "hamletId", select: "name nameTa nameEn" },
  { path: "streetId", select: "name nameTa nameEn" },
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

// GET /api/farmers/unresolved — Admin only: farmers with no canonical hamlet link
// (hamletId missing/null), surfaced for manual reconciliation.
router.get("/unresolved", verifyToken, requireAdmin, async (req, res) => {
  try {
    const farmers = await User.find(
      { role: "SHG Member", hamletId: null },
      "name phone hamlet street shg_name houseNo created_at"
    ).sort({ created_at: -1 });
    res.json(farmers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/farmers/:id/location — Admin only: explicitly assign a canonical
// hamlet/street to one farmer. No fuzzy matching or guessing — the Admin must
// supply a real hamletId (and, if given, a streetId that belongs to it).
router.patch("/:id/location", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { hamletId, streetId } = req.body;
    if (!hamletId) return res.status(400).json({ message: "hamletId is required" });

    const hamletDoc = await Hamlet.findById(hamletId);
    if (!hamletDoc) return res.status(400).json({ message: "Invalid hamletId" });

    let streetDoc = null;
    if (streetId) {
      streetDoc = await Street.findById(streetId);
      if (!streetDoc || streetDoc.hamletId.toString() !== hamletDoc._id.toString()) {
        return res.status(400).json({ message: "streetId does not belong to the selected hamlet" });
      }
    }

    const farmer = await User.findOneAndUpdate(
      { _id: req.params.id, role: "SHG Member" },
      {
        hamletId: hamletDoc._id,
        streetId: streetDoc ? streetDoc._id : null,
        crpId: hamletDoc.crpId || null,
        hamlet: hamletDoc.nameTa || hamletDoc.name || "",
        street: streetDoc ? (streetDoc.nameTa || streetDoc.name || "") : "",
      },
      { new: true }
    ).populate([
      { path: "hamletId", select: "name nameTa nameEn" },
      { path: "streetId", select: "name nameTa nameEn" },
      { path: "crpId",    select: "name phone designation assignedLocation" },
    ]);

    if (!farmer) return res.status(404).json({ message: "Farmer not found" });
    res.json(farmer);
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
