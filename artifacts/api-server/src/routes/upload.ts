import { Router } from "express";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { upload } from "../middleware/multerConfig.js";
import { processAllFiles } from "../services/ocr.js";
import { createJob, updateJob } from "../store.js";
import { logger } from "../lib/logger.js";
import { devErrorDetails } from "../lib/errors.js";
import { isAllowedUpload, MAX_FILE_SIZE } from "../lib/fileTypes.js";
import type { Request, Response } from "express";

const router = Router();

// Sanitize filename to prevent path traversal
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.') // collapse multiple dots
    .replace(/^\.+/, ''); // strip leading dots
}

function validateFile(file: Express.Multer.File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File ${file.originalname} exceeds maximum size of 25MB` };
  }
  if (!isAllowedUpload(file.originalname, file.mimetype)) {
    return { valid: false, error: `File ${file.originalname} is not an allowed type. Accepted formats: PDF, JPG, PNG, TIFF, BMP, WEBP, HEIC, DOCX.` };
  }
  return { valid: true };
}

// POST /api/upload
router.post("/upload", upload.array("files", 20), async (req: Request, res: Response) => {
  const correlationId = req.id || 'unknown';
  
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ 
        error: "No files uploaded",
        correlationId 
      });
      return;
    }

    // Validate all files
    const validationErrors: string[] = [];
    const validFiles: Express.Multer.File[] = [];

    for (const file of files) {
      const validation = validateFile(file);
      if (!validation.valid) {
        validationErrors.push(validation.error || 'Invalid file');
      } else {
        validFiles.push(file);
      }
    }

    if (validationErrors.length > 0) {
      logger.warn({ 
        correlationId, 
        errors: validationErrors,
        totalFiles: files.length,
        validFiles: validFiles.length 
      }, "File validation failed");
      
      res.status(400).json({ 
        error: "Some files failed validation",
        details: validationErrors,
        correlationId 
      });
      return;
    }

    if (validFiles.length === 0) {
      res.status(400).json({ 
        error: "No valid files to process",
        correlationId 
      });
      return;
    }

    const jobId = uuidv4();

    // Create job entry immediately with sanitized filenames
    const uploadedFiles = validFiles.map((f) => ({
      originalName: sanitizeFilename(f.originalname),
      mimetype: f.mimetype,
      size: f.size,
      path: f.path,
    }));

    createJob(jobId, uploadedFiles);

    // Respond immediately with jobId
    res.json({
      jobId,
      status: "processing",
      fileCount: validFiles.length,
      message: `Processing ${validFiles.length} file(s)...`,
      correlationId
    });

    // Process files asynchronously
    setImmediate(async () => {
      try {
        updateJob(jobId, { status: "processing", stage: "ocr", progress: 10, message: "Extracting text from documents..." });

        const fileInputs = validFiles.map((f) => ({
          path: f.path,
          originalName: sanitizeFilename(f.originalname),
          mimetype: f.mimetype,
        }));

        const { unifiedContext, fileSummaries } = await processAllFiles(fileInputs);

        updateJob(jobId, {
          status: "ready",
          stage: "intake",
          progress: 50,
          message: "Text extraction complete. Ready for intake.",
          medicalContext: unifiedContext,
          files: fileSummaries.map((s, i) => ({
            originalName: sanitizeFilename(s.name),
            mimetype: validFiles[i]?.mimetype ?? "",
            size: validFiles[i]?.size ?? 0,
            path: validFiles[i]?.path ?? "",
            pageCount: s.pageCount,
          })),
        });

        logger.info({ jobId, fileCount: validFiles.length, correlationId }, "File processing complete");
      } catch (e) {
        logger.error({ e, jobId, correlationId }, "File processing failed");
        updateJob(jobId, {
          status: "failed",
          stage: "ocr",
          progress: 0,
          error: e instanceof Error ? e.message : "Processing failed",
          message: "Failed to process uploaded documents",
        });
      } finally {
        // The extracted text is preserved in job.medicalContext; the raw uploaded
        // files (often containing PHI) don't need to remain on disk after this.
        for (const f of validFiles) {
          fs.unlink(f.path, (err) => {
            if (err && err.code !== "ENOENT") {
              logger.warn({ err, path: f.path, correlationId }, "Failed to delete uploaded file after processing");
            }
          });
        }
      }
    });
  } catch (e) {
    logger.error({ e, correlationId }, "Upload route error");
    res.status(500).json({ 
      error: "Upload failed", 
      correlationId,
      details: devErrorDetails(e)
    });
  }
});

export default router;
