import { Router } from "express";
import { getJob, updateJob, createJob, reportContextStore, type JobState } from "../store.js";
import { extractStructuredData } from "../services/extractionService.js";
import { performClinicalReasoning } from "../services/clinicalReasoningService.js";
import { logger } from "../lib/logger.js";
import { errorMessage } from "../lib/errors.js";
import type { Request, Response } from "express";
import type { ClinicalReport } from "../types/report.js";

const router = Router();

const DISCLAIMER = "This is AI-generated decision support and not a clinical diagnosis. Always verify with a licensed physician.";

function formatIntakeContext(intakeData: Record<string, unknown>): string {
  const parts: string[] = [];
  const type = (intakeData.analysisType as string) ?? "physical";
  parts.push(`PATIENT INTAKE & CLINICAL ASSESSMENT (${type.toUpperCase()})`);
  parts.push(`Patient Name: ${intakeData.patientName ?? "Patient"}`);
  if (intakeData.age) parts.push(`Age: ${intakeData.age} years`);
  if (intakeData.biologicalSex) parts.push(`Biological Sex: ${intakeData.biologicalSex}`);
  if (intakeData.heightCm && intakeData.weightKg) {
    const h = (intakeData.heightCm as number) / 100;
    const w = intakeData.weightKg as number;
    const bmi = (w / (h * h)).toFixed(1);
    parts.push(`Height: ${intakeData.heightCm}cm | Weight: ${intakeData.weightKg}kg | BMI: ${bmi}`);
  }
  if (intakeData.chiefComplaint) parts.push(`Chief Complaint: ${intakeData.chiefComplaint}`);
  if (intakeData.symptomDuration) parts.push(`Symptom Duration: ${intakeData.symptomDuration}`);
  if (Array.isArray(intakeData.knownDiagnoses) && intakeData.knownDiagnoses.length > 0) {
    parts.push(`Known Diagnoses: ${intakeData.knownDiagnoses.join(", ")}`);
  }
  if (intakeData.currentMedications) parts.push(`Current Medications: ${intakeData.currentMedications}`);
  if (intakeData.knownAllergies) parts.push(`Known Allergies: ${intakeData.knownAllergies}`);
  if (intakeData.recentSurgeries) {
    parts.push(`Recent Surgeries: Yes - ${intakeData.recentSurgeriesDetails || "Details not specified"}`);
  }
  if (Array.isArray(intakeData.familyHistory) && intakeData.familyHistory.length > 0) {
    parts.push(`Family History: ${intakeData.familyHistory.join(", ")}`);
  }
  if (intakeData.smoking) parts.push(`Smoking History: ${intakeData.smoking}`);
  if (intakeData.alcohol) parts.push(`Alcohol Consumption: ${intakeData.alcohol}`);



  // Psychiatric screening answers
  if (Array.isArray(intakeData.phq9Answers)) {
    const phq9 = (intakeData.phq9Answers as number[]).reduce((a, b) => a + (b > -1 ? b : 0), 0);
    parts.push(`PHQ-9 Depression Scale Score: ${phq9}/27`);
  }
  if (Array.isArray(intakeData.gad7Answers)) {
    const gad7 = (intakeData.gad7Answers as number[]).reduce((a, b) => a + (b > -1 ? b : 0), 0);
    parts.push(`GAD-7 Anxiety Scale Score: ${gad7}/21`);
  }
  if (intakeData.sleepQuality) parts.push(`Sleep Quality Rating: ${intakeData.sleepQuality}/10`);
  if (intakeData.appetiteChanges) parts.push(`Appetite Changes: ${intakeData.appetiteChanges}`);
  if (intakeData.lifeStressors) {
    parts.push(`Significant Life Stressors: Yes - ${intakeData.lifeStressorsDetails || "Details not specified"}`);
  }
  if (intakeData.previousMentalHealthDiagnosis) {
    parts.push(`Previous Mental Health History: Yes - ${intakeData.mentalHealthDiagnosisDetails || "Details not specified"}`);
  }

  return parts.join("\n");
}

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

    const formattedIntake = formatIntakeContext(intakeData);
    let job = getJob(jobId);

    if (!job) {
      job = createJob(jobId, []);
      updateJob(jobId, { medicalContext: formattedIntake, intakeData });
      job = getJob(jobId)!;
    } else {
      const combinedContext = job.medicalContext && !job.medicalContext.startsWith("PATIENT INTAKE")
        ? `${job.medicalContext}\n\n====================\n${formattedIntake}`
        : formattedIntake;
      updateJob(jobId, { medicalContext: combinedContext, intakeData });
      job = getJob(jobId)!;
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
          await extractStructuredData(job.medicalContext!, language, (job as any).images, (job as any).pageTexts);
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
        const height = intakeData.heightCm as number | null | undefined;
        const weight = intakeData.weightKg as number | null | undefined;
        let bmi: number | null = null;
        if (height && weight && height > 0) {
          bmi = parseFloat((weight / Math.pow(height / 100, 2)).toFixed(1));
        }

        const intakeName = intakeData.patientName as string | null | undefined;
        let rawName = (intakeName && intakeName.trim().length > 1) ? intakeName : patientName;
        let cleanName = rawName ? rawName.replace(/\s+(weight|height|age|sex|patient|id)$/i, "").trim() : null;
        if (!cleanName || cleanName.length < 2) cleanName = "Patient";

        const patientSummary = {
          name: cleanName,
          age: (intakeData.age as number | null | undefined) ?? patientAge,
          sex: (intakeData.biologicalSex as string | null | undefined) ?? patientSex,
          bmi,
          dateOfAnalysis: new Date().toISOString(),
          analysisType: (intakeData.analysisType as string) ?? "physical",
        };

        const report: ClinicalReport = {
          jobId,
          patientSummary,
          labParameters: labParameters ?? [],
          prescriptions: prescriptions ?? [],
          findings: reasoning.findings ?? [],
          organSystems: reasoning.organSystems ?? [],
          criticalValues: reasoning.criticalValues ?? [],
          psychiatricSummary: reasoning.psychiatricSummary ?? null,
          clinicalConclusion: reasoning.clinicalConclusion ?? null,
          possibleConditions: reasoning.possibleConditions ?? [],
          riskAssessment: reasoning.riskAssessment ?? null,
          nextSteps: reasoning.nextSteps ?? [],
          disclaimer: DISCLAIMER,
          createdAt: new Date().toISOString(),
          rawMedicalContext: job.medicalContext,
          hasError: false,
          errorMessage: null,
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
