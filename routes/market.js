import express from "express";
import MarketPrice from "../models/MarketPrice.js";
import { verifyToken } from "../middleware/auth.js";
import { notifyUsersByRole } from "../utils/notificationService.js";

const router = express.Router();

// GET /api/market — get latest market price (public, no auth needed)
router.get("/", async (req, res) => {
  try {
    const price = await MarketPrice.findOne().sort({ updatedAt: -1 });
    if (!price) {
      return res.json({ broiler: 180, chick: 50, egg: 7, updatedAt: new Date(), updatedBy: "Default" });
    }
    res.json(price);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/market — CRP sets new market price
router.post("/", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP") return res.status(403).json({ message: "Forbidden" });
    const { broiler, chick, egg } = req.body;
    if (!broiler || !chick || !egg) return res.status(400).json({ message: "All prices are required" });

    const price = await MarketPrice.create({
      broiler,
      chick,
      egg,
      updatedBy: req.user.userId,
    });

    await notifyUsersByRole(["SHG Member", "CRP"], {
      type: "market",
      title: "Market Price Update",
      message: `Market prices updated: Broiler ₹${broiler}/kg, Chick ₹${chick}, Egg ₹${egg}.`,
      payload: { broiler, chick, egg },
    });

    res.status(201).json(price);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
