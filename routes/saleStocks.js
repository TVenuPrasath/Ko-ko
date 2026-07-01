import express from "express";
import SaleStock from "../models/SaleStock.js";
import User from "../models/User.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

// GET /api/sale-stocks — get all available stocks (public for buyers)
router.get("/", async (req, res) => {
  try {
    const stocks = await SaleStock.find()
      .populate("userId", "name phone hamlet street houseNo shg_name")
      .sort({ createdAt: -1 });
    res.json(stocks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sale-stocks — farmer submits stock for sale
router.post("/", verifyToken, async (req, res) => {
  try {
    const { broilers, chicks, eggs } = req.body;
    const user = await User.findById(req.user.userId);
    await SaleStock.deleteMany({ userId: req.user.userId, status: "available" });
    const stock = await SaleStock.create({
      userId: req.user.userId,
      farmerName: user.name,
      hamlet: user.hamlet,
      phone: user.phone,
      broilers: broilers || 0,
      chicks: chicks || 0,
      eggs: eggs || 0,
    });
    res.status(201).json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/sale-stocks/:id/sold — mark as sold
router.patch("/:id/sold", verifyToken, async (req, res) => {
  try {
    const stock = await SaleStock.findByIdAndUpdate(
      req.params.id,
      { status: "sold", soldAt: new Date() },
      { new: true }
    );
    res.json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
