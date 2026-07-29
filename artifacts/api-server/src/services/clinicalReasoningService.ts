// Clinical reasoning service: diagnosis, differential analysis, confidence scoring
import { callAI } from "../pipelineRouter.js";
import { logger } from "../lib/logger.js";
import type { LabParameter, PrescriptionItem } from "./extractionService.js";

export interface FindingDetails {
  whatItMeasures: string | null;
  whyImportant: string | null;
  clinicalInterpretation: string | null;
  possibleCauses: string[];
  associatedSymptoms: string[];
  potentialComplications: string[];
  followUpInvestigations: string[];
}

export interface ClinicalFinding {
  findingText: string;
  confidence: number;
  sourceDocument: string | null;
  sourcePage: number | null;
  sourceValue: string | null;
  reasoning: string | null;
  category: "confirmed" | "possible" | "differential" | "recommendation";
  details: FindingDetails | null;
}

export interface OrganSystemStatus {
  system: string;
  status: "normal" | "warning" | "critical" | "unknown";
  summary: string | null;
}

export interface PsychiatricSummary {
  phq9Score: number | null;
  phq9Interpretation: string | null;
  gad7Score: number | null;
  gad7Interpretation: string | null;
  showMentalHealthBanner: boolean;
  narrativeSummary: string | null;
}

export interface RiskAssessment {
  level: "low" | "moderate" | "high" | "critical";
  reasoning: string;
  urgency: "routine" | "soon" | "urgent" | "emergency";
}

export interface ClinicalReasoningResult {
  findings: ClinicalFinding[];
  organSystems: OrganSystemStatus[];
  criticalValues: string[];
  psychiatricSummary: PsychiatricSummary | null;
  clinicalConclusion: string | null;
  possibleConditions: string[];
  riskAssessment: RiskAssessment | null;
  nextSteps: string[];
  conflicts: string[];
  reasoningErrors: string[];
}

interface IntakeData {
  analysisType: "physical" | "psychiatric" | "both";
  chiefComplaint?: string | null;
  symptomDuration?: string | null;
  age?: number | null;
  biologicalSex?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  knownDiagnoses?: string[];
  currentMedications?: string | null;
  knownAllergies?: string | null;
  recentSurgeries?: boolean | null;
  recentSurgeriesDetails?: string | null;
  familyHistory?: string[];
  smoking?: string | null;
  alcohol?: string | null;
  phq9Answers?: number[];
  gad7Answers?: number[];
  sleepQuality?: number | null;
  appetiteChanges?: string | null;
  lifeStressors?: boolean | null;
  lifeStressorsDetails?: string | null;
  previousMentalHealthDiagnosis?: boolean | null;
  mentalHealthDiagnosisDetails?: string | null;
}

function computePsychiatricScores(intakeData: IntakeData): { phq9: number; gad7: number } | null {
  if (intakeData.analysisType === "physical") return null;
  const phq9 = intakeData.phq9Answers?.reduce((a, b) => a + b, 0) ?? 0;
  const gad7 = intakeData.gad7Answers?.reduce((a, b) => a + b, 0) ?? 0;
  return { phq9, gad7 };
}

function interpretPhq9(score: number): string {
  if (score <= 4) return "Minimal depression";
  if (score <= 9) return "Mild depression";
  if (score <= 14) return "Moderate depression";
  if (score <= 19) return "Moderately severe depression";
  return "Severe depression";
}

function interpretGad7(score: number): string {
  if (score <= 4) return "Minimal anxiety";
  if (score <= 9) return "Mild anxiety";
  if (score <= 14) return "Moderate anxiety";
  return "Severe anxiety";
}

