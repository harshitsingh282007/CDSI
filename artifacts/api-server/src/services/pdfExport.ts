import type { ClinicalReport, RiskAssessment } from "../types/report.js";
import { logger } from "../lib/logger.js";
import type PDFKit from "pdfkit";
type PDFDoc = InstanceType<typeof PDFKit>;

// ── Extended types not yet in the shared schema ───────────────────────────
interface ExtendedReport extends ClinicalReport {
  riskAssessment: RiskAssessment | null;
  clinicalConclusion: string | null;
  possibleConditions: string[];
  nextSteps: string[];
}

// ── Colours ───────────────────────────────────────────────────────────────
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

function riskPalette(level: string) {
  switch (level) {
    case "critical": return { bg: "#FEF2F2", border: "#DC2626", text: "#991B1B", label: "CRITICAL RISK" };
    case "high":     return { bg: "#FFF7ED", border: "#EA580C", text: "#9A3412", label: "HIGH RISK"     };
    case "moderate": return { bg: "#FFFBEB", border: "#D97706", text: "#92400E", label: "MODERATE RISK" };
    default:         return { bg: "#F0FDF4", border: "#16A34A", text: "#14532D", label: "LOW RISK"      };
  }
}

// ── Main export ────────────────────────────────────────────────────────────
export async function generateReportPdf(report: ClinicalReport): Promise<Buffer> {
  const r = report as ExtendedReport;
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
  const buffers: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));

  // ── Pre-compute summary numbers ──────────────────────────────────────────
  const totalLabs    = r.labParameters.length;
  const abnormalCnt  = r.labParameters.filter(l => l.status !== "normal").length;
  const criticalCnt  = r.labParameters.filter(l => l.status === "critical").length;
  const findingsCnt  = r.findings.length;
  const confirmedCnt = r.findings.filter(f => f.category === "confirmed").length;

  // ════════════════════════════════════════════════════════════════════════
  //  PAGE 1 - COVER / SUMMARY
  // ════════════════════════════════════════════════════════════════════════

  // Header bar
  doc.rect(0, 0, doc.page.width, 90).fill("#052E16");
  doc.fillColor("#4ADE80").fontSize(28).font("Helvetica-Bold").text("CDSI", 50, 22);
  doc.fillColor("#D1FAE5").fontSize(11).font("Helvetica")
    .text("Clinical Decision Support Intelligence", 50, 54);
  doc.fillColor("#6EE7B7").fontSize(8).font("Helvetica-Oblique")
    .text(`Report generated: ${new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
      doc.page.width - 220, 60, { width: 180, align: "right" });

  doc.y = 108;

  // Patient info band
  const ps = r.patientSummary;
  doc.rect(50, doc.y, doc.page.width - 100, 44).fill("#F0FDF4").stroke("#D1FAE5");
  const patRow = [
    ps.name  ? ps.name  : "Anonymous Patient",
    ps.age   ? `Age ${ps.age}` : "",
    ps.sex   ? ps.sex            : "",
    `Type: ${ps.analysisType}`,
    new Date(ps.dateOfAnalysis).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
  ].filter(Boolean).join("   ·   ");
  doc.fillColor(C.text).fontSize(11).font("Helvetica-Bold")
    .text(patRow, 58, doc.y + 14, { width: doc.page.width - 116 });
  doc.y += 58;

  // ── Risk Assessment Banner ─────────────────────────────────────────────
  if (r.riskAssessment) {
    const rp = riskPalette(r.riskAssessment.level);
    doc.moveDown(0.6);
    const bannerH = 72;
    const bannerY = doc.y;
    doc.roundedRect(50, bannerY, doc.page.width - 100, bannerH, 6)
      .fillAndStroke(rp.bg, rp.border);

    // Risk level label
    doc.fillColor(rp.border).fontSize(22).font("Helvetica-Bold")
      .text(rp.label, 62, bannerY + 10, { width: 180 });

    // Urgency pill
    const urgencyLabel = `${r.riskAssessment.urgency.toUpperCase()} FOLLOW-UP`;
    doc.fillColor(rp.text).fontSize(9).font("Helvetica-Bold")
      .text(urgencyLabel, 62, bannerY + 40);

    // Reasoning (right column)
    if (r.riskAssessment.reasoning) {
      doc.fillColor(rp.text).fontSize(9).font("Helvetica")
        .text(r.riskAssessment.reasoning, 240, bannerY + 10, {
          width: doc.page.width - 300,
          height: bannerH - 16,
          ellipsis: true,
        });
    }
    doc.y = bannerY + bannerH + 12;
  }

  // ── Summary Stats Row ──────────────────────────────────────────────────
  doc.moveDown(0.4);
  const statY  = doc.y;
  const statW  = (doc.page.width - 100) / 4;
  const stats  = [
    { label: "Lab Tests",  value: String(totalLabs),   sub: "analysed",                   bg: "#F9FAFB", border: "#E5E7EB", textC: C.text      },
    { label: "Abnormal",   value: String(abnormalCnt),  sub: `of ${totalLabs}`,             bg: abnormalCnt  > 0 ? "#FFFBEB" : "#F0FDF4", border: abnormalCnt  > 0 ? "#FCD34D" : "#86EFAC", textC: abnormalCnt  > 0 ? "#92400E" : "#14532D" },
    { label: "Critical",   value: String(criticalCnt),  sub: "values flagged",              bg: criticalCnt > 0 ? "#FEF2F2" : "#F9FAFB",  border: criticalCnt > 0 ? "#FCA5A5" : "#E5E7EB", textC: criticalCnt > 0 ? "#991B1B" : C.muted   },
    { label: "Findings",   value: String(findingsCnt),  sub: `${confirmedCnt} confirmed`,   bg: "#F0FDF4",  border: "#86EFAC", textC: "#14532D"  },
  ];

  for (let i = 0; i < stats.length; i++) {
    const s  = stats[i]!;
    const sx = 50 + i * statW;
    doc.roundedRect(sx, statY, statW - 4, 56, 5).fillAndStroke(s.bg, s.border);
    doc.fillColor(C.muted).fontSize(7).font("Helvetica-Bold")
      .text(s.label.toUpperCase(), sx + 8, statY + 8, { width: statW - 20 });
    doc.fillColor(s.textC).fontSize(22).font("Helvetica-Bold")
      .text(s.value, sx + 8, statY + 20, { width: statW - 20 });
    doc.fillColor(C.muted).fontSize(7).font("Helvetica")
      .text(s.sub, sx + 8, statY + 44, { width: statW - 20 });
  }
  doc.y = statY + 68;

  // ── Clinical Conclusion / Overall Summary ──────────────────────────────
  if (r.clinicalConclusion) {
    doc.moveDown(0.8);
    sectionHeader(doc, "Clinical Overview & Conclusion");
    doc.roundedRect(50, doc.y, doc.page.width - 100, 0, 4); // will be drawn below
    const conclusionY = doc.y;
    doc.fillColor(C.text).fontSize(10).font("Helvetica")
      .text(r.clinicalConclusion, 58, doc.y, { width: doc.page.width - 116 });
    // box around it
    const conclusionH = doc.y - conclusionY + 10;
    doc.roundedRect(50, conclusionY - 4, doc.page.width - 100, conclusionH + 4, 4)
      .stroke("#D1D5DB");
    doc.moveDown(0.6);
  }

  // ── Possible Conditions ────────────────────────────────────────────────
  const conditions = r.possibleConditions ?? [];
  if (conditions.length > 0) {
    doc.moveDown(0.4);
    sectionHeader(doc, "Possible Conditions & Differential Viewpoints");
    doc.fillColor(C.muted).fontSize(8).font("Helvetica-Oblique")
      .text("AI-generated possibilities only - clinical evaluation required to confirm any diagnosis.", 50, doc.y);
    doc.moveDown(0.5);

    // pill-style condition tags - draw inline
    const pillH   = 18;
    const pillPad = 8;
    let   px      = 50;
    const py0     = doc.y;
    let   py      = py0;

    for (const cond of conditions) {
      const tw = doc.widthOfString(cond) + pillPad * 2 + 2;
      if (px + tw > doc.page.width - 50) { px = 50; py += pillH + 6; }
      doc.roundedRect(px, py, tw, pillH, 4).fillAndStroke("#EFF6FF", "#BFDBFE");
      doc.fillColor("#1E40AF").fontSize(9).font("Helvetica")
        .text(cond, px + pillPad, py + 4, { lineBreak: false });
      px += tw + 6;
    }
    doc.y = py + pillH + 10;
    doc.moveDown(0.4);
  }

  // ── Next Steps ────────────────────────────────────────────────────────
  const nextSteps = r.nextSteps ?? [];
  if (nextSteps.length > 0) {
    doc.moveDown(0.3);
    sectionHeader(doc, "Suggested Next Steps");
    nextSteps.forEach((step, i) => {
      if (doc.y > doc.page.height - 80) doc.addPage();
      const stepY = doc.y;
      // circle number
      doc.circle(58, stepY + 7, 7).fill("#DBEAFE");
      doc.fillColor("#1D4ED8").fontSize(7).font("Helvetica-Bold")
        .text(String(i + 1), 55, stepY + 3, { width: 8, align: "center", lineBreak: false });
      doc.fillColor(C.text).fontSize(10).font("Helvetica")
        .text(step, 72, stepY, { width: doc.page.width - 122 });
      doc.moveDown(0.4);
    });
    doc.moveDown(0.3);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  DETAILED SECTIONS (continue on new page for cleanliness)
  // ════════════════════════════════════════════════════════════════════════
  doc.addPage();
  doc.rect(0, 0, doc.page.width, 6).fill(C.primary);
  doc.y = 24;

  // ── Organ Systems ─────────────────────────────────────────────────────
  if (r.organSystems?.length) {
    sectionHeader(doc, "Organ System Overview");
    const sysW  = (doc.page.width - 100) / 3;
    let   col   = 0;
    let   rowY  = doc.y;

    for (const sys of r.organSystems) {
      if (doc.y > doc.page.height - 100) { doc.addPage(); rowY = doc.y; col = 0; }
      const sysColor =
        sys.status === "critical" ? { bg: "#FEF2F2", border: "#FCA5A5", text: "#991B1B", badge: "#DC2626" } :
        sys.status === "warning"  ? { bg: "#FFFBEB", border: "#FCD34D", text: "#92400E", badge: "#D97706" } :
                                    { bg: "#F0FDF4", border: "#86EFAC", text: "#14532D", badge: "#16A34A" };
      const sx = 50 + col * sysW;
      if (col === 0) rowY = doc.y;

      const boxH = 54;
      doc.roundedRect(sx, rowY, sysW - 6, boxH, 5).fillAndStroke(sysColor.bg, sysColor.border);
      doc.fillColor(sysColor.badge).fontSize(7).font("Helvetica-Bold")
        .text(sys.status.toUpperCase(), sx + 8, rowY + 7, { width: sysW - 20 });
      doc.fillColor(C.text).fontSize(10).font("Helvetica-Bold")
        .text(sys.system, sx + 8, rowY + 18, { width: sysW - 20 });
      if (sys.summary) {
        doc.fillColor(sysColor.text).fontSize(7.5).font("Helvetica")
          .text(sys.summary, sx + 8, rowY + 32, { width: sysW - 20, height: 18, ellipsis: true });
      }

      col++;
      if (col === 3) { col = 0; doc.y = rowY + boxH + 8; }
    }
    if (col > 0) doc.y = rowY + 64;
    doc.moveDown(0.6);
  }

  // ── Confirmed Findings ────────────────────────────────────────────────
  const confirmedFindings  = r.findings.filter(f => f.category === "confirmed");
  const differentials      = r.findings.filter(f => f.category === "possible" || f.category === "differential");
  const recommendations    = r.findings.filter(f => f.category === "recommendation");

  if (confirmedFindings.length > 0) {
    sectionHeader(doc, `Confirmed Clinical Findings (${confirmedFindings.length})`);
    for (const f of confirmedFindings) {
      if (doc.y > doc.page.height - 80) doc.addPage();
      const confColor = f.confidence >= 80 ? "#16A34A" : f.confidence >= 60 ? "#D97706" : "#6B7280";
      const fy = doc.y;
      doc.circle(56, fy + 6, 5).fill(confColor);
      doc.fillColor(C.text).fontSize(10).font("Helvetica-Bold")
        .text(f.findingText, 68, fy, { width: doc.page.width - 130 });
      doc.fillColor(C.muted).fontSize(8).font("Helvetica")
        .text(
          `Confidence: ${f.confidence}%` +
          (f.sourceValue    ? `  |  Value: ${f.sourceValue}` : "") +
          (f.sourceDocument ? `  (${f.sourceDocument})`      : ""),
          68, doc.y,
        );
      if (f.reasoning) {
        doc.fillColor("#374151").fontSize(9).font("Helvetica-Oblique")
          .text(f.reasoning, 68, doc.y, { width: doc.page.width - 130 });
      }
      doc.moveDown(0.5);
    }
    doc.moveDown(0.3);
  }

  // ── Differentials / Possible ──────────────────────────────────────────
  if (differentials.length > 0) {
    sectionHeader(doc, `Differential Diagnosis & Watch Points (${differentials.length})`);
    for (const f of differentials) {
      if (doc.y > doc.page.height - 80) doc.addPage();
      const fy = doc.y;
      doc.circle(56, fy + 6, 5).fill("#D97706");
      doc.fillColor(C.text).fontSize(10).font("Helvetica").text(f.findingText, 68, fy, { width: doc.page.width - 130 });
      doc.fillColor(C.muted).fontSize(8).text(`Confidence: ${f.confidence}%`, 68, doc.y);
      doc.moveDown(0.4);
    }
    doc.moveDown(0.3);
  }

  // ── Recommendations ───────────────────────────────────────────────────
  if (recommendations.length > 0) {
    sectionHeader(doc, "Clinical Recommendations");
    const recY = doc.y;
    const recStartY = recY;
    for (const f of recommendations) {
      if (doc.y > doc.page.height - 80) doc.addPage();
      const fy = doc.y;
      doc.rect(50, fy, 3, 14).fill(C.primary);
      doc.fillColor(C.text).fontSize(10).font("Helvetica").text(f.findingText, 60, fy, { width: doc.page.width - 110 });
      doc.moveDown(0.4);
    }
    const recEndY = doc.y;
    doc.rect(50, recStartY - 4, doc.page.width - 100, recEndY - recStartY + 14).stroke("#D1FAE5");
    doc.moveDown(0.3);
  }

  // ── Lab Results Table ─────────────────────────────────────────────────
  if (r.labParameters.length > 0) {
    if (doc.y > doc.page.height - 140) doc.addPage();
    sectionHeader(doc, `Laboratory Results - ${r.labParameters.length} parameters`);
    const cols    = [160, 80, 70, 130, 65];
    const headers = ["Parameter / Panel", "Value", "Unit", "Reference Range", "Status"];
    tableRow(doc, headers, cols, "#052E16", "#4ADE80", true);

    for (const lab of r.labParameters) {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const statusColor =
        lab.status === "critical"                            ? C.critical :
        lab.status === "high" || lab.status === "low"        ? C.warning  :
                                                              C.normal;
      const rowBg =
        lab.status === "critical"                            ? "#FEF2F2" :
        lab.status === "high" || lab.status === "low"        ? "#FFFBEB" :
                                                              C.white;

      const nameCell = lab.panel ? `${lab.name}\n${lab.panel}` : lab.name;
      tableRow(doc, [
        nameCell,
        lab.value,
        lab.unit ?? "—",
        lab.referenceRange ?? "—",
        lab.status.toUpperCase(),
      ], cols, rowBg, lab.status === "normal" ? C.text : statusColor, false);
    }
    doc.moveDown(1);
  }

  // ── Prescriptions ─────────────────────────────────────────────────────
  if (r.prescriptions.length > 0) {
    if (doc.y > doc.page.height - 120) doc.addPage();
    sectionHeader(doc, `Active Prescriptions - ${r.prescriptions.length} medication(s)`);
    for (const rx of r.prescriptions) {
      if (doc.y > doc.page.height - 80) doc.addPage();
      const rxY = doc.y;
      doc.roundedRect(50, rxY, doc.page.width - 100, 0, 4); // placeholder
      doc.fillColor(C.text).fontSize(10).font("Helvetica-Bold").text(rx.medicineName, 58, rxY + 2);
      const details = [
        rx.dosage    ? `Dose: ${rx.dosage}`         : null,
        rx.frequency ? `Freq: ${rx.frequency}`      : null,
        rx.duration  ? `Duration: ${rx.duration}`   : null,
        rx.timing    ? `Timing: ${rx.timing}`       : null,
      ].filter(Boolean).join("   ·   ");
      if (details) doc.fillColor(C.primary).fontSize(9).font("Helvetica").text(details, 58, doc.y);
      if (rx.specialInstructions) {
        doc.fillColor(C.warning).fontSize(8).font("Helvetica-Oblique")
          .text(`⚠ ${rx.specialInstructions}`, 58, doc.y);
      }
      const rxEndY = doc.y + 4;
      doc.roundedRect(50, rxY, doc.page.width - 100, rxEndY - rxY + 2, 4).stroke("#E5E7EB");
      doc.y = rxEndY + 10;
    }
    doc.moveDown(0.3);
  }

  // ── Psychiatric Section ───────────────────────────────────────────────
  const psych = r.psychiatricSummary as {
    phq9Score?: number | null; phq9Interpretation?: string | null;
    gad7Score?: number | null; gad7Interpretation?: string | null;
    showMentalHealthBanner?: boolean; narrativeSummary?: string | null;
  } | null;

  if (psych && (psych.phq9Score != null || psych.gad7Score != null)) {
    if (doc.y > doc.page.height - 140) doc.addPage();
    sectionHeader(doc, "Psychiatric Assessment");
    if (psych.showMentalHealthBanner) {
      const banY = doc.y;
      doc.rect(50, banY, doc.page.width - 100, 24).fill("#FEF2F2");
      doc.fillColor(C.critical).fontSize(9).font("Helvetica-Bold")
        .text("⚠ Scores indicate moderate-to-severe symptoms - consult a mental health professional.",
          58, banY + 7, { width: doc.page.width - 116 });
      doc.y = banY + 30;
    }

    // Score bars
    for (const [score, max, label, interp] of [
      [psych.phq9Score, 27, "PHQ-9", psych.phq9Interpretation],
      [psych.gad7Score, 21, "GAD-7", psych.gad7Interpretation],
    ] as [number | null | undefined, number, string, string | null | undefined][]) {
      if (score == null) continue;
      const barY   = doc.y;
      const barW   = doc.page.width - 150;
      const pct    = score / max;
      const barCol = pct >= 0.55 ? C.critical : pct >= 0.35 ? C.warning : C.primary;
      doc.fillColor(C.text).fontSize(10).font("Helvetica-Bold")
        .text(`${label} Score: ${score} / ${max}`, 58, barY);
      doc.rect(58, doc.y + 2, barW, 10).fill("#F3F4F6");
      doc.rect(58, doc.y + 2, barW * pct, 10).fill(barCol);
      doc.y += 16;
      if (interp) {
        doc.fillColor(C.muted).fontSize(9).font("Helvetica").text(interp, 58, doc.y);
      }
      doc.moveDown(0.6);
    }
    if (psych.narrativeSummary) {
      doc.fillColor(C.text).fontSize(9).font("Helvetica-Oblique")
        .text(psych.narrativeSummary, 58, doc.y, { width: doc.page.width - 116 });
      doc.moveDown(0.5);
    }
  }

  // ── DISCLAIMER BLOCK ─────────────────────────────────────────────────
  doc.moveDown(1);
  if (doc.y > doc.page.height - 80) doc.addPage();
  doc.rect(50, doc.y, doc.page.width - 100, 36).fill("#F9FAFB").stroke("#E5E7EB");
  doc.fillColor(C.muted).fontSize(7.5).font("Helvetica-Oblique")
    .text(
      "IMPORTANT DISCLAIMER: This report is generated by an AI clinical decision support system and is intended solely to assist licensed healthcare professionals. It does not constitute a medical diagnosis, treatment plan, or clinical opinion. All findings must be independently reviewed and verified by a qualified clinician before any clinical action is taken.",
      58, doc.y + 8, { width: doc.page.width - 116, lineGap: 1.5 },
    );
  doc.moveDown(2);

  // ── FOOTER on every page ──────────────────────────────────────────────
  doc.flushPages();
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const bottom = doc.page.height - 36;
    doc.rect(0, bottom - 2, doc.page.width, 38).fill("#052E16");
    doc.fillColor("#6EE7B7").fontSize(7).font("Helvetica")
      .text(
        `CDSI Clinical Report  ·  ${r.patientSummary.name ?? "Anonymous Patient"}  ·  Page ${i + 1} of ${range.count}  ·  AI-generated - not a diagnostic tool`,
        50, bottom + 8, { align: "center", width: doc.page.width - 100 },
      );
  }

  doc.end();
  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end",   () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function sectionHeader(doc: PDFDoc, title: string): void {
  if (doc.y > doc.page.height - 120) doc.addPage();
  doc.fillColor(C.primary).fontSize(12).font("Helvetica-Bold").text(title);
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y)
    .strokeColor("#D1FAE5").lineWidth(1.5).stroke();
  doc.moveDown(0.5);
}

function tableRow(
  doc: PDFDoc,
  cells: string[],
  colWidths: number[],
  bgColor: string,
  textColor: string,
  isHeader: boolean,
): void {
  if (doc.y > doc.page.height - 60) doc.addPage();
  const rowHeight = isHeader ? 22 : 20;
  const startX    = 50;
  const startY    = doc.y;
  let   totalW    = 0;
  for (const w of colWidths) totalW += w;
  doc.rect(startX, startY, totalW, rowHeight).fill(bgColor);

  let x = startX;
  for (let i = 0; i < cells.length; i++) {
    const w    = colWidths[i] ?? 80;
    const cell = cells[i] ?? "";
    // Handle multi-line cells (e.g. name\npanel)
    const lines = cell.split("\n");
    doc.fillColor(textColor)
      .fontSize(isHeader ? 8 : 8)
      .font(isHeader ? "Helvetica-Bold" : "Helvetica")
      .text(lines[0] ?? "", x + 3, startY + (isHeader ? 7 : 5), { width: w - 6, ellipsis: true, lineBreak: false });
    if (lines[1]) {
      doc.fillColor(isHeader ? textColor : "#9CA3AF").fontSize(7).font("Helvetica")
        .text(lines[1], x + 3, startY + (isHeader ? 7 : 5) + 9, { width: w - 6, ellipsis: true, lineBreak: false });
    }
    x += w;
  }
  doc.y = startY + rowHeight + 1;
}
