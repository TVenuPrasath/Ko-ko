import express from "express";
import Street from "../models/Street.js";
import { verifyToken, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// GET /api/streets — Admin: all streets with hamlet populated
router.get("/", verifyToken, requireAdmin, async (req, res) => {
  try {
    const streets = await Street.find()
      .populate("hamletId", "name crpId")
      .sort({ name: 1 });
    res.json(streets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
