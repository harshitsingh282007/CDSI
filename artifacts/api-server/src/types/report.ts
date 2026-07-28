// Shared report types for CDSI platform

export interface PatientSummary {
  name: string | null;
  age: number | null;
  sex: string | null;
  dateOfAnalysis: string;
  analysisType: string;
}

export interface LabParameter {
  name: string;
  value: string;
  unit: string | null;
  referenceRange: string | null;
  status: "normal" | "high" | "low" | "critical" | "borderline";
  interpretation: string | null;
  panel: string | null;
}

export interface PrescriptionItem {
  medicineName: string;
  brandName: string | null;
  genericName: string | null;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  timing: string | null;
  route: string | null;
  specialInstructions: string | null;
}

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

export interface ClinicalReport {
  jobId: string;
  patientSummary: PatientSummary;
  labParameters: LabParameter[];
  prescriptions: PrescriptionItem[];
  findings: ClinicalFinding[];
  organSystems: OrganSystemStatus[];
  criticalValues: string[];
  psychiatricSummary: PsychiatricSummary | null;
  // Detailed clinical narrative fields
  clinicalConclusion: string | null;
  possibleConditions: string[];
  riskAssessment: RiskAssessment | null;
  nextSteps: string[];
  disclaimer: string;
  createdAt: string;
  rawMedicalContext?: string | null;
  hasError: boolean;
  errorMessage?: string | null;
}
