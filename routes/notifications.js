import express from "express";
import Notification from "../models/Notification.js";
import { verifyToken } from "../middleware/auth.js";
import {
  getTargetUserIds,
  getUsersByRole,
  notifyUsers,
  registerDeviceToken,
  unregisterDeviceToken,
  markNotificationRead,
} from "../utils/notificationService.js";

const router = express.Router();

// GET /api/notifications — get notifications for the current user
router.get("/", verifyToken, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === "CRP" || req.user.role === "ADMIN") {
      query = {};
    } else {
      const { read } = req.query;
      if (read === "true") {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        query = { recipient_ids: req.user.userId, read_by: req.user.userId, created_at: { $gte: since } };
      } else if (read === "false") {
        query = { recipient_ids: req.user.userId, read_by: { $ne: req.user.userId } };
      } else {
        query = { recipient_ids: req.user.userId };
      }
    }

    const notifications = await Notification.find(query).sort({ created_at: -1 }).limit(50);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/mark-all-read — mark all unread as read for current user
router.patch("/mark-all-read", verifyToken, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient_ids: req.user.userId, read_by: { $ne: req.user.userId } },
      { $addToSet: { read_by: req.user.userId } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications — CRP creates and sends a notification
router.post("/", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });

    const { type, title, message, batch_id, hamlet, shg_name, shg_names } = req.body;
    if (!type || !message) return res.status(400).json({ message: "type and message are required" });

    const targetIds = await getTargetUserIds(hamlet, shg_name, shg_names);
    const crpIds = await getUsersByRole(["CRP"]);
    const recipients = [...new Set([...targetIds, ...crpIds])];

    const notifications = await notifyUsers(recipients, {
      type,
      title: title || type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      message,
      batchId: batch_id,
      hamlet,
      shg_name,
      shg_names,
      payload: { batch_id, type },
    });

    res.status(201).json({ sent: notifications.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notifications/register-token — store a user's FCM token
router.post("/register-token", verifyToken, async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token) return res.status(400).json({ message: "token is required" });
    const record = await registerDeviceToken(req.user.userId, token, platform);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notifications/unregister-token — deactivate a user's FCM token
router.delete("/unregister-token", verifyToken, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "token is required" });
    await unregisterDeviceToken(req.user.userId, token);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/:id/read — mark a notification as read
router.patch("/:id/read", verifyToken, async (req, res) => {
  try {
    const notification = await markNotificationRead(req.params.id, req.user.userId);
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    res.json(notification);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notifications/:id — CRP deletes a notification log
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "CRP" && req.user.role !== "ADMIN") return res.status(403).json({ message: "Forbidden" });
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
