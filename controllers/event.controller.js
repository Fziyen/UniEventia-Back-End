// controllers/event.controller.js
const Event = require("../models/Events");
const Notification = require("../models/Notifications");
const Review = require("../models/Reviews");
const EventComment = require("../models/EventComments");
const User = require("../models/User");
const {
  storeImage,
  getImage,
  streamImage,
  deleteImage,
} = require("../services/imageStorage");
const { deleteEventAndAssociatedData } = require("../services/cascadeDeletion");

const validateEventInput = ({
  title,
  description,
  startDate,
  endDate,
  location,
  maxParticipants,
}) => {
  const normalizedTitle = String(title || "").trim();
  const normalizedDescription = String(description || "").trim();
  const normalizedLocation = String(location || "").trim();
  const normalizedCapacity = Number(maxParticipants ?? 50);

  if (!normalizedTitle || !normalizedDescription || !normalizedLocation) {
    return {
      ok: false,
      message: "Title, description, and location are required.",
    };
  }

  if (
    !Number.isInteger(normalizedCapacity) ||
    normalizedCapacity < 1 ||
    normalizedCapacity > 100000
  ) {
    return {
      ok: false,
      message:
        "Maximum participants must be a whole number between 1 and 100,000.",
    };
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return {
      ok: false,
      message: "Valid start date and end date are required.",
    };
  }

  if (end <= start) {
    return {
      ok: false,
      message: "End date must be after the start date.",
    };
  }

  return {
    ok: true,
    message: "Validation successful",
    data: {
      title: normalizedTitle,
      description: normalizedDescription,
      startDate,
      endDate,
      location: normalizedLocation,
      maxParticipants: normalizedCapacity,
    },
  };
};

const validateParticipationInput = ({ eventId }) => {
  const normalizedEventId = String(eventId || "").trim();
  if (!normalizedEventId) {
    return {
      ok: false,
      message: "Event ID is required.",
    };
  }

  return {
    ok: true,
    message: "Validation successful",
    data: { eventId: normalizedEventId },
  };
};

const getEventParticipationState = (event, userId) => {
  if (!event || !userId) {
    return "guest";
  }

  const organizerId = event.organizer?._id || event.organizer;
  if (String(organizerId) === String(userId)) {
    return "organizer";
  }

  const participants = Array.isArray(event.participants)
    ? event.participants
    : [];
  const isJoined = participants.some(
    (participant) => String(participant?._id || participant) === String(userId),
  );

  if (isJoined) {
    return "joined";
  }

  return "available";
};

// Rate limiting helper: Check 24-hour event creation limit
const checkEventCreationRateLimit = async (organizerId) => {
  const EVENTS_LIMIT_24H = 8;
  const HOURS_24 = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  const twentyFourHoursAgo = new Date(Date.now() - HOURS_24);

  try {
    // Count events created by this organizer in the last 24 hours
    const recentEventCount = await Event.countDocuments({
      organizer: organizerId,
      createdAt: { $gte: twentyFourHoursAgo },
    });

    return {
      isAllowed: recentEventCount < EVENTS_LIMIT_24H,
      currentCount: recentEventCount,
      limit: EVENTS_LIMIT_24H,
      remainingCount: Math.max(0, EVENTS_LIMIT_24H - recentEventCount),
    };
  } catch (error) {
    // If there's a database error, log it and allow the request to proceed
    console.error("Rate limit check error:", error);
    return {
      isAllowed: true,
      currentCount: 0,
      limit: EVENTS_LIMIT_24H,
      remainingCount: EVENTS_LIMIT_24H,
    };
  }
};

exports.validateEventInput = validateEventInput;
exports.validateParticipationInput = validateParticipationInput;
exports.getEventParticipationState = getEventParticipationState;
exports.checkEventCreationRateLimit = checkEventCreationRateLimit;

