import fs from "fs";
import path from "path";
import { logger } from "./lib/logger.js";

// Persistent data directory
// On Azure App Service, /home/site/wwwroot is read-only when using WEBSITE_RUN_FROM_PACKAGE=1
// We must use a writable path under /home.
const isAzure = process.env.WEBSITE_SITE_NAME !== undefined;
const BASE_DATA_DIR = isAzure ? "/home/data/cdsi-store" : path.resolve("./data");

export type JobStage =
  | "uploading"
  | "ocr"
  | "extraction"
  | "intake"
  | "reasoning"
  | "report"
  | "complete"
  | "failed";

export interface UploadedFile {
  originalName: string;
  mimetype: string;
  size: number;
  path: string;
  pageCount?: number;
}

export interface JobState {
  jobId: string;
  /** ready = OCR/intake prep done, awaiting POST /analyze */
  status: "pending" | "processing" | "ready" | "completed" | "failed" | "partial";
  stage: JobStage;
  progress: number; // 0-100
  message: string | null;
  error: string | null;
  files: UploadedFile[];
  medicalContext: string | null;
  structuredData: {
    labParameters: unknown[];
    prescriptions: unknown[];
  } | null;
  intakeData: unknown | null;
  report: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// ── Generic File-based Map implementation ────────────────────────────────────
class FileMap<T> {
  private dir: string;
  private isJobStore: boolean;

  constructor(dirName: string, isJobStore = false) {
    this.dir = path.join(BASE_DATA_DIR, dirName);
    this.isJobStore = isJobStore;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private getPath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9-_]/g, "");
    return path.join(this.dir, `${safeKey}.json`);
  }

  has(key: string): boolean {
    return fs.existsSync(this.getPath(key));
  }

  get(key: string): T | undefined {
    const p = this.getPath(key);
    if (!fs.existsSync(p)) return undefined;
    try {
      const data = fs.readFileSync(p, "utf8");
      const parsed = JSON.parse(data);
      
      // Date restoration for JobState objects
      if (this.isJobStore && parsed) {
        if (parsed.createdAt) parsed.createdAt = new Date(parsed.createdAt);
        if (parsed.updatedAt) parsed.updatedAt = new Date(parsed.updatedAt);
      }
      
      return parsed as T;
    } catch {
      return undefined;
    }
  }

  set(key: string, value: T): this {
    const p = this.getPath(key);
    try {
      fs.writeFileSync(p, JSON.stringify(value, null, 2), "utf8");
    } catch (err) {
      logger.error({ err, key }, `Failed to write file in FileMap: ${this.dir}`);
    }
    return this;
  }

  delete(key: string): boolean {
    const p = this.getPath(key);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  entries(): [string, T][] {
    try {
      const files = fs.readdirSync(this.dir);
      const list: [string, T][] = [];
      for (const file of files) {
        if (file.endsWith(".json")) {
          const key = path.basename(file, ".json");
          const val = this.get(key);
          if (val !== undefined) {
            list.push([key, val]);
          }
        }
      }
      return list;
    } catch {
      return [];
    }
  }
}

// Custom store for Session Sets to handle serialization correctly
class SessionSetStore {
  private dir: string;

  constructor() {
    this.dir = path.join(BASE_DATA_DIR, "sessions");
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private getPath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9-_]/g, "");
    return path.join(this.dir, `${safeKey}.json`);
  }

  get(jobId: string): Set<string> | undefined {
    const p = this.getPath(jobId);
    if (!fs.existsSync(p)) return undefined;
    try {
      const data = fs.readFileSync(p, "utf8");
      const arr = JSON.parse(data) as string[];
      return new Set(arr);
    } catch {
      return undefined;
    }
  }

  set(jobId: string, value: Set<string>): this {
    const p = this.getPath(jobId);
    try {
      fs.writeFileSync(p, JSON.stringify(Array.from(value), null, 2), "utf8");
    } catch (err) {
      logger.error({ err, jobId }, "Failed to write session set");
    }
    return this;
  }

  delete(jobId: string): boolean {
    const p = this.getPath(jobId);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

// ── Persistent File-based Stores ─────────────────────────────────────────────
export const jobStore = new FileMap<JobState>("jobs", true);
export const chatStore = new FileMap<ChatMessage[]>("chats");
export const reportContextStore = new FileMap<string>("contexts");
const jobSessionsStore = new SessionSetStore();

export function linkSessionToJob(jobId: string, sessionId: string): void {
  const sessions = jobSessionsStore.get(jobId) ?? new Set<string>();
  sessions.add(sessionId);
  jobSessionsStore.set(jobId, sessions);
}

export function createJob(jobId: string, files: UploadedFile[]): JobState {
  const job: JobState = {
    jobId,
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  jobStore.set(jobId, job);
  return job;
}

export function updateJob(jobId: string, updates: Partial<JobState>): void {
  const job = jobStore.get(jobId);
  if (job) {
    Object.assign(job, updates, { updatedAt: new Date() });
    jobStore.set(jobId, job);
  }
}

export function getJob(jobId: string): JobState | undefined {
  return jobStore.get(jobId);
}

function deleteJobFiles(job: JobState | undefined): void {
  if (!job) return;
  for (const file of job.files) {
    fs.unlink(file.path, (err) => {
      if (err && err.code !== "ENOENT") {
        logger.warn({ err, path: file.path }, "Failed to delete uploaded file from disk");
      }
    });
  }
}

export function deleteJob(jobId: string): boolean {
  deleteJobFiles(jobStore.get(jobId));
  const sessions = jobSessionsStore.get(jobId);
  if (sessions) {
    for (const sessionId of sessions) chatStore.delete(sessionId);
    jobSessionsStore.delete(jobId);
  }
  reportContextStore.delete(jobId);
  return jobStore.delete(jobId);
}

export function deleteChatHistory(sessionId: string): boolean {
  return chatStore.delete(sessionId);
}

export function deleteReportContext(jobId: string): boolean {
  return reportContextStore.delete(jobId);
}

// Cleanup function to remove old jobs (older than specified hours)
export function cleanupOldJobs(maxAgeHours: number = 24): number {
  const now = new Date();
  const maxAge = maxAgeHours * 60 * 60 * 1000;
  let deletedCount = 0;

  for (const [jobId, job] of jobStore.entries()) {
    const age = now.getTime() - job.createdAt.getTime();
    if (age > maxAge) {
      deleteJobFiles(job);
      jobStore.delete(jobId);
      const sessions = jobSessionsStore.get(jobId);
      if (sessions) {
        for (const sessionId of sessions) chatStore.delete(sessionId);
        jobSessionsStore.delete(jobId);
      }
      reportContextStore.delete(jobId);
      deletedCount++;
    }
  }

  return deletedCount;
}
