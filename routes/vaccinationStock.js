import express from "express";
import VaccinationStock from "../models/VaccinationStock.js";
import User from "../models/User.js";
import { verifyToken } from "../middleware/auth.js";
import { notifyUsers, getUsersByRole } from "../utils/notificationService.js";

const router = express.Router();

// Age category → vaccine label mapping (client-approved)
export const CATEGORY_MAP = [
  { key: "withinMonth", labelEn: "Within 1 month",    labelTa: "1 மாதத்திற்குள்",              vaccine: "Lasota" },
  { key: "month2",      labelEn: "2 months old",       labelTa: "2 மாத வயது",                   vaccine: "Fowl Pox" },
  { key: "month3",      labelEn: "3 months old",       labelTa: "3 மாத வயது",                   vaccine: "Infectious Coryza" },
  { key: "month4Plus",  labelEn: "4–7 months & above", labelTa: "4 முதல் 7 மாதங்கள் மற்றும் மேல்", vaccine: "RDVK + Deworming (3 மாதத்திற்கு ஒருமுறை)" },
];

function formatDateDDMMYYYY(date) {
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// GET /api/vaccination-stock/all — CRP: all farmer stocks
router.get("/all", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP") return res.status(403).json({ message: "Forbidden" });
    const stocks = await VaccinationStock.find()
      .populate("userId", "name phone hamlet street houseNo shg_name")
      .sort({ updatedAt: -1 });
    res.json(stocks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/vaccination-stock — farmer's own current stock
router.get("/", verifyToken, async (req, res) => {
  try {
    const stock = await VaccinationStock.findOne({ userId: req.user.userId });
    res.json(stock || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/vaccination-stock — farmer submits stock; sends notification with vax date = entry + 3 days
router.post("/", verifyToken, async (req, res) => {
  try {
    const { withinMonth, month2, month3, month4Plus } = req.body;

    const entryDate = new Date();
    const vaccinationDate = addDays(entryDate, 3);
    const vaccinationDateStr = formatDateDDMMYYYY(vaccinationDate);

    const stock = await VaccinationStock.findOneAndUpdate(
      { userId: req.user.userId },
      {
        userId: req.user.userId,
        withinMonth: withinMonth || 0,
        month2:      month2      || 0,
        month3:      month3      || 0,
        month4Plus:  month4Plus  || 0,
        entryDate,
        status: "pending",
        lastProgressedAt: entryDate,
        updatedAt: entryDate,
      },
      { upsert: true, new: true }
    );

    // Build notification lines — only categories with count > 0
    const counts = { withinMonth: withinMonth || 0, month2: month2 || 0, month3: month3 || 0, month4Plus: month4Plus || 0 };
    const lines = CATEGORY_MAP
      .filter((c) => counts[c.key] > 0)
      .map((c) => {
        const vaccineLabel = c.vaccine ? ` (${c.vaccine})` : "";
        return `${c.labelTa}${vaccineLabel}: ${counts[c.key]} கோழிகள்`;
      });

    const farmerMsg =
      `💉 தடுப்பூசி தேதி: ${vaccinationDateStr}\n` +
      lines.join("\n") +
      `\n\nதடுப்பூசி போட வேண்டிய கோழிகளை இந்நாள் அடைவாக வையுங்கள்.`;

    const farmerId = req.user.userId;
    const crpIds = await getUsersByRole(["CRP"]);

    // Include the farmer's name in the CRP-facing title/message so that two
    // different farmers submitting identical category/count data on the same
    // day don't produce byte-identical notifications — isDuplicateNotification
    // (notificationService.js) keys only on {type, title, message, day} with no
    // recipient check, so identical content would otherwise silently suppress
    // the second farmer's CRP alert even though their stock record was saved.
    const farmerDoc = await User.findById(farmerId).select("name");
    const farmerLabel = farmerDoc?.name || "விவசாயி";

    const crpMsg =
      `💉 ${farmerLabel} தடுப்பூசி இருப்பு பதிவு செய்தார். தேதி: ${vaccinationDateStr}\n` +
      lines.join("\n");

    // Notify farmer
    await notifyUsers([farmerId], {
      type: "vaccination_stock_reminder",
      title: `தடுப்பூசி தேதி: ${vaccinationDateStr}`,
      message: farmerMsg,
      payload: { vaccinationDate: vaccinationDate.toISOString(), stockId: stock._id.toString() },
    });

    // Notify CRP
    if (crpIds.length) {
      await notifyUsers(crpIds, {
        type: "vaccination_stock_reminder",
        title: `விவசாயி தடுப்பூசி இருப்பு — ${farmerLabel} — ${vaccinationDateStr}`,
        message: crpMsg,
        payload: { vaccinationDate: vaccinationDate.toISOString(), stockId: stock._id.toString(), farmerId },
      });
    }

    res.status(201).json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/vaccination-stock/:id/complete — CRP marks vaccination as completed
router.patch("/:id/complete", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP") return res.status(403).json({ message: "Forbidden" });

    const stock = await VaccinationStock.findByIdAndUpdate(
      req.params.id,
      {
        status: "completed",
        completedAt: new Date(),
        completedBy: String(req.user.userId),
        updatedAt: new Date(),
      },
      { new: true }
    ).populate("userId", "name phone hamlet");

    if (!stock) return res.status(404).json({ message: "Not found" });

    // Notify the farmer that vaccination is marked complete
    await notifyUsers([stock.userId._id.toString()], {
      type: "vaccination_completed",
      title: "தடுப்பூசி நிறைவு",
      message: "உங்கள் தடுப்பூசி CRP ஆல் நிறைவு செய்யப்பட்டது ✅",
      payload: { stockId: stock._id.toString() },
    });

    res.json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
