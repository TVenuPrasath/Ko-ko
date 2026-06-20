import express from "express";
import Hamlet from "../models/Hamlet.js";
import Street from "../models/Street.js";
import User from "../models/User.js";
import Crp from "../models/Crp.js";
import { verifyToken, requireAdmin, requireCrpOrAdmin } from "../middleware/auth.js";

const router = express.Router();

// GET /api/hamlets — public
router.get("/", async (req, res) => {
  try {
    const hamlets = await Hamlet.find().populate("crpId", "name phone designation").sort({ name: 1 });
    res.json(hamlets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hamlets — Admin only
router.post("/", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, crpId } = req.body;
    if (!name) return res.status(400).json({ message: "name required" });
    const hamlet = await Hamlet.create({ name, crpId: crpId || null });
    if (crpId) {
      await Crp.findByIdAndUpdate(crpId, { $addToSet: { assignedHamlets: hamlet._id } });
    }
    res.status(201).json(hamlet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/hamlets/:id — Admin only
router.patch("/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, crpId } = req.body;
    const hamlet = await Hamlet.findById(req.params.id);
    if (!hamlet) return res.status(404).json({ message: "Hamlet not found" });

    const previousCrpId = hamlet.crpId?.toString();
    const newCrpId = crpId !== undefined ? crpId || null : hamlet.crpId;

    hamlet.name = name ?? hamlet.name;
    hamlet.crpId = newCrpId;
    await hamlet.save();

    // Update crpId on all farmers in this hamlet when CRP changes
    if (crpId !== undefined) {
      await User.updateMany({ hamletId: hamlet._id }, { crpId: newCrpId });
      if (previousCrpId && previousCrpId !== newCrpId) {
        await Crp.findByIdAndUpdate(previousCrpId, { $pull: { assignedHamlets: hamlet._id } });
      }
      if (newCrpId) {
        await Crp.findByIdAndUpdate(newCrpId, { $addToSet: { assignedHamlets: hamlet._id } });
      }
    }

    const populatedHamlet = await Hamlet.findById(hamlet._id).populate("crpId", "name phone designation");
    res.json(populatedHamlet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hamlets/:id — Admin only
router.delete("/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    const hamlet = await Hamlet.findByIdAndDelete(req.params.id);
    if (!hamlet) return res.status(404).json({ message: "Hamlet not found" });
    if (hamlet.crpId) {
      await Crp.findByIdAndUpdate(hamlet.crpId, { $pull: { assignedHamlets: hamlet._id } });
    }
    await Street.deleteMany({ hamletId: hamlet._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hamlets/:hamletId/streets — public
router.get("/:hamletId/streets", async (req, res) => {
  try {
    const streets = await Street.find({ hamletId: req.params.hamletId }).sort({ name: 1 });
    res.json(streets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/hamlets/:hamletId/streets — Admin or CRP
router.post("/:hamletId/streets", verifyToken, requireCrpOrAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "name required" });
    const street = await Street.create({ name, hamletId: req.params.hamletId });
    res.status(201).json(street);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/hamlets/streets/:streetId — Admin or CRP
router.patch("/streets/:streetId", verifyToken, requireCrpOrAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    const street = await Street.findByIdAndUpdate(req.params.streetId, { name }, { new: true });
    if (!street) return res.status(404).json({ message: "Street not found" });
    res.json(street);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hamlets/streets/:streetId — Admin or CRP
router.delete("/streets/:streetId", verifyToken, requireCrpOrAdmin, async (req, res) => {
  try {
    const street = await Street.findByIdAndDelete(req.params.streetId);
    if (!street) return res.status(404).json({ message: "Street not found" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
