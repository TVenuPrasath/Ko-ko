import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Otp from "../models/Otp.js";
import Hamlet from "../models/Hamlet.js";
import Street from "../models/Street.js";
import { notifyUsersByRole } from "../utils/notificationService.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Case-insensitive exact match against a Hamlet's name/nameTa/nameEn — used
// only by the legacy string-based fallback path below (profile), which never
// invents an id or guesses: an ambiguous match (2+ hamlets sharing the
// supplied value) is treated the same as no match at all. No fuzzy, partial,
// or transliteration matching — exact string equality after trimming/case-
// folding only.
async function findHamletByLegacyName(hamletName) {
  if (!hamletName) return null;
  const target = hamletName.trim().toLowerCase();
  if (!target) return null;

  const hamlets = await Hamlet.find({}, "name nameTa nameEn crpId");
  const matches = hamlets.filter((h) =>
    [h.name, h.nameTa, h.nameEn].some((v) => typeof v === "string" && v.trim().toLowerCase() === target)
  );

  return matches.length === 1 ? matches[0] : null;
}

// POST /api/auth/login — Admin and CRP login with phone + password
router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ message: "phone and password required" });

    const user = await User.findOne({ phone, role: { $in: [/^ADMIN$/i, /^CRP$/i] } })
      .populate("crpProfileId");
    if (!user) return res.status(404).json({ message: "User not found" });

    const valid = await bcrypt.compare(password, user.password || "");
    if (!valid) return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign(
      { userId: user._id, role: String(user.role || "").toUpperCase(), hamlet: user.hamlet },
      process.env.JWT_SECRET
    );

    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/send-otp — Farmer OTP login
router.post("/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone || phone.length !== 10) return res.status(400).json({ message: "Valid phone required" });

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await Otp.deleteMany({ phone });
    await Otp.create({ phone, code, expiresAt });

    console.log(`OTP for ${phone}: ${code}`);

    res.json({ success: true, message: "OTP sent", otp: code });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/verify-otp
router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) return res.status(400).json({ message: "phone and otp required" });

    const record = await Otp.findOne({ phone, code: otp, used: false });
    if (!record) return res.status(400).json({ message: "Invalid OTP" });
    if (record.expiresAt < new Date()) return res.status(400).json({ message: "OTP expired" });

    record.used = true;
    await record.save();

    const user = await User.findOne({ phone }).populate("crpId", "name phone designation assignedLocation");
    if (!user) return res.status(404).json({ message: "User not found. Please register first." });
    if (user.role === "SHG Member" && !user.approved) return res.status(403).json({ message: "pending", approved: false });

    const token = jwt.sign(
      { userId: user._id, role: String(user.role || "").toUpperCase(), hamlet: user.hamlet },
      process.env.JWT_SECRET
    );

    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { phone, name, hamletId, streetId, houseNo, shg_name } = req.body;
    if (!phone || !name || !shg_name) return res.status(400).json({ message: "Required fields missing" });
    if (!hamletId || !streetId) return res.status(400).json({ message: "Hamlet and Street selections are required" });

    if (phone.length !== 10) {
      return res.status(400).json({ message: "Phone number must be exactly 10 digits" });
    }

    const existing = await User.findOne({ phone });
    if (existing) return res.status(400).json({ message: "Phone already registered" });

    // Validate hamlet
    const hamletDoc = await Hamlet.findById(hamletId);
    if (!hamletDoc) return res.status(400).json({ message: "Invalid Hamlet selection" });

    // Validate street
    const streetDoc = await Street.findById(streetId);
    if (!streetDoc) return res.status(400).json({ message: "Invalid Street selection" });

    if (streetDoc.hamletId.toString() !== hamletId) {
      return res.status(400).json({ message: "The selected Street does not belong to the selected Hamlet" });
    }

    // Automatically resolve CRP ID assigned to the Hamlet
    const crpId = hamletDoc.crpId || null;

    const user = await User.create({
      phone, name,
      hamletId,
      streetId,
      crpId,
      hamlet: hamletDoc.name,
      street: streetDoc.name,
      houseNo,
      shg_name,
      role: "SHG Member",
      approved: false,
    });

    await notifyUsersByRole(["CRP"], {
      type: "user_registration_pending",
      title: "New farmer registration pending approval",
      message: `${name} has registered and is awaiting approval.`,
      payload: { userId: user._id.toString(), hamlet: hamletDoc.name, shg_name },
    });

    res.status(201).json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/seed-crp
