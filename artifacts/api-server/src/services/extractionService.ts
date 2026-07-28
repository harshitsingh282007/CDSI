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

export async function extractStructuredData(
  medicalContext: string,
  language = "English"
): Promise<StructuredExtractionResult> {
  const errors: string[] = [];

  if (!medicalContext.trim()) {
    return { labParameters: [], prescriptions: [], patientName: null, patientAge: null, patientSex: null, extractionErrors: ["No medical context provided"] };
  }

  // Split into chunks if too long (Gemini has massive token limits, but good for safety)
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
          const parsed = JSON.parse(response.content) as {
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
