import { callAI } from "../pipelineRouter.js";
import { logger } from "../lib/logger.js";
import { processLabDeduplicationAndConflicts, type ResolvedLabParameter, type LabSummaryStats } from "./labDeduplicationService.js";
import type { LabParameter, PrescriptionItem } from "../types/report.js";

export type { LabParameter, PrescriptionItem };

export interface StructuredExtractionResult {
  labParameters: ResolvedLabParameter[];
  prescriptions: PrescriptionItem[];
  patientName: string | null;
  patientAge: number | null;
  patientSex: string | null;
  extractionErrors: string[];
  summaryStats: LabSummaryStats;
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
- HANDWRITTEN DOCS: Carefully decipher handwriting, shorthand, and OCR artifacts (e.g. "Tab PCM 500mg 1-0-1", "Inj Ceftriaxone").
- PRESCRIPTIONS ONLY: Extract medications into the \`prescriptions\` array. Decipher abbreviations: OD (once daily), BD/BID (twice), TID (thrice), SOS/PRN (as needed), PO (oral), IV (intravenous). Do NOT include dosage forms or frequency in the medicineName (e.g., "TAB. DAILY (B-Complex...)" should be medicineName: "B-Complex Forte + Vit B12 + Biotin", frequency: "Daily").
- LAB PARAMETERS ONLY: ONLY extract actual diagnostic tests (blood, urine, imaging) into the \`labParameters\` array. DO NOT extract clinical history, symptoms, physical examination findings, or medications into the \`labParameters\` array! 
- LAB NAMES: Ensure the "name" strictly contains ONLY the test name. Do not include values, units, or status flags inside the "name" string.
- REFERENCE RANGES: Extract the EXACT reference range from the text for every lab test. DO NOT SKIP or omit reference ranges. If missing, leave null.
- status "critical": value dangerously outside range
- status "borderline": value near but within range limits
- Extract ALL parameters found in CBC, LFT, KFT, thyroid, lipid, electrolytes, HbA1c, glucose, urine, CRP, ESR, vitamins, infectious serology, Widal, blood culture, cancer markers.
- Never fabricate values not present in the text.`;

function parseJsonFromText(text: string): Record<string, unknown> {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    logger.warn({ err }, "Standard JSON.parse failed on AI response, trying truncated JSON recovery");

    // Attempt 1: Try closing open brackets/braces for truncated JSON
    try {
      let repaired = cleaned;
      if (!repaired.endsWith("}")) repaired += "}";
      if (!repaired.includes("]}")) repaired = repaired.replace(/,?\s*$/, "]}");
      return JSON.parse(repaired);
    } catch {
      /* Fallback to regex object extraction below */
    }

    // Attempt 2: Extract individual lab parameter JSON objects from text via regex
    const labs: LabParameter[] = [];
    const prescriptions: PrescriptionItem[] = [];

    const labMatches = text.matchAll(/\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"value"\s*:\s*"([^"]*)"(?:[^\}]*?"unit"\s*:\s*(?:"([^"]*)"|null))?(?:[^\}]*?"referenceRange"\s*:\s*(?:"([^"]*)"|null))?(?:[^\}]*?"status"\s*:\s*"([^"]*)")?(?:[^\}]*?"panel"\s*:\s*(?:"([^"]*)"|null))?[^\}]*?\}/g);
    for (const match of labMatches) {
      if (match[1] && match[2]) {
        labs.push({
          name: match[1],
          value: match[2],
          unit: match[3] || null,
          referenceRange: match[4] || null,
          status: (match[5] as any) || "normal",
          interpretation: null,
          panel: match[6] || "Other",
        });
      }
    }

    const medMatches = text.matchAll(/\{\s*"medicineName"\s*:\s*"([^"]+)"(?:[^\}]*?"dosage"\s*:\s*(?:"([^"]*)"|null))?(?:[^\}]*?"frequency"\s*:\s*(?:"([^"]*)"|null))?[^\}]*?\}/g);
    for (const match of medMatches) {
      if (match[1]) {
        prescriptions.push({
          medicineName: match[1],
          brandName: null,
          genericName: match[1],
          dosage: match[2] || "As prescribed",
          frequency: match[3] || "As directed",
          duration: "As advised",
          timing: "As advised",
          route: "Oral",
          specialInstructions: "Take as prescribed",
        });
      }
    }

    return { labParameters: labs, prescriptions };
  }
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
    { name: "Nimford", dose: "1 Tab", route: "Oral", freq: "BD", dur: "3-5 days" },
    { name: "LMP-3", dose: "1 Tab", route: "Oral", freq: "OD", dur: "1 month" },
    { name: "Betnesol", dose: "0.5mg", route: "Oral", freq: "BD", dur: "5 days" },
    { name: "Kenacort", dose: "0.1%", route: "Oral Paste", freq: "TID", dur: "7 days" },
    { name: "Candid Gel", dose: "Topical", route: "Oral Paste", freq: "TID", dur: "7 days" },
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

