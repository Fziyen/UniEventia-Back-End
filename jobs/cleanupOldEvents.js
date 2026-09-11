const Event = require("../models/Events");
const { deleteEventAndAssociatedData } = require("../services/cascadeDeletion");

const DAYS_TO_RETAIN = 31; // Keep events for 31 days after they end
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // Run cleanup daily

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
        totalRegistrationsDeleted: 0,
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
      totalRegistrationsDeleted: 0,
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
        totalStats.totalRegistrationsDeleted += stats.registrationsDeleted;
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
      totalRegistrationsDeleted: 0,
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
};
