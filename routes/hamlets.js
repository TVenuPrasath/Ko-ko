import express from "express";
import Hamlet from "../models/Hamlet.js";
import Street from "../models/Street.js";
import User from "../models/User.js";
import Crp from "../models/Crp.js";
import { verifyToken, requireAdmin, requireCrpOrAdmin } from "../middleware/auth.js";
import { reassignHamletCrp } from "../utils/hamletCrp.js";

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
    const { nameTa, nameEn, crpId } = req.body;
    if (!nameTa || !nameEn) return res.status(400).json({ message: "nameTa and nameEn are required" });

    const hamlet = await Hamlet.create({
      nameTa,
      nameEn,
      name: nameEn, // legacy compatibility field
      crpId: crpId || null,
    });
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
    const { nameTa, nameEn, crpId } = req.body;
    const hamlet = await Hamlet.findById(req.params.id);
    if (!hamlet) return res.status(404).json({ message: "Hamlet not found" });

    if (nameTa !== undefined || nameEn !== undefined) {
      const newNameTa = nameTa !== undefined ? nameTa : hamlet.nameTa;
      const newNameEn = nameEn !== undefined ? nameEn : hamlet.nameEn;
      if (!newNameTa || !newNameEn) {
        return res.status(400).json({ message: "nameTa and nameEn are required" });
      }
      // findByIdAndUpdate (not .save()) so this never triggers full-document
      // validation against unrelated fields on legacy documents.
      await Hamlet.findByIdAndUpdate(hamlet._id, { nameTa: newNameTa, nameEn: newNameEn, name: newNameEn });
      // Refresh the denormalized display string for every farmer in this hamlet.
      // hamletId is left untouched — only the cached display text changes.
      await User.updateMany({ hamletId: hamlet._id }, { hamlet: newNameTa });
    }

    if (crpId !== undefined) {
      await reassignHamletCrp(hamlet._id, crpId || null);
    }

    const populatedHamlet = await Hamlet.findById(hamlet._id).populate("crpId", "name phone designation");
    res.json(populatedHamlet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hamlets/:id — Admin only. Blocked while streets or farmers still
// reference this hamlet, to avoid silently orphaning real data.
router.delete("/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    const hamlet = await Hamlet.findById(req.params.id);
    if (!hamlet) return res.status(404).json({ message: "Hamlet not found" });

    const [streetCount, farmerCount] = await Promise.all([
      Street.countDocuments({ hamletId: hamlet._id }),
      User.countDocuments({ hamletId: hamlet._id, role: "SHG Member" }),
    ]);

    if (streetCount > 0 || farmerCount > 0) {
      return res.status(409).json({
        message: "Cannot delete hamlet: it still has referencing streets and/or farmers",
        streetCount,
        farmerCount,
      });
    }

    await Hamlet.findByIdAndDelete(hamlet._id);
    if (hamlet.crpId) {
      await Crp.findByIdAndUpdate(hamlet.crpId, { $pull: { assignedHamlets: hamlet._id } });
    }
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
    const { nameTa, nameEn } = req.body;
    if (!nameTa || !nameEn) return res.status(400).json({ message: "nameTa and nameEn are required" });

    const street = await Street.create({
      nameTa,
      nameEn,
      name: nameEn, // legacy compatibility field
      hamletId: req.params.hamletId,
    });
    res.status(201).json(street);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/hamlets/streets/:streetId — Admin or CRP
router.patch("/streets/:streetId", verifyToken, requireCrpOrAdmin, async (req, res) => {
  try {
    const { nameTa, nameEn } = req.body;
    const street = await Street.findById(req.params.streetId);
    if (!street) return res.status(404).json({ message: "Street not found" });

    if (nameTa === undefined && nameEn === undefined) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    const newNameTa = nameTa !== undefined ? nameTa : street.nameTa;
    const newNameEn = nameEn !== undefined ? nameEn : street.nameEn;
    if (!newNameTa || !newNameEn) {
      return res.status(400).json({ message: "nameTa and nameEn are required" });
    }

    const updated = await Street.findByIdAndUpdate(
      street._id,
      { nameTa: newNameTa, nameEn: newNameEn, name: newNameEn },
      { new: true }
    );

    // Refresh the denormalized display string for every farmer on this street.
    // streetId is left untouched — only the cached display text changes.
    await User.updateMany({ streetId: street._id }, { street: newNameTa });

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/hamlets/streets/:streetId — Admin or CRP. Blocked while farmers
// still reference this street.
router.delete("/streets/:streetId", verifyToken, requireCrpOrAdmin, async (req, res) => {
  try {
    const street = await Street.findById(req.params.streetId);
    if (!street) return res.status(404).json({ message: "Street not found" });

    const farmerCount = await User.countDocuments({ streetId: street._id, role: "SHG Member" });
    if (farmerCount > 0) {
      return res.status(409).json({
        message: "Cannot delete street: farmers are still assigned to it",
        farmerCount,
      });
    }

    await Street.findByIdAndDelete(street._id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
