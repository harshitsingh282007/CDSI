import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencies = vi.hoisted(() => ({
  cleanupOldJobs: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../artifacts/api-server/src/store.js", () => ({
  cleanupOldJobs: dependencies.cleanupOldJobs,
}));

vi.mock("../artifacts/api-server/src/lib/logger.js", () => ({
  logger: dependencies.logger,
}));

import {
  startCleanupScheduler,
  stopCleanupScheduler,
} from "../artifacts/api-server/src/lib/cleanupScheduler";

describe("cleanup scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    dependencies.cleanupOldJobs.mockReset();
    dependencies.logger.info.mockReset();
    dependencies.logger.warn.mockReset();
    dependencies.logger.error.mockReset();
  });

  afterEach(() => {
    stopCleanupScheduler();
    vi.useRealTimers();
  });

  it("starts once and cleans jobs every hour", () => {
    dependencies.cleanupOldJobs.mockReturnValue(2);

    startCleanupScheduler();
    startCleanupScheduler();
    vi.advanceTimersByTime(3_600_000);

    expect(dependencies.logger.warn).toHaveBeenCalledWith(
      "Cleanup scheduler already running",
    );
    expect(dependencies.cleanupOldJobs).toHaveBeenCalledWith(24);
    expect(dependencies.logger.info).toHaveBeenCalledWith(
      { deletedCount: 2 },
      "Automatic job cleanup completed",
    );
  });

  it("logs cleanup failures without stopping the timer", () => {
    const error = new Error("cleanup failed");
    dependencies.cleanupOldJobs.mockImplementation(() => {
      throw error;
    });

    startCleanupScheduler();
    vi.advanceTimersByTime(7_200_000);

    expect(dependencies.cleanupOldJobs).toHaveBeenCalledTimes(2);
    expect(dependencies.logger.error).toHaveBeenCalledWith(
      { e: error },
      "Automatic job cleanup failed",
    );
  });

  it("stops an active scheduler and safely ignores repeated stops", () => {
    startCleanupScheduler();

    stopCleanupScheduler();
    stopCleanupScheduler();
    vi.advanceTimersByTime(3_600_000);

    expect(dependencies.cleanupOldJobs).not.toHaveBeenCalled();
    expect(dependencies.logger.info).toHaveBeenCalledWith(
      "Automatic job cleanup scheduler stopped",
    );
  });
});
