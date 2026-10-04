const { Types } = require("mongoose");
const { promoteWaitlist } = require("../services/waitlist");
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

const eventHasEnded = event => new Date(event.endDate).getTime() <= Date.now();
const endedEventMessage = "This event has ended and can no longer be edited.";

const publicProfileFields =
  "fname lname username email emailPublic profilePicture bio role createdAt";

const stripPrivateEmails = (events) => {
  const sanitizeUser = (user) => {
    if (!user || typeof user !== "object" || user._bsontype === "ObjectId") return user;
    const safeUser = user.toObject ? user.toObject() : { ...user };
    if (!safeUser.emailPublic) delete safeUser.email;
    return safeUser;
  };

  return events.map((event) => {
    const plainEvent = event.toObject ? event.toObject() : event;
    plainEvent.organizer = sanitizeUser(plainEvent.organizer);
    plainEvent.participants = (plainEvent.participants || []).map(sanitizeUser);
    plainEvent.reviews = (plainEvent.reviews || []).map((review) => ({
      ...review,
      user: sanitizeUser(review.user),
    }));
    plainEvent.comments = (plainEvent.comments || []).map((comment) => ({
      ...comment,
      user: sanitizeUser(comment.user),
    }));
    return plainEvent;
  });
};

const validateEventInput = ({
  title,
  description,
  startDate,
  endDate,
  location,
  maxParticipants,
  language, wheelchairAccess, cost, transport, whatToBring,
}) => {
  const practical = {};
  for (const [key, value, limit] of [["language", language, 100], ["cost", cost, 200], ["transport", transport, 2000], ["whatToBring", whatToBring, 2000]]) {
    if (value !== undefined) {
      if (typeof value !== "string" || value.trim().length > limit) return { ok: false, message: `${key} must be text of at most ${limit} characters.` };
      practical[key] = value.trim();
    }
  }
  if (wheelchairAccess !== undefined) {
    if (!["unknown", "yes", "partial", "no"].includes(wheelchairAccess)) return { ok: false, message: "Choose a valid wheelchair access option." };
    practical.wheelchairAccess = wheelchairAccess;
  }
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

  if (normalizedTitle.length > 200 || normalizedDescription.length > 10000 || normalizedLocation.length > 500) {
    return { ok: false, message: "Event text exceeds the allowed length." };
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

  const hasExplicitTime = value => value instanceof Date ||
    (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value));
  if (!hasExplicitTime(startDate) || !hasExplicitTime(endDate)) {
    return { ok: false, message: "Start and end dates must include a time and timezone." };
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
      ...practical,
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

  if ((event.waitlist || []).some(id => String(id) === String(userId))) return "waitlisted";

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
      isAllowed: false,
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
      ...validation.data,
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
      .populate("organizer participants", publicProfileFields)
      .populate("reviews comments");
    await Review.populate(events, {
      path: "reviews.user",
      select: publicProfileFields,
    });
    await EventComment.populate(events, {
      path: "comments.user",
      select: publicProfileFields,
    });
    res.status(200).json(stripPrivateEmails(events));
  } catch (error) {
    res.status(400).send(error.message);
  }
};

// Get a single event by ID
exports.getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate("organizer participants", publicProfileFields)
      .populate("reviews comments");
    await Review.populate(event, {
      path: "reviews.user",
      select: publicProfileFields,
    });
    await EventComment.populate(event, {
      path: "comments.user",
      select: publicProfileFields,
    });
    if (!event) {
      return res.status(404).send("Event not found");
    }
    res.status(200).json(stripPrivateEmails([event])[0]);
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

const deleteOwnedEntry = async ({ model, entryId, eventId, userId, field }) => {
  const entry = await model.findById(entryId);
  if (!entry || String(entry.event) !== String(eventId)) {
    return { status: 404, message: "Entry not found." };
  }
  if (String(entry.user) !== String(userId)) {
    return { status: 403, message: "You can only delete your own entry." };
  }

  await model.deleteOne({ _id: entryId });
  await Event.findByIdAndUpdate(eventId, { $pull: { [field]: entryId } });
  return null;
};

