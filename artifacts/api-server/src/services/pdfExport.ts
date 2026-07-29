import type { ClinicalReport, RiskAssessment } from "../types/report.js";
import { logger } from "../lib/logger.js";
import type PDFKit from "pdfkit";
type PDFDoc = InstanceType<typeof PDFKit>;

// ── Extended types for report payload ────────────────────────────────────
interface ExtendedReport extends ClinicalReport {
  riskAssessment: RiskAssessment | null;
  clinicalConclusion: string | null;
  possibleConditions: string[];
  nextSteps: string[];
}

// ── Color Palette ────────────────────────────────────────────────────────
const C = {
  primary:  "#16A34A",
  critical: "#DC2626",
  warning:  "#D97706",
  normal:   "#16A34A",
  text:     "#111827",
  muted:    "#6B7280",
  bg:       "#F9FAFB",
  white:    "#FFFFFF",
};

/** Sanitize non-ASCII characters to prevent PDFKit Helvetica font corruption (e.g. garbled ;ÄÀ) */
function cleanPdfText(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/µ/g, "u")
    .replace(/μ/g, "u")
    .replace(/°/g, " deg ")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/;/g, "")
    .replace(/[^\x20-\x7E\n\r\t]/g, "") // Keep standard printable ASCII
    .trim();
}

function riskPalette(level: string) {
  switch (level) {
    case "critical": return { bg: "#FEF2F2", border: "#DC2626", text: "#991B1B", label: "CRITICAL RISK" };
    case "high":     return { bg: "#FFF7ED", border: "#EA580C", text: "#9A3412", label: "HIGH RISK"     };
    case "moderate": return { bg: "#FFFBEB", border: "#D97706", text: "#92400E", label: "MODERATE RISK" };
    default:         return { bg: "#F0FDF4", border: "#16A34A", text: "#14532D", label: "LOW RISK"      };
  }
}

function getBmiLabel(bmi: number): string {
  if (bmi < 16.0) return "Very Low (Severe Underweight)";
  if (bmi < 18.5) return "Low (Underweight)";
  if (bmi < 25.0) return "Normal (Healthy)";
  if (bmi < 30.0) return "Moderate High (Overweight)";
  if (bmi < 35.0) return "High (Obesity Class I)";
  if (bmi < 40.0) return "Very High (Obesity Class II)";
  return "Extremely High (Obesity Class III)";
}