exports.createEvent = async (req, res) => {
  const validation = validateEventInput(req.body);
  if (!validation.ok) {
    return res.status(400).json({ message: validation.message });
  }

  try {
    const currentUser = await User.findById(req.user.id).select("role");
    if (!currentUser || currentUser.role !== "Organizer") {
      return res
        .status(403)
        .json({ message: "Access denied. Only organizers can create events." });
    }

    // Check rate limit: max 8 events per 24 hours
    const rateLimitCheck = await checkEventCreationRateLimit(req.user.id);

    if (!rateLimitCheck.isAllowed) {
      return res.status(429).json({
        message: `Rate limit exceeded. You have reached the maximum of ${rateLimitCheck.limit} events per 24 hours.`,
        errorCode: "RATE_LIMIT_EXCEEDED",
        limit: rateLimitCheck.limit,
        current: rateLimitCheck.currentCount,
        remaining: rateLimitCheck.remainingCount,
        resetTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    const {
      title,
      description,
      startDate,
      endDate,
      location,
      maxParticipants,
    } = validation.data;
    const coverImageFile =
      req.files?.coverImage?.[0] || req.files?.image?.[0] || req.file;
    const event = new Event({
      title,
      description,
      startDate,
      endDate,
      location,
      maxParticipants,
      organizer: req.user.id,
    });

    if (coverImageFile) {
      event.coverImageFileId = await storeImage({
        buffer: coverImageFile.buffer,
        filename: coverImageFile.originalname,
        contentType: coverImageFile.mimetype,
      });
      event.coverImage = `/api/events/${event._id}/image`;
    }
    await event.save();

    res.status(201).json({
      message: "Event created successfully",
      event,
      rateLimit: {
        limit: rateLimitCheck.limit,
        current: rateLimitCheck.currentCount + 1, // Include the just-created event
        remaining: rateLimitCheck.remainingCount - 1,
      },
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Event creation failed" });
  }
};

// Get all events
exports.getEvents = async (req, res) => {
  try {
    const events = await Event.find()
      .populate(
        "organizer participants",
        "fname lname username profilePicture bio role createdAt",
      )
      .populate("reviews comments");
    await Review.populate(events, {
      path: "reviews.user",
      select: "fname lname username profilePicture bio role createdAt",
    });
    await EventComment.populate(events, {
      path: "comments.user",
      select: "fname lname username profilePicture bio role createdAt",
    });
    res.status(200).json(events);
  } catch (error) {
    res.status(400).send(error.message);
  }
};

// Get a single event by ID
exports.getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate(
        "organizer participants",
        "fname lname username profilePicture bio role createdAt",
      )
      .populate("reviews comments");
    await Review.populate(event, {
      path: "reviews.user",
      select: "fname lname username profilePicture bio role createdAt",
    });
    await EventComment.populate(event, {
      path: "comments.user",
      select: "fname lname username profilePicture bio role createdAt",
    });
    if (!event) {
      return res.status(404).send("Event not found");
    }
    res.status(200).json(event);
  } catch (error) {
    res.status(400).send(error.message);
  }
};

exports.getEventImage = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).select(
      "coverImageFileId",
    );
    if (!event || !event.coverImageFileId) {
      return res.status(404).end();
    }

    const image = await getImage(event.coverImageFileId);
    if (!image) return res.status(404).end();

    res.setHeader(
      "Content-Type",
      image.contentType || "application/octet-stream",
    );
    res.setHeader("Content-Length", image.length);
    streamImage(event.coverImageFileId, res);
  } catch (error) {
    res.status(400).send(error.message);
  }
};

exports.leaveReview = async (req, res) => {
  const { comment, rating } = req.body;
  try {
    const event = await Event.findById(req.params.id).populate(
      "organizer participants",
    );
    if (!event) {
      return res.status(404).send("Event not found");
    }
    if (new Date(event.endDate) >= new Date()) {
      return res
        .status(400)
        .json({ message: "Reviews are available after the event has ended." });
    }
    const wasParticipant = event.participants.some(
      (participant) =>
        String(participant?._id || participant) === String(req.user.id),
    );
    if (!wasParticipant) {
      return res
        .status(403)
        .json({ message: "Only participants can review a completed event." });
    }

    const review = new Review({
      event: event._id,
      user: req.user.id,
      comment,
      rating,
    });
    await review.save();
    event.reviews.push(review._id);
    await event.save();

    const organizer = event.organizer;

    const notification = new Notification({
      recipient: organizer._id,
      event: event._id,
      message: `New review on your event: ${event.title}`,
      type: "review",
    });
    await notification.save();

    res.status(201).send("Review submitted successfully");
  } catch (error) {
    res.status(400).send(error.message);
  }
};

