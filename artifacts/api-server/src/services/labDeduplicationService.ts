import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../lib/logger.js";
import type { LabParameter } from "./extractionService.js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface SourceExtraction {
  rawName: string;
  rawValue: string;
  rawUnit: string | null;
  sourceDocument?: string | null;
  sourcePage?: number | null;
}

export interface ConflictDetails {
  rawValues: string[];
  sourceExtractions: SourceExtraction[];
  reason: string;
}

export interface ResolvedLabParameter extends LabParameter {
  canonicalKey: string;
  isConflicting?: boolean;
  conflictDetails?: ConflictDetails | null;
  possibleSynonymCandidate?: boolean;
  sourceExtractions: SourceExtraction[];
}

export interface LabSummaryStats {
  totalAnalyzed: number;
  totalExtractedRaw: number;
  mergedCount: number;
  abnormalCount: number;
  criticalCount: number;
  normalCount: number;
  conflictingCount: number;
}

export interface LabDeduplicationOutput {
  resolvedLabs: ResolvedLabParameter[];
  unresolvedSynonyms: Array<{ rawName: string; matchedCanonicalKey: string; similarity: number }>;
  summaryStats: LabSummaryStats;
}

export interface RegistryEntry {
  canonicalKey: string;
  displayName: string;
  panel: string;
  synonyms: string[];
  targetUnit: string;
  unitConversions: Record<string, number>;
  defaultReferenceRange: string;
  valueTolerancePct?: number;
}

export interface CanonicalRegistryData {
  version: string;
  entries: RegistryEntry[];
}

// ── Load Registry ───────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadRegistry(): CanonicalRegistryData {
  try {
    const jsonPath = path.resolve(__dirname, "../data/canonicalLabRegistry.json");
    if (fs.existsSync(jsonPath)) {
      const content = fs.readFileSync(jsonPath, "utf8");
      return JSON.parse(content) as CanonicalRegistryData;
    }
  } catch (err) {
    logger.error({ err }, "Failed to load canonicalLabRegistry.json from disk, fallback to empty registry");
  }
  return { version: "1.0.0", entries: [] };
}

let registryCache: CanonicalRegistryData | null = null;

export function getRegistry(): CanonicalRegistryData {
  if (!registryCache) {
    registryCache = loadRegistry();
  }
  return registryCache;
}

export function reloadRegistry(): CanonicalRegistryData {
  registryCache = loadRegistry();
  return registryCache;
}

// ── Negative Guards ─────────────────────────────────────────────────────────
// Guard rules to prevent distinct medical parameters with similar tokens from ever merging

const NEGATIVE_GUARD_GROUPS: Array<{ tokens: string[]; keys: string[] }> = [
  {
    tokens: ["direct", "conjugated"],
    keys: ["direct_bilirubin"],
  },
  {
    tokens: ["indirect", "unconjugated"],
    keys: ["indirect_bilirubin"],
  },
  {
    tokens: ["total bilirubin", "s. bilirubin (total)"],
    keys: ["total_bilirubin"],
  },
  {
    tokens: ["ast", "sgot"],
    keys: ["ast"],
  },
  {
    tokens: ["alt", "sgpt"],
    keys: ["alt"],
  },
  {
    tokens: ["fasting", "fbs", "fbg"],
    keys: ["fasting_glucose"],
  },
  {
    tokens: ["random", "rbs", "rbg"],
    keys: ["random_glucose"],
  },
  {
    tokens: ["post prandial", "ppbs", "pp glucose"],
    keys: ["postprandial_glucose"],
  },
  {
    tokens: ["free t3", "ft3"],
    keys: ["free_t3"],
  },
  {
    tokens: ["free t4", "ft4"],
    keys: ["free_t4"],
  },
  {
    tokens: ["total t3", "t3"],
    keys: ["total_t3"],
  },
  {
    tokens: ["total t4", "t4"],
    keys: ["total_t4"],
  },
  {
    tokens: ["tsh"],
    keys: ["tsh"],
  },
  {
    tokens: ["wbc", "tlc", "leukocyte", "leucocyte"],
    keys: ["wbc"],
  },
  {
    tokens: ["rbc", "erythrocyte", "red blood"],
    keys: ["rbc"],
  },
  {
    tokens: ["widal o", "typhi o"],
    keys: ["widal_o"],
  },
  {
    tokens: ["widal h", "typhi h"],
    keys: ["widal_h"],
  },
];

