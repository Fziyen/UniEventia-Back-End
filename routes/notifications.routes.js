const express = require("express");
const {
  getNotifications,
  countUnread,
  markRead,
  markAllRead,
  removeNotification,
  removeAllNotifications,
} = require("../controllers/notification.controller");
const auth = require("../middlewares/auth.middleware");

const router = express.Router();

router.get("/", auth, getNotifications);
router.get("/unread-count", auth, countUnread);
router.patch("/read-all", auth, markAllRead);
router.delete("/clear-all", auth, removeAllNotifications);
router.patch("/:id/read", auth, markRead);
router.delete("/:id", auth, removeNotification);

module.exports = router;
