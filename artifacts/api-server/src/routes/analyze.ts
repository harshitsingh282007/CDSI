import { Router } from "express";
import { getJob, updateJob, reportContextStore, type JobState } from "../store.js";
import { extractStructuredData } from "../services/extractionService.js";
import { performClinicalReasoning } from "../services/clinicalReasoningService.js";
import { logger } from "../lib/logger.js";
import { errorMessage } from "../lib/errors.js";
import type { Request, Response } from "express";
import type { ClinicalReport } from "../types/report.js";

const router = Router();

const DISCLAIMER = "This is AI-generated decision support and not a clinical diagnosis. Always verify with a licensed physician.";

// POST /api/analyze
router.post("/analyze", async (req: Request, res: Response) => {
  try {
    const { jobId, intakeData, language = "English" } = req.body as {
      jobId: string;
      intakeData: Record<string, unknown>;
      language?: string;
    };

    if (!jobId) { res.status(400).json({ error: "jobId is required" }); return; }
    if (!intakeData) { res.status(400).json({ error: "intakeData is required" }); return; }

    const job = getJob(jobId);
    if (!job) { res.status(404).json({ error: `Job ${jobId} not found` }); return; }
    if (!job.medicalContext) {
      res.status(400).json({ error: "No medical context found. Please upload documents first." });
      return;
    }

    res.json({ jobId, status: "processing", message: "Clinical analysis started" });

    setImmediate(async () => {
      const pipelineStart = Date.now();
      const stageTimings: Record<string, number> = {};

      try {
        updateJob(jobId, {
          status: "processing",
          stage: "extraction",
          progress: 55,
          message: "Extracting lab values and prescriptions using AI...",
          intakeData,
        });

        const extractionStart = Date.now();
        const { labParameters, prescriptions, patientName, patientAge, patientSex, extractionErrors } =
          await extractStructuredData(job.medicalContext!, language);
        stageTimings.extraction = Date.now() - extractionStart;

        updateJob(jobId, {
          structuredData: { labParameters, prescriptions },
          stage: "reasoning",
          progress: 72,
          message: `Found ${labParameters.length} lab parameters, ${prescriptions.length} prescriptions. Running clinical reasoning...`,
        });

        const intakeTyped = intakeData as unknown as Parameters<typeof performClinicalReasoning>[3];
        const reasoningStart = Date.now();
        const reasoning = await performClinicalReasoning(
          job.medicalContext!,
          labParameters,
          prescriptions,
          intakeTyped,
          language
        );
        stageTimings.reasoning = Date.now() - reasoningStart;

        updateJob(jobId, { stage: "report", progress: 92, message: "Finalising clinical report..." });

        const synthesisStart = Date.now();
        const patientSummary = {
          name: patientName,
          age: (intakeData.age as number | null | undefined) ?? patientAge,
          sex: (intakeData.biologicalSex as string | null | undefined) ?? patientSex,
          dateOfAnalysis: new Date().toISOString(),
          analysisType: (intakeData.analysisType as string) ?? "physical",
        };

        const report: ClinicalReport = {
          jobId,
          patientSummary,
          labParameters,
          prescriptions,
          findings: reasoning.findings,
          organSystems: reasoning.organSystems,
          criticalValues: reasoning.criticalValues,
          psychiatricSummary: reasoning.psychiatricSummary,
          clinicalConclusion: reasoning.clinicalConclusion,
          possibleConditions: reasoning.possibleConditions,
          riskAssessment: reasoning.riskAssessment,
          nextSteps: reasoning.nextSteps,
          disclaimer: DISCLAIMER,
          createdAt: new Date().toISOString(),
          rawMedicalContext: job.medicalContext,
          hasError: extractionErrors.length > 0 || reasoning.reasoningErrors.length > 0,
          errorMessage: [...extractionErrors, ...reasoning.reasoningErrors].join("; ") || null,
        };

        updateJob(jobId, {
          status: "completed",
          stage: "report",
          progress: 100,
          message: "Clinical analysis complete",
          report,
        });

        reportContextStore.set(jobId, JSON.stringify({
          patientSummary: report.patientSummary,
          findings: report.findings,
          clinicalConclusion: report.clinicalConclusion,
          riskAssessment: report.riskAssessment,
          labParameters: report.labParameters,
        }));

        stageTimings.synthesis = Date.now() - synthesisStart;
        stageTimings.total = Date.now() - pipelineStart;
        logger.info(
          { jobId, labCount: labParameters.length, findingCount: reasoning.findings.length, stageTimings },
          "Analysis complete"
        );
      } catch (e) {
        logger.error({ e, jobId, stageTimings, elapsedMs: Date.now() - pipelineStart }, "Analysis failed");
        const errMsg = e instanceof Error ? e.message : "Analysis failed";

        const currentJob = getJob(jobId) as JobState;
        const partialReport: ClinicalReport = {
          jobId,
          patientSummary: {
            name: null, age: null, sex: null,
            dateOfAnalysis: new Date().toISOString(),
            analysisType: (intakeData.analysisType as string) ?? "physical",
          },
          labParameters: (currentJob?.structuredData?.labParameters ?? []) as ClinicalReport["labParameters"],
          prescriptions: (currentJob?.structuredData?.prescriptions ?? []) as ClinicalReport["prescriptions"],
          findings: [],
          organSystems: [],
          criticalValues: ((currentJob?.structuredData?.labParameters ?? []) as Array<{ name: string; value: string; unit?: string | null; status: string }>)
            .filter((l) => l.status === "critical")
            .map((l) => `${l.name}: ${l.value}${l.unit ? " " + l.unit : ""} (critical)`),
          psychiatricSummary: null,
          clinicalConclusion: null,
          possibleConditions: [],
          riskAssessment: null,
          nextSteps: [],
          disclaimer: DISCLAIMER,
          createdAt: new Date().toISOString(),
          hasError: true,
          errorMessage: errMsg,
        };

        updateJob(jobId, {
          status: "partial",
          stage: "report",
          progress: 100,
          error: errMsg,
          message: "Analysis completed with partial results",
          report: partialReport,
        });
      }
    });
  } catch (e) {
    logger.error({ e }, "Analyze route error");
    res.status(500).json({ error: "Analysis failed", details: errorMessage(e) });
  }
});

// GET /api/report/:jobId
router.get("/report/:jobId", (req: Request, res: Response) => {
  const jobId = req.params["jobId"] as string;
  const job = getJob(jobId);

  if (!job) { res.status(404).json({ error: `Job ${jobId} not found` }); return; }
  if (!job.report) {
    if (
      job.status === "processing" ||
      job.status === "pending" ||
      job.status === "ready" ||
      job.status === "completed" ||
      job.status === "partial"
    ) {
      res.status(202).json({
        jobId, status: job.status, stage: job.stage,
        progress: job.progress, message: job.message, error: null, result: null,
      });
      return;
    }
    res.status(404).json({ error: "Report not yet available" });
    return;
  }

  res.json(job.report);
});

export default router;