// ── Main PDF Generation Function ──────────────────────────────────────────
export async function generateReportPdf(report: ClinicalReport): Promise<Buffer> {
  const r = report as ExtendedReport;
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
  const buffers: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));

  // Pre-compute summary counts
  const totalLabs    = r.labParameters.length;
  const abnormalCnt  = r.labParameters.filter(l => l.status !== "normal").length;
  const criticalCnt  = r.labParameters.filter(l => l.status === "critical").length;
  const findingsCnt  = r.findings.length;
  const confirmedCnt = r.findings.filter(f => f.category === "confirmed").length;

  // ════════════════════════════════════════════════════════════════════════
  //  PAGE 1 - HEADER & PATIENT SUMMARY
  // ════════════════════════════════════════════════════════════════════════

  // Header banner
  doc.rect(0, 0, doc.page.width, 85).fill("#052E16");
  doc.fillColor("#4ADE80").fontSize(26).font("Helvetica-Bold").text("CDSI", 40, 20);
  doc.fillColor("#D1FAE5").fontSize(10).font("Helvetica")
    .text("Clinical Decision Support Intelligence Platform", 40, 50);
  doc.fillColor("#6EE7B7").fontSize(8).font("Helvetica-Oblique")
    .text(`Report Generated: ${new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
      doc.page.width - 240, 54, { width: 200, align: "right" });

  doc.y = 98;

  // Patient Info Band
  const ps = r.patientSummary;
  const cleanName = cleanPdfText(ps.name).replace(/\s+(weight|height|age|sex|patient|id)$/i, "") || "Patient";
  doc.rect(40, doc.y, doc.page.width - 80, 42).fill("#F0FDF4").stroke("#D1FAE5");
  
  const patDetails = [
    cleanName,
    ps.age ? `Age ${ps.age}` : "",
    ps.sex ? ps.sex : "",
    ps.bmi ? `BMI: ${ps.bmi} kg/m2 (${getBmiLabel(ps.bmi)})` : "",
    `Type: ${ps.analysisType}`,
    new Date(ps.dateOfAnalysis).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
  ].filter(Boolean).join("   ·   ");

  doc.fillColor(C.text).fontSize(9.5).font("Helvetica-Bold")
    .text(patDetails, 48, doc.y + 13, { width: doc.page.width - 96 });
  doc.y += 52;

  // ── Risk Assessment Banner ─────────────────────────────────────────────
  if (r.riskAssessment) {
    const rp = riskPalette(r.riskAssessment.level);
    const bannerH = 60;
    const bannerY = doc.y;
    doc.roundedRect(40, bannerY, doc.page.width - 80, bannerH, 6)
      .fillAndStroke(rp.bg, rp.border);

    doc.fillColor(rp.border).fontSize(18).font("Helvetica-Bold")
      .text(rp.label, 52, bannerY + 12, { width: 170 });

    const urgencyLabel = `${r.riskAssessment.urgency.toUpperCase()} FOLLOW-UP`;
    doc.fillColor(rp.text).fontSize(8.5).font("Helvetica-Bold")
      .text(urgencyLabel, 52, bannerY + 36);

    if (r.riskAssessment.reasoning) {
      doc.fillColor(rp.text).fontSize(8.5).font("Helvetica")
        .text(cleanPdfText(r.riskAssessment.reasoning), 220, bannerY + 10, {
          width: doc.page.width - 270,
          height: bannerH - 16,
          ellipsis: true,
        });
    }
    doc.y = bannerY + bannerH + 10;
  }

  // ── Stats Summary Row ──────────────────────────────────────────────────
  const statY = doc.y;
  const statW = (doc.page.width - 80) / 4;
  const stats = [
    { label: "Lab Tests", value: String(totalLabs), sub: "analysed", bg: "#F9FAFB", border: "#E5E7EB", textC: C.text },
    { label: "Abnormal", value: String(abnormalCnt), sub: `of ${totalLabs} tests`, bg: abnormalCnt > 0 ? "#FFFBEB" : "#F0FDF4", border: abnormalCnt > 0 ? "#FCD34D" : "#86EFAC", textC: abnormalCnt > 0 ? "#92400E" : "#14532D" },
    { label: "Critical", value: String(criticalCnt), sub: "values flagged", bg: criticalCnt > 0 ? "#FEF2F2" : "#F9FAFB", border: criticalCnt > 0 ? "#FCA5A5" : "#E5E7EB", textC: criticalCnt > 0 ? "#991B1B" : C.muted },
    { label: "Findings", value: String(findingsCnt), sub: `${confirmedCnt} confirmed`, bg: "#F0FDF4", border: "#86EFAC", textC: "#14532D" },
  ];

  for (let i = 0; i < stats.length; i++) {
    const s = stats[i]!;
    const sx = 40 + i * statW;
    doc.roundedRect(sx, statY, statW - 4, 48, 5).fillAndStroke(s.bg, s.border);
    doc.fillColor(C.muted).fontSize(6.5).font("Helvetica-Bold")
      .text(s.label.toUpperCase(), sx + 6, statY + 6, { width: statW - 16 });
    doc.fillColor(s.textC).fontSize(18).font("Helvetica-Bold")
      .text(s.value, sx + 6, statY + 16, { width: statW - 16 });
    doc.fillColor(C.muted).fontSize(6.5).font("Helvetica")
      .text(s.sub, sx + 6, statY + 36, { width: statW - 16 });
  }
  doc.y = statY + 56;

  // ── Clinical Conclusion / Overview ────────────────────────────────────
  if (r.clinicalConclusion) {
    checkPageSpace(doc, 70);
    sectionHeader(doc, "Clinical Overview & Conclusion");
    const concY = doc.y;
    const cleanConc = cleanPdfText(r.clinicalConclusion);
    doc.fillColor(C.text).fontSize(9).font("Helvetica")
      .text(cleanConc, 48, concY, { width: doc.page.width - 96 });
    const concH = doc.y - concY + 8;
    doc.roundedRect(40, concY - 4, doc.page.width - 80, concH, 4).stroke("#D1D5DB");
    doc.y = concY + concH + 8;
  }

  // ── Possible Conditions ────────────────────────────────────────────────
  const conditions = r.possibleConditions ?? [];
  if (conditions.length > 0) {
    checkPageSpace(doc, 50);
    sectionHeader(doc, "Possible Conditions & Differential Viewpoints");
    const pillH = 16;
    let px = 40;
    let py = doc.y;

    for (const cond of conditions) {
      const cleanCond = cleanPdfText(cond);
      const tw = doc.widthOfString(cleanCond) + 16;
      if (px + tw > doc.page.width - 40) { px = 40; py += pillH + 4; }
      doc.roundedRect(px, py, tw, pillH, 4).fillAndStroke("#EFF6FF", "#BFDBFE");
      doc.fillColor("#1E40AF").fontSize(8).font("Helvetica")
        .text(cleanCond, px + 8, py + 3, { lineBreak: false });
      px += tw + 4;
    }
    doc.y = py + pillH + 10;
  }

  // ── Next Steps ────────────────────────────────────────────────────────
  const nextSteps = r.nextSteps ?? [];
  if (nextSteps.length > 0) {
    checkPageSpace(doc, 60);
    sectionHeader(doc, "Suggested Next Steps");
    nextSteps.forEach((step, i) => {
      checkPageSpace(doc, 20);
      const stepY = doc.y;
      doc.circle(48, stepY + 5, 5).fill("#DBEAFE");
      doc.fillColor("#1D4ED8").fontSize(6.5).font("Helvetica-Bold")
        .text(String(i + 1), 45, stepY + 2, { width: 6, align: "center", lineBreak: false });
      doc.fillColor(C.text).fontSize(8.5).font("Helvetica")
        .text(cleanPdfText(step), 60, stepY, { width: doc.page.width - 100 });
      doc.y += 14;
    });
    doc.y += 6;
  }

  // ════════════════════════════════════════════════════════════════════════
  //  DETAILED SECTIONS (Organ Systems, Lab Table, Prescriptions)
  // ════════════════════════════════════════════════════════════════════════

  // ── Organ Systems ─────────────────────────────────────────────────────
  if (r.organSystems?.length) {
    checkPageSpace(doc, 90);
    sectionHeader(doc, "Organ System Overview");
    const sysW = (doc.page.width - 80) / 3;
    let col = 0;
    let rowY = doc.y;

    for (const sys of r.organSystems) {
      if (col === 0) {
        checkPageSpace(doc, 44);
        rowY = doc.y;
      }
      const sysColor =
        sys.status === "critical" ? { bg: "#FEF2F2", border: "#FCA5A5", text: "#991B1B", badge: "#DC2626" } :
        sys.status === "warning"  ? { bg: "#FFFBEB", border: "#FCD34D", text: "#92400E", badge: "#D97706" } :
                                    { bg: "#F0FDF4", border: "#86EFAC", text: "#14532D", badge: "#16A34A" };
      const sx = 40 + col * sysW;

      doc.roundedRect(sx, rowY, sysW - 4, 38, 4).fillAndStroke(sysColor.bg, sysColor.border);
      doc.fillColor(sysColor.badge).fontSize(6.5).font("Helvetica-Bold")
        .text(sys.status.toUpperCase(), sx + 6, rowY + 5, { width: sysW - 16 });
      doc.fillColor(C.text).fontSize(9).font("Helvetica-Bold")
        .text(cleanPdfText(sys.system), sx + 6, rowY + 14, { width: sysW - 16 });
      if (sys.summary) {
        doc.fillColor(sysColor.text).fontSize(7).font("Helvetica")
          .text(cleanPdfText(sys.summary), sx + 6, rowY + 24, { width: sysW - 16, height: 12, ellipsis: true });
      }

      col++;
      if (col === 3) { col = 0; doc.y = rowY + 44; }
    }
    if (col > 0) doc.y = rowY + 44;
    doc.y += 6;
  }

  // ── Confirmed Clinical Findings ───────────────────────────────────────
  const confirmedFindings = r.findings.filter(f => f.category === "confirmed");
  if (confirmedFindings.length > 0) {
    checkPageSpace(doc, 60);
    sectionHeader(doc, `Confirmed Clinical Findings (${confirmedFindings.length})`);
    for (const f of confirmedFindings) {
      checkPageSpace(doc, 24);
      const confColor = f.confidence >= 80 ? "#16A34A" : f.confidence >= 60 ? "#D97706" : "#6B7280";
      const fy = doc.y;
      doc.circle(46, fy + 5, 4).fill(confColor);
      doc.fillColor(C.text).fontSize(9).font("Helvetica-Bold")
        .text(cleanPdfText(f.findingText), 56, fy, { width: doc.page.width - 100 });
      if (f.reasoning) {
        doc.fillColor("#374151").fontSize(8).font("Helvetica-Oblique")
          .text(cleanPdfText(f.reasoning), 56, doc.y + 2, { width: doc.page.width - 100 });
      }
      doc.y += 18;
    }
    doc.y += 6;
  }

  // ── Laboratory Results Table ──────────────────────────────────────────
  if (r.labParameters.length > 0) {
    checkPageSpace(doc, 80);
    sectionHeader(doc, `Laboratory Results (${r.labParameters.length} parameters)`);

    const colWidths = [180, 85, 75, 115, 60];
    const headers = ["Parameter / Panel", "Value", "Unit", "Reference Range", "Status"];

    // Render Table Header
    renderTableHeader(doc, headers, colWidths);

    let isEven = false;
    for (const lab of r.labParameters) {
      checkPageSpace(doc, 22);

      const statusColor =
        lab.status === "critical" ? C.critical :
        lab.status === "high" || lab.status === "low" ? C.warning :
        C.normal;

      const rowBg =
        lab.status === "critical" ? "#FEF2F2" :
        lab.status === "high" || lab.status === "low" ? "#FFFBEB" :
        isEven ? "#F9FAFB" : C.white;

      isEven = !isEven;

      const cleanVal  = cleanPdfText(lab.value);
      const cleanUnit = cleanPdfText(lab.unit) || "-";
      const cleanRef  = cleanPdfText(lab.referenceRange) || "-";
      const cleanName = cleanPdfText(lab.name);
      const cleanPan  = cleanPdfText(lab.panel);

      const nameCell = cleanPan ? `${cleanName} (${cleanPan})` : cleanName;

      renderTableRow(doc, [
        nameCell,
        cleanVal,
        cleanUnit,
        cleanRef,
        lab.status.toUpperCase(),
      ], colWidths, rowBg, lab.status === "normal" ? C.text : statusColor);
    }
    doc.y += 10;
  }

  // ── Prescriptions ─────────────────────────────────────────────────────
  if (r.prescriptions.length > 0) {
    checkPageSpace(doc, 80);
    sectionHeader(doc, `Active Prescriptions (${r.prescriptions.length} medications)`);
    for (const rx of r.prescriptions) {
      checkPageSpace(doc, 32);
      const rxY = doc.y;
      doc.roundedRect(40, rxY, doc.page.width - 80, 28, 4).fillAndStroke("#F9FAFB", "#E5E7EB");
      doc.fillColor(C.text).fontSize(9.5).font("Helvetica-Bold")
        .text(cleanPdfText(rx.medicineName), 48, rxY + 4, { width: 140, lineBreak: false });

      const details = [
        rx.dosage    ? `Dose: ${cleanPdfText(rx.dosage)}`       : null,
        rx.frequency ? `Freq: ${cleanPdfText(rx.frequency)}`    : null,
        rx.duration  ? `Duration: ${cleanPdfText(rx.duration)}` : null,
      ].filter(Boolean).join("   ·   ");

      if (details) {
        doc.fillColor(C.primary).fontSize(8.5).font("Helvetica")
          .text(details, 200, rxY + 5, { width: doc.page.width - 250, lineBreak: false });
      }
      if (rx.specialInstructions) {
        doc.fillColor(C.warning).fontSize(7.5).font("Helvetica-Oblique")
          .text(`* ${cleanPdfText(rx.specialInstructions)}`, 48, rxY + 16, { width: doc.page.width - 96, lineBreak: false });
      }
      doc.y = rxY + 34;
    }
    doc.y += 6;
  }

  // ── Disclaimer Block ──────────────────────────────────────────────────
  checkPageSpace(doc, 45);
  doc.rect(40, doc.y, doc.page.width - 80, 32).fill("#F9FAFB").stroke("#E5E7EB");
  doc.fillColor(C.muted).fontSize(7).font("Helvetica-Oblique")
    .text(
      "IMPORTANT DISCLAIMER: This report is generated by an AI clinical decision support system and is intended solely to assist licensed healthcare professionals. It does not constitute a medical diagnosis, treatment plan, or clinical opinion. All findings must be independently reviewed and verified by a qualified clinician.",
      48, doc.y + 6, { width: doc.page.width - 96, lineGap: 1 },
    );

  // ── FOOTER ON EVERY PAGE ──────────────────────────────────────────────
  doc.flushPages();
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const bottom = doc.page.height - 30;
    doc.rect(0, bottom - 2, doc.page.width, 32).fill("#052E16");
    doc.fillColor("#6EE7B7").fontSize(7).font("Helvetica")
      .text(
        `CDSI Clinical Report   ·   Patient: ${cleanName}   ·   Page ${i + 1} of ${range.count}   ·   AI Decision Support Only`,
        40, bottom + 8, { align: "center", width: doc.page.width - 80 },
      );
  }

  doc.end();
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end",   () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function checkPageSpace(doc: PDFDoc, requiredHeight: number): void {
  if (doc.y + requiredHeight > doc.page.height - 45) {
    doc.addPage();
    doc.rect(0, 0, doc.page.width, 4).fill(C.primary);
    doc.y = 25;
  }
}

function sectionHeader(doc: PDFDoc, title: string): void {
  doc.fillColor(C.primary).fontSize(11).font("Helvetica-Bold").text(title);
  doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y)
    .strokeColor("#D1FAE5").lineWidth(1).stroke();
  doc.y += 6;
}

function renderTableHeader(doc: PDFDoc, headers: string[], colWidths: number[]): void {
  const startX = 40;
  const startY = doc.y;
  const rowHeight = 18;
  let totalW = 0;
  for (const w of colWidths) totalW += w;

  doc.rect(startX, startY, totalW, rowHeight).fill("#052E16");

  let x = startX;
  for (let i = 0; i < headers.length; i++) {
    const w = colWidths[i] ?? 70;
    doc.fillColor("#4ADE80").fontSize(7.5).font("Helvetica-Bold")
      .text(headers[i] ?? "", x + 4, startY + 5, { width: w - 8, lineBreak: false });
    x += w;
  }
  doc.y = startY + rowHeight + 1;
}

function renderTableRow(
  doc: PDFDoc,
  cells: string[],
  colWidths: number[],
  bgColor: string,
  textColor: string,
): void {
  const startX = 40;
  const startY = doc.y;
  const rowHeight = 16;
  let totalW = 0;
  for (const w of colWidths) totalW += w;

  doc.rect(startX, startY, totalW, rowHeight).fill(bgColor);

  let x = startX;
  for (let i = 0; i < cells.length; i++) {
    const w = colWidths[i] ?? 70;
    const cellText = cells[i] ?? "";
    doc.fillColor(textColor).fontSize(7.5).font("Helvetica")
      .text(cellText, x + 4, startY + 4, { width: w - 8, ellipsis: true, lineBreak: false });
    x += w;
  }
  doc.y = startY + rowHeight + 1;
}