exports.deleteComment = async (req, res) => {
  try {
    const result = await deleteOwnedEntry({
      model: EventComment,
      entryId: req.params.commentId,
      eventId: req.params.id,
      userId: req.user.id,
      field: "comments",
    });
    if (result)
      return res.status(result.status).json({ message: result.message });
    return res.status(204).send();
  } catch (error) {
    return res.status(400).json({ message: "Comment could not be deleted." });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const result = await deleteOwnedEntry({
      model: Review,
      entryId: req.params.reviewId,
      eventId: req.params.id,
      userId: req.user.id,
      field: "reviews",
    });
    if (result)
      return res.status(result.status).json({ message: result.message });
    return res.status(204).send();
  } catch (error) {
    return res.status(400).json({ message: "Review could not be deleted." });
  }
};

// Joining a full event adds the user to the FIFO waitlist.
exports.participateEvent = async (req, res) => {
  const eventId = req.params.id;
  const userId = req.user.id;
  try {
    await promoteWaitlist(eventId);
    const event = await Event.findOneAndUpdate({
      _id: eventId, organizer: { $ne: userId }, startDate: { $gt: new Date() },
      participants: { $ne: userId }, waitlist: { $ne: userId },
    }, [{ $set: {
      participants: { $cond: [
        { $and: [{ $lt: [{ $size: { $ifNull: ['$participants', []] } }, { $ifNull: ['$maxParticipants', 50] }] }, { $eq: [{ $size: { $ifNull: ['$waitlist', []] } }, 0] }] },
        { $concatArrays: [{ $ifNull: ['$participants', []] }, [{ $literal: new Types.ObjectId(userId) }]] }, { $ifNull: ['$participants', []] },
      ] },
      waitlist: { $cond: [
        { $and: [{ $lt: [{ $size: { $ifNull: ['$participants', []] } }, { $ifNull: ['$maxParticipants', 50] }] }, { $eq: [{ $size: { $ifNull: ['$waitlist', []] } }, 0] }] },
        { $ifNull: ['$waitlist', []] },
        { $concatArrays: [{ $ifNull: ['$waitlist', []] }, [{ $literal: new Types.ObjectId(userId) }]] },
      ] },
    } }], { new: true });
    const current = event ? await promoteWaitlist(eventId) : await Event.findById(eventId);
    if (!current) return res.status(404).json({ message: 'Event not found.' });
    if (String(current.organizer) === String(userId)) return res.status(403).json({ message: 'Organizers cannot join their own events.' });
    if (new Date(current.startDate) <= new Date()) return res.status(400).json({ message: 'This event is no longer accepting participants.' });
    const position = (current.waitlist || []).findIndex(id => String(id) === String(userId)) + 1;
    const status = position ? 'waitlisted' : 'joined';
    if (event && !position) {
      try {
        await Notification.create({ recipient: current.organizer, event: eventId, type: 'participation', message: `A new participant joined your event: ${current.title}` });
      } catch (error) { console.error('Participation notification failed:', error.message); }
    }
    return res.status(event ? 201 : 200).json({ status, position: position || null, message: position ? `You are on the waitlist at position ${position}.` : 'You are participating in this event.', event: stripPrivateEmails([current])[0] });
  } catch (error) { return res.status(400).json({ message: 'Could not join this event.' }); }
};

exports.leaveWaitlist = async (req, res) => {
  try {
    const event = await Event.findOneAndUpdate({ _id: req.params.id, waitlist: req.user.id }, { $pull: { waitlist: req.user.id } }, { new: true });
    if (!event) return res.status(404).json({ message: 'Waitlist entry not found. Refresh to check whether you have been promoted.' });
    await promoteWaitlist(event._id);
    return res.status(200).json({ message: 'You left the waitlist.' });
  } catch (error) { return res.status(400).json({ message: 'Could not leave the waitlist.' }); }
};

exports.removeParticipant = async (req, res) => {
  try {
    const event = await Event.findOneAndUpdate({ _id: req.params.id, organizer: req.user.id, endDate: { $gt: new Date() }, participants: req.params.participantId }, { $pull: { participants: req.params.participantId } }, { new: true });
    if (!event) return res.status(404).json({ message: 'Event or participant not found, or the event has ended.' });
    await promoteWaitlist(event._id);
    return res.status(200).json({ message: 'Participant removed successfully.' });
  } catch (error) { return res.status(400).json({ message: 'Could not remove participant.' }); }
};

