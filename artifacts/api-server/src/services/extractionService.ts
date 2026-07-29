// Extraction service: structured data extraction from medical context
import { callAI } from "../pipelineRouter.js";
import { logger } from "../lib/logger.js";

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

export interface StructuredExtractionResult {
  labParameters: LabParameter[];
  prescriptions: PrescriptionItem[];
  patientName: string | null;
  patientAge: number | null;
  patientSex: string | null;
  extractionErrors: string[];
}

const LAB_SYSTEM_PROMPT = `You are a medical data extraction AI. Extract ALL lab values, prescriptions, and patient info from the provided medical text. Return ONLY valid JSON matching the exact schema - no markdown, no explanation.

Schema:
{
  "labParameters": [
    {
      "name": "parameter name",
      "value": "numeric or text value",
      "unit": "unit or null",
      "referenceRange": "e.g. 13.0-17.0 or null",
      "status": "normal|high|low|critical|borderline",
      "interpretation": "brief clinical note or null",
      "panel": "CBC|LFT|KFT|Thyroid|Lipid|Electrolytes|Urine|Hormones|Coagulation|Vitamins|Inflammatory|Infectious|Cancer|Glucose|Other"
    }
  ],
  "prescriptions": [
    {
      "medicineName": "name",
      "brandName": null,
      "genericName": null,
      "dosage": null,
      "frequency": null,
      "duration": null,
      "timing": null,
      "route": null,
      "specialInstructions": null
    }
  ],
  "patientName": null,
  "patientAge": null,
  "patientSex": null
}

Rules:
- status "critical": value dangerously outside range
- status "borderline": value near but within range limits
- Extract ALL parameters found in CBC, LFT, KFT, thyroid, lipid, electrolytes, HbA1c, glucose, urine, CRP, ESR, vitamins, infectious serology, cancer markers
- If no labs found, return empty array
- If no prescriptions found, return empty array
- Never fabricate values not present in the text`;

