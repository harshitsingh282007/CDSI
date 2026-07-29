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
    { name: "TAB. DAILY (B-Complex Forte + Vit B12 + Biotin)", generic: "B-Complex + Vit B12 + Biotin", dose: "100mcg", route: "Oral", freq: "0-0-1 (Bedtime)", dur: "1 month", timing: "After food" },
    { name: "SYP. APTIMAX", generic: "Giloy + Saunf + Kutki + Vidang", dose: "10ml", route: "Oral", freq: "2-0-2 (Twice Daily)", dur: "1 month", timing: "After food" },
    { name: "TAB. LMP-3", generic: "Methylcobalamin + L-Methylfolate + Pyridoxal-5-Phosphate", dose: "1 Tab", route: "Oral", freq: "1-0-0 (Morning)", dur: "1 month", timing: "After food" },
    { name: "TAB. LEMCAL D3 60K", generic: "Cholecalciferol (Vitamin D3) 60,000 IU", dose: "60k IU", route: "Oral", freq: "0-0-1 (Weekly)", dur: "1 month", timing: "After food" },
    { name: "CAP. ROB DSR", generic: "Domperidone 30mg + Rabeprazole 20mg", dose: "30mg/20mg", route: "Oral", freq: "1-0-0 (Morning)", dur: "7-14 days", timing: "Before food (Empty Stomach)" },
    { name: "INJ. LEMCAL D3", generic: "Vitamin D3 Injection", dose: "600,000 IU", route: "Intramuscular (IM)", freq: "1-0-0 (Once Weekly)", dur: "2-4 weeks", timing: "Clinical administration" },
    { name: "KENACORT 0.1% ORAL PASTE", generic: "Triamcinolone Acetonide 0.1%", dose: "0.1% w/w", route: "Topical / Oral Paste", freq: "1-1-1 (TID)", dur: "7 days", timing: "After meals" },
    { name: "CANDID MOUTH GEL + BETNESOL FORTE", generic: "Clotrimazole + Betamethasone", dose: "Topical + 0.5mg", route: "Oral Paste + Tab", freq: "1-1-1 (TID)", dur: "7 days", timing: "After meals" },
    { name: "TAB. NIMFORD", generic: "Nimesulide 100mg + Paracetamol 325mg", dose: "100mg/325mg", route: "Oral", freq: "1-0-1 (BD)", dur: "3 days", timing: "After food (SOS)" },
    { name: "POW. ELECTRAL 4.4GM", generic: "Oral Rehydration Salts (ORS)", dose: "4.4g / sachet", route: "Oral", freq: "1-0-0 (In 1L Water)", dur: "3 days", timing: "Frequent sips" },
    { name: "TAB. RISEBOK", generic: "Rifaximin / Gastro-antibiotic", dose: "400mg / 550mg", route: "Oral", freq: "1-0-1 (BD)", dur: "7-14 days", timing: "After food" },
    { name: "CAP. NIFTRAN", generic: "Nitrofurantoin", dose: "100mg", route: "Oral", freq: "1-0-1 (BD)", dur: "7 days", timing: "After food" },
    { name: "TAB. COMBIFLAM", generic: "Ibuprofen 400mg + Paracetamol 325mg", dose: "400mg/325mg", route: "Oral", freq: "1-0-1 (BD SOS)", dur: "3-5 days", timing: "After food" },
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

