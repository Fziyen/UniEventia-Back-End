const express = require("express");
const {
  createEvent,
  getEvents,
  getEventById,
  leaveReview,
  participateEvent,
  deleteEvent,
  updateCoverImage,
  getEventsByOrganizer,
  removeParticipant,
  addComment,
  deleteComment,
  deleteReview,
  updateEvent,
  triggerCleanupJob,
  cancelParticipation,
  getEventImage,
} = require("../controllers/event.controller");
const { getNotifications } = require("../controllers/notification.controller");
const auth = require("../middlewares/auth.middleware");
const uploadimg = require("../middlewares/upload"); // Import the upload middleware

const router = express.Router();

router.post(
  "/",
  auth,
  uploadimg.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "image", maxCount: 1 },
  ]),
  createEvent,
);
router.get("/", getEvents);
router.get("/organizer", auth, getEventsByOrganizer);
router.get("/:id/image", getEventImage);
router.delete("/:id/participants/:participantId", auth, removeParticipant);
router.get("/:id", getEventById);
router.post("/:id/reviews", auth, leaveReview);
router.post("/:id/comments", auth, addComment);
router.delete("/:id/comments/:commentId", auth, deleteComment);
router.delete("/:id/reviews/:reviewId", auth, deleteReview);
router.put("/:id/participate", auth, participateEvent);
router.delete("/:id/participate", auth, cancelParticipation);
router.put("/:id", auth, uploadimg.single("coverImage"), updateEvent); // Route for updating event details
router.delete("/:id", auth, deleteEvent);
router.put(
  "/:id/cover-image",
  auth,
  uploadimg.single("coverImage"),
  updateCoverImage,
); // Route for uploading cover image

// Add a new route to get notifications
router.get("/notifications", auth, getNotifications);

// Manual cleanup trigger (for admin/testing - should be protected in production)
router.post("/admin/cleanup-old-events", triggerCleanupJob);

module.exports = router;
