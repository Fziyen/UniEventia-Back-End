const Event = require("../models/Events");
const Review = require("../models/Reviews");
const EventComment = require("../models/EventComments");
const Registration = require("../models/Registrations");
const Notification = require("../models/Notifications");
const { deleteImage } = require("./imageStorage");

const deleteEventAndAssociatedData = async (event) => {
  const eventId = event._id;
  const stats = {
    eventDeleted: false,
    reviewsDeleted: 0,
    commentsDeleted: 0,
    registrationsDeleted: 0,
    notificationsDeleted: 0,
    fileDeleted: false,
  };

  stats.fileDeleted = await deleteImage(event.coverImageFileId);

  const [
    reviewsResult,
    commentsResult,
    registrationsResult,
    notificationsResult,
  ] = await Promise.all([
    Review.deleteMany({ event: eventId }),
    EventComment.deleteMany({ event: eventId }),
    Registration.deleteMany({ event: eventId }),
    Notification.deleteMany({ event: eventId }),
  ]);

  stats.reviewsDeleted = reviewsResult.deletedCount;
  stats.commentsDeleted = commentsResult.deletedCount;
  stats.registrationsDeleted = registrationsResult.deletedCount;
  stats.notificationsDeleted = notificationsResult.deletedCount;

  const eventResult = await Event.deleteOne({ _id: eventId });
  stats.eventDeleted = eventResult.deletedCount > 0;
  return stats;
};

const deleteUserAndAssociatedData = async (user) => {
  const userId = user._id;
  const stats = {
    eventsDeleted: 0,
    reviewsDeleted: 0,
    commentsDeleted: 0,
    registrationsDeleted: 0,
    notificationsDeleted: 0,
    profileImageDeleted: false,
    userDeleted: false,
  };

  const ownedEvents = await Event.find({ organizer: userId });
  for (const event of ownedEvents) {
    const eventStats = await deleteEventAndAssociatedData(event);
    if (eventStats.eventDeleted) stats.eventsDeleted += 1;
  }

  const [reviews, comments, registrations, notifications] = await Promise.all([
    Review.find({ user: userId }).select("_id"),
    EventComment.find({ user: userId }).select("_id"),
    Registration.deleteMany({ user: userId }),
    Notification.deleteMany({ recipient: userId }),
  ]);

  const reviewIds = reviews.map((review) => review._id);
  const commentIds = comments.map((comment) => comment._id);

  await Promise.all([
    Review.deleteMany({ user: userId }),
    EventComment.deleteMany({ user: userId }),
    Event.updateMany(
      {},
      {
        $pull: {
          participants: userId,
          reviews: { $in: reviewIds },
          comments: { $in: commentIds },
        },
      },
    ),
  ]);

  stats.reviewsDeleted = reviews.length;
  stats.commentsDeleted = comments.length;
  stats.registrationsDeleted = registrations.deletedCount;
  stats.notificationsDeleted = notifications.deletedCount;
  stats.profileImageDeleted = await deleteImage(user.profilePictureFileId);
  stats.userDeleted = (await user.deleteOne()).deletedCount > 0;

  return stats;
};

module.exports = {
  deleteEventAndAssociatedData,
  deleteUserAndAssociatedData,
};