exports.cancelParticipation = async (req, res) => {
  try {
    const event = await Event.findOneAndUpdate({ _id: req.params.id, participants: req.user.id }, { $pull: { participants: req.user.id } }, { new: true });
    if (!event) return res.status(404).json({ message: 'Participation not found.' });
    const updated = await promoteWaitlist(event._id);
    try {
      await Notification.create({ recipient: event.organizer, event: event._id, type: 'participation', message: `A participant has withdrawn from your event: ${event.title}` });
    } catch (error) { console.error('Withdrawal notification failed:', error.message); }
    return res.status(200).json({ message: 'You have withdrawn from this event.', event: stripPrivateEmails([updated])[0] });
  } catch (error) { return res.status(400).json({ message: 'Could not withdraw from this event.' }); }
};

// Delete an event
exports.deleteEvent = async (req, res) => {
  const { id } = req.params;
  try {
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).send("Event not found");
    }
    if (String(event.organizer) !== String(req.user.id)) {
      return res.status(403).json({ message: "Only the organizer can delete this event." });
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
    if (String(event.organizer) !== String(req.user.id)) {
      return res.status(403).json({ message: "Only the organizer can change this image." });
    }
    if (eventHasEnded(event)) {
      return res.status(403).json({ message: endedEventMessage });
    }
    const oldImageFileId = event.coverImageFileId;
    event.coverImageFileId = await storeImage({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });
    event.coverImage = `/api/events/${event._id}/image`;
    const saved = await Event.findOneAndUpdate({
      _id: event._id, organizer: req.user.id, endDate: { $gt: new Date() },
    }, { $set: { coverImage: event.coverImage, coverImageFileId: event.coverImageFileId } }, { new: true });
    if (!saved) {
      await deleteImage(event.coverImageFileId);
      return res.status(409).json({ message: "The event ended or changed. Refresh before editing." });
    }
    await deleteImage(oldImageFileId);
    res.status(200).json(saved);
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
    const event = await Event.findById(id).populate("organizer participants", publicProfileFields);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Check if the requesting user is the organizer
    if (String(event.organizer._id) !== String(req.user.id)) {
      return res.status(403).json({
        message: "Access denied. Only the organizer can update this event.",
      });
    }

    // Check the stored end time before accepting replacement dates from the request.
    if (eventHasEnded(event)) {
      return res.status(403).json({ message: endedEventMessage });
    }
    if (validation.data.maxParticipants < event.participants.length) {
      return res.status(400).json({ message: "Capacity cannot be lower than the current participant count." });
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

    for (const key of ["language", "wheelchairAccess", "cost", "transport", "whatToBring"]) {
      if (validation.data[key] !== undefined && event[key] !== validation.data[key]) {
        event[key] = validation.data[key];
        updatedFields.push("Accessibility and practical details updated");
      }
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

    // Check live attendance and update capacity in the same write.
    const saved = await Event.findOneAndUpdate({
      _id: id, organizer: req.user.id, endDate: { $gt: new Date() },
      $expr: { $lte: [{ $size: '$participants' }, maxParticipants] },
    }, { $set: {
      ...validation.data,
      ...(req.file ? { coverImage: event.coverImage, coverImageFileId: event.coverImageFileId } : {}),
    } }, { new: true, runValidators: true });
    if (!saved) {
      if (req.file) await deleteImage(event.coverImageFileId);
      return res.status(409).json({ message: "The event ended or attendance changed. Refresh before editing." });
    }
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

    await promoteWaitlist(event._id);
    // Reload after promotion so the response includes the current queue.
    const currentEvent = await Event.findById(event._id);
    await currentEvent.populate("organizer participants", publicProfileFields);
    await currentEvent.populate("reviews comments");

    res.status(200).json({
      message: "Event updated successfully",
      event: stripPrivateEmails([currentEvent])[0],
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Event update failed" });
  }
};

exports.getEventsByOrganizer = async (req, res) => {
  try {
    const events = await Event.find({ organizer: req.user.id })
      .populate("organizer participants", publicProfileFields)
      .populate("reviews");
    await Review.populate(events, {
      path: "reviews.user",
      select: publicProfileFields,
    });
    res.json(stripPrivateEmails(events));
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