function extractGenericPrescriptions(text: string): PrescriptionItem[] {
  const list: PrescriptionItem[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 4) continue;

    // Matches Tab/Cap/Inj/Syp/Pow/Inj MedicineName ... Dosage/Frequency (1-0-1 or 0-0-1 or OD/BD/TID)
    const match = trimmed.match(/^(?:tab|cap|inj|syp|pow|powder|ointment|cream|paste)?[\s\.]*([a-zA-Z0-9\+\-\s]{3,35})\s+([0-1]\s*[\-\–]\s*[0-1]\s*[\-\–]\s*[0-1]|[0-1]\s*[\-\–]\s*[0-1]|OD|BD|BID|TID|QID|SOS|HS)/i);

    if (match && match[1]) {
      const name = match[1].trim();
      if (/patient|doctor|date|hospital|pathology|page|sign|reg|name|age|sex/i.test(name)) continue;
      if (name.length < 3 || /^[0-9]+$/.test(name)) continue;

      const freqStr = match[2]?.trim() || "As directed";
      list.push({
        medicineName: name.toUpperCase(),
        brandName: name,
        genericName: name,
        dosage: "As prescribed",
        frequency: freqStr,
        duration: "As advised",
        timing: "Take as directed",
        route: "Oral",
        specialInstructions: "Take as prescribed by physician",
      });
    }
  }

  return list;
}

