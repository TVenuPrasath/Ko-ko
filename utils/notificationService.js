import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import DeviceToken from "../models/DeviceToken.js";
import User from "../models/User.js";
import { sendPushNotification } from "./fcm.js";

const ADMIN_ROLES = ["CRP"];

export async function registerDeviceToken(userId, token, platform = "unknown") {
  if (!userId || !token) throw new Error("userId and token are required");

  const existing = await DeviceToken.findOneAndUpdate(
    { token },
    { userId, platform: platform || "unknown", active: true, updatedAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return existing;
}

export async function unregisterDeviceToken(userId, token) {
  if (!userId || !token) throw new Error("userId and token are required");
  const result = await DeviceToken.findOneAndUpdate({ userId, token }, { active: false, updatedAt: new Date() });
  return result;
}

export async function getTargetUserIds(hamlet, shg_name, shg_names) {
  const query = [];

  if (Array.isArray(shg_names) && shg_names.length > 0) {
    query.push({ shg_name: { $in: shg_names } });
  }

  if (shg_name) {
    query.push({ shg_name });
  }

  if (hamlet) {
    query.push({ hamlet });
  }

  if (query.length === 0) {
    const farmers = await User.find({ role: "SHG Member" }, { _id: 1 });
    return farmers.map((farmer) => farmer._id.toString());
  }

  const users = await User.find({ role: "SHG Member", $or: query }, { _id: 1 });
  return users.map((user) => user._id.toString());
}

export async function getUsersByRole(roles) {
  const users = await User.find({ role: { $in: roles } }, { _id: 1 });
  return users.map((user) => user._id.toString());
}

export async function getUserActiveTokens(userId) {
  const tokens = await DeviceToken.find({ userId: new mongoose.Types.ObjectId(userId), active: true }).distinct("token");
  return tokens;
}

export async function isDuplicateNotification(type, title, message) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exists = await Notification.findOne({ type, title, message, created_at: { $gte: today } });
  return Boolean(exists);
}

export async function broadcastNotification({
  recipientIds,
  batchId,
  type,
  title,
  message,
  hamlet,
  shg_name,
  shg_names,
  payload,
}) {
  if (!recipientIds?.length) return null;

  if (await isDuplicateNotification(type, title, message)) return null;

  const notification = await Notification.create({
    notification_id: new mongoose.Types.ObjectId().toString(),
    recipient_ids: recipientIds,
    read_by: [],
    batch_id: batchId,
    type,
    title,
    message,
    channel: "push",
    status: "pending",
    created_at: new Date(),
    createdAt: new Date(),
    hamlet,
    shg_name,
    shg_names,
    payload,
  });

  // fetch all tokens in one query instead of looping
  const objectIds = recipientIds.map(id => new mongoose.Types.ObjectId(id));
  const allTokens = await DeviceToken.find({ userId: { $in: objectIds }, active: true }).distinct("token");

  if (!allTokens.length) return notification;

  const result = await sendPushNotification(allTokens, { title, body: message }, {
    type,
    notification_id: notification.notification_id,
    batch_id: batchId?.toString?.(),
  });

  notification.status = result.failureCount > 0 && result.successCount === 0 ? "failed" : "sent";
  notification.sent_at = new Date();
  notification.failure_reason = result.failureCount > 0
    ? JSON.stringify(result.responses.filter(r => !r.success).map(r => r.error?.message || ""))
    : undefined;
  notification.payload = payload;
  await notification.save();

  if (result.invalidTokens.length > 0) {
    await DeviceToken.updateMany({ token: { $in: result.invalidTokens } }, { active: false, updatedAt: new Date() });
  }

  return notification;
}

export async function notifyUsers(userIds, data) {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean).map(String))];
  if (!uniqueIds.length) return [];
  const result = await broadcastNotification({ recipientIds: uniqueIds, ...data });
  return result ? [result] : [];
}

export async function notifyUsersByRole(roles, data) {
  const ids = await getUsersByRole(roles);
  return notifyUsers(ids, data);
}

export async function markNotificationRead(notificationId, userId) {
  const notification = await Notification.findOneAndUpdate(
    { notification_id: notificationId, recipient_ids: userId },
    { $addToSet: { read_by: userId } },
    { new: true }
  );
  return notification;
}

export async function retryFailedNotifications() {
  const failed = await Notification.find({ status: "failed" }).sort({ created_at: -1 }).limit(50);
  const results = [];

  for (const item of failed) {
    const objectIds = (item.recipient_ids || []).map(id => new mongoose.Types.ObjectId(id));
    const allTokens = await DeviceToken.find({ userId: { $in: objectIds }, active: true }).distinct("token");
    if (!allTokens.length) continue;

    const response = await sendPushNotification(allTokens, { title: item.title, body: item.message }, {
      type: item.type,
      notification_id: item.notification_id,
      batch_id: item.batch_id?.toString?.(),
    });

    item.status = response.failureCount > 0 && response.successCount === 0 ? "failed" : "sent";
    item.sent_at = new Date();
    item.failure_reason = response.failureCount > 0 ? JSON.stringify(response.responses.filter(r => !r.success).map(r => r.error?.message || "")) : undefined;
    await item.save();

    if (response.invalidTokens.length > 0) {
      await DeviceToken.updateMany({ token: { $in: response.invalidTokens } }, { active: false, updatedAt: new Date() });
    }
    results.push(item);
  }
  return results;
}