router.post("/seed-crp", async (req, res) => {
  try {
    const { phone, name, role, hamlet, secret } = req.body;
    if (secret !== process.env.SEED_SECRET) return res.status(403).json({ message: "Forbidden" });
    if (role !== "CRP") return res.status(400).json({ message: "Only CRP can be seeded" });

    const existing = await User.findOne({ phone });
    if (existing) return res.status(400).json({ message: "User already exists" });

    const user = await User.create({ phone, name, role, hamlet, approved: true });
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/auth/profile — farmer updates own profile
router.patch("/profile", verifyToken, async (req, res) => {
  try {
    const { name, houseNo, hamlet, street, hamletId, streetId } = req.body;
    const allowed = {};
    if (name  !== undefined) allowed.name    = String(name).trim();
    if (houseNo !== undefined) allowed.houseNo = String(houseNo).trim();

    if (hamletId) {
      // Preferred ID-based path. Free-text hamlet/street on the same request are
      // ignored — the denormalized display strings only ever come from the
      // resolved canonical documents, never from client-supplied text.
      const hamletDoc = await Hamlet.findById(hamletId);
      if (!hamletDoc) return res.status(400).json({ message: "Invalid hamletId" });

      allowed.hamletId = hamletDoc._id;
      allowed.crpId = hamletDoc.crpId || null;
      allowed.hamlet = hamletDoc.nameTa || hamletDoc.name || "";

      if (streetId) {
        const streetDoc = await Street.findById(streetId);
        if (!streetDoc || streetDoc.hamletId.toString() !== hamletDoc._id.toString()) {
          return res.status(400).json({ message: "streetId does not belong to the selected hamlet" });
        }
        allowed.streetId = streetDoc._id;
        allowed.street = streetDoc.nameTa || streetDoc.name || "";
      }
    } else if (hamlet !== undefined) {
      // Legacy free-text fallback for older app versions — matches case-
      // insensitively against name/nameTa/nameEn; otherwise unchanged behavior.
      const hamletName = String(hamlet).trim();
      allowed.hamlet = hamletName;
      const hamletDoc = await findHamletByLegacyName(hamletName);
      const resolvedHamletId = hamletDoc ? hamletDoc._id : null;
      allowed.hamletId = resolvedHamletId;
      allowed.crpId = hamletDoc ? (hamletDoc.crpId || null) : null;

      if (street !== undefined) {
        const streetName = String(street).trim();
        allowed.street = streetName;
        const streetDoc = (streetName && resolvedHamletId)
          ? await Street.findOne({ name: streetName, hamletId: resolvedHamletId })
          : null;
        allowed.streetId = streetDoc ? streetDoc._id : null;
      }
    } else if (street !== undefined) {
      // Street-only free-text change, hamlet untouched — legacy behavior. Resolves
      // against the farmer's existing hamletId.
      const streetName = String(street).trim();
      allowed.street = streetName;
      const hamletIdForStreet = (await User.findById(req.user.userId, "hamletId"))?.hamletId || null;
      const streetDoc = (streetName && hamletIdForStreet)
        ? await Street.findOne({ name: streetName, hamletId: hamletIdForStreet })
        : null;
      allowed.streetId = streetDoc ? streetDoc._id : null;
    }

    if (!allowed.name) return res.status(400).json({ message: "Name is required" });

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: allowed },
      { new: true, runValidators: true }
    ).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
