/**
 * End-to-end pipeline test - seeds a job, runs analysis stages, verifies completion.
 * Usage: PORT=8080 AI_API_KEY=... AI_BASE_URL=... AI_MODEL=... pnpm run test:pipeline
 */
import { v4 as uuidv4 } from "uuid";
import { createJob, updateJob, getJob } from "./store.js";
import { extractStructuredData } from "./services/extractionService.js";
import { performClinicalReasoning } from "./services/clinicalReasoningService.js";
import { errorMessage } from "./lib/errors.js";
import type { ClinicalReport } from "./types/report.js";

const SAMPLE_MEDICAL_CONTEXT = `
Patient: Jane Smith, Age 52, Female
Date: 2026-01-15

COMPLETE BLOOD COUNT (CBC):
- Hemoglobin: 10.8 g/dL (Reference: 12.0-15.5) LOW
- WBC: 11.2 x10^9/L (Reference: 4.0-11.0) HIGH
- Platelets: 145 x10^9/L (Reference: 150-400) LOW

LIVER FUNCTION TEST (LFT):
- ALT: 68 U/L (Reference: 7-56) HIGH
- AST: 45 U/L (Reference: 10-40) HIGH
- Bilirubin Total: 1.2 mg/dL (Reference: 0.1-1.2) BORDERLINE

KIDNEY FUNCTION:
- Creatinine: 1.4 mg/dL (Reference: 0.6-1.1) HIGH
- eGFR: 58 mL/min/1.73m2 (Reference: >90) LOW

LIPID PANEL:
- Total Cholesterol: 245 mg/dL (Reference: <200) HIGH
- LDL: 165 mg/dL (Reference: <100) HIGH
- HDL: 38 mg/dL (Reference: >50) LOW

GLUCOSE:
- Fasting Glucose: 118 mg/dL (Reference: 70-100) HIGH
- HbA1c: 6.4% (Reference: <5.7) HIGH

PRESCRIPTIONS:
- Metformin 500mg twice daily
- Atorvastatin 20mg once daily at bedtime
- Omeprazole 20mg once daily before breakfast
`;

const INTAKE_DATA = {
  analysisType: "physical" as const,
  chiefComplaint: "Fatigue and weakness for 3 months",
  symptomDuration: "3 months",
  age: 52,
  biologicalSex: "female",
  heightCm: 165,
  weightKg: 72,
  knownDiagnoses: ["Type 2 Diabetes"],
  currentMedications: "Metformin, Atorvastatin",
  knownAllergies: "Penicillin",
  recentSurgeries: false,
  familyHistory: ["Hypertension", "Diabetes"],
  smoking: "never",
  alcohol: "occasional",
};

const RUNS = 2;
const MAX_TOTAL_MS = 180_000;

async function runPipelineOnce(runIndex: number): Promise<{ ok: boolean; stageTimings: Record<string, number>; error?: string }> {
  const jobId = uuidv4();
  const stageTimings: Record<string, number> = {};
  const pipelineStart = Date.now();

  createJob(jobId, []);
  updateJob(jobId, {
    status: "ready",
    stage: "intake",
    progress: 50,
    message: "Seeded for e2e test",
    medicalContext: SAMPLE_MEDICAL_CONTEXT,
    intakeData: INTAKE_DATA,
  });

  console.log(`\n--- Run ${runIndex + 1}/${RUNS} (jobId: ${jobId}) ---`);

  try {
    updateJob(jobId, { status: "processing", stage: "extraction", progress: 55 });

    const t0 = Date.now();
    const extraction = await extractStructuredData(SAMPLE_MEDICAL_CONTEXT);
    stageTimings.extraction = Date.now() - t0;
    console.log(`  extraction: ${stageTimings.extraction}ms - ${extraction.labParameters.length} labs, ${extraction.prescriptions.length} rx`);

    if (extraction.extractionErrors.length > 0) {
      console.warn(`  extraction warnings: ${extraction.extractionErrors.join("; ")}`);
    }

    updateJob(jobId, {
      structuredData: { labParameters: extraction.labParameters, prescriptions: extraction.prescriptions },
      stage: "reasoning",
      progress: 72,
    });

    const t1 = Date.now();
    const reasoning = await performClinicalReasoning(
      SAMPLE_MEDICAL_CONTEXT,
      extraction.labParameters,
      extraction.prescriptions,
      INTAKE_DATA
    );
    stageTimings.reasoning = Date.now() - t1;
    console.log(`  reasoning: ${stageTimings.reasoning}ms - ${reasoning.findings.length} findings`);

    if (reasoning.reasoningErrors.length > 0) {
      console.warn(`  reasoning warnings: ${reasoning.reasoningErrors.join("; ")}`);
    }

    const report: ClinicalReport = {
      jobId,
      patientSummary: {
        name: extraction.patientName,
        age: INTAKE_DATA.age,
        sex: INTAKE_DATA.biologicalSex,
        dateOfAnalysis: new Date().toISOString(),
        analysisType: "physical",
      },
      labParameters: extraction.labParameters,
      prescriptions: extraction.prescriptions,
      findings: reasoning.findings,
      organSystems: reasoning.organSystems,
      criticalValues: reasoning.criticalValues,
      psychiatricSummary: reasoning.psychiatricSummary,
      clinicalConclusion: reasoning.clinicalConclusion,
      possibleConditions: reasoning.possibleConditions,
      riskAssessment: reasoning.riskAssessment,
      nextSteps: reasoning.nextSteps,
      disclaimer: "Test disclaimer",
      createdAt: new Date().toISOString(),
      hasError: false,
      errorMessage: null,
    };

    updateJob(jobId, { status: "completed", stage: "report", progress: 100, report });

    stageTimings.total = Date.now() - pipelineStart;
    console.log(`  total: ${stageTimings.total}ms`);

    const job = getJob(jobId);
    if (!job?.report || job.status !== "completed" || job.progress !== 100) {
      return { ok: false, stageTimings, error: "Job did not reach completed state with report" };
    }

    if (!report.clinicalConclusion && reasoning.findings.length === 0) {
      return { ok: false, stageTimings, error: "Report has no clinical content" };
    }

    return { ok: true, stageTimings };
  } catch (e) {
    stageTimings.total = Date.now() - pipelineStart;
    const msg = errorMessage(e);
    console.error(`  FAILED: ${msg}`);
    return { ok: false, stageTimings, error: msg };
  }
}

async function main() {
  if (!process.env["AI_API_KEY"]) {
    console.error("AI_API_KEY is required for pipeline e2e test");
    process.exit(1);
  }

  console.log("CDSI Pipeline E2E Test");
  console.log(`Running ${RUNS} consecutive pipeline executions...`);

  const results = [];
  for (let i = 0; i < RUNS; i++) {
    const result = await runPipelineOnce(i);
    results.push(result);

    if (!result.ok) {
      console.error(`\nRun ${i + 1} FAILED: ${result.error}`);
      process.exit(1);
    }

    if (result.stageTimings.total! > MAX_TOTAL_MS) {
      console.error(`\nRun ${i + 1} exceeded max time (${MAX_TOTAL_MS}ms)`);
      process.exit(1);
    }
  }

  console.log("\n✓ All runs passed");
  console.log("Stage timing summary:");
  for (const [i, r] of results.entries()) {
    console.log(`  Run ${i + 1}: extraction=${r.stageTimings.extraction}ms reasoning=${r.stageTimings.reasoning}ms total=${r.stageTimings.total}ms`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