function parseJsonFromText(text: string): Record<string, unknown> {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

function extractLabsRegex(text: string): LabParameter[] {
  const labs: LabParameter[] = [];
  const patterns: Array<{ name: string; regex: RegExp; panel: string; unit: string }> = [
    { name: "Hemoglobin", regex: /(?:hemoglobin|hb|hgb)[\s:]*([0-9]+(?:\.[0-9]+)?)\s*(g\/dl)?/i, panel: "CBC", unit: "g/dL" },
    { name: "WBC Count", regex: /(?:wbc|white blood cell|leukocytes)[\s:]*([0-9]+(?:\.[0-9]+)?)\s*(\times\s*10\^3\/\mu l|\/ul|k\/ul)?/i, panel: "CBC", unit: "10^3/uL" },
    { name: "Platelet Count", regex: /(?:platelet|plt)[\s:]*([0-9,]+(?:\.[0-9]+)?)/i, panel: "CBC", unit: "10^3/uL" },
    { name: "HbA1c", regex: /(?:hba1c|glycated hemoglobin)[\s:]*([0-9]+(?:\.[0-9]+)?)\s*%?/i, panel: "Glucose", unit: "%" },
    { name: "Fasting Blood Glucose", regex: /(?:fasting blood sugar|fasting glucose|fbs)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Glucose", unit: "mg/dL" },
    { name: "Serum Creatinine", regex: /(?:creatinine|serum creatinine)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "KFT", unit: "mg/dL" },
    { name: "Blood Urea", regex: /(?:blood urea|bun|urea)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "KFT", unit: "mg/dL" },
    { name: "TSH", regex: /(?:tsh|thyroid stimulating hormone)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Thyroid", unit: "uIU/mL" },
    { name: "Total Bilirubin", regex: /(?:total bilirubin|bilirubin)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "LFT", unit: "mg/dL" },
    { name: "ALT (SGPT)", regex: /(?:alt|sgpt)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "LFT", unit: "U/L" },
    { name: "AST (SGOT)", regex: /(?:ast|sgot)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "LFT", unit: "U/L" },
    { name: "Total Cholesterol", regex: /(?:total cholesterol|cholesterol)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Lipid", unit: "mg/dL" },
    { name: "Triglycerides", regex: /(?:triglycerides|tg)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Lipid", unit: "mg/dL" },
    { name: "Vitamin D", regex: /(?:vitamin d|25-oh vitamin d)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Vitamins", unit: "ng/mL" },
    { name: "Vitamin B12", regex: /(?:vitamin b12|b12)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Vitamins", unit: "pg/mL" },
  ];

  for (const item of patterns) {
    const match = text.match(item.regex);
    if (match && match[1]) {
      const valStr = match[1].replace(/,/g, "");
      const valNum = parseFloat(valStr);
      if (!isNaN(valNum)) {
        labs.push({
          name: item.name,
          value: valStr,
          unit: item.unit,
          referenceRange: null,
          status: "normal",
          interpretation: `Extracted parameter: ${valStr} ${item.unit}`,
          panel: item.panel,
        });
      }
    }
  }
  return labs;
}

export async function extractStructuredData(
  medicalContext: string,
  language = "English"
): Promise<StructuredExtractionResult> {
  const errors: string[] = [];

  if (!medicalContext.trim()) {
    return { labParameters: [], prescriptions: [], patientName: null, patientAge: null, patientSex: null, extractionErrors: ["No medical context provided"] };
  }

  const MAX_CHARS = 12000;
  const chunks: string[] = [];
  if (medicalContext.length > MAX_CHARS) {
    for (let i = 0; i < medicalContext.length; i += MAX_CHARS) {
      chunks.push(medicalContext.slice(i, i + MAX_CHARS));
    }
  } else {
    chunks.push(medicalContext);
  }

  const allLabs: LabParameter[] = [];
  const allPrescriptions: PrescriptionItem[] = [];
  let patientName: string | null = null;
  let patientAge: number | null = null;
  let patientSex: string | null = null;

  for (const chunkResults of await extractChunksParallel(chunks, language, errors)) {
    allLabs.push(...chunkResults.labs);
    allPrescriptions.push(...chunkResults.prescriptions);
    if (!patientName && chunkResults.patientName) patientName = chunkResults.patientName;
    if (!patientAge && chunkResults.patientAge) patientAge = chunkResults.patientAge;
    if (!patientSex && chunkResults.patientSex) patientSex = chunkResults.patientSex;
  }

  // Deterministic regex fallback if AI extraction yielded no lab parameters
  if (allLabs.length === 0) {
    const regexLabs = extractLabsRegex(medicalContext);
    if (regexLabs.length > 0) {
      logger.info({ count: regexLabs.length }, "Extracted labs via regex fallback");
      allLabs.push(...regexLabs);
    }
  }

  return {
    labParameters: deduplicateLabs(allLabs),
    prescriptions: allPrescriptions,
    patientName,
    patientAge,
    patientSex,
    extractionErrors: errors,
  };
}

interface ChunkExtractionResult {
  labs: LabParameter[];
  prescriptions: PrescriptionItem[];
  patientName: string | null;
  patientAge: number | null;
  patientSex: string | null;
}

async function extractChunksParallel(
  chunks: string[],
  language: string,
  errors: string[]
): Promise<ChunkExtractionResult[]> {
  return Promise.all(
    chunks.map(async (chunk, i) => {
      const prompt = `Extract all medical data from the following text (chunk ${i + 1}/${chunks.length}):\n\n${chunk}`;
      let retries = 0;

      while (retries <= 1) {
        const response = await callAI("entity_extract", prompt, LAB_SYSTEM_PROMPT, { language, jsonMode: true });
        if (response.error) {
          errors.push(response.error);
          if (response.timedOut) {
            errors.push(`Chunk ${i + 1} extraction timed out`);
          }
          return { labs: [], prescriptions: [], patientName: null, patientAge: null, patientSex: null };
        }
        try {
          const parsed = parseJsonFromText(response.content) as {
            labParameters?: LabParameter[];
            prescriptions?: PrescriptionItem[];
            patientName?: string | null;
            patientAge?: number | null;
            patientSex?: string | null;
          };
          return {
            labs: parsed.labParameters ?? [],
            prescriptions: parsed.prescriptions ?? [],
            patientName: parsed.patientName ?? null,
            patientAge: parsed.patientAge ?? null,
            patientSex: parsed.patientSex ?? null,
          };
        } catch (e) {
          retries++;
          if (retries > 1) {
            logger.warn({ e, chunk: i + 1 }, "JSON parse failed for extraction response");
            errors.push(`Failed to parse extraction response for chunk ${i + 1}`);
          }
        }
      }

      return { labs: [], prescriptions: [], patientName: null, patientAge: null, patientSex: null };
    })
  );
}

function deduplicateLabs(labs: LabParameter[]): LabParameter[] {
  const seen = new Map<string, LabParameter>();
  for (const lab of labs) {
    const key = lab.name.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.set(key, lab);
    }
  }
  return Array.from(seen.values());
}
