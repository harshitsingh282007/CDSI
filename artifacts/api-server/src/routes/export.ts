import { Router } from "express";
import { generateReportPdf } from "../services/pdfExport.js";
import { logger } from "../lib/logger.js";
import { errorMessage } from "../lib/errors.js";
import type { Request, Response } from "express";
import type { ClinicalReport } from "../types/report.js";

const router = Router();

// POST /api/export-report
router.post("/export-report", async (req: Request, res: Response) => {
  try {
    const { report } = req.body as { jobId?: string; report: ClinicalReport };

    if (!report) {
      res.status(400).json({ error: "report is required" });
      return;
    }

    const pdfBuffer = await generateReportPdf(report);

    const filename = `CDSI_Report_${report.patientSummary.name?.replace(/\s+/g, "_") ?? "Patient"}_${new Date().toISOString().split("T")[0]}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (e) {
    logger.error({ e }, "PDF export failed");
    res.status(500).json({ error: "PDF generation failed", details: errorMessage(e) });
  }
});

export default router;
