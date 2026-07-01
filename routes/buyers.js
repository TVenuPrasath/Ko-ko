import express from "express";
import Buyer from "../models/Buyer.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// GET /api/buyers — CRP gets all buyers
router.get("/", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    const buyers = await Buyer.find().sort({ createdAt: -1 });
    res.json(buyers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/buyers — CRP adds a buyer
router.post("/", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    const { name, phone, type } = req.body;
    if (!name || !phone || !type) return res.status(400).json({ message: "name, phone, and type are required" });

    const buyer = await Buyer.create({ name, phone, type });
    res.status(201).json(buyer);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: "Phone number already exists" });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/buyers/:id — CRP removes a buyer
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    await Buyer.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
