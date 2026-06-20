import express from "express";
import bcrypt from "bcryptjs";
import Crp from "../models/Crp.js";
import User from "../models/User.js";
import Hamlet from "../models/Hamlet.js";
import { verifyToken, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// GET /api/crps
router.get("/", verifyToken, requireAdmin, async (req, res) => {
  try {
    const crps = await Crp.find().populate("assignedHamlets", "name").sort({ createdAt: -1 });
    res.json(crps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/crps — Admin creates a new CRP + User account
router.post("/", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, phone, designation, assignedLocation, assignedHamlets, status, password } = req.body;
    if (!name || !phone) return res.status(400).json({ message: "name and phone required" });

    if (await Crp.findOne({ phone })) return res.status(400).json({ message: "CRP with this phone already exists" });

    const crp = await Crp.create({
      name,
      phone,
      designation,
      assignedLocation,
      assignedHamlets: Array.isArray(assignedHamlets) ? assignedHamlets : [],
      status: status || "Active",
    });

    if (Array.isArray(assignedHamlets) && assignedHamlets.length) {
      await Hamlet.updateMany({ _id: { $in: assignedHamlets } }, { crpId: crp._id });
      await User.updateMany({ hamletId: { $in: assignedHamlets } }, { crpId: crp._id });
      await Crp.updateMany({ _id: { $ne: crp._id }, assignedHamlets: { $in: assignedHamlets } }, { $pull: { assignedHamlets: { $in: assignedHamlets } } });
    }

    if (!(await User.findOne({ phone }))) {
      const hashed = await bcrypt.hash(password || "changeme123", 10);
      await User.create({ name, phone, password: hashed, role: "CRP", crpProfileId: crp._id, approved: true });
    }

    res.status(201).json(crp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/crps/:id — Admin updates CRP
router.patch("/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, phone, designation, assignedLocation, assignedHamlets, status } = req.body;
    const crp = await Crp.findById(req.params.id);
    if (!crp) return res.status(404).json({ message: "CRP not found" });

    const previousHamlets = Array.isArray(crp.assignedHamlets) ? crp.assignedHamlets : [];
    if (Array.isArray(assignedHamlets)) {
      await Hamlet.updateMany({ _id: { $in: previousHamlets }, crpId: crp._id }, { $unset: { crpId: "" } });
      await User.updateMany({ hamletId: { $in: previousHamlets }, crpId: crp._id }, { $unset: { crpId: "" } });
      await Hamlet.updateMany({ _id: { $in: assignedHamlets } }, { crpId: crp._id });
      await User.updateMany({ hamletId: { $in: assignedHamlets } }, { crpId: crp._id });
      crp.assignedHamlets = assignedHamlets;
    }

    crp.name = name ?? crp.name;
    crp.phone = phone ?? crp.phone;
    crp.designation = designation ?? crp.designation;
    crp.assignedLocation = assignedLocation ?? crp.assignedLocation;
    if (status) crp.status = status;
    crp.updatedAt = new Date();

    await crp.save();
    await User.findOneAndUpdate({ crpProfileId: crp._id }, { name: crp.name, phone: crp.phone });
    res.json(crp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/crps/:id/status — Activate / Deactivate
router.patch("/:id/status", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["Active", "Inactive"].includes(status)) return res.status(400).json({ message: "status must be Active or Inactive" });
    const crp = await Crp.findByIdAndUpdate(req.params.id, { status, updatedAt: new Date() }, { new: true });
    if (!crp) return res.status(404).json({ message: "CRP not found" });
    res.json(crp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/crps/:id/hamlets — Assign hamlets to CRP
router.patch("/:id/hamlets", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { hamletIds } = req.body; // array of hamlet _ids
    if (!Array.isArray(hamletIds)) return res.status(400).json({ message: "hamletIds must be an array" });

    const crp = await Crp.findById(req.params.id);
    if (!crp) return res.status(404).json({ message: "CRP not found" });

    const previousHamlets = Array.isArray(crp.assignedHamlets) ? crp.assignedHamlets : [];
    if (previousHamlets.length) {
      await Hamlet.updateMany({ _id: { $in: previousHamlets }, crpId: crp._id }, { $unset: { crpId: "" } });
      await User.updateMany({ hamletId: { $in: previousHamlets }, crpId: crp._id }, { $unset: { crpId: "" } });
    }

    await Hamlet.updateMany({ _id: { $in: hamletIds } }, { crpId: crp._id });
    await User.updateMany({ hamletId: { $in: hamletIds } }, { crpId: crp._id });

    crp.assignedHamlets = hamletIds;
    await crp.save();

    res.json({ success: true, assigned: hamletIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/crps/:id — Admin deletes CRP
router.delete("/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    const crp = await Crp.findByIdAndDelete(req.params.id);
    if (!crp) return res.status(404).json({ message: "CRP not found" });
    await User.findOneAndDelete({ crpProfileId: crp._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
