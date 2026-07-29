/**
 * extractionService.ts — fallback sketch
 * ---------------------------------------
 * Goal: detect when pdf-parse returns a "text-poor" document (scanned photo,
 * handwritten prescription, skewed multi-clinic upload) and reroute to a
 * vision-based extraction path instead of feeding thin/garbage text to the LLM.
 *
 * Drop-in point: wherever you currently do
 *   const { text } = await pdfParse(buffer);
 *   const result = await runLabPanelAgent(text);
 */

import pdfParse from "pdf-parse";
// Render PDF pages -> PNG buffers. Options: pdf-to-img, pdf-poppler (pdftoppm),
// or a headless-chromium/pdf.js canvas render. Pick whichever is already
// available in your infra; interface shown below is illustrative.
import { renderPdfPagesToImages } from "./pdfRender"; // your wrapper around pdftoppm/pdf-to-img

// ---- Config ----------------------------------------------------
const MIN_CHARS_PER_PAGE = 200; // tune empirically against real uploads
const MIN_ALPHA_RATIO = 0.4; // guards against garbage/OCR-noise text layers

// ---- Types -------------------------------------------------------
interface ExtractionInput {
  buffer: Buffer;
  pageCount?: number;
}

interface ExtractionResult {
  route: "text" | "vision";
  rawText?: string;
  images?: Buffer[];
}

// ---- Step 1: decide which path to take --------------------------
export async function decideExtractionRoute(
  input: ExtractionInput
): Promise<ExtractionResult> {
  const parsed = await pdfParse(input.buffer);
  const text = parsed.text ?? "";
  const pageCount = parsed.numpages || input.pageCount || 1;

  const avgCharsPerPage = text.length / pageCount;
  const alphaChars = (text.match(/[a-zA-Z]/g) || []).length;
  const alphaRatio = text.length > 0 ? alphaChars / text.length : 0;

  const looksTextNative =
    avgCharsPerPage >= MIN_CHARS_PER_PAGE && alphaRatio >= MIN_ALPHA_RATIO;

  if (looksTextNative) {
    return { route: "text", rawText: text };
  }

  // Text layer is empty, near-empty, or noise (common for phone-photographed
  // PDFs, scanned Widal reports, handwritten Rx slips like the sample you
  // uploaded). Fall back to rendering pages as images for a vision model.
  const images = await renderPdfPagesToImages(input.buffer, {
    dpi: 200, // 200-300 dpi is usually enough for typed tables + most handwriting
  });

  return { route: "vision", images };
}

// ---- Step 2: route to the right agent input ----------------------
export async function extractClinicalData(input: ExtractionInput) {
  const decision = await decideExtractionRoute(input);

  if (decision.route === "text") {
    return runTextBasedAgents(decision.rawText!);
  }

  return runVisionBasedAgents(decision.images!);
}

// ---- Text path: cheap, fast, for clean digital PDFs ---------------
async function runTextBasedAgents(text: string) {
  // existing Lab Panel Agent / Rx Agent / Radiology Agent prompts,
  // operating on plain extracted text
  return callLLM({
    mode: "text",
    content: text,
  });
}

// ---- Vision path: for scans, photos, handwriting ------------------
async function runVisionBasedAgents(images: Buffer[]) {
  // Send each page image (or batch a few at a time — mind token/image limits)
  // to your multimodal endpoint. Keep the prompt schema-driven: ask explicitly
  // for a structured JSON with sections like labParameters[], prescriptions[],
  // vitals[], etc., rather than open-ended summarization.
  const perPageResults = await Promise.all(
    images.map((imgBuffer, i) =>
      callLLM({
        mode: "vision",
        image: imgBuffer,
        pageIndex: i,
        instructions: VISION_EXTRACTION_PROMPT,
      })
    )
  );

  return mergePageResults(perPageResults);
}

// ---- Prompt: force structure, don't let the model free-summarize -
const VISION_EXTRACTION_PROMPT = `
You are reading one page of a medical document (may be typed, scanned,
or handwritten; may include multiple clinics/hospitals on different pages).

Extract ALL of the following if present on this page, as strict JSON:
{
  "labParameters": [
    { "name": string, "result": string, "unit": string, "referenceRange": string, "status": "normal"|"high"|"low"|"unknown" }
  ],
  "prescriptions": [
    { "medicine": string, "dosage": string, "frequency": string, "duration": string, "prescribingDoctor": string, "date": string }
  ],
  "vitals": [ { "name": string, "value": string } ],
  "notes": string // anything handwritten/unclear that doesn't fit above
}

Rules:
- Do not skip handwritten sections — attempt best-effort transcription and
  flag uncertain reads inside "notes" rather than omitting them.
- If a table spans a page break or is partially cut off, extract what is
  visible and note it's partial.
- Return ONLY valid JSON, no prose.
`;

// ---- Merge per-page JSON into one report --------------------------
function mergePageResults(pages: any[]) {
  return {
    labParameters: pages.flatMap((p) => p.labParameters ?? []),
    prescriptions: pages.flatMap((p) => p.prescriptions ?? []),
    vitals: pages.flatMap((p) => p.vitals ?? []),
    notes: pages.map((p) => p.notes).filter(Boolean),
  };
}

// Placeholder — wire to your existing OpenAI-compatible client
async function callLLM(args: any): Promise<any> {
  throw new Error("wire this to your existing multimodal client");
}
