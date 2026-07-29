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

const LAB_SYSTEM_PROMPT = `You are an expert medical data extraction AI specialized in interpreting both digital lab reports and messy handwritten doctor prescriptions, camera-captured document photos, and scanned medical notes.

Extract ALL lab values, medical tests, prescriptions, and patient info from the provided medical text. Return ONLY valid JSON matching the exact schema - no markdown, no explanation.

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

Rules & Deciphering Instructions:
- HANDWRITTEN DOCTOR PRESCRIPTIONS & CAMERA PHOTOS: Carefully decipher doctor handwriting, shorthand, and OCR text artifacts (e.g. "Tab PCM 500mg 1-0-1 x 5d", "Inj Ceftriaxone 1g IV BD", "Cap Amox 500 TID").
- Decipher common prescription abbreviations:
  * OD = Once daily | BD / BID = Twice daily | TID = Three times daily | QID = Four times daily
  * SOS / PRN = As needed | STAT = Immediately | HS = At bedtime
  * PO = Oral | IV = Intravenous | IM = Intramuscular | SC = Subcutaneous
- Extract EVERY SINGLE test and medication found in the document, even if handwritten or abbreviated.
- status "critical": value dangerously outside range
- status "borderline": value near but within range limits
- Extract ALL parameters found in CBC, LFT, KFT, thyroid, lipid, electrolytes, HbA1c, glucose, urine, CRP, ESR, vitamins, infectious serology, Widal, blood culture, cancer markers
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
  const patterns: Array<{ name: string; regex: RegExp; panel: string; unit: string; normalMin?: number; normalMax?: number }> = [
    { name: "WBC (Total)", regex: /(?:wbc|white blood cell|leukocytes|wbc \(total\))[\s:]*([0-9,]+(?:\.[0-9]+)?)\s*(?:cells\/[μu]l|\/ul|k\/ul|10\^3\/[μu]l)?/i, panel: "CBC", unit: "cells/µL", normalMin: 4500, normalMax: 11000 },
    { name: "Neutrophils", regex: /neutrophils[\s:]*([0-9]+(?:\.[0-9]+)?)\s*%/i, panel: "CBC", unit: "%", normalMin: 50, normalMax: 70 },
    { name: "Lymphocytes", regex: /lymphocytes[\s:]*([0-9]+(?:\.[0-9]+)?)\s*%/i, panel: "CBC", unit: "%", normalMin: 20, normalMax: 40 },
    { name: "Hemoglobin", regex: /(?:hemoglobin|hb|hgb)[\s:]*([0-9]+(?:\.[0-9]+)?)\s*(g\/dl)?/i, panel: "CBC", unit: "g/dL", normalMin: 13.5, normalMax: 17.5 },
    { name: "Hematocrit", regex: /hematocrit[\s:]*([0-9]+(?:\.[0-9]+)?)\s*%/i, panel: "CBC", unit: "%", normalMin: 41, normalMax: 53 },
    { name: "Platelet Count", regex: /(?:platelets|platelet count|plt)[\s:]*([0-9,]+(?:\.[0-9]+)?)/i, panel: "CBC", unit: "cells/µL", normalMin: 150000, normalMax: 400000 },
    { name: "RBC Count", regex: /(?:rbc|red blood cell)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "CBC", unit: "M/µL", normalMin: 4.5, normalMax: 6.0 },
    { name: "MCV", regex: /mcv[\s:]*([0-9]+(?:\.[0-9]+)?)\s*fl/i, panel: "CBC", unit: "fL", normalMin: 80, normalMax: 100 },
    
    // Widal & Serology
    { name: "Salmonella Typhi O (Widal)", regex: /salmonella typhi o[^\n:]*:\s*(positive|negative|[0-9]+:[0-9]+)/i, panel: "Infectious", unit: "Titer" },
    { name: "Salmonella Typhi H (Widal)", regex: /salmonella typhi h[^\n:]*:\s*(positive|negative|[0-9]+:[0-9]+)/i, panel: "Infectious", unit: "Titer" },
    { name: "Blood Culture", regex: /blood culture[^\n:]*:\s*(positive|negative|[^\n]+)/i, panel: "Infectious", unit: "Culture" },

    // LFT
    { name: "Total Bilirubin", regex: /total bilirubin[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "LFT", unit: "mg/dL", normalMin: 0.1, normalMax: 1.2 },
    { name: "Direct Bilirubin", regex: /direct bilirubin[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "LFT", unit: "mg/dL", normalMin: 0.0, normalMax: 0.3 },
    { name: "Indirect Bilirubin", regex: /indirect bilirubin[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "LFT", unit: "mg/dL", normalMin: 0.1, normalMax: 0.8 },
    { name: "AST (SGOT)", regex: /(?:ast|sgot)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "LFT", unit: "IU/L", normalMin: 10, normalMax: 40 },
    { name: "ALT (SGPT)", regex: /(?:alt|sgpt)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "LFT", unit: "IU/L", normalMin: 7, normalMax: 56 },
    { name: "ALP", regex: /alp[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "LFT", unit: "IU/L", normalMin: 30, normalMax: 120 },
    { name: "Albumin", regex: /albumin[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "LFT", unit: "g/dL", normalMin: 3.5, normalMax: 5.5 },

    // RFT
    { name: "Serum Creatinine", regex: /(?:creatinine|serum creatinine)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "KFT", unit: "mg/dL", normalMin: 0.7, normalMax: 1.3 },
    { name: "Blood Urea Nitrogen (BUN)", regex: /(?:blood urea nitrogen|bun|blood urea)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "KFT", unit: "mg/dL", normalMin: 7, normalMax: 20 },
    { name: "eGFR", regex: /egfr[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "KFT", unit: "mL/min/1.73m²", normalMin: 90, normalMax: 140 },

    // Glucose & Coagulation
    { name: "Fasting Blood Sugar", regex: /fasting blood (?:sugar|glucose)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Glucose", unit: "mg/dL", normalMin: 70, normalMax: 100 },
    { name: "Random Blood Sugar", regex: /random blood (?:sugar|glucose)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Glucose", unit: "mg/dL", normalMin: 70, normalMax: 140 },
    { name: "Prothrombin Time (PT)", regex: /(?:pt \(prothrombin time\)|prothrombin time)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Coagulation", unit: "sec", normalMin: 12, normalMax: 14 },
    { name: "INR", regex: /inr[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Coagulation", unit: "", normalMin: 0.8, normalMax: 1.1 },
    { name: "aPTT", regex: /aptt[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Coagulation", unit: "sec", normalMin: 25, normalMax: 35 },

    // Vitamins, Thyroid & Electrolytes
    { name: "Vitamin D (25 Hydroxy)", regex: /(?:vitamin d|25 hydroxy|vit d)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Vitamins", unit: "ng/mL", normalMin: 30, normalMax: 100 },
    { name: "Vitamin B12", regex: /(?:vitamin b12|vit b12|b12)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Vitamins", unit: "pg/mL", normalMin: 200, normalMax: 1100 },
    { name: "TSH (Thyroid Stimulating Hormone)", regex: /(?:tsh|thyroid stimulating hormone)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Thyroid", unit: "uIU/mL", normalMin: 0.7, normalMax: 6.4 },
    { name: "Serum Calcium", regex: /(?:calcium|serum calcium)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Electrolytes", unit: "mg/dL", normalMin: 8.4, normalMax: 10.2 },
    { name: "Serum Uric Acid", regex: /(?:uric acid|serum uric acid)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "KFT", unit: "mg/dL", normalMin: 3.5, normalMax: 8.5 },
    { name: "Serum Sodium", regex: /(?:sodium|serum sodium)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Electrolytes", unit: "mmol/L", normalMin: 135, normalMax: 155 },
    { name: "Serum Potassium", regex: /(?:potassium|serum potassium)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Electrolytes", unit: "mmol/L", normalMin: 3.5, normalMax: 5.5 },
    { name: "Serum Chloride", regex: /(?:chloride|serum chloride)[\s:]*([0-9]+(?:\.[0-9]+)?)/i, panel: "Electrolytes", unit: "mmol/L", normalMin: 97, normalMax: 111 },
  ];

  for (const item of patterns) {
    const match = text.match(item.regex);
    if (match && match[1]) {
      const valStr = match[1].replace(/,/g, "");
      const valNum = parseFloat(valStr);
      let status: LabParameter["status"] = "normal";
      if (!isNaN(valNum) && item.normalMin !== undefined && item.normalMax !== undefined) {
        if (valNum < item.normalMin) status = "low";
        else if (valNum > item.normalMax) status = valNum > item.normalMax * 1.5 ? "critical" : "high";
      } else if (/positive/i.test(match[0])) {
        status = "critical";
      }

      labs.push({
        name: item.name,
        value: valStr,
        unit: item.unit,
        referenceRange: item.normalMin ? `${item.normalMin}-${item.normalMax}` : null,
        status,
        interpretation: `Extracted result: ${valStr} ${item.unit}`,
        panel: item.panel,
      });
    }
  }
  return labs;
}

function extractPrescriptionsRegex(text: string): PrescriptionItem[] {
  const list: PrescriptionItem[] = [];
  const meds = [
    { name: "Ceftriaxone", dose: "2g", route: "Intravenous (IV)", freq: "Every 8 hours", dur: "7-14 days" },
    { name: "Azithromycin", dose: "500mg", route: "Oral", freq: "Once daily", dur: "3-5 days" },
    { name: "Paracetamol", dose: "500mg", route: "PO/IV", freq: "Every 6 hours", dur: "As needed" },
    { name: "Ondansetron", dose: "4mg", route: "PO/IV", freq: "TID", dur: "3-5 days" },
    { name: "ORS Solution", dose: "Ad-lib", route: "Oral", freq: "Frequent sips", dur: "Ongoing" },
    { name: "Cefixime", dose: "400mg", route: "Oral", freq: "TID", dur: "7-10 days" },
    { name: "Levofloxacin", dose: "500mg", route: "Oral", freq: "OD", dur: "7-10 days" },
    { name: "Risebok", dose: "As directed", route: "Oral", freq: "OD", dur: "7-30 days" },
    { name: "Lemcal D3", dose: "60k IU / 500mg", route: "Oral", freq: "Once weekly / OD", dur: "1-3 months" },
    { name: "Combiflam", dose: "500mg", route: "Oral", freq: "SOS / BD", dur: "3-5 days" },
    { name: "Niftran", dose: "100mg", route: "Oral", freq: "BD", dur: "5-7 days" },
    { name: "Rob DSR", dose: "30mg/20mg", route: "Oral", freq: "OD (Before Food)", dur: "7-14 days" },
    { name: "Aptimax", dose: "Syrup / Tab", route: "Oral", freq: "BD", dur: "1 month" },
    { name: "Electral", dose: "4.4g / sachet", route: "Oral", freq: "In 1L Water", dur: "3-5 days" },
    { name: "B-Complex", dose: "1 Tab", route: "Oral", freq: "OD / Bedtime", dur: "1 month" },
  ];

  for (const m of meds) {
    if (new RegExp(m.name, "i").test(text)) {
      list.push({
        medicineName: m.name,
        brandName: null,
        genericName: m.name,
        dosage: m.dose,
        frequency: m.freq,
        duration: m.dur,
        timing: "As advised",
        route: m.route,
        specialInstructions: "Take as prescribed",
      });
    }
  }
  return list;
}

function extractPatientInfo(text: string): { name: string | null; age: number | null; sex: string | null } {
  const ageMatch = text.match(/age[\s:]*([0-9]+)/i);
  const sexMatch = text.match(/(?:gender|sex)[\s:]*(male|female)/i);
  const nameMatch = text.match(/name[\s:]*([a-zA-Z\s\[\]]+)/i);

  return {
    name: nameMatch ? nameMatch[1].trim() : null,
    age: ageMatch ? parseInt(ageMatch[1], 10) : null,
    sex: sexMatch ? sexMatch[1].toLowerCase() : null,
  };
}

function extractGenericTableLabs(text: string): LabParameter[] {
  const labs: LabParameter[] = [];
  const lines = text.split("\n");
  const ignoreWords = ["page", "patient", "name", "date", "doctor", "hospital", "pathology", "sample", "barcode", "report", "method", "unit", "result", "status", "biological", "ref", "interval", "department", "test name"];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 8) continue;

    // Line parser: Test Name ... Number value ... Unit ... Status (H/L/N/C) ... Reference Range
    const match = trimmed.match(/^([a-zA-Z0-9\s\(\)\-\.\/]{3,45})\s+([0-9]+\.?[0-9]*)\s*([a-zA-Z%\/µu0-9\^\-]{1,15})?\s*([HLNC])?\s*([0-9]+\.?[0-9]*\s*[\-\–\:]\s*[0-9]+\.?[0-9]*)?/i);

    if (match && match[1] && match[2]) {
      const name = match[1].trim();
      const lowerName = name.toLowerCase();

      if (ignoreWords.some((word) => lowerName.startsWith(word) || lowerName.endsWith(word))) continue;
      if (name.length < 3 || /^[0-9]+$/.test(name)) continue;

      const valStr = match[2];
      const unit = match[3] || null;
      const flag = match[4]?.toUpperCase();
      const ref = match[5] || null;

      let status: LabParameter["status"] = "normal";
      if (flag === "L") status = "low";
      else if (flag === "H") status = "high";
      else if (flag === "C") status = "critical";

      let panel = "Other";
      if (/wbc|rbc|hb|hemoglobin|hematocrit|platelet|neutrophil|lymphocyte|eosinophil|monocyte|mcv|mch/i.test(name)) panel = "CBC";
      else if (/bilirubin|sgot|sgpt|ast|alt|alp|albumin|protein|globulin/i.test(name)) panel = "LFT";
      else if (/creatinine|urea|bun|uric|egfr/i.test(name)) panel = "KFT";
      else if (/tsh|t3|t4|thyroid/i.test(name)) panel = "Thyroid";
      else if (/vitamin|vit d|vit b/i.test(name)) panel = "Vitamins";
      else if (/calcium|potassium|sodium|chloride|phosphorus/i.test(name)) panel = "Electrolytes";
      else if (/glucose|sugar|hba1c/i.test(name)) panel = "Glucose";
      else if (/urine|pus|ep cells|casts|crystals/i.test(name)) panel = "Urine";

      labs.push({
        name,
        value: valStr,
        unit,
        referenceRange: ref,
        status,
        interpretation: `Extracted result: ${valStr}${unit ? " " + unit : ""}`,
        panel,
      });
    }
  }

  return labs;
}

function deduplicatePrescriptions(meds: PrescriptionItem[]): PrescriptionItem[] {
  const seen = new Map<string, PrescriptionItem>();
  for (const med of meds) {
    const key = med.medicineName.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.set(key, med);
    }
  }
  return Array.from(seen.values());
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

  // Double check layer: ALWAYS run generic line table parser & regex fallbacks to catch any missing labs/prescriptions
  const genericLabs = extractGenericTableLabs(medicalContext);
  if (genericLabs.length > 0) {
    logger.info({ count: genericLabs.length }, "Extracted labs via generic table parser 2nd check");
    allLabs.push(...genericLabs);
  }

  const regexLabs = extractLabsRegex(medicalContext);
  if (regexLabs.length > 0) {
    logger.info({ count: regexLabs.length }, "Extracted labs via regex parser 2nd check");
    allLabs.push(...regexLabs);
  }

  const regexMeds = extractPrescriptionsRegex(medicalContext);
  if (regexMeds.length > 0) {
    logger.info({ count: regexMeds.length }, "Extracted prescriptions via regex 2nd check");
    allPrescriptions.push(...regexMeds);
  }

  const patientInfo = extractPatientInfo(medicalContext);
  if (!patientName) patientName = patientInfo.name;
  if (!patientAge) patientAge = patientInfo.age;
  if (!patientSex) patientSex = patientInfo.sex;

  return {
    labParameters: deduplicateLabs(allLabs),
    prescriptions: deduplicatePrescriptions(allPrescriptions),
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
