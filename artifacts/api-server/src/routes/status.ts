import { Router } from "express";
import { getJob } from "../store.js";
import type { Request, Response } from "express";

const router = Router();

// GET /api/status/:jobId
router.get("/status/:jobId", (req: Request, res: Response) => {
  const jobId = req.params["jobId"] as string;
  const job = getJob(jobId);

  if (!job) {
    res.status(404).json({ error: `Job ${jobId} not found` });
    return;
  }

  const responseBody = {
    jobId: job.jobId,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    message: job.message,
    error: job.error,
    result: job.report ? { hasReport: true } : null,
  };

  res.json(responseBody);
});

export default router;
