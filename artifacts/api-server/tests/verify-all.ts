import app from "../src/app.js";
import { createJob, getJob, updateJob } from "../src/store.js";
import { performClinicalReasoning } from "../src/services/clinicalReasoningService.js";
import { generateReportPdf } from "../src/services/pdfExport.js";
import type { LabParameter } from "../src/services/extractionService.js";

async function runTests() {
  console.log("=========================================");
  console.log("  CDSI E2E PIPELINE & ALL-OPTIONS TEST   ");
  console.log("=========================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // Test 1: Sample Lab Parameters
  const sampleLabs: LabParameter[] = [
    { name: "Hemoglobin", value: "11.2", unit: "g/dL", referenceRange: "13.5-17.5", status: "borderline", interpretation: "Mild anemia" },
    { name: "WBC Count", value: "14200", unit: "cells/mm3", referenceRange: "4000-11000", status: "critical", interpretation: "Leukocytosis indicating active infection" },
    { name: "Platelet Count", value: "180000", unit: "cells/mm3", referenceRange: "150000-450000", status: "normal", interpretation: "Normal platelet count" },
    { name: "Widal Test (S. Typhi O)", value: "1:320", unit: "titer", referenceRange: "< 1:80", status: "critical", interpretation: "Positive Salmonella Typhi O antigen titer" }
  ];

  const samplePrescriptions = [
    { name: "Ceftriaxone 1g IV", dosage: "1g IV BD", duration: "7 days", instructions: "Administer slowly over 30 mins" },
    { name: "Paracetamol 500mg", dosage: "1 tab TDS", duration: "5 days", instructions: "For fever spike > 100F" }
  ];

  const medicalContext = "Patient presented with 5-day fever up to 102F, abdominal cramping, and chills. Lab reports show Hb 11.2, WBC 14,200, Widal O 1:320. Prescribed Ceftriaxone and Paracetamol.";

  // Test 2: Option 1 - Physical Analysis
  try {
    const resPhysical = await performClinicalReasoning(
      medicalContext,
      sampleLabs,
      samplePrescriptions,
      { analysisType: "physical", chiefComplaint: "High fever & chills", age: 24, biologicalSex: "Male" },
      "English"
    );
    assert(Array.isArray(resPhysical.findings), "Option 1 (Physical): Returns findings array");
    assert(Array.isArray(resPhysical.organSystems), "Option 1 (Physical): Returns organSystems array");
    assert(resPhysical.psychiatricSummary === null, "Option 1 (Physical): Psychiatric summary is correctly null");
  } catch (err) {
    assert(false, `Option 1 (Physical) threw error: ${err}`);
  }

  // Test 3: Option 2 - Psychiatric Analysis
  try {
    const resPsych = await performClinicalReasoning(
      medicalContext,
      sampleLabs,
      samplePrescriptions,
      {
        analysisType: "psychiatric",
        chiefComplaint: "Anxiety and sleep disruption",
        age: 28,
        biologicalSex: "Female",
        phq9Answers: [2, 2, 1, 3, 1, 2, 1, 0, 0], // Score = 12 (Moderate)
        gad7Answers: [3, 3, 2, 2, 1, 1, 0]        // Score = 12 (Moderate)
      },
      "English"
    );
    assert(resPsych.psychiatricSummary !== null, "Option 2 (Psychiatric): Returns non-null psychiatricSummary");
    assert(resPsych.psychiatricSummary?.phq9Score === 12, "Option 2 (Psychiatric): PHQ-9 score correctly calculated as 12");
    assert(resPsych.psychiatricSummary?.gad7Score === 12, "Option 2 (Psychiatric): GAD-7 score correctly calculated as 12");
  } catch (err) {
    assert(false, `Option 2 (Psychiatric) threw error: ${err}`);
  }

  // Test 4: Option 3 - Physical + Psychiatric Analysis
  try {
    const resBoth = await performClinicalReasoning(
      medicalContext,
      sampleLabs,
      samplePrescriptions,
      {
        analysisType: "both",
        chiefComplaint: "Chronic fatigue, fever, and panic attacks",
        age: 35,
        biologicalSex: "Female",
        phq9Answers: [3, 3, 3, 3, 2, 2, 1, 1, 0], // Score = 18 (Severe)
        gad7Answers: [3, 3, 3, 2, 2, 1, 1]        // Score = 15 (Severe)
      },
      "English"
    );
    assert(Array.isArray(resBoth.findings), "Option 3 (Both): Returns physical findings array");
    assert(resBoth.psychiatricSummary !== null, "Option 3 (Both): Returns non-null psychiatricSummary");
    assert(resBoth.psychiatricSummary?.showMentalHealthBanner === true, "Option 3 (Both): Shows mental health alert banner for severe score");
  } catch (err) {
    assert(false, `Option 3 (Both) threw error: ${err}`);
  }

  // Test 5: Option 4 - Adaptive AI Analysis
  try {
    const resAdaptive = await performClinicalReasoning(
      medicalContext,
      sampleLabs,
      samplePrescriptions,
      {
        analysisType: "adaptive",
        chiefComplaint: "Abdominal cramping and fatigue",
        age: 30,
        biologicalSex: "Male"
      },
      "English"
    );
    assert(Array.isArray(resAdaptive.findings), "Option 4 (Adaptive): Returns physical findings array");
    assert(Array.isArray(resAdaptive.organSystems), "Option 4 (Adaptive): Returns organSystems array");
  } catch (err) {
    assert(false, `Option 4 (Adaptive) threw error: ${err}`);
  }

  // Test 6: PDF Generation Test
  try {
    const mockReport = {
      jobId: "test-job-pdf",
      patientSummary: {
        name: "Test Patient",
        age: 30,
        sex: "Male",
        bmi: 15.8,
        dateOfAnalysis: new Date().toISOString(),
        analysisType: "adaptive"
      },
      labParameters: sampleLabs,
      prescriptions: samplePrescriptions,
      findings: [
        {
          findingText: "Salmonella Typhi Infection (Typhoid Fever)",
          confidence: 95,
          sourceDocument: null,
          sourcePage: null,
          sourceValue: "Widal O Titer 1:320",
          reasoning: "High WBC count and positive Widal titer indicate active typhoid fever.",
          category: "confirmed" as const,
          details: null
        }
      ],
      organSystems: [
        { system: "Hematic / Immune System", status: "warning" as const, summary: "Leukocytosis with WBC 14,200" }
      ],
      criticalValues: ["WBC Count: 14200 cells/mm3 (critical)"],
      psychiatricSummary: {
        phq9Score: 12,
        phq9Interpretation: "Moderate depression",
        gad7Score: 10,
        gad7Interpretation: "Moderate anxiety",
        showMentalHealthBanner: false,
        narrativeSummary: "Psychiatric symptoms secondary to chronic systemic illness."
      },
      clinicalConclusion: "Acute Typhoid Fever with mild secondary anemia.",
      possibleConditions: ["Salmonella Enteric Fever", "Gastroenteritis"],
      riskAssessment: {
        level: "moderate" as const,
        reasoning: "Requires IV Antibiotic therapy and monitoring.",
        urgency: "soon" as const
      },
      nextSteps: ["Complete 7-day Ceftriaxone course", "Re-check CBC and Widal in 10 days"],
      disclaimer: "AI Decision Support Only.",
      createdAt: new Date().toISOString()
    };

    const pdfBuffer = await generateReportPdf(mockReport);
    assert(Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 5000, `Option PDF: PDF generated successfully (${pdfBuffer.length} bytes)`);
  } catch (err) {
    assert(false, `PDF Generation threw error: ${err}`);
  }

  console.log("\n=========================================");
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED  `);
  console.log("=========================================\n");

  if (failed > 0) process.exit(1);
}

runTests().catch(console.error);