exports.addComment = async (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text || text.length > 500) {
    return res
      .status(400)
      .json({ message: "Comment must be between 1 and 500 characters." });
  }

  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    if (new Date(event.endDate) < new Date()) {
      return res
        .status(400)
        .json({ message: "Comments are only available for upcoming events." });
    }

    const comment = await EventComment.create({
      event: event._id,
      user: req.user.id,
      text,
    });
    event.comments.push(comment._id);
    await event.save();
    await comment.populate("user", "fname lname profilePicture");
    return res.status(201).json(comment);
  } catch (error) {
    return res.status(400).json({ message: "Comment could not be added." });
  }
};

// Participate in an event
exports.participateEvent = async (req, res) => {
  const eventId = String(req.params.id || req.body.eventId || "").trim();
  const userId = req.user.id;

  const validation = validateParticipationInput({ eventId });
  if (!validation.ok) {
    return res.status(400).json({ message: validation.message });
  }

  try {
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    if (String(event.organizer) === String(userId)) {
      return res.status(403).json({
        message: "Organizers cannot participate in their own events.",
      });
    }
    if (new Date(event.startDate) <= new Date()) {
      return res
        .status(400)
        .json({ message: "This event is no longer accepting participants." });
    }
    if (event.participants.length >= event.maxParticipants) {
      return res
        .status(409)
        .json({ message: "This event has reached its participant limit." });
    }

    const alreadyParticipating = event.participants.some(
      (participantId) => String(participantId) === String(userId),
    );

    if (alreadyParticipating) {
      return res.status(200).json({
        message: "You are already participating in this event.",
        event,
      });
    }

    event.participants.push(userId);
    await event.save();

    const notification = new Notification({
      recipient: event.organizer,
      event: eventId,
      message: `A new participant joined your event: ${event.title}`,
      type: "participation",
    });
    await notification.save();

    res.status(201).json({
      message: "Participation successful",
      event,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Participation failed" });
  }
};

// Remove a participant from an event owned by the authenticated organizer.
exports.removeParticipant = async (req, res) => {
  const { id, participantId } = req.params;
  try {
    const event = await Event.findOne({
      _id: id,
      organizer: req.user.id,
    });
    if (!event) {
      return res.status(404).send("Event not found");
    }

    const wasParticipant = event.participants.some(
      (userId) => String(userId) === String(participantId),
    );
    if (!wasParticipant) {
      return res
        .status(404)
        .send("Participant is not registered for this event");
    }

    event.participants.pull(participantId);
    await event.save();
    res.status(200).json({ message: "Participant removed successfully" });
  } catch (error) {
    res.status(400).send(error.message);
  }
};

// Cancel/Withdraw participation from an event (authenticated user removes themselves)
exports.cancelParticipation = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const event = await Event.findById(id).populate("organizer");
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const wasParticipant = event.participants.some(
      (participantId) => String(participantId) === String(userId),
    );

    if (!wasParticipant) {
      return res.status(400).json({
        message: "You are not participating in this event",
      });
    }

    // Remove the user from participants
    event.participants.pull(userId);
    await event.save();

    // Notify the organizer about cancellation
    const notification = new Notification({
      recipient: event.organizer._id,
      event: event._id,
      message: `A participant has withdrawn from your event: ${event.title}`,
      type: "participation",
    });
    await notification.save();

    res.status(200).json({
      message: "You have successfully withdrawn from this event",
      event,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Cancellation failed" });
  }
};

// Delete an event
exports.deleteEvent = async (req, res) => {
  const { id } = req.params;
  try {
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).send("Event not found");
    }
    await deleteEventAndAssociatedData(event);
    res.status(200).json({ message: "Event deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update cover image for an event
exports.updateCoverImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("An image file is required");
    }
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).send("Event not found");
    }
    const oldImageFileId = event.coverImageFileId;
    event.coverImageFileId = await storeImage({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });
    event.coverImage = `/api/events/${event._id}/image`;
    await event.save();
    await deleteImage(oldImageFileId);
    res.status(200).json(event);
  } catch (error) {
    res.status(400).send(error.message);
  }
};

