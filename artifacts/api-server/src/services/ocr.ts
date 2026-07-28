import fs from "fs";
import path from "path";
import { logger } from "../lib/logger.js";

export interface OcrResult {
  text: string;
  pageCount: number;
  confidence?: number;
  lowQuality?: boolean;
  docAnnotation: string;
}

// Raw regex-based PDF text extraction fallback for text PDFs
function extractRawPdfText(buffer: Buffer): string {
  const content = buffer.toString("latin1");
  const texts: string[] = [];
  // Match BT...ET blocks (PDF text objects)
  const blocks = content.match(/BT[\s\S]*?ET/g) ?? [];
  for (const block of blocks) {
    // Handle (text) Tj and (text) '
    const tjMatches = block.match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*(?:Tj|')/g) ?? [];
    for (const m of tjMatches) {
      const text = m.replace(/\)\s*(?:Tj|')$/, "").replace(/^\(/, "");
      const decoded = decodePdfString(text);
      if (decoded.trim()) texts.push(decoded);
    }
    // Handle [(text) num (text)] TJ
    const TJMatches = block.match(/\[([^\]]*)\]\s*TJ/g) ?? [];
    for (const m of TJMatches) {
      const inner = m.replace(/\]\s*TJ$/, "").replace(/^\[/, "");
      const parts = inner.match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/g) ?? [];
      for (const p of parts) {
        const decoded = decodePdfString(p.slice(1, -1));
        if (decoded.trim()) texts.push(decoded);
      }
    }
    // Line break on Td/TD/T* operators
    if (/\bT[dD*]\b/.test(block) && texts.length > 0) {
      texts.push("\n");
    }
  }
  return texts.join(" ").replace(/ +\n /g, "\n").replace(/ {2,}/g, " ").trim();
}

function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")");
}

// Extract text from PDF using pdf-parse v2 (PDFParse class API)
async function extractPdfText(filePath: string, fileName: string): Promise<OcrResult> {
  try {
    const buffer = fs.readFileSync(filePath);
    let extractedText = "";
    let pageCount = 1;

    try {
      // pdf-parse v2 uses a class-based API
      const { PDFParse } = await import("pdf-parse");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parser = new PDFParse({ data: buffer, verbosity: 0 } as any);
      const result = await parser.getText();
      extractedText = (result as { text?: string })?.text ?? "";
      pageCount = (result as { total?: number })?.total ?? 1;
      await parser.destroy();
    } catch (parseErr) {
      // Fallback: raw regex extraction for basic text PDFs
      logger.warn({ parseErr, fileName }, "pdf-parse failed, falling back to raw extraction");
      extractedText = extractRawPdfText(buffer);
      // Count form feeds as page separators
      pageCount = Math.max(1, (extractedText.match(/\f/g) ?? []).length + 1);
    }

    if (!extractedText.trim() || extractedText.trim().length < 30) {
      // Likely scanned - try OCR path
      return await ocrPdfPages(filePath, fileName, pageCount);
    }

    // Split into pages by form-feed or keep as single page
    const pages = extractedText.split("\f").filter((p: string) => p.trim().length > 0);
    let annotated = "";
    if (pages.length > 1) {
      pages.forEach((pg: string, i: number) => {
        annotated += `[DOC: ${fileName} | PAGE: ${i + 1}]\n${pg.trim()}\n\n`;
      });
    } else {
      annotated = `[DOC: ${fileName} | PAGE: 1]\n${extractedText.trim()}\n\n`;
    }

    return { text: annotated, pageCount: Math.max(pages.length, pageCount, 1), docAnnotation: `[DOC: ${fileName}]` };
  } catch (e) {
    logger.error({ e, fileName }, "PDF text extraction failed");
    return { text: `[DOC: ${fileName} | ERROR: Failed to extract text]\n`, pageCount: 0, docAnnotation: `[DOC: ${fileName}]` };
  }
}

// OCR scanned PDF pages
async function ocrPdfPages(filePath: string, fileName: string, pageCount: number): Promise<OcrResult> {
  try {
    const { fromPath } = await import("pdf2pic");
    const convert = fromPath(filePath, {
      density: 200,
      saveFilename: path.basename(filePath, path.extname(filePath)),
      savePath: path.dirname(filePath),
      format: "png",
      width: 1654,
      height: 2339,
    });

    let fullText = "";
    const batchSize = 5;
    const actualPages = pageCount || 1;

    for (let start = 1; start <= actualPages; start += batchSize) {
      const end = Math.min(start + batchSize - 1, actualPages);
      for (let page = start; page <= end; page++) {
        try {
          const result = await convert(page, { responseType: "image" });
          const imgPath = result.path;
          if (imgPath) {
            const pageText = await ocrImage(imgPath, fileName, page);
            fullText += pageText;
            try { fs.unlinkSync(imgPath); } catch { /* ignore */ }
          }
        } catch (e) {
          logger.warn({ e, page, fileName }, "Page OCR failed");
          fullText += `[DOC: ${fileName} | PAGE: ${page} | OCR_FAILED]\n`;
        }
      }
    }
    return { text: fullText, pageCount: actualPages, docAnnotation: `[DOC: ${fileName}]` };
  } catch (e) {
    logger.warn({ e }, "pdf2pic not available, using text extraction fallback");
    return {
      text: `[DOC: ${fileName} | NOTE: Scanned PDF detected. Text extraction limited.]\n`,
      pageCount: pageCount || 1,
      docAnnotation: `[DOC: ${fileName}]`,
    };
  }
}