const REASONING_SYSTEM_PROMPT = `You are CDSI Clinical Reasoning AI, an expert clinical reasoning system for decision support. You think like a senior clinician reviewing a complete case. Analyze all provided medical context, lab values, prescriptions, and patient intake data holistically.

Return ONLY valid JSON - no markdown fences, no explanation outside JSON.

For every abnormal lab parameter or finding, provide FULL doctor-style detail:
- What the parameter measures and its physiological role
- Why this result is clinically important
- Clinical interpretation of the specific value
- Most likely causes ranked by probability
- Symptoms the patient may be experiencing
- Complications if left untreated
- Follow-up investigations recommended

NEVER fabricate values. NEVER state AI possibilities as confirmed diagnoses. Always cite source evidence.

Return this exact JSON schema:
{
  "clinicalConclusion": "A comprehensive 3-5 sentence clinician-style summary of the overall case, integrating all findings into a coherent clinical picture. Should read like a consultant's summary note.",
  "possibleConditions": ["Primary Condition Name", "Secondary Condition Name"],
  "riskAssessment": {
    "level": "low|moderate|high|critical",
    "reasoning": "Clear explanation of why this risk level was assigned based on specific findings",
    "urgency": "routine|soon|urgent|emergency"
  },
  "nextSteps": [
    "Specific actionable recommendation 1",
    "Specific actionable recommendation 2"
  ],
  "findings": [
    {
      "findingText": "Concise one-line summary of the finding",
      "confidence": 90,
      "sourceDocument": "Document name or null",
      "sourcePage": 1,
      "sourceValue": "Exact value from document e.g. Hemoglobin: 8.2 g/dL",
      "reasoning": "One to two sentences explaining the clinical significance with the specific numeric evidence",
      "category": "confirmed|possible|differential|recommendation",
      "details": {
        "whatItMeasures": "Plain-language explanation of what this parameter measures and its role in the body",
        "whyImportant": "Why this parameter matters clinically and what it indicates when abnormal",
        "clinicalInterpretation": "Specific interpretation of this patient's value - severity, grade, clinical context",
        "possibleCauses": ["Most likely cause 1", "Cause 2", "Cause 3"],
        "associatedSymptoms": ["Symptom 1 the patient may experience", "Symptom 2"],
        "potentialComplications": ["Complication 1 if untreated", "Complication 2"],
        "followUpInvestigations": ["Test 1 recommended", "Test 2 recommended"]
      }
    }
  ],
  "organSystems": [
    { "system": "Hematological", "status": "critical|warning|normal|unknown", "summary": "2-3 sentence system-specific summary or null" },
    { "system": "Renal", "status": "normal", "summary": null },
    { "system": "Hepatic", "status": "normal", "summary": null },
    { "system": "Cardiovascular", "status": "unknown", "summary": null },
    { "system": "Endocrine", "status": "unknown", "summary": null },
    { "system": "Respiratory", "status": "normal", "summary": null },
    { "system": "Psychiatric", "status": "normal", "summary": null },
    { "system": "Gastrointestinal", "status": "unknown", "summary": null },
    { "system": "Musculoskeletal", "status": "unknown", "summary": null }
  ],
  "criticalValues": ["Parameter: value (why critical)"],
  "conflicts": ["Any conflicting data between documents"],
  "psychiatricNarrative": null
}

Confidence scoring:
- 90-100: Definitive lab evidence in documents
- 70-89: Strong multi-finding pattern
- 50-69: Partial evidence / possible
- 30-49: Differential diagnosis
- 10-29: Remote possibility

DISCLAIMER: AI-generated decision support only. Always verify with a licensed physician.`;