function isViolationOfNegativeGuard(rawName: string, candidateKey: string): boolean {
  const lowerRaw = rawName.toLowerCase();
  
  // Specific checks
  if (candidateKey === "total_bilirubin" && (lowerRaw.includes("direct") || lowerRaw.includes("indirect"))) return true;
  if (candidateKey === "direct_bilirubin" && (lowerRaw.includes("total") || lowerRaw.includes("indirect"))) return true;
  if (candidateKey === "indirect_bilirubin" && (lowerRaw.includes("total") || lowerRaw.includes("direct"))) return true;

  if (candidateKey === "ast" && lowerRaw.includes("alt")) return true;
  if (candidateKey === "alt" && lowerRaw.includes("ast")) return true;

  if (candidateKey === "fasting_glucose" && (lowerRaw.includes("random") || lowerRaw.includes("post prandial") || lowerRaw.includes("ppbs"))) return true;
  if (candidateKey === "random_glucose" && (lowerRaw.includes("fasting") || lowerRaw.includes("post prandial") || lowerRaw.includes("ppbs"))) return true;
  if (candidateKey === "postprandial_glucose" && (lowerRaw.includes("fasting") || lowerRaw.includes("random"))) return true;

  if (candidateKey === "free_t3" && !lowerRaw.includes("free") && lowerRaw.includes("total")) return true;
  if (candidateKey === "free_t4" && !lowerRaw.includes("free") && lowerRaw.includes("total")) return true;
  if (candidateKey === "total_t3" && lowerRaw.includes("free")) return true;
  if (candidateKey === "total_t4" && lowerRaw.includes("free")) return true;

  if (candidateKey === "wbc" && lowerRaw.includes("rbc")) return true;
  if (candidateKey === "rbc" && lowerRaw.includes("wbc")) return true;

  if (candidateKey === "widal_o" && lowerRaw.includes("typhi h")) return true;
  if (candidateKey === "widal_h" && lowerRaw.includes("typhi o")) return true;

  return false;
}

// ── String Similarity Functions ─────────────────────────────────────────────

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }

  return d[m][n];
}

function tokenDiceSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }

  if (setA.size + setB.size === 0) return 0;
  return (2 * intersection) / (setA.size + setB.size);
}

export function computeLabelSimilarity(rawName: string, synonym: string): number {
  const normRaw = rawName.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const normSyn = synonym.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

  if (normRaw === normSyn) return 1.0;

  const dice = tokenDiceSimilarity(normRaw, normSyn);
  const maxLen = Math.max(normRaw.length, normSyn.length);
  const levDist = levenshteinDistance(normRaw, normSyn);
  const levSim = maxLen > 0 ? 1 - levDist / maxLen : 1;

  return 0.6 * dice + 0.4 * levSim;
}

// ── Matcher ─────────────────────────────────────────────────────────────────

export interface MatchResult {
  entry: RegistryEntry | null;
  similarity: number;
  isFuzzy: boolean;
  isPossibleSynonym: boolean;
}

export function findCanonicalMatch(rawName: string, registry = getRegistry()): MatchResult {
  const cleanRaw = rawName.toLowerCase().trim();

  // 1. Direct exact synonym match
  for (const entry of registry.entries) {
    if (entry.synonyms.some((syn) => syn.toLowerCase() === cleanRaw)) {
      return { entry, similarity: 1.0, isFuzzy: false, isPossibleSynonym: false };
    }
  }

  // 2. Fuzzy match with negative guard check
  let bestEntry: RegistryEntry | null = null;
  let bestSimilarity = 0;

  for (const entry of registry.entries) {
    if (isViolationOfNegativeGuard(rawName, entry.canonicalKey)) {
      continue;
    }

    for (const syn of entry.synonyms) {
      const sim = computeLabelSimilarity(cleanRaw, syn);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestEntry = entry;
      }
    }
  }

  if (bestEntry && bestSimilarity >= 0.82) {
    const isHighConfidence = bestSimilarity >= 0.89;
    return {
      entry: bestEntry,
      similarity: bestSimilarity,
      isFuzzy: true,
      isPossibleSynonym: !isHighConfidence,
    };
  }

  return { entry: null, similarity: 0, isFuzzy: false, isPossibleSynonym: false };
}

