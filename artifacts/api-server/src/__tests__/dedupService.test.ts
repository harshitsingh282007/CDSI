import assert from "node:assert";
import {
  processLabDeduplicationAndConflicts,
  findCanonicalMatch,
  getRegistry,
  areValuesWithinTolerance,
  normalizeNumericValue,
  type LabParameter,
} from "../services/labDeduplicationService.js";

function runTests() {
  console.log("=================================================");
  console.log("   CDSI LAB DEDUPLICATION & CONFLICT TEST SUITE  ");
  console.log("=================================================\n");

  const registry = getRegistry();
  assert.ok(registry.entries.length > 0, "Registry must contain canonical lab entries");
  console.log(`✓ Registry loaded: ${registry.entries.length} canonical test entries found.\n`);

  // ── TEST 1: Full Registry Synonym Integrity ──────────────────────────────
  console.log("RUNNING TEST 1: Full Registry Synonym Resolution...");
  for (const entry of registry.entries) {
    for (const syn of entry.synonyms) {
      const match = findCanonicalMatch(syn, registry);
      assert.ok(match.entry !== null, `Synonym '${syn}' failed to match any canonical entry`);
      assert.strictEqual(
        match.entry.canonicalKey,
        entry.canonicalKey,
        `Synonym '${syn}' matched '${match.entry.canonicalKey}', expected '${entry.canonicalKey}'`
      );
    }
  }
  console.log("✓ PASS: All registry synonyms resolve 1:1 to their canonical keys.\n");

  // ── TEST 2: Synonym Deduplication (Property 1) ───────────────────────────
  console.log("RUNNING TEST 2: Synonym Deduplication (N synonym-labeled rows -> 1 row)...");
  const synLabs: LabParameter[] = [
    { name: "WBC", value: "12000", unit: "cells/µL", referenceRange: "4500-11000", status: "high", interpretation: null, panel: "CBC" },
    { name: "Total Leukocyte Count", value: "12", unit: "10^3/ul", referenceRange: "4-11", status: "high", interpretation: null, panel: "CBC" },
    { name: "TLC", value: "12.0", unit: "k/ul", referenceRange: "4-11", status: "high", interpretation: null, panel: "CBC" },
    { name: "WBC (Total)", value: "12000", unit: "cells/ul", referenceRange: "4500-11000", status: "high", interpretation: null, panel: "CBC" },
  ];

  const synResult = processLabDeduplicationAndConflicts(synLabs, registry);
  assert.strictEqual(synResult.resolvedLabs.length, 1, "Expected exactly 1 resolved WBC row");
  assert.strictEqual(synResult.resolvedLabs[0].canonicalKey, "wbc");
  assert.strictEqual(synResult.resolvedLabs[0].isConflicting, false);
  assert.strictEqual(synResult.resolvedLabs[0].sourceExtractions.length, 4, "Source extractions should contain all 4 raw entries");
  assert.strictEqual(synResult.summaryStats.mergedCount, 3, "Merged count should be 3");
  console.log("✓ PASS: 4 synonym-labeled WBC rows correctly deduplicated into 1 canonical entry.\n");

  // ── TEST 3: Contradictory Value Conflict Detection (Property 2) ──────────
  console.log("RUNNING TEST 3: Contradictory Value Conflict Detection...");
  const conflictLabs: LabParameter[] = [
    { name: "Serum Creatinine", value: "1.4", unit: "mg/dL", referenceRange: "0.7-1.3", status: "high", interpretation: null, panel: "KFT" },
    { name: "Creatinine", value: "5.2", unit: "mg/dL", referenceRange: "0.7-1.3", status: "critical", interpretation: null, panel: "KFT" },
  ];

  const conflictResult = processLabDeduplicationAndConflicts(conflictLabs, registry);
  assert.strictEqual(conflictResult.resolvedLabs.length, 1, "Expected 1 canonical group row");
  assert.strictEqual(conflictResult.resolvedLabs[0].canonicalKey, "creatinine");
  assert.strictEqual(conflictResult.resolvedLabs[0].isConflicting, true, "isConflicting flag must be true");
  assert.ok(conflictResult.resolvedLabs[0].conflictDetails !== null);
  assert.strictEqual(conflictResult.resolvedLabs[0].conflictDetails?.rawValues.length, 2);
  assert.strictEqual(conflictResult.summaryStats.conflictingCount, 1, "Summary stats conflictingCount must be 1");
  console.log("✓ PASS: Contradictory Creatinine values (1.4 vs 5.2) correctly flagged as CONFLICTING_EXTRACTION.\n");

  // ── TEST 4: Negative Guard Distinct Parameter Protection (Property 3) ───
  console.log("RUNNING TEST 4: Negative Guard Protection (Distinct tests with similar names)...");
  const distinctLabs: LabParameter[] = [
    { name: "Total Bilirubin", value: "2.8", unit: "mg/dL", referenceRange: "0.1-1.2", status: "critical", interpretation: null, panel: "LFT" },
    { name: "Direct Bilirubin", value: "1.6", unit: "mg/dL", referenceRange: "0.0-0.3", status: "critical", interpretation: null, panel: "LFT" },
    { name: "Indirect Bilirubin", value: "1.2", unit: "mg/dL", referenceRange: "0.1-0.8", status: "high", interpretation: null, panel: "LFT" },
    { name: "AST", value: "94", unit: "IU/L", referenceRange: "10-40", status: "high", interpretation: null, panel: "LFT" },
    { name: "ALT", value: "82", unit: "IU/L", referenceRange: "7-56", status: "high", interpretation: null, panel: "LFT" },
    { name: "Fasting Blood Sugar", value: "118", unit: "mg/dL", referenceRange: "70-100", status: "high", interpretation: null, panel: "Glucose" },
    { name: "Random Blood Sugar", value: "164", unit: "mg/dL", referenceRange: "70-140", status: "high", interpretation: null, panel: "Glucose" },
  ];

  const distinctResult = processLabDeduplicationAndConflicts(distinctLabs, registry);
  assert.strictEqual(distinctResult.resolvedLabs.length, 7, "All 7 distinct parameters must remain separate");
  const keys = distinctResult.resolvedLabs.map((l) => l.canonicalKey).sort();
  const expectedKeys = ["alt", "ast", "direct_bilirubin", "fasting_glucose", "indirect_bilirubin", "random_glucose", "total_bilirubin"].sort();
  assert.deepStrictEqual(keys, expectedKeys, "Canonical keys must match exactly");
  assert.strictEqual(distinctResult.summaryStats.conflictingCount, 0, "No conflicts should be flagged for distinct parameters");
  console.log("✓ PASS: Distinct parameters (Total/Direct/Indirect Bilirubin, AST/ALT, Fasting/Random Glucose) remain completely isolated.\n");

  // ── TEST 5: Unit Conversion & Normalization (Property 5) ─────────────────
  console.log("RUNNING TEST 5: Unit Conversion Normalization...");
  const entryWbc = registry.entries.find((e) => e.canonicalKey === "wbc")!;
  const norm1 = normalizeNumericValue("12.5", "10^3/ul", entryWbc);
  const norm2 = normalizeNumericValue("12500", "cells/µL", entryWbc);
  assert.strictEqual(norm1, 12500, "12.5 10^3/ul must normalize to 12500 cells/µL");
  assert.strictEqual(norm2, 12500, "12500 cells/µL must normalize to 12500 cells/µL");

  const tolCheck = areValuesWithinTolerance(
    { name: "WBC", value: "12.5", unit: "10^3/ul", referenceRange: null, status: "high", interpretation: null, panel: "CBC" },
    { name: "WBC", value: "12500", unit: "cells/µL", referenceRange: null, status: "high", interpretation: null, panel: "CBC" },
    entryWbc
  );
  assert.strictEqual(tolCheck, true, "12.5 10^3/ul and 12500 cells/µL must be within tolerance");
  console.log("✓ PASS: Unit conversion correctly normalizes and compares different unit conventions.\n");

  // ── TEST 6: Summary Statistics Calculation ────────────────────────────────
  console.log("RUNNING TEST 6: Summary Statistics Recomputation...");
  assert.strictEqual(distinctResult.summaryStats.totalAnalyzed, 7);
  assert.strictEqual(distinctResult.summaryStats.abnormalCount, 5);
  assert.strictEqual(distinctResult.summaryStats.criticalCount, 2);
  assert.strictEqual(synResult.summaryStats.totalAnalyzed, 1);
  assert.strictEqual(synResult.summaryStats.mergedCount, 3);
  console.log("✓ PASS: Summary statistics accurately recomputed on resolved dataset.\n");

  console.log("=================================================");
  console.log("   ALL DEDUPLICATION & CONFLICT TESTS PASSED!    ");
  console.log("=================================================");
}

try {
  runTests();
} catch (err) {
  console.error("\n❌ TEST FAILURE:", err);
  process.exit(1);
}