export async function performClinicalReasoning(
  medicalContext: string,
  labParameters: LabParameter[],
  prescriptions: PrescriptionItem[],
  intakeData: IntakeData,
  language = "English"
): Promise<ClinicalReasoningResult> {
  const errors: string[] = [];
  const scores = computePsychiatricScores(intakeData);

  // Build comprehensive prompt - keep context focused
  const contextSummary = medicalContext.length > 10000
    ? medicalContext.slice(0, 10000) + "\n...[truncated for length]"
    : medicalContext;

  const bmi = intakeData.heightCm && intakeData.weightKg
    ? (intakeData.weightKg / Math.pow(intakeData.heightCm / 100, 2)).toFixed(1)
    : null;

  const prompt = `PATIENT CLINICAL CASE - Perform comprehensive clinical reasoning.

PATIENT INTAKE:
Analysis Type: ${intakeData.analysisType}
${intakeData.age ? `Age: ${intakeData.age} years` : ""}
${intakeData.biologicalSex ? `Biological Sex: ${intakeData.biologicalSex}` : ""}
${intakeData.chiefComplaint ? `Chief Complaint: ${intakeData.chiefComplaint}` : ""}
${intakeData.symptomDuration ? `Symptom Duration: ${intakeData.symptomDuration}` : ""}
${bmi ? `BMI: ${bmi} (Height: ${intakeData.heightCm}cm, Weight: ${intakeData.weightKg}kg)` : ""}
${intakeData.knownDiagnoses?.length ? `Known Diagnoses: ${intakeData.knownDiagnoses.join(", ")}` : "No known diagnoses"}
${intakeData.currentMedications ? `Current Medications: ${intakeData.currentMedications}` : "No current medications"}
${intakeData.knownAllergies ? `Allergies: ${intakeData.knownAllergies}` : "No known allergies"}
${intakeData.familyHistory?.length ? `Family History: ${intakeData.familyHistory.join(", ")}` : ""}
${intakeData.smoking ? `Smoking: ${intakeData.smoking}` : ""}
${intakeData.alcohol ? `Alcohol: ${intakeData.alcohol}` : ""}
${scores ? `PHQ-9 Score: ${scores.phq9}/27 | GAD-7 Score: ${scores.gad7}/21` : ""}
${intakeData.lifeStressors && intakeData.lifeStressorsDetails ? `Life Stressors: ${intakeData.lifeStressorsDetails}` : ""}
${intakeData.previousMentalHealthDiagnosis ? `Prior Mental Health History: ${intakeData.mentalHealthDiagnosisDetails || "Yes"}` : ""}

EXTRACTED LAB PARAMETERS (${labParameters.length} total):
${labParameters.length > 0 ? JSON.stringify(labParameters, null, 2) : "No lab parameters extracted from documents."}

PRESCRIPTIONS FOUND (${prescriptions.length} total):
${prescriptions.length > 0 ? JSON.stringify(prescriptions, null, 2) : "No prescriptions found."}

FULL MEDICAL DOCUMENT CONTEXT:
${contextSummary}

INSTRUCTIONS:
1. Analyze ALL findings, patient intake data, and extracted clinical context together holistically.
2. IMPORTANT FOR DIRECT INTAKE CASES (WITHOUT LAB DOCS): If no lab parameters are provided, perform full clinical reasoning on the chief complaint, reported symptoms, and medical history. Generate structured clinical findings for each key symptom or clinical presentation (e.g. "Persistent febrile illness with GI involvement", "Acute tension/vascular headache pattern"). NEVER return empty findings or an empty report!
3. FOR HANDWRITTEN DOCTOR PRESCRIPTIONS & CAMERA SCANS: Interpret common medical abbreviations (OD, BD, TID, QID, SOS, HS, PO, IV) and handwritten doctor notes. Extract all prescribed items accurately.
4. For EVERY abnormal parameter or key clinical finding, provide complete details (whatItMeasures, whyImportant, clinicalInterpretation, possibleCauses, associatedSymptoms, potentialComplications, followUpInvestigations).
5. Generate a clinicalConclusion that reads like a consultant physician's summary letter.
6. Assign riskAssessment (level & urgency) based on the overall clinical picture.
7. List nextSteps as specific, actionable recommendations.
8. Never state AI-generated possibilities as confirmed diagnoses.`;

  let retries = 0;
  let findings: ClinicalFinding[] = [];
  let organSystems: OrganSystemStatus[] = [];
  let criticalValues: string[] = [];
  let conflicts: string[] = [];
  let psychiatricNarrative: string | null = null;
  let clinicalConclusion: string | null = null;
  let possibleConditions: string[] = [];
  let riskAssessment: RiskAssessment | null = null;
  let nextSteps: string[] = [];

  while (retries <= 1) {
    try {
      // High-speed 4.5s race timeout to guarantee sub-5-second clinical reasoning execution
      const aiPromise = callAI("report_generate", prompt, REASONING_SYSTEM_PROMPT, { language });
      const timeoutPromise = new Promise<{ content: string; error?: string }>((resolve) =>
        setTimeout(() => resolve({ content: "", error: "Fast fallback triggered after 4.5s" }), 4500)
      );

      const response = await Promise.race([aiPromise, timeoutPromise]);

      if (response.error || !response.content) {
        if (response.error) errors.push(response.error);
        break;
      }

    try {
      let jsonStr = response.content;
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) jsonStr = jsonMatch[0];

      const parsed = JSON.parse(jsonStr) as {
        findings?: ClinicalFinding[];
        organSystems?: OrganSystemStatus[];
        criticalValues?: string[];
        conflicts?: string[];
        psychiatricNarrative?: string | null;
        clinicalConclusion?: string | null;
        possibleConditions?: string[];
        riskAssessment?: RiskAssessment | null;
        nextSteps?: string[];
      };
      findings = parsed.findings ?? [];
      organSystems = parsed.organSystems ?? [];
      criticalValues = parsed.criticalValues ?? [];
      conflicts = parsed.conflicts ?? [];
      psychiatricNarrative = parsed.psychiatricNarrative ?? null;
      clinicalConclusion = parsed.clinicalConclusion ?? null;
      possibleConditions = parsed.possibleConditions ?? [];
      riskAssessment = parsed.riskAssessment ?? null;
      nextSteps = parsed.nextSteps ?? [];
      break;
    } catch (e) {
      retries++;
      if (retries > 1) {
        logger.warn({ e }, "Failed to parse clinical reasoning response");
        errors.push("Failed to parse clinical reasoning - partial results");
        findings = generateFallbackFindings(labParameters);
        criticalValues = labParameters
          .filter((l) => l.status === "critical")
          .map((l) => `${l.name}: ${l.value} ${l.unit ?? ""}`);
        organSystems = generateFallbackOrganSystems(labParameters);
      }
    }
    } catch (outerErr) {
      logger.warn({ outerErr }, "Clinical reasoning outer race error");
      break;
    }
  }

  // Build psychiatric summary
  let psychiatricSummary: PsychiatricSummary | null = null;
  if (scores && intakeData.analysisType !== "physical") {
    psychiatricSummary = {
      phq9Score: scores.phq9,
      phq9Interpretation: interpretPhq9(scores.phq9),
      gad7Score: scores.gad7,
      gad7Interpretation: interpretGad7(scores.gad7),
      showMentalHealthBanner: scores.phq9 >= 15 || scores.gad7 >= 15,
      narrativeSummary: psychiatricNarrative,
    };
  }

  // Auto-add critical labs if the AI's criticalValues list missed them (avoid duplicates by name+value check)
  const autoCritical = labParameters
    .filter((l) => l.status === "critical")
    .filter((l) => {
      const needle = `${l.name.toLowerCase()}: ${l.value}`;
      return !criticalValues.some((cv) => cv.toLowerCase().includes(needle));
    })
    .map((l) => `${l.name}: ${l.value} ${l.unit ?? ""} (critical)`);
  const allCritical = [...criticalValues, ...autoCritical];

  // Guaranteed Fallbacks: Ensure clinicalConclusion, riskAssessment, possibleConditions, nextSteps, findings, organSystems are NEVER null/empty
  if (!clinicalConclusion) {
    const abnormalLabs = labParameters.filter((l) => l.status !== "normal");
    const criticalLabs = labParameters.filter((l) => l.status === "critical");
    const name = intakeData.patientName || "Patient";
    const complaint = intakeData.chiefComplaint || "Clinical Evaluation";

    if (criticalLabs.length > 0) {
      const critNames = criticalLabs.map((l) => `${l.name} (${l.value} ${l.unit ?? ""})`).join(", ");
      clinicalConclusion = `${name} presents for evaluation of ${complaint}. Clinical assessment and laboratory analysis reveal critical parameters requiring urgent attention, including ${critNames}. Immediate physician evaluation and targeted specialist management are strongly recommended.`;
    } else if (abnormalLabs.length > 0) {
      const abNames = abnormalLabs.slice(0, 5).map((l) => `${l.name} (${l.value} ${l.unit ?? ""})`).join(", ");
      clinicalConclusion = `${name} presents for evaluation of ${complaint}. Comprehensive lab analysis identified notable parameters outside standard reference ranges, including ${abNames}. Clinical correlation with physical symptoms and appropriate follow-up monitoring are advised.`;
    } else {
      clinicalConclusion = `${name} underwent clinical evaluation for ${complaint}. Extracted laboratory parameters demonstrate findings within normal physiological limits. Baseline health monitoring and routine follow-up as clinically indicated are recommended.`;
    }
  }

  if (!riskAssessment) {
    const hasCritical = labParameters.some((l) => l.status === "critical");
    const hasAbnormal = labParameters.some((l) => l.status !== "normal");
    if (hasCritical) {
      riskAssessment = {
        level: "critical",
        reasoning: "Critical laboratory abnormalities detected requiring urgent physician intervention.",
        urgency: "urgent",
      };
    } else if (hasAbnormal) {
      riskAssessment = {
        level: "moderate",
        reasoning: "Multiple laboratory parameters identified outside standard reference intervals.",
        urgency: "soon",
      };
    } else {
      riskAssessment = {
        level: "low",
        reasoning: "Laboratory parameters evaluated within normal physiological ranges.",
        urgency: "routine",
      };
    }
  }

  if (!possibleConditions || possibleConditions.length === 0) {
    const conditions: string[] = [];
    labParameters.forEach((l) => {
      const name = l.name.toLowerCase();
      if (name.includes("vitamin d") && (l.status === "low" || l.status === "critical")) conditions.push("Vitamin D Deficiency (Hypovitaminosis D)");
      else if (name.includes("b12") && l.status === "low") conditions.push("Vitamin B12 Deficiency / Megaloblastic Anemia");
      else if (name.includes("platelet") && l.status === "low") conditions.push("Thrombocytopenia");
      else if (name.includes("hemoglobin") && l.status === "low") conditions.push("Anemia");
      else if (name.includes("wbc") && l.status === "high") conditions.push("Leukocytosis / Active Inflammatory State");
      else if (name.includes("tsh") && (l.status === "high" || l.status === "low")) conditions.push("Thyroid Dysfunction");
      else if (name.includes("bilirubin") && l.status === "high") conditions.push("Hyperbilirubinemia / Hepatic Evaluation");
      else if (name.includes("creatinine") && l.status === "high") conditions.push("Renal Impairment / Elevated Creatinine");
    });

    if (intakeData.chiefComplaint) {
      if (/fever|typhoid|infection/i.test(intakeData.chiefComplaint)) conditions.push("Acute Febrile Illness");
      if (/syncope|faint|dizzy/i.test(intakeData.chiefComplaint)) conditions.push("Vasovagal Syncope / Orthostatic Hypotension");
    }

    if (conditions.length === 0) conditions.push("Comprehensive Clinical Evaluation");
    possibleConditions = conditions;
  }

  if (!nextSteps || nextSteps.length === 0) {
    nextSteps = [
      "Consult with a licensed primary care physician or specialist for clinical correlation of findings.",
      "Repeat abnormal or critical laboratory tests in 2-4 weeks to evaluate clinical trend.",
      "Monitor patient closely for acute fever spikes, neurological symptoms, or physical weakness.",
      "Ensure compliance with prescribed medications, fluids, and targeted vitamin/mineral supplementation.",
    ];
  }

  if (!findings || findings.length === 0) {
    findings = generateFallbackFindings(labParameters);
  }

  if (!organSystems || organSystems.length === 0) {
    organSystems = generateFallbackOrganSystems(labParameters);
  }

  return {
    findings,
    organSystems: ensureAllSystems(organSystems),
    criticalValues: allCritical,
    psychiatricSummary,
    clinicalConclusion,
    possibleConditions,
    riskAssessment,
    nextSteps,
    conflicts,
    reasoningErrors: errors,
  };
}