// ── Value Normalization & Comparison ────────────────────────────────────────

function cleanUnitString(unit: string | null): string {
  if (!unit) return "";
  return unit.toLowerCase().replace(/\s+/g, "").trim();
}

export function extractNumericValue(valStr: string): number | null {
  if (!valStr) return null;
  const cleaned = valStr.replace(/,/g, "").trim();
  const match = cleaned.match(/[-+]?[0-9]*\.?[0-9]+/);
  if (match) {
    const num = parseFloat(match[0]);
    return isNaN(num) ? null : num;
  }
  return null;
}

export function normalizeNumericValue(
  valStr: string,
  rawUnit: string | null,
  entry: RegistryEntry
): number | null {
  const num = extractNumericValue(valStr);
  if (num === null) return null;

  if (!rawUnit) return num;

  const normUnit = cleanUnitString(rawUnit);
  const conversions = entry.unitConversions;

  for (const [unitKey, factor] of Object.entries(conversions)) {
    if (cleanUnitString(unitKey) === normUnit) {
      return num * factor;
    }
  }

  return num;
}

export function areValuesWithinTolerance(
  lab1: LabParameter,
  lab2: LabParameter,
  entry: RegistryEntry
): boolean {
  const num1 = normalizeNumericValue(lab1.value, lab1.unit, entry);
  const num2 = normalizeNumericValue(lab2.value, lab2.unit, entry);

  // Both numeric comparison
  if (num1 !== null && num2 !== null) {
    const absDiff = Math.abs(num1 - num2);
    const maxVal = Math.max(Math.abs(num1), Math.abs(num2));
    const tolerancePct = entry.valueTolerancePct ?? 5;
    
    // For small decimals (e.g., Creatinine 1.2 vs 1.3), allow at least 0.15 absolute tolerance
    const toleranceAbs = Math.max(0.15, maxVal * (tolerancePct / 100));

    return absDiff <= toleranceAbs;
  }

  // Qualitative comparison
  const str1 = lab1.value.trim().toUpperCase();
  const str2 = lab2.value.trim().toUpperCase();

  return str1 === str2;
}

// ── Summary Statistics ──────────────────────────────────────────────────────

export function calculateLabSummaryStats(
  resolvedLabs: ResolvedLabParameter[],
  totalExtractedRaw: number
): LabSummaryStats {
  const conflicting = resolvedLabs.filter((l) => l.isConflicting);
  const nonConflicting = resolvedLabs.filter((l) => !l.isConflicting);

  const totalAnalyzed = nonConflicting.length;
  const conflictingCount = conflicting.length;
  const mergedCount = Math.max(0, totalExtractedRaw - resolvedLabs.length);

  const abnormalCount = nonConflicting.filter(
    (l) => l.status === "high" || l.status === "low" || l.status === "borderline"
  ).length;

  const criticalCount = nonConflicting.filter((l) => l.status === "critical").length;
  const normalCount = nonConflicting.filter((l) => l.status === "normal").length;

  return {
    totalAnalyzed,
    totalExtractedRaw,
    mergedCount,
    abnormalCount,
    criticalCount,
    normalCount,
    conflictingCount,
  };
}

// ── Main Deduplication & Conflict Detection Engine ──────────────────────────

