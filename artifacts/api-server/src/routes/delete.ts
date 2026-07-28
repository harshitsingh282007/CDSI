import { Router } from "express";
import { deleteJob } from "../store.js";
import { logger } from "../lib/logger.js";
import { devErrorDetails } from "../lib/errors.js";
import type { Request, Response } from "express";

const router = Router();

// DELETE /api/delete/job/:jobId - Delete a job and all associated data
router.delete("/job/:jobId", async (req: Request, res: Response) => {
  const correlationId = req.id || 'unknown';
  const { jobId } = req.params;
  
  // Handle case where jobId might be an array
  const jobIdStr = Array.isArray(jobId) ? jobId[0] : jobId;

  try {
    // Deletes the job plus its linked chat sessions and report context
    const jobDeleted = deleteJob(jobIdStr);

    logger.info({ jobId: jobIdStr, correlationId, jobDeleted }, "Job deletion requested");

    if (jobDeleted) {
      res.json({ 
        success: true,
        message: "Job and associated data deleted successfully",
        correlationId
      });
    } else {
      res.status(404).json({ 
        error: "Job not found",
        correlationId
      });
    }
  } catch (e) {
    logger.error({ e, jobId: jobIdStr, correlationId }, "Job deletion failed");
    res.status(500).json({ 
      error: "Deletion failed",
      correlationId,
      details: devErrorDetails(e)
    });
  }
});

export default router;