// Update event details and notify all participants
exports.updateEvent = async (req, res) => {
  const { id } = req.params;
  const validation = validateEventInput(req.body);

  if (!validation.ok) {
    return res.status(400).json({ message: validation.message });
  }

  try {
    const event = await Event.findById(id).populate("organizer participants");
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check if the requesting user is the organizer
    if (String(event.organizer._id) !== String(req.user.id)) {
      return res.status(403).json({
        message: "Access denied. Only the organizer can update this event.",
      });
    }

    // Track which fields were updated
    const updatedFields = [];
    const {
      title,
      description,
      startDate,
      endDate,
      location,
      maxParticipants,
    } = validation.data;

    if (event.title !== title) {
      updatedFields.push(`Title: ${event.title} → ${title}`);
      event.title = title;
    }
    if (event.description !== description) {
      updatedFields.push(`Description updated`);
      event.description = description;
    }
    if (
      new Date(event.startDate).toISOString() !==
      new Date(startDate).toISOString()
    ) {
      updatedFields.push(
        `Start Date: ${new Date(event.startDate).toLocaleDateString()} → ${new Date(startDate).toLocaleDateString()}`,
      );
      event.startDate = startDate;
    }
    if (
      new Date(event.endDate).toISOString() !== new Date(endDate).toISOString()
    ) {
      updatedFields.push(
        `End Date: ${new Date(event.endDate).toLocaleDateString()} → ${new Date(endDate).toLocaleDateString()}`,
      );
      event.endDate = endDate;
    }
    if (event.location !== location) {
      updatedFields.push(`Location: ${event.location} → ${location}`);
      event.location = location;
    }
    if (event.maxParticipants !== maxParticipants) {
      updatedFields.push(
        `Max Participants: ${event.maxParticipants} → ${maxParticipants}`,
      );
      event.maxParticipants = maxParticipants;
    }

    let oldCoverImageFileId;

    // Handle cover image update if provided
    if (req.file) {
      updatedFields.push("Cover image updated");
      oldCoverImageFileId = event.coverImageFileId;
      event.coverImageFileId = await storeImage({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });
      event.coverImage = `/api/events/${event._id}/image`;
    }

    // Save the updated event
    await event.save();
    await deleteImage(oldCoverImageFileId);

    // Send notifications to all participants about the event update
    if (event.participants && event.participants.length > 0) {
      const changesSummary =
        updatedFields.length > 0
          ? updatedFields.join(", ")
          : "Event details updated";

      const notificationPromises = event.participants.map((participant) => {
        const notification = new Notification({
          recipient: participant._id,
          event: event._id,
          message: `Event "${event.title}" has been updated: ${changesSummary}`,
          type: "event_update",
        });
        return notification.save();
      });

      await Promise.all(notificationPromises);
    }

    // Populate the response with full details
    await event.populate("organizer participants reviews comments");

    res.status(200).json({
      message: "Event updated successfully",
      event,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Event update failed" });
  }
};

exports.getEventsByOrganizer = async (req, res) => {
  try {
    const events = await Event.find({ organizer: req.user.id })
      .populate(
        "organizer participants",
        "fname lname username profilePicture bio role createdAt",
      )
      .populate("reviews");
    await Review.populate(events, {
      path: "reviews.user",
      select: "fname lname username profilePicture bio role createdAt",
    });
    res.json(events);
  } catch (err) {
    res.status(500).send("Server error");
  }
};

// Manual trigger for cleanup job (admin only - for testing and maintenance)
exports.triggerCleanupJob = async (req, res) => {
  try {
    const { triggerCleanupNow } = require("../jobs/cleanupOldEvents");

    const stats = await triggerCleanupNow();

    res.status(200).json({
      message: "Event cleanup completed",
      stats,
    });
  } catch (error) {
    console.error("Cleanup trigger error:", error);
    res.status(500).json({
      message: "Cleanup job failed",
      error: error.message,
    });
  }
};
