import express from "express";
import Shg from "../models/Shg.js";
import User from "../models/User.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

const DEFAULT_GROUPS = [
  "சக்தி மகளிர் சுய உதவி குழு", "காட்டூர் 1", "காட்டூர் 2",
  "தாமரை மகளிர் சுய உதவி குழு", "சரஸ்வதி மகளிர் சுய உதவி குழு",
  "ஓம் சக்தி மகளிர் சுய உதவி குழு", "முல்லை மகளிர் சுய குழு",
  "ஶ்ரீ பாரதி மகளிர் சுய உதவி குழு", "அஞ்சலி மகளிர் சுய உதவி குழு",
  "அல்லி மகளிர் சுய உதவி குழு", "வசந்தம் மகளிர் சுய உதவி குழு",
  "தென்றல் மகளிர் சுய உதவி குழு", "குறிஞ்சி மகளிர் சுய உதவி குழு",
  "கோணாங்கிபட்டி 1", "கோணாங்கிபட்டி 2", "கோணாங்கிபட்டி 6", "கோணாங்கிபட்டி 7",
  "சாமந்தி மகளிர் சுய உதவி குழு", "பசும்பொன் மகளிர் சுய உதவி குழு",
  "தாழம்பூ மகளிர் சுய உதவி குழு", "புதுமைப்பெண் மகளிர் சுய உதவி குழு",
  "செம்பருத்தி மகளிர் சுய உதவி குழு", "வெண்ணிலா மகளிர் சுய உதவி குழு",
  "குங்குமம் மகளிர் சுய உதவி குழு",
];

// GET /api/shg — get all SHG groups (public)
router.get("/", async (req, res) => {
  try {
    let groups = await Shg.find().sort({ createdAt: 1 });
    if (groups.length === 0) {
      await Shg.insertMany(DEFAULT_GROUPS.map((name) => ({ name })));
      groups = await Shg.find().sort({ createdAt: 1 });
    }
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/shg — CRP adds a new SHG group
router.post("/", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP") return res.status(403).json({ message: "Forbidden" });
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "name is required" });
    const group = await Shg.create({ name });
    res.status(201).json(group);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: "SHG group already exists" });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/shg/:id — CRP deletes SHG group and all its farmers
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP") return res.status(403).json({ message: "Forbidden" });
    const group = await Shg.findByIdAndDelete(req.params.id);
    if (!group) return res.status(404).json({ message: "Group not found" });
    const result = await User.deleteMany({ shg_name: group.name, role: "SHG Member" });
    res.json({ success: true, deletedFarmers: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
