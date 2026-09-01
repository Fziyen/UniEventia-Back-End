const fs = require("fs");
const path = require("path");
const Event = require("../models/Events");
const Review = require("../models/Reviews");
const EventComment = require("../models/EventComments");
const Notification = require("../models/Notifications");

const DAYS_TO_RETAIN = 31; // Keep events for 31 days after they end
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // Run cleanup daily

/**
 * Delete a file from the uploads directory
 * @param {string} filePath - The relative file path to delete
 * @returns {Promise<boolean>} - True if file was deleted, false if not found or error
 */
const deleteFileFromDisk = async (filePath) => {
  if (!filePath) return false;

  try {
    // Extract just the filename from the path (e.g., "/uploads/1234567-image.jpg" -> "1234567-image.jpg")
    const fileName = path.basename(filePath);
    const fullPath = path.join(__dirname, "../uploads", fileName);

    // Check if file exists
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`Deleted file: ${fileName}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error.message);
    return false;
  }
};

/**
 * Delete an event and all its associated data
 * @param {Object} event - The event document to delete
 * @returns {Promise<Object>} - Deletion statistics
 */
const deleteEventAndAssociatedData = async (event) => {
  const stats = {
    eventDeleted: false,
    reviewsDeleted: 0,
    commentsDeleted: 0,
    notificationsDeleted: 0,
    fileDeleted: false,
    error: null,
  };

  try {
    const eventId = event._id;

    // Delete cover image from disk
    if (event.coverImage) {
      stats.fileDeleted = await deleteFileFromDisk(event.coverImage);
    }

    // Delete all reviews associated with this event
    const reviewsResult = await Review.deleteMany({ event: eventId });
    stats.reviewsDeleted = reviewsResult.deletedCount;

    // Delete all comments associated with this event
    const commentsResult = await EventComment.deleteMany({ event: eventId });
    stats.commentsDeleted = commentsResult.deletedCount;

    // Delete all notifications associated with this event
    const notificationsResult = await Notification.deleteMany({
      event: eventId,
    });
    stats.notificationsDeleted = notificationsResult.deletedCount;

    // Delete the event itself
    const eventResult = await Event.deleteOne({ _id: eventId });
    stats.eventDeleted = eventResult.deletedCount > 0;

    if (stats.eventDeleted) {
      console.log(
        `[Cleanup] Deleted event "${event.title}" (ID: ${eventId}) and associated data:`,
        stats,
      );
    }

    return stats;
  } catch (error) {
    stats.error = error.message;
    console.error(`Error deleting event ${event._id}:`, error);
    return stats;
  }
};

/**
 * Main cleanup function that finds and deletes events older than DAYS_TO_RETAIN
 * @returns {Promise<Object>} - Overall cleanup statistics
 */
const cleanupOldEvents = async () => {
  try {
    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - DAYS_TO_RETAIN);

    console.log(
      `[Cleanup] Starting cleanup of events ended before ${thirtyOneDaysAgo.toISOString()}`,
    );

    // Find all events that ended 31+ days ago
    const oldEvents = await Event.find({
      endDate: { $lt: thirtyOneDaysAgo },
    });

    if (oldEvents.length === 0) {
      console.log("[Cleanup] No events to clean up.");
      return {
        totalEventsCleaned: 0,
        totalReviewsDeleted: 0,
        totalCommentsDeleted: 0,
        totalNotificationsDeleted: 0,
        totalFilesDeleted: 0,
        errors: 0,
      };
    }

    console.log(`[Cleanup] Found ${oldEvents.length} events to clean up.`);

    let totalStats = {
      totalEventsCleaned: 0,
      totalReviewsDeleted: 0,
      totalCommentsDeleted: 0,
      totalNotificationsDeleted: 0,
      totalFilesDeleted: 0,
      errors: 0,
    };

    // Process each old event
    for (const event of oldEvents) {
      const stats = await deleteEventAndAssociatedData(event);

      if (stats.eventDeleted) {
        totalStats.totalEventsCleaned += 1;
        totalStats.totalReviewsDeleted += stats.reviewsDeleted;
        totalStats.totalCommentsDeleted += stats.commentsDeleted;
        totalStats.totalNotificationsDeleted += stats.notificationsDeleted;
        if (stats.fileDeleted) totalStats.totalFilesDeleted += 1;
      }

      if (stats.error) {
        totalStats.errors += 1;
      }
    }

    console.log(`[Cleanup] Cleanup completed:`, totalStats);

    return totalStats;
  } catch (error) {
    console.error("[Cleanup] Fatal cleanup error:", error);
    return {
      totalEventsCleaned: 0,
      totalReviewsDeleted: 0,
      totalCommentsDeleted: 0,
      totalNotificationsDeleted: 0,
      totalFilesDeleted: 0,
      errors: 1,
    };
  }
};

/**
 * Initialize the cleanup job with a daily schedule
 * Cleanup runs at 2 AM UTC every day
 */
const initializeCleanupJob = () => {
  // Calculate time until next 2 AM UTC
  const now = new Date();
  const next2AM = new Date(now);
  next2AM.setUTCHours(2, 0, 0, 0);

  // If 2 AM already passed today, schedule for tomorrow
  if (next2AM <= now) {
    next2AM.setUTCDate(next2AM.getUTCDate() + 1);
  }

  const timeUntilNext2AM = next2AM.getTime() - now.getTime();

  console.log(
    `[Cleanup] Cleanup job scheduled. Next cleanup at ${next2AM.toISOString()}`,
  );

  // Schedule first cleanup
  setTimeout(() => {
    cleanupOldEvents();
    // Then run daily
    setInterval(() => {
      cleanupOldEvents();
    }, CLEANUP_INTERVAL);
  }, timeUntilNext2AM);
};

/**
 * Manually trigger cleanup (for testing or immediate use)
 * @returns {Promise<Object>} - Cleanup statistics
 */
const triggerCleanupNow = async () => {
  console.log("[Cleanup] Manual cleanup triggered.");
  return await cleanupOldEvents();
};

module.exports = {
  initializeCleanupJob,
  triggerCleanupNow,
  cleanupOldEvents,
  deleteEventAndAssociatedData,
  deleteFileFromDisk,
};
