const Notification = require("../models/Notifications");

// Optional Socket.IO injection
let io = null;
function setIo(_io) {
  io = _io;
}

function validatePaginationQuery({ page, limit, unreadOnly }) {
  const parsedPage = Number(page || 1);
  const parsedLimit = Number(limit || 20);
  const safePage =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safeLimit = Number.isFinite(parsedLimit)
    ? Math.min(100, Math.max(1, parsedLimit))
    : 20;

  return {
    ok: true,
    message: "Validation successful",
    data: {
      page: safePage,
      limit: safeLimit,
      unreadOnly: String(unreadOnly) === "true",
    },
  };
}

function validateNotificationTarget(id) {
  const safeId = String(id || "").trim();
  if (!safeId || safeId === "undefined") {
    return {
      ok: false,
      message: "Notification ID is required.",
    };
  }

  return {
    ok: true,
    message: "Validation successful",
    data: { id: safeId },
  };
}

module.exports.validatePaginationQuery = validatePaginationQuery;
module.exports.validateNotificationTarget = validateNotificationTarget;

// Create a notification
async function createNotification(req, res) {
  try {
    const { recipient, event, message, type } = req.body;
    const doc = await Notification.notify({ recipient, event, message, type });

    if (io && recipient) {
      io.to(String(recipient)).emit("notification:new", doc);
    }
    res.status(201).json(doc);
  } catch (error) {
    res.status(400).json({ message: "Unable to create notification." });
  }
}

// Get notifications for the authenticated user
// Supports ?unreadOnly=true, ?page=1&limit=20
async function getNotifications(req, res) {
  try {
    const { page, limit, unreadOnly } = req.query;
    const pagination = validatePaginationQuery({ page, limit, unreadOnly });

    const baseQuery = { recipient: req.user.id };
    if (pagination.data.unreadOnly) baseQuery.read = false;

    if (!page && !limit) {
      const items = await Notification.find(baseQuery).sort({ createdAt: -1 });
      return res.status(200).json(items);
    }

    const skip = (pagination.data.page - 1) * pagination.data.limit;

    const [items, total, unread] = await Promise.all([
      Notification.find(baseQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pagination.data.limit),
      Notification.countDocuments({ recipient: req.user.id }),
      Notification.countDocuments({ recipient: req.user.id, read: false }),
    ]);

    res.status(200).json({
      items,
      page: pagination.data.page,
      limit: pagination.data.limit,
      total,
      unread,
    });
  } catch (error) {
    res.status(500).json({ message: "Unable to load notifications." });
  }
}

// Count unread notifications for the authenticated user
async function countUnread(req, res) {
  try {
    const unread = await Notification.countDocuments({
      recipient: req.user.id,
      read: false,
    });
    res.status(200).json({ unread });
  } catch (error) {
    res.status(500).json({ message: "Unable to count notifications." });
  }
}

// Mark a single notification as read
async function markRead(req, res) {
  try {
    const validation = validateNotificationTarget(req.params.id);
    if (!validation.ok) {
      return res.status(400).json({ message: validation.message });
    }

    const updated = await Notification.findOneAndUpdate(
      { _id: validation.data.id, recipient: req.user.id },
      { $set: { read: true } },
      { new: true },
    );
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.status(200).json(updated);
  } catch (error) {
    res.status(400).json({ message: "Unable to update notification." });
  }
}

// Mark all notifications as read
async function markAllRead(req, res) {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user.id, read: false },
      { $set: { read: true } },
    );
    res.status(200).json({ modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ message: "Unable to update notifications." });
  }
}

// Delete a notification
async function removeNotification(req, res) {
  try {
    const { id } = req.params;
    const { deletedCount } = await Notification.deleteOne({
      _id: id,
      recipient: req.user.id,
    });
    if (!deletedCount) return res.status(404).json({ error: "Not found" });
    res.status(200).json({ deleted: true });
  } catch (error) {
    res.status(400).json({ message: "Unable to delete notification." });
  }
}

module.exports = {
  setIo,
  createNotification,
  getNotifications,
  countUnread,
  markRead,
  markAllRead,
  removeNotification,
};