async function ocrImage(imgPath: string, fileName: string, page: number): Promise<string> {
  try {
    try {
      const sharp = (await import("sharp")).default;
      const processedPath = imgPath.replace(/\.png$/, "_processed.png");
      await sharp(imgPath)
        .rotate()
        .normalize()
        .sharpen()
        .toFile(processedPath);
      fs.renameSync(processedPath, imgPath);
    } catch {
      // sharp not available
    }

    const Tesseract = await import("tesseract.js");
    const worker = await Tesseract.createWorker("eng");
    const { data } = await worker.recognize(imgPath);
    await worker.terminate();

    const confidence = data.confidence ?? 0;
    if (confidence < 60) {
      return `[DOC: ${fileName} | PAGE: ${page} | LOW_QUALITY: confidence ${confidence.toFixed(0)}%]\n${data.text}\n\n`;
    }
    return `[DOC: ${fileName} | PAGE: ${page}]\n${data.text}\n\n`;
  } catch (e) {
    logger.warn({ e }, "Tesseract OCR failed");
    return `[DOC: ${fileName} | PAGE: ${page} | OCR_UNAVAILABLE]\n`;
  }
}

async function extractDocxText(filePath: string, fileName: string): Promise<OcrResult> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return {
      text: `[DOC: ${fileName} | PAGE: 1]\n${result.value.trim()}\n\n`,
      pageCount: 1,
      docAnnotation: `[DOC: ${fileName}]`,
    };
  } catch (e) {
    logger.error({ e, fileName }, "DOCX extraction failed");
    return { text: `[DOC: ${fileName} | ERROR: DOCX extraction failed]\n`, pageCount: 0, docAnnotation: `[DOC: ${fileName}]` };
  }
}

async function extractImageText(filePath: string, fileName: string): Promise<OcrResult> {
  try {
    let processedPath = filePath;
    try {
      const sharp = (await import("sharp")).default;
      processedPath = filePath + "_processed.png";
      await sharp(filePath).rotate().normalize().sharpen().toFile(processedPath);
    } catch {
      processedPath = filePath;
    }

    const Tesseract = await import("tesseract.js");
    const worker = await Tesseract.createWorker("eng");
    const { data } = await worker.recognize(processedPath);
    await worker.terminate();

    if (processedPath !== filePath) {
      try { fs.unlinkSync(processedPath); } catch { /* ignore */ }
    }

    const confidence = data.confidence ?? 0;
    return {
      text: `[DOC: ${fileName} | PAGE: 1]\n${data.text}\n\n`,
      pageCount: 1,
      confidence,
      lowQuality: confidence < 60,
      docAnnotation: `[DOC: ${fileName}]`,
    };
  } catch (e) {
    logger.error({ e, fileName }, "Image OCR failed");
    return { text: `[DOC: ${fileName} | OCR_FAILED]\n`, pageCount: 1, docAnnotation: `[DOC: ${fileName}]` };
  }
}

export async function processFile(
  filePath: string,
  originalName: string,
  mimetype: string
): Promise<OcrResult> {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === ".pdf" || mimetype === "application/pdf") {
    return extractPdfText(filePath, originalName);
  }
  if (ext === ".docx" || mimetype.includes("wordprocessingml")) {
    return extractDocxText(filePath, originalName);
  }
  if ([".jpg", ".jpeg", ".png", ".heic", ".heif"].includes(ext) || mimetype.startsWith("image/")) {
    return extractImageText(filePath, originalName);
  }

  return { text: `[DOC: ${originalName} | UNSUPPORTED_FORMAT]\n`, pageCount: 0, docAnnotation: `[DOC: ${originalName}]` };
}

export async function processAllFiles(
  files: Array<{ path: string; originalName: string; mimetype: string }>
): Promise<{ unifiedContext: string; fileSummaries: Array<{ name: string; pageCount: number; lowQuality?: boolean }> }> {
  const results: OcrResult[] = [];
  const fileSummaries: Array<{ name: string; pageCount: number; lowQuality?: boolean }> = [];

  for (const file of files) {
    const result = await processFile(file.path, file.originalName, file.mimetype);
    results.push(result);
    fileSummaries.push({ name: file.originalName, pageCount: result.pageCount, lowQuality: result.lowQuality });
  }

  const unifiedContext = results.map((r) => r.text).join("\n---\n\n");
  return { unifiedContext, fileSummaries };
}