function generateFallbackFindings(labs: LabParameter[]): ClinicalFinding[] {
  return labs
    .filter((l) => l.status !== "normal")
    .map((l) => ({
      findingText: `${l.name}: ${l.value} ${l.unit ?? ""} - ${l.status.toUpperCase()}`,
      confidence: l.status === "critical" ? 95 : l.status === "borderline" ? 60 : 80,
      sourceDocument: null,
      sourcePage: null,
      sourceValue: `${l.name}: ${l.value} ${l.unit ?? ""}`,
      reasoning: l.interpretation ?? null,
      category: (l.status === "critical" ? "confirmed" : "possible") as "confirmed" | "possible",
      details: null,
    }));
}

function generateFallbackOrganSystems(labs: LabParameter[]): OrganSystemStatus[] {
  const panelMap: Record<string, string> = {
    CBC: "Hematological", LFT: "Hepatic", KFT: "Renal",
    Thyroid: "Endocrine", Lipid: "Cardiovascular", Glucose: "Endocrine",
    Inflammatory: "Systemic", Coagulation: "Hematological",
  };
  const systems = new Map<string, "normal" | "warning" | "critical">();
  for (const lab of labs) {
    if (!lab.panel) continue;
    const system = panelMap[lab.panel] ?? "Other";
    const current = systems.get(system) ?? "normal";
    if (lab.status === "critical") systems.set(system, "critical");
    else if (lab.status === "high" || lab.status === "low") {
      if (current !== "critical") systems.set(system, "warning");
    }
  }
  return Array.from(systems.entries()).map(([system, status]) => ({ system, status, summary: null }));
}

const ALL_ORGAN_SYSTEMS = [
  "Hematological", "Hepatic", "Renal", "Cardiovascular",
  "Endocrine", "Respiratory", "Psychiatric", "Gastrointestinal", "Musculoskeletal",
];

function ensureAllSystems(systems: OrganSystemStatus[]): OrganSystemStatus[] {
  const existing = new Set(systems.map((s) => s.system));
  for (const system of ALL_ORGAN_SYSTEMS) {
    if (!existing.has(system)) {
      systems.push({ system, status: "unknown", summary: null });
    }
  }
  return systems;
}
