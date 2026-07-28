import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  chatStore,
  cleanupOldJobs,
  createJob,
  deleteChatHistory,
  deleteJob,
  deleteReportContext,
  getJob,
  jobStore,
  linkSessionToJob,
  reportContextStore,
  updateJob,
  type UploadedFile,
} from "../artifacts/api-server/src/store";

const files: UploadedFile[] = [
  {
    originalName: "report.pdf",
    mimetype: "application/pdf",
    size: 1024,
    path: "/tmp/report.pdf",
  },
];

describe("job store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T12:00:00.000Z"));
    jobStore.clear();
    chatStore.clear();
    reportContextStore.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates and retrieves a job with the expected initial state", () => {
    const job = createJob("job-1", files);

    expect(job).toMatchObject({
      jobId: "job-1",
      status: "pending",
      stage: "uploading",
      progress: 0,
      message: "Job created",
      error: null,
      files,
      medicalContext: null,
      structuredData: null,
      intakeData: null,
      report: null,
    });
    expect(job.createdAt).toEqual(new Date("2026-07-14T12:00:00.000Z"));
    expect(job.updatedAt).toEqual(job.createdAt);
    expect(getJob("job-1")).toBe(job);
  });

  it("updates existing jobs and ignores unknown job ids", () => {
    const job = createJob("job-1", files);
    vi.setSystemTime(new Date("2026-07-14T12:05:00.000Z"));

    updateJob("job-1", {
      status: "processing",
      stage: "ocr",
      progress: 25,
    });
    updateJob("missing", { progress: 50 });

    expect(job).toMatchObject({
      status: "processing",
      stage: "ocr",
      progress: 25,
      updatedAt: new Date("2026-07-14T12:05:00.000Z"),
    });
    expect(jobStore.size).toBe(1);
  });

  it("deletes jobs, chat history, and report context independently", () => {
    createJob("job-1", files);
    linkSessionToJob("job-1", "session-1");
    chatStore.set("session-1", []);
    reportContextStore.set("job-1", "clinical context");

    expect(deleteReportContext("job-1")).toBe(true);
    expect(deleteReportContext("job-1")).toBe(false);

    expect(deleteJob("job-1")).toBe(true);
    expect(deleteJob("job-1")).toBe(false);

    expect(chatStore.has("session-1")).toBe(false);
    expect(deleteChatHistory("session-1")).toBe(false);
  });

  it("cleans expired jobs and their associated cached data", () => {
    const expired = createJob("expired", files);
    expired.createdAt = new Date("2026-07-13T11:59:59.999Z");
    const recent = createJob("recent", files);
    recent.createdAt = new Date("2026-07-13T12:00:00.000Z");
    linkSessionToJob("expired", "expired");
    linkSessionToJob("recent", "recent");
    chatStore.set("expired", [
      { role: "user", content: "hello", timestamp: "now" },
    ]);
    chatStore.set("recent", []);
    reportContextStore.set("expired", "old");
    reportContextStore.set("recent", "new");

    expect(cleanupOldJobs()).toBe(1);
    expect(getJob("expired")).toBeUndefined();
    expect(chatStore.has("expired")).toBe(false);
    expect(reportContextStore.has("expired")).toBe(false);
    expect(getJob("recent")).toBe(recent);
    expect(chatStore.has("recent")).toBe(true);
    expect(reportContextStore.has("recent")).toBe(true);
  });
});
