// controllers/event.controller.js
const Event = require("../models/Events");
const Notification = require("../models/Notifications");
const Review = require("../models/Reviews");
const EventComment = require("../models/EventComments");

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
  const normalizedCapacity = Number(maxParticipants || 50);

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

  if (end < start) {
    return {
      ok: false,
      message: "End date cannot be before the start date.",
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

exports.validateEventInput = validateEventInput;
exports.validateParticipationInput = validateParticipationInput;
exports.getEventParticipationState = getEventParticipationState;

exports.createEvent = async (req, res) => {
  const validation = validateEventInput(req.body);
  if (!validation.ok) {
    return res.status(400).json({ message: validation.message });
  }

  if (req.user.role !== "Organizer") {
    return res
      .status(403)
      .json({ message: "Access denied. Only organizers can create events." });
  }

  const { title, description, startDate, endDate, location, maxParticipants } =
    validation.data;
  const coverImageFile =
    req.files?.coverImage?.[0] || req.files?.image?.[0] || req.file;
  const coverImage = coverImageFile
    ? `/uploads/${coverImageFile.filename}`
    : undefined;

  try {
    const event = new Event({
      title,
      description,
      startDate,
      endDate,
      location,
      maxParticipants,
      organizer: req.user.id,
      coverImage,
    });
    await event.save();
    res.status(201).json({
      message: "Event created successfully",
      event,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Event creation failed" });
  }
};

// Get all events
exports.getEvents = async (req, res) => {
  try {
    const events = await Event.find().populate(
      "organizer participants reviews comments",
    );
    await Review.populate(events, {
      path: "reviews.user",
      select: "fname lname name profilePicture",
    });
    await EventComment.populate(events, {
      path: "comments.user",
      select: "fname lname profilePicture",
    });
    res.status(200).json(events);
  } catch (error) {
    res.status(400).send(error.message);
  }
};

// Get a single event by ID
exports.getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).populate(
      "organizer participants reviews comments",
    );
    if (!event) {
      return res.status(404).send("Event not found");
    }
    res.status(200).json(event);
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
      return res
        .status(403)
        .json({
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

// Delete an event
exports.deleteEvent = async (req, res) => {
  const { id } = req.params;
  try {
    const deletedEvent = await Event.findByIdAndDelete(id);
    if (!deletedEvent) {
      return res.status(404).send("Event not found");
    }
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
    event.coverImage = `/uploads/${req.file.filename}`;
    await event.save();
    res.status(200).json(event);
  } catch (error) {
    res.status(400).send(error.message);
  }
};

exports.getEventsByOrganizer = async (req, res) => {
  try {
    const events = await Event.find({ organizer: req.user.id }).populate(
      "organizer participants reviews",
    );
    await Review.populate(events, {
      path: "reviews.user",
      select: "fname lname profilePicture email",
    });
    res.json(events);
  } catch (err) {
    res.status(500).send("Server error");
  }
};
