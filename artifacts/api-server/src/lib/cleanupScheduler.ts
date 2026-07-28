import { cleanupOldJobs } from "../store.js";
import { logger } from "./logger.js";

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start automatic cleanup of old jobs
 * Runs every hour to remove jobs older than 24 hours
 */
export function startCleanupScheduler(): void {
  if (cleanupInterval) {
    logger.warn("Cleanup scheduler already running");
    return;
  }

  // Run cleanup every hour (3600000 ms)
  cleanupInterval = setInterval(() => {
    try {
      const deletedCount = cleanupOldJobs(24); // Clean up jobs older than 24 hours
      if (deletedCount > 0) {
        logger.info({ deletedCount }, "Automatic job cleanup completed");
      }
    } catch (e) {
      logger.error({ e }, "Automatic job cleanup failed");
    }
  }, 3600000); // 1 hour

  logger.info("Automatic job cleanup scheduler started (runs every hour)");
}

/**
 * Stop the automatic cleanup scheduler
 */
export function stopCleanupScheduler(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info("Automatic job cleanup scheduler stopped");
  }
}
