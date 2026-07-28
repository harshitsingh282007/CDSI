# CDSI - Clinical Decision Support Intelligence

> AI-powered clinical report analysis platform that transforms raw medical documents, lab reports, and prescriptions into structured, actionable clinical insights - with multi-language support and a PDF export.

---

## Overview

CDSI is a full-stack healthcare AI platform built for clinicians and medical professionals. Upload any medical document - lab reports, prescriptions, imaging summaries, intake forms - and CDSI's AI pipeline extracts, structures, and analyses the data to produce a comprehensive clinical decision support report.

The platform is designed to **assist** licensed healthcare professionals, not replace them. All outputs carry clear AI-generated disclaimers and are structured for fast clinical review.

---

## Key Features

### AI-Powered Analysis
- Extracts lab parameters, findings, prescriptions, and organ system data from raw PDF/text documents
- Generates a structured **Risk Assessment** (Low / Moderate / High / Critical) with urgency classification
- Identifies **Possible Conditions** and differential diagnoses
- Produces a **Clinical Conclusion** narrative summary
- Suggests **Next Steps** and actionable recommendations
- Psychiatric scoring integration - **PHQ-9** and **GAD-7** with interpretation

### Interactive Report Dashboard
- **Risk Gauge Chart** - radial bar visualisation of overall risk level
- **Lab Donut Chart** - distribution of normal / abnormal / critical / low values
- **Lab Panel Chart** - stacked bar chart grouped by panel (CBC, Metabolic, etc.)
- **Confidence Chart** - horizontal bar chart for finding confidence scores
- **Organ System Chart** - status breakdown across all organ systems
- Summary stats row: total labs, abnormal count, critical flags, confirmed findings

### Professional PDF Export
- Full multi-page A4 report with dark branded header/footer
- Cover page with Risk Assessment banner (colour-coded by severity)
- 4-stat summary dashboard (lab count, abnormal, critical, findings)
- Possible conditions as pill tags
- Next steps with numbered circles
- Organ system grid cards
- Complete lab results table with panel sub-labels and status colour coding
- Prescriptions with dosage, frequency, and special instructions
- Psychiatric score progress bars
- Regulatory disclaimer block
- Page numbers on every page

### 20-Language Support
Full UI translation across all pages in:
English · Arabic · French · Spanish · German · Portuguese · Hindi · Urdu · Chinese (Simplified) · Japanese · Korean · Russian · Turkish · Italian · Dutch · Polish · Bengali · Swahili · Persian · Malay

### Patient Intake
- Structured intake form capturing demographics, chief complaint, history, medications, allergies, and lifestyle
- Feeds patient context into the AI pipeline for more accurate analysis

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Wouter Router |
| Charts | Recharts 2.x |
| State / Data | TanStack Query v5, React Context |
| Backend | Node.js, Express, esbuild |
| AI - Extraction | OpenAI-compatible API (e.g. DeepSeek, OpenAI, Gemini) |
| AI - Reasoning | OpenAI-compatible API (e.g. DeepSeek, OpenAI, Gemini) |
| PDF Generation | PDFKit (server-side) |
| PDF Parsing | pdf-parse v2 |
| Monorepo | pnpm workspaces |

---

## Project Structure

```
CDSI-AI/
├── artifacts/
│   ├── cdsi-platform/          # React + Vite frontend
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── Upload.tsx        # Document upload
│   │       │   ├── Intake.tsx        # Patient intake form
│   │       │   ├── Processing.tsx    # Real-time analysis progress
│   │       │   ├── Report.tsx        # Interactive report + charts
│   │       │   └── Settings.tsx      # Language & system settings
│   │       ├── context/
│   │       │   └── CDSIContext.tsx   # Global state (language, report, session)
│   │       └── translations.ts      # 20-language translation system
│   └── api-server/             # Express backend
│       └── src/
│           ├── routes/
│           │   ├── analysis.ts       # POST /api/analyse - starts pipeline
│           │   ├── export.ts         # POST /api/export-report - PDF generation
│           │   └── status.ts         # GET /api/status/:jobId - polling
│           ├── services/
│           │   ├── pdfExport.ts      # Full report PDF builder
│           │   ├── extractionService.ts    # AI extraction pipeline
│           │   └── clinicalReasoningService.ts    # AI reasoning pipeline
│           └── types/
│               └── report.ts         # Shared ClinicalReport schema
└── package.json
```

---

## How It Works

```
1. Upload  →  Patient uploads a PDF or text medical document
2. Intake  →  Optional: fill in patient demographics & history
3. Process →  AI pipeline extracts & structures all clinical data
                 ├── Extraction AI: lab values, prescriptions, findings
                 └── Reasoning AI:  risk assessment, conditions, conclusion
4. Report  →  Interactive dashboard with charts & full clinical report
5. Export  →  Download a professional multi-page PDF
```

The backend uses a polling architecture - the frontend polls `/api/status/:jobId` every 1.5 seconds and displays smooth animated progress until analysis is complete.

---

## Clinical Data Extracted

| Category | Details |
|---|---|
| Lab Parameters | Name, value, unit, reference range, status (normal/high/low/critical), panel grouping |
| Clinical Findings | Finding text, category (confirmed/differential/recommendation), confidence %, reasoning |
| Prescriptions | Medicine name, dosage, frequency, duration, timing, special instructions |
| Organ Systems | System name, status, summary |
| Risk Assessment | Level (low/moderate/high/critical), reasoning, urgency |
| Possible Conditions | Differential diagnosis list |
| Clinical Conclusion | AI-generated narrative summary |
| Next Steps | Actionable recommendation list |
| Psychiatric Scores | PHQ-9, GAD-7 scores with interpretation |

---

## Disclaimer

> **CDSI is a clinical decision support tool intended solely to assist licensed healthcare professionals.** It does not constitute a medical diagnosis, treatment plan, or clinical opinion. All AI-generated findings must be independently reviewed and verified by a qualified clinician before any clinical action is taken.
