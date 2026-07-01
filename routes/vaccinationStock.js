import express from "express";
import VaccinationStock from "../models/VaccinationStock.js";
import { verifyToken } from "../middleware/auth.js";
import { notifyUsers, getUsersByRole } from "../utils/notificationService.js";
import mongoose from "mongoose";

const router = express.Router();

// Age category → vaccine label mapping
export const CATEGORY_MAP = [
  { key: "week0",  label: "F Strain Vaccine",       tamil: "1 வார வயதுக்குள்" },
  { key: "week2",  label: "IBD Vaccine",             tamil: "2-3 வார வயது" },
  { key: "week4",  label: "LaSota Vaccine",          tamil: "4-5 வார வயது" },
  { key: "week6",  label: "Fowl Pox Vaccine",        tamil: "6-7 வார வயது" },
  { key: "week8",  label: "Dewormer",                tamil: "8-9 வார வயது" },
  { key: "week10", label: "R2B + Dewormer",          tamil: "10-11 வார வயது" },
  { key: "week12", label: "Multivitamins",           tamil: "12-13 வார வயது" },
  { key: "month4", label: "Monitor (Booster Soon)",  tamil: "4 மாதங்கள் ஆனவை" },
  { key: "month5", label: "R2B Booster + Dewormer",  tamil: "5 மாதங்கள் ஆனவை" },
];

// GET /api/vaccination-stock — get current stock for logged-in farmer
router.get("/", verifyToken, async (req, res) => {
  try {
    const stock = await VaccinationStock.findOne({ userId: req.user.userId });
    res.json(stock || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vaccination-stock — farmer submits stock entry, triggers immediate notifications
router.post("/", verifyToken, async (req, res) => {
  try {
    const { week0, week2, week4, week6, week8, week10, week12, month4, month5 } = req.body;

    const stock = await VaccinationStock.findOneAndUpdate(
      { userId: req.user.userId },
      {
        userId: req.user.userId,
        week0: week0 || 0,
        week2: week2 || 0,
        week4: week4 || 0,
        week6: week6 || 0,
        week8: week8 || 0,
        week10: week10 || 0,
        week12: week12 || 0,
        month4: month4 || 0,
        month5: month5 || 0,
        entryDate: new Date(),
        lastProgressedAt: new Date(),
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // Send immediate notifications for each non-zero category
    const crpIds = await getUsersByRole(["CRP"]);
    const farmerId = req.user.userId;

    for (const cat of CATEGORY_MAP) {
      const count = stock[cat.key];
      if (!count || count <= 0) continue;
      if (cat.key === "month4") continue; // monitor only, no immediate action

      const farmerMsg = `${count} birds are due for ${cat.label} (${cat.tamil})`;
      const crpMsg = `Farmer has ${count} birds due for ${cat.label} (${cat.tamil})`;

      await notifyUsers([farmerId], {
        type: "vaccination_reminder",
        title: cat.label,
        message: farmerMsg,
        payload: { category: cat.key, count, vaccine: cat.label },
      });

      if (crpIds.length) {
        await notifyUsers(crpIds, {
          type: "vaccination_reminder",
          title: cat.label,
          message: crpMsg,
          payload: { category: cat.key, count, vaccine: cat.label, farmerId },
        });
      }
    }

    res.status(201).json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
