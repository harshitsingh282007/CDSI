import { describe, it, expect } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { createJob, updateJob, getJob } from "../src/store.js";

// Guards against a regression where the frontend polled the job status and could
// mistake an intermediate "completed" stage (e.g. OCR finishing at 50% progress)
// for the final analysis being done. The real signal is progress === 100 with a report.
function shouldFetchReport(status: string | undefined, progress: number, hasReport: boolean): boolean {
  return (status === "completed" || status === "partial") && progress === 100 && hasReport;
}

describe("job status race condition", () => {
  it("does not treat OCR-ready state as analysis complete", () => {
    const jobId = uuidv4();
    createJob(jobId, []);
    updateJob(jobId, { status: "ready", stage: "intake", progress: 50, medicalContext: "sample context" });

    const job = getJob(jobId)!;
    expect(job.status).toBe("ready");
    expect(shouldFetchReport(job.status, job.progress, false)).toBe(false);
  });

  it("does not fetch a report while analysis is still processing", () => {
    const jobId = uuidv4();
    createJob(jobId, []);
    updateJob(jobId, { status: "processing", stage: "extraction", progress: 55 });

    const job = getJob(jobId)!;
    expect(shouldFetchReport(job.status, job.progress, false)).toBe(false);
  });

  it("fetches the report once analysis is truly complete", () => {
    const jobId = uuidv4();
    createJob(jobId, []);
    updateJob(jobId, {
      status: "completed",
      stage: "report",
      progress: 100,
      report: {
        jobId,
        patientSummary: { name: "Test", age: 40, sex: "male", dateOfAnalysis: new Date().toISOString(), analysisType: "physical" },
      },
    });

    const job = getJob(jobId)!;
    expect(shouldFetchReport(job.status, job.progress, true)).toBe(true);
  });

  it("blocks the old regression: 'completed' status at partial progress (e.g. OCR at 50%)", () => {
    const jobId = uuidv4();
    createJob(jobId, []);
    updateJob(jobId, { status: "completed", stage: "extraction", progress: 50 });

    const job = getJob(jobId)!;
    expect(shouldFetchReport(job.status, job.progress, false)).toBe(false);
  });
});
