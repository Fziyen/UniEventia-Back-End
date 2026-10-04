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
  cancelParticipation,
  leaveWaitlist,
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
router.get("/notifications", auth, getNotifications);
router.get("/:id", getEventById);
router.post("/:id/reviews", auth, leaveReview);
router.post("/:id/comments", auth, addComment);
router.delete("/:id/comments/:commentId", auth, deleteComment);
router.delete("/:id/reviews/:reviewId", auth, deleteReview);
router.put("/:id/participate", auth, participateEvent);
router.delete("/:id/participate", auth, cancelParticipation);
router.delete("/:id/waitlist", auth, leaveWaitlist);
router.put("/:id", auth, uploadimg.single("coverImage"), updateEvent); // Route for updating event details
router.delete("/:id", auth, deleteEvent);
router.put(
  "/:id/cover-image",
  auth,
  uploadimg.single("coverImage"),
  updateCoverImage,
); // Route for uploading cover image

// Cleanup runs through the scheduled job; it is deliberately not exposed over HTTP.

module.exports = router;
