import express from "express";
import DiseaseReport from "../models/DiseaseReport.js";
import User from "../models/User.js";
import { verifyToken } from "../middleware/auth.js";
import { notifyUsersByRole } from "../utils/notificationService.js";

const router = express.Router();

// POST /api/disease — farmer submits a report
router.post("/", verifyToken, async (req, res) => {
  try {
    const { description, photo } = req.body;
    if (!description) return res.status(400).json({ message: "Description is required" });

    const report = await DiseaseReport.create({
      userId: req.user.userId,
      description,
      photo: photo || null,
    });

    const farmer = await User.findById(req.user.userId);
    await notifyUsersByRole(["CRP"], {
      type: "disease",
      title: "New Disease Report",
      message: `${farmer?.name || "A farmer"} has submitted a disease report.`,
      payload: { reportId: report._id.toString(), hamlet: farmer?.hamlet, shg_name: farmer?.shg_name },
    });

    res.status(201).json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/disease — farmer gets their own reports
router.get("/", verifyToken, async (req, res) => {
  try {
    const reports = await DiseaseReport.find({ userId: req.user.userId }).sort({ reportedAt: -1 });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/disease/all — CRP gets all reports with farmer info
router.get("/all", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    const reports = await DiseaseReport.find()
      .populate("userId", "name phone hamlet street houseNo shg_name")
      .sort({ reportedAt: -1 });
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/disease/:id/review — CRP marks a report as reviewed
router.patch("/:id/review", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    const report = await DiseaseReport.findByIdAndUpdate(
      req.params.id,
      { status: "Reviewed" },
      { new: true }
    );
    if (!report) return res.status(404).json({ message: "Report not found" });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