export function processLabDeduplicationAndConflicts(
  rawLabs: LabParameter[],
  registry = getRegistry()
): LabDeduplicationOutput {
  const totalExtractedRaw = rawLabs.length;
  const groups = new Map<string, { entry: RegistryEntry | null; items: LabParameter[]; isFuzzy: boolean }>();
  const unresolvedSynonyms: Array<{ rawName: string; matchedCanonicalKey: string; similarity: number }> = [];

  // 1. Group items by canonical key
  for (const lab of rawLabs) {
    const name = lab.name.trim();
    if (!name || (name.match(/[a-zA-Z]/g) ?? []).length < 2) continue;

    const match = findCanonicalMatch(name, registry);
    const key = match.entry ? match.entry.canonicalKey : name.toLowerCase();

    if (match.isPossibleSynonym && match.entry) {
      unresolvedSynonyms.push({
        rawName: name,
        matchedCanonicalKey: match.entry.canonicalKey,
        similarity: match.similarity,
      });
    }

    if (!groups.has(key)) {
      groups.set(key, { entry: match.entry, items: [], isFuzzy: match.isFuzzy });
    }
    groups.get(key)!.items.push(lab);
  }

  const resolvedLabs: ResolvedLabParameter[] = [];

  // 2. Process each canonical group
  for (const [key, group] of groups.entries()) {
    const entry = group.entry;
    const items = group.items;

    // Single item in group -> resolved directly
    if (items.length === 1) {
      const item = items[0];
      const sourceExtractions: SourceExtraction[] = [
        {
          rawName: item.name,
          rawValue: item.value,
          rawUnit: item.unit,
          sourceDocument: (item as any).sourceDocument ?? null,
          sourcePage: (item as any).sourcePage ?? null,
        },
      ];

      resolvedLabs.push({
        ...item,
        name: entry ? entry.displayName : item.name,
        unit: entry ? entry.targetUnit || item.unit : item.unit,
        referenceRange: item.referenceRange || (entry ? entry.defaultReferenceRange : null),
        panel: entry ? entry.panel : item.panel,
        canonicalKey: key,
        isConflicting: false,
        conflictDetails: null,
        sourceExtractions,
      });
      continue;
    }

    // Multiple items in group -> check value tolerance across pairs
    let isConflictingGroup = false;

    if (entry) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          if (!areValuesWithinTolerance(items[i], items[j], entry)) {
            isConflictingGroup = true;
            break;
          }
        }
        if (isConflictingGroup) break;
      }
    } else {
      // Unmapped parameter group check
      const firstVal = items[0].value.trim().toUpperCase();
      isConflictingGroup = items.some((it) => it.value.trim().toUpperCase() !== firstVal);
    }

    const sourceExtractions: SourceExtraction[] = items.map((item) => ({
      rawName: item.name,
      rawValue: item.value,
      rawUnit: item.unit,
      sourceDocument: (item as any).sourceDocument ?? null,
      sourcePage: (item as any).sourcePage ?? null,
    }));

    if (isConflictingGroup) {
      // CONFLICTING_EXTRACTION path
      const rawValues = items.map((it) => `${it.name}: ${it.value} ${it.unit || ""}`.trim());
      const hasCritical = items.some((it) => it.status === "critical");
      const hasHighLow = items.some((it) => it.status === "high" || it.status === "low");

      const conflictDetails: ConflictDetails = {
        rawValues,
        sourceExtractions,
        reason: `Contradictory values detected for canonical key '${key}' across ${items.length} extractions.`,
      };

      logger.warn({ key, rawValues }, "Conflicting extractions detected for canonical lab key");

      resolvedLabs.push({
        name: entry ? entry.displayName : items[0].name,
        value: items.map((it) => `${it.value}${it.unit ? " " + it.unit : ""}`).join(" vs "),
        unit: entry ? entry.targetUnit : items[0].unit,
        referenceRange: entry ? entry.defaultReferenceRange : items[0].referenceRange,
        status: hasCritical ? "critical" : hasHighLow ? "high" : "borderline",
        interpretation: "CONFLICTING EXTRACTION: Human verification required.",
        panel: entry ? entry.panel : items[0].panel,
        canonicalKey: key,
        isConflicting: true,
        conflictDetails,
        sourceExtractions,
      });
    } else {
      // DEDUPLICATED CLEAN MERGE path
      // Pick item with cleanest values/reference ranges
      const bestItem = items.find((it) => it.referenceRange && it.unit) || items[0];

      logger.info({ key, mergedCount: items.length }, "Deduplicated matching lab extractions into single canonical entry");

      resolvedLabs.push({
        ...bestItem,
        name: entry ? entry.displayName : bestItem.name,
        unit: entry ? entry.targetUnit || bestItem.unit : bestItem.unit,
        referenceRange: bestItem.referenceRange || (entry ? entry.defaultReferenceRange : null),
        panel: entry ? entry.panel : bestItem.panel,
        canonicalKey: key,
        isConflicting: false,
        conflictDetails: null,
        sourceExtractions,
      });
    }
  }

  const summaryStats = calculateLabSummaryStats(resolvedLabs, totalExtractedRaw);

  return {
    resolvedLabs,
    unresolvedSynonyms,
    summaryStats,
  };
}