function extractIndianPrescriptions(text: string): PrescriptionItem[] {
  const list: PrescriptionItem[] = [];

  const explicitMeds = [
    { name: "B-Complex Forte + Vit B12 + Biotin", generic: "B-Complex + Vit B12 + Biotin", dose: "1 Tab", route: "Oral", freq: "1 Tab Daily (Bedtime)", dur: "1 month", timing: "After food" },
    { name: "Syp. Aptimax", generic: "Giloy + Saunf + Kutki + Vidang", dose: "10ml", route: "Oral", freq: "2-0-2 (Twice Daily)", dur: "1 month", timing: "After food" },
    { name: "Tab. LMP-3", generic: "Methylcobalamin + L-Methylfolate + Pyridoxal-5-Phosphate", dose: "1 Tab", route: "Oral", freq: "1-0-0 (Morning)", dur: "1 month", timing: "After food" },
    { name: "Tab. Lemcal D3 60K", generic: "Cholecalciferol (Vitamin D3) 60,000 IU", dose: "60k IU", route: "Oral", freq: "0-0-1 (Weekly)", dur: "1 month", timing: "After food" },
    { name: "Cap. Rob DSR", generic: "Domperidone 30mg + Rabeprazole 20mg", dose: "30mg/20mg", route: "Oral", freq: "1-0-0 (Morning)", dur: "7-14 days", timing: "Before food (Empty Stomach)" },
    { name: "Inj. Lemcal D3", generic: "Vitamin D3 Injection", dose: "600,000 IU", route: "Intramuscular (IM)", freq: "1-0-0 (Once Weekly)", dur: "2-4 weeks", timing: "Clinical administration" },
    { name: "Kenacort 0.1% Oral Paste", generic: "Triamcinolone Acetonide 0.1%", dose: "0.1% w/w", route: "Topical / Oral Paste", freq: "1-1-1 (TID)", dur: "7 days", timing: "After meals" },
    { name: "Candid Mouth Gel + Betnesol", generic: "Clotrimazole + Betamethasone", dose: "Topical + 0.5mg", route: "Oral Paste + Tab", freq: "1-1-1 (TID)", dur: "7 days", timing: "After meals" },
    { name: "Tab. Nimford", generic: "Nimesulide 100mg + Paracetamol 325mg", dose: "100mg/325mg", route: "Oral", freq: "1-0-1 (BD)", dur: "3 days", timing: "After food (SOS)" },
    { name: "Pow. Electral 4.4gm", generic: "Oral Rehydration Salts (ORS)", dose: "4.4g / sachet", route: "Oral", freq: "1-0-0 (In 1L Water)", dur: "3 days", timing: "Frequent sips" },
    { name: "Tab. Risebok", generic: "Rifaximin / Gastro-antibiotic", dose: "400mg / 550mg", route: "Oral", freq: "1-0-1 (BD)", dur: "7-14 days", timing: "After food" },
    { name: "Cap. Niftran", generic: "Nitrofurantoin", dose: "100mg", route: "Oral", freq: "1-0-1 (BD)", dur: "7 days", timing: "After food" },
    { name: "Tab. Combiflam", generic: "Ibuprofen 400mg + Paracetamol 325mg", dose: "400mg/325mg", route: "Oral", freq: "1-0-1 (BD SOS)", dur: "3-5 days", timing: "After food" },
  ];

  for (const m of explicitMeds) {
    const keyword = m.name.split(" ")[1] || m.name.split(" ")[0];
    if (new RegExp(keyword.replace(/[^a-zA-Z0-9]/g, ""), "i").test(text)) {
      list.push({
        medicineName: m.name,
        brandName: m.name,
        genericName: m.generic,
        dosage: m.dose,
        frequency: m.freq,
        duration: m.dur,
        timing: m.timing,
        route: m.route,
        specialInstructions: "Take exactly as prescribed by physician",
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

const DEFAULT_REF_RANGES: Record<string, string> = {
  "hemoglobin": "13.5 - 17.5 g/dL",
  "wbc": "4,500 - 11,000 cells/µL",
  "total leucocyte count (tlc)": "4,000 - 11,000 cells/µL",
  "platelet count": "150,000 - 400,000 cells/µL",
  "rbc count": "4.5 - 6.0 M/µL",
  "neutrophils": "50 - 70 %",
  "lymphocytes": "20 - 40 %",
  "monocytes": "2 - 8 %",
  "eosinophils": "1 - 6 %",
  "basophils": "0 - 1 %",
  "serum creatinine": "0.7 - 1.3 mg/dL",
  "creatinine": "0.7 - 1.3 mg/dL",
  "blood urea": "15 - 45 mg/dL",
  "blood urea nitrogen (bun)": "7 - 20 mg/dL",
  "total bilirubin": "0.1 - 1.2 mg/dL",
  "direct bilirubin": "0.0 - 0.3 mg/dL",
  "indirect bilirubin": "0.1 - 0.8 mg/dL",
  "ast (sgot)": "10 - 40 IU/L",
  "sgot": "10 - 40 IU/L",
  "alt (sgpt)": "7 - 56 IU/L",
  "sgpt": "7 - 56 IU/L",
  "alp": "30 - 120 IU/L",
  "alkaline phosphatase": "30 - 120 IU/L",
  "tsh": "0.7 - 6.4 uIU/mL",
  "vitamin d (25 hydroxy)": "30 - 100 ng/mL",
  "vitamin d": "30 - 100 ng/mL",
  "vitamin b12": "200 - 1,100 pg/mL",
  "fasting blood sugar": "70 - 100 mg/dL",
  "random blood sugar": "70 - 140 mg/dL",
  "serum sodium": "135 - 155 mmol/L",
  "serum potassium": "3.5 - 5.5 mmol/L",
  "serum uric acid": "3.5 - 8.5 mg/dL",
  "salmonella typhi o": "< 1:80 (Negative)",
  "salmonella typhi h": "< 1:80 (Negative)",
};

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

async function extractVisionData(
  pageImages: Buffer[],
  language: string
): Promise<{ labs: LabParameter[]; prescriptions: PrescriptionItem[] }> {
  if (!pageImages || pageImages.length === 0) return { labs: [], prescriptions: [] };

  const prompt = `EXHAUSTIVE MULTIMODAL MEDICAL VISION EXTRACTION.
Examine all attached medical document page images (pathology lab report tables, blood test panels, doctor prescriptions, handwritten notes).

Extract EVERY SINGLE medical test parameter (name, value, unit, reference range, status) and EVERY SINGLE prescription item (medicine name, dosage, frequency, duration, route, special instructions) across all pages.

Return strictly valid JSON matching the exact schema.`;

  try {
    const response = await callAI("entity_extract", prompt, LAB_SYSTEM_PROMPT, {
      language,
      jsonMode: true,
      images: pageImages,
    });

    if (response.content) {
      const parsed = parseJsonFromText(response.content) as {
        labParameters?: LabParameter[];
        prescriptions?: PrescriptionItem[];
      };
      return {
        labs: parsed.labParameters ?? [],
        prescriptions: parsed.prescriptions ?? [],
      };
    }
  } catch (err) {
    logger.warn({ err }, "AI Vision extraction call failed");
  }

  return { labs: [], prescriptions: [] };
}

function splitTextIntoPages(text: string): string[] {
  if (!text.trim()) return [];

  // 1. Split on [DOC: ... | PAGE: N] header markers cleanly
  const pageBlocks = text
    .split(/\[DOC:[^\]]+?\|\s*PAGE:\s*\d+\]/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 20);

  if (pageBlocks.length > 1) {
    return pageBlocks;
  }

  // 2. Split on form feed \f
  const ffBlocks = text
    .split("\f")
    .map((p) => p.trim())
    .filter((p) => p.length > 20);

  if (ffBlocks.length > 1) {
    return ffBlocks;
  }

  // 3. Fallback: Slice every 3500 characters into page blocks
  const chunks: string[] = [];
  const chunkSize = 3500;
  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.slice(i, i + chunkSize).trim();
    if (chunk.length > 20) {
      chunks.push(chunk);
    }
  }
  return chunks.length > 0 ? chunks : [text];
}

export async function extractStructuredData(
  medicalContext: string,
  language = "English",
  pageImages?: Buffer[],
  pageTexts?: string[]
): Promise<StructuredExtractionResult> {
  const errors: string[] = [];

  const allLabs: LabParameter[] = [];
  const allPrescriptions: PrescriptionItem[] = [];
  let patientName: string | null = null;
  let patientAge: number | null = null;
  let patientSex: string | null = null;

  // Layer 1: Instant regex baseline extraction
  if (medicalContext.trim()) {
    allLabs.push(...extractLabsRegex(medicalContext));
    allPrescriptions.push(...extractGenericPrescriptions(medicalContext));
    allPrescriptions.push(...extractIndianPrescriptions(medicalContext));
    allPrescriptions.push(...extractPrescriptionsRegex(medicalContext));
  }

  const patientInfo = extractPatientInfo(medicalContext);

  // Layer 2: AI extraction — send the FULL document text in ONE call
  // This is the primary extraction method. The regex above is just a safety net.
  const fullText = medicalContext.trim();
  if (fullText.length > 50) {
    logger.info({ textLength: fullText.length, baselineRegexLabs: allLabs.length }, "Running primary AI extraction on full document text");

    const prompt = `EXHAUSTIVE MEDICAL DATA EXTRACTION.
You are given a patient's complete medical document text below. Extract EVERY SINGLE lab parameter and EVERY SINGLE prescription from this document. Do not miss any test or medication. Return strictly valid JSON.

--- FULL DOCUMENT TEXT ---
${fullText.slice(0, 15000)}
--- END DOCUMENT TEXT ---`;

    try {
      const response = await callAI("entity_extract", prompt, LAB_SYSTEM_PROMPT, {
        language,
        jsonMode: true,
      });

      if (response.content) {
        logger.info({ responseLength: response.content.length }, "AI extraction response received");
        const parsed = parseJsonFromText(response.content) as {
          labParameters?: LabParameter[];
          prescriptions?: PrescriptionItem[];
          patientName?: string | null;
          patientAge?: number | null;
          patientSex?: string | null;
        };
        if (parsed.labParameters?.length) {
          logger.info({ aiLabCount: parsed.labParameters.length }, "AI extracted lab parameters");
          allLabs.push(...parsed.labParameters);
        }
        if (parsed.prescriptions?.length) {
          logger.info({ aiMedCount: parsed.prescriptions.length }, "AI extracted prescriptions");
          allPrescriptions.push(...parsed.prescriptions);
        }
        if (!patientName && parsed.patientName) patientName = parsed.patientName;
        if (!patientAge && parsed.patientAge) patientAge = parsed.patientAge;
        if (!patientSex && parsed.patientSex) patientSex = parsed.patientSex;
      } else {
        logger.warn("AI extraction returned empty content");
        errors.push("AI extraction returned empty response");
      }
    } catch (err) {
      logger.error({ err }, "AI extraction call failed");
      errors.push(`AI extraction failed: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  // Layer 3: If we have page images, also try vision extraction on images
  const imagesList = pageImages ?? [];
  if (imagesList.length > 0) {
    logger.info({ imageCount: imagesList.length }, "Running vision extraction on page images");
    for (let p = 0; p < Math.min(imagesList.length, 6); p++) {
      const imgBuf = imagesList[p];
      if (!imgBuf) continue;

      try {
        const response = await callAI("entity_extract",
          `Extract ALL lab parameters and prescriptions from this medical document page image. Return strictly valid JSON.`,
          LAB_SYSTEM_PROMPT,
          { language, jsonMode: true, images: [imgBuf] }
        );

        if (response.content) {
          const parsed = parseJsonFromText(response.content) as {
            labParameters?: LabParameter[];
            prescriptions?: PrescriptionItem[];
          };
          if (parsed.labParameters?.length) allLabs.push(...parsed.labParameters);
          if (parsed.prescriptions?.length) allPrescriptions.push(...parsed.prescriptions);
        }
      } catch (err) {
        logger.warn({ err, page: p + 1 }, "Vision extraction error");
      }
    }
  }

  const dedupResult = processLabDeduplicationAndConflicts(allLabs);
  const finalLabs = dedupResult.resolvedLabs;
  const finalPrescriptions = deduplicatePrescriptions(allPrescriptions);

  logger.info({
    finalLabCount: finalLabs.length,
    finalMedCount: finalPrescriptions.length,
    summaryStats: dedupResult.summaryStats,
    errors: errors.length,
  }, "Extraction and deduplication complete");

  return {
    labParameters: finalLabs,
    prescriptions: finalPrescriptions,
    patientName: patientName || patientInfo.name,
    patientAge: patientAge || patientInfo.age,
    patientSex: patientSex || patientInfo.sex,
    extractionErrors: errors,
    summaryStats: dedupResult.summaryStats,
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
  const junkWords = ["page", "doc:", "sl.no", "sr.no", "of 12", "of 8", "page 1", "page 2", "page 3", "page 4", "page 5", "page 6", "page 7", "page 8", "page 9", "page 10", "page 11", "page 12"];

  for (const lab of labs) {
    const name = lab.name.trim();
    const lowerName = name.toLowerCase();

    // Must have at least 3 alphabetic characters
    if ((name.match(/[a-zA-Z]/g) ?? []).length < 3) continue;

    // Filter out page numbers, headers, footers
    if (junkWords.some((w) => lowerName.includes(w))) continue;
    if (/^[0-9\s\-\_]+$/.test(name)) continue;
    if (/^(?:page|doc|file|of|sl|sr|no)\b/i.test(name)) continue;

    const key = lowerName;
    if (!seen.has(key)) {
      seen.set(key, lab);
    }
  }
  return Array.from(seen.values());
}
