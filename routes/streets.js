import express from "express";
import mongoose from "mongoose";
import Street from "../models/Street.js";
import { verifyToken, requireAdmin } from "../middleware/auth.js";

const router = express.Router();

// GET /api/streets — Admin: all streets with hamlet populated. Optional
// ?hamletId=<id> scopes the result to streets belonging to that hamlet.
router.get("/", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { hamletId } = req.query;
    const filter = {};
    if (hamletId !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(hamletId)) {
        return res.status(400).json({ message: "Invalid hamletId" });
      }
      filter.hamletId = hamletId;
    }

    const streets = await Street.find(filter)
      .populate("hamletId", "name crpId")
      .sort({ name: 1 });
    res.json(streets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