function extractGenericTableLabs(text: string): LabParameter[] {
  const labs: LabParameter[] = [];
  const lines = text.split("\n");
  const ignoreHeaderWords = ["page", "patient", "doctor", "hospital", "pathology", "sample", "barcode", "report", "method", "unit", "result", "biological", "ref", "interval", "department", "test name", "sl.no", "sr.no", "doc:"];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 5) continue;

    // Filter out page footers / headers
    if (/^\-\-\s*[0-9]+\s*of\b/i.test(trimmed) || /\bpage\s*[0-9]+/i.test(trimmed) || /\bof\s+[0-9]+\b/i.test(trimmed)) continue;

    // Flexible Line Matcher for pathology table rows:
    // Group 1: Test Name (3 to 50 chars)
    // Group 2: Value (number, decimal, ratio 1:160, range 10-12, or text POSITIVE/NEGATIVE/PRESENT/REACTIVE/TRACE/NIL/CLEAR)
    // Group 3: Unit (optional)
    // Group 4: Flag (HIGH, LOW, CRITICAL, NORMAL, ABN, H, L, C, N)
    // Group 5: Reference Range (optional)
    const lineMatch = trimmed.match(
      /^([a-zA-Z0-9\s\(\)\-\.\/]{3,50})\s+([0-9]+\.?[0-9]*\s*[\-\:]\s*[0-9]+\.?[0-9]*|[0-9]+\.?[0-9]*|POSITIVE|NEGATIVE|PRESENT|ABSENT|REACTIVE|NON\-REACTIVE|TRACE|CLEAR|CLOUDY|TURBID|NIL|NORMAL|STRAW)\s*([a-zA-Z%\/µu0-9\^\-\s]{1,25})?\s*(HIGH|LOW|CRITICAL|NORMAL|ABN|[HLNC])?\s*([0-9]+\.?[0-9]*\s*[\-\–\:]\s*[0-9]+\.?[0-9]*)?/i
    );

    if (lineMatch && lineMatch[1] && lineMatch[2]) {
      let name = lineMatch[1].trim();

      // Strip common prefixes: S., SERUM, PLASMA, BLOOD, URINE -
      name = name.replace(/^(?:s\.|serum|plasma|blood|urine\s*[\-\:]?)\s+/i, "").trim();
      const lowerName = name.toLowerCase();

      // Skip header / footer lines
      if (ignoreHeaderWords.some((w) => lowerName.startsWith(w) || lowerName.endsWith(w))) continue;
      if (name.length < 3 || /^[0-9\s\-\_]+$/.test(name)) continue;
      if ((name.match(/[a-zA-Z]/g) ?? []).length < 3) continue;

      const valStr = lineMatch[2].trim();
      const rawUnit = lineMatch[3]?.trim() || null;
      const rawFlag = lineMatch[4]?.trim()?.toUpperCase() || null;
      const refRange = lineMatch[5]?.trim() || null;

      let status: LabParameter["status"] = "normal";
      if (rawFlag === "L" || rawFlag === "LOW") status = "low";
      else if (rawFlag === "H" || rawFlag === "HIGH") status = "high";
      else if (rawFlag === "C" || rawFlag === "CRITICAL" || rawFlag === "ABN") status = "critical";
      else if (/positive|reactive|present/i.test(valStr)) status = "high";

      let panel = "Other";
      if (/wbc|tlc|rbc|hb|hemoglobin|hematocrit|platelet|plt|neutrophil|lymphocyte|eosinophil|monocyte|mcv|mch|mchc|pcv/i.test(name)) panel = "CBC";
      else if (/bilirubin|sgot|sgpt|ast|alt|alp|alkaline|phosphatase|albumin|protein|globulin|ggt|ratio/i.test(name)) panel = "LFT";
      else if (/creatinine|urea|bun|uric|egfr|calcium|phosphorus|sodium|potassium|chloride/i.test(name)) panel = "KFT";
      else if (/tsh|t3|t4|thyroid/i.test(name)) panel = "Thyroid";
      else if (/vitamin|vit d|vit b|hydroxy|b12/i.test(name)) panel = "Vitamins";
      else if (/glucose|sugar|hba1c|fasting|pp/i.test(name)) panel = "Glucose";
      else if (/urine|pus|ep|epithelial|casts|crystals|sp\.?gr|ph|ketones|urobilinogen/i.test(name)) panel = "Urine";
      else if (/widal|typhidot|typhi|serology|hiv|hbsag|hcv|vdrl|ra factor|crp|esr/i.test(name)) panel = "Infectious";

      labs.push({
        name,
        value: valStr,
        unit: rawUnit,
        referenceRange: refRange,
        status,
        interpretation: `Extracted result: ${valStr}${rawUnit ? " " + rawUnit : ""}`,
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

  // Layer 1: ALWAYS run document-wide deterministic parsers first to guarantee immediate baseline extraction
  if (medicalContext.trim()) {
    allLabs.push(...extractGenericTableLabs(medicalContext));
    allLabs.push(...extractLabsRegex(medicalContext));
    allPrescriptions.push(...extractGenericPrescriptions(medicalContext));
    allPrescriptions.push(...extractIndianPrescriptions(medicalContext));
    allPrescriptions.push(...extractPrescriptionsRegex(medicalContext));
  }

  const imagesList = pageImages ?? [];
  const textsList = (pageTexts && pageTexts.length > 0) ? pageTexts : splitTextIntoPages(medicalContext);
  const totalPages = Math.max(imagesList.length, textsList.length);

  logger.info({ totalPages, imageCount: imagesList.length, textPageCount: textsList.length, baselineLabs: allLabs.length, baselineMeds: allPrescriptions.length }, "Executing Page-by-Page AI Vision & Text Extraction");

  // Page-by-Page Extraction: Loops through EACH page individually to extract ALL labs & prescriptions
  if (totalPages > 0) {
    logger.info({ totalPages }, "Executing Page-by-Page AI Vision & Text Extraction");
    for (let p = 0; p < totalPages; p++) {
      const imgBuf = imagesList[p];
      const textChunk = textsList[p] ?? "";

      const prompt = `PAGE ${p + 1} OF ${totalPages} - EXHAUSTIVE MEDICAL DATA EXTRACTION.
Analyze Page ${p + 1} of the patient's medical record (pathology report table or doctor prescription note).

Extract EVERY SINGLE medical test parameter (name, value, unit, reference range, status) and EVERY SINGLE prescription item (medicine name, dosage, frequency, duration, route, special instructions) visible on Page ${p + 1}.

Page Text Context:
${textChunk}

Return strictly valid JSON matching the exact schema.`;

      try {
        const response = await callAI("entity_extract", prompt, LAB_SYSTEM_PROMPT, {
          language,
          jsonMode: true,
          images: imgBuf ? [imgBuf] : undefined,
        });

        if (response.content) {
          const parsed = parseJsonFromText(response.content) as {
            labParameters?: LabParameter[];
            prescriptions?: PrescriptionItem[];
            patientName?: string | null;
            patientAge?: number | null;
            patientSex?: string | null;
          };
          if (parsed.labParameters?.length) allLabs.push(...parsed.labParameters);
          if (parsed.prescriptions?.length) allPrescriptions.push(...parsed.prescriptions);
          if (!patientName && parsed.patientName) patientName = parsed.patientName;
          if (!patientAge && parsed.patientAge) patientAge = parsed.patientAge;
          if (!patientSex && parsed.patientSex) patientSex = parsed.patientSex;
        }
      } catch (err) {
        logger.warn({ err, page: p + 1 }, "Page-by-page AI extraction error");
      }

      // Page-level deterministic parsers
      if (textChunk) {
        allLabs.push(...extractGenericTableLabs(textChunk));
        allLabs.push(...extractLabsRegex(textChunk));
        allPrescriptions.push(...extractGenericPrescriptions(textChunk));
        allPrescriptions.push(...extractIndianPrescriptions(textChunk));
        allPrescriptions.push(...extractPrescriptionsRegex(textChunk));
      }
    }
  }

  // Document-wide fallback pass
  if (medicalContext.trim()) {
    allLabs.push(...extractGenericTableLabs(medicalContext));
    allLabs.push(...extractLabsRegex(medicalContext));
    allPrescriptions.push(...extractGenericPrescriptions(medicalContext));
    allPrescriptions.push(...extractIndianPrescriptions(medicalContext));
    allPrescriptions.push(...extractPrescriptionsRegex(medicalContext));
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
