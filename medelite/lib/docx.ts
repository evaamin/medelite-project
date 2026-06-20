"use client";

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  ExternalHyperlink,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
} from "docx";
import type { RenderModel } from "./types";
import { formatAddress, formatMetric, resolveDisplayName } from "./format";
import { triggerDownload, slug } from "./pdf";

const VIOLET = "7B2FF7";
const MAGENTA = "E5147E";
const SLATE = "5A5566";
const HAIR = "E7E4EC";

const thinBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: HAIR },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: HAIR },
  left: { style: BorderStyle.SINGLE, size: 4, color: HAIR },
  right: { style: BorderStyle.SINGLE, size: 4, color: HAIR },
};

function labelCell(text: string) {
  return new TableCell({
    width: { size: 52, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill: "FAF9FB", color: "auto" },
    borders: thinBorders,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
  });
}

function valueCell(text: string) {
  return new TableCell({
    width: { size: 48, type: WidthType.PERCENTAGE },
    borders: thinBorders,
    children: [new Paragraph(text)],
  });
}

function kvRow(label: string, value: string) {
  return new TableRow({ children: [labelCell(label), valueCell(value || "—")] });
}

function starText(value: number | null): string {
  if (value === null) return "Not rated";
  return "★".repeat(value) + "☆".repeat(5 - value) + `  (${value}/5)`;
}

function sectionHeading(text: string) {
  return new Paragraph({
    spacing: { before: 260, after: 80 },
    shading: { type: ShadingType.CLEAR, fill: VIOLET, color: "auto" },
    children: [new TextRun({ text: `  ${text}`, bold: true, color: "FFFFFF", size: 18 })],
  });
}

function metricTable(rows: RenderModel["report"]["metrics"]) {
  const headerCell = (t: string) =>
    new TableCell({
      shading: { type: ShadingType.CLEAR, fill: "FAF9FB", color: "auto" },
      borders: thinBorders,
      children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 16 })] })],
    });
  type Align = (typeof AlignmentType)[keyof typeof AlignmentType];
  const dataCell = (t: string, align: Align = AlignmentType.RIGHT) =>
    new TableCell({
      borders: thinBorders,
      children: [new Paragraph({ alignment: align, children: [new TextRun(t)] })],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [headerCell("Measure"), headerCell("Facility"), headerCell("National"), headerCell("State")],
      }),
      ...rows.map(
        (m) =>
          new TableRow({
            children: [
              dataCell(m.kind === "ed" ? "ED Visit" : "Hospitalization", AlignmentType.LEFT),
              dataCell(formatMetric(m.facility, m.unit)),
              dataCell(formatMetric(m.national, m.unit)),
              dataCell(formatMetric(m.state, m.unit)),
            ],
          })
      ),
    ],
  });
}

export async function downloadDocx(model: RenderModel) {
  const { report, manual } = model;
  const displayName = resolveDisplayName(report.cmsName, manual.nameOverride);
  const shortRows = report.metrics.filter((m) => m.stay === "short");
  const longRows = report.metrics.filter((m) => m.stay === "long");

  const doc = new Document({
    creator: "INFINITE, managed by Medelite",
    title: `Facility Assessment Snapshot — ${displayName}`,
    sections: [
      {
        children: [
          // Hardcoded branding banner.
          new Paragraph({
            children: [
              new TextRun({ text: "INFINITE", bold: true, color: VIOLET, size: 30 }),
              new TextRun({ text: "   Managed by MEDELITE", color: SLATE, size: 18 }),
            ],
          }),
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: MAGENTA, space: 1 } },
            children: [],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 160 },
            children: [new TextRun({ text: "FACILITY ASSESSMENT SNAPSHOT", bold: true, size: 26 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [new TextRun({ text: report.state || "—", bold: true, color: SLATE, size: 20 })],
          }),

          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              kvRow("Name of Facility", displayName),
              kvRow("Location", formatAddress(report)),
              kvRow("EMR", manual.emr),
              kvRow("Census Capacity", report.certifiedBeds?.toString() ?? "—"),
              kvRow("Current Census", manual.currentCensus),
              kvRow("Type of Patient", manual.patientType),
              kvRow("Previous Coverage from Medelite", manual.previousCoverage),
              kvRow("Previous Provider Performance from Medelite", manual.previousPerformance),
              kvRow("Medical Coverage", manual.medicalCoverage),
            ],
          }),

          sectionHeading("CMS FIVE-STAR RATINGS"),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              kvRow("Overall Star Rating", starText(report.ratings.overall)),
              kvRow("Health Inspection", starText(report.ratings.healthInspection)),
              kvRow("Staffing", starText(report.ratings.staffing)),
              kvRow("Quality of Resident Care", starText(report.ratings.qualityOfResidentCare)),
            ],
          }),

          sectionHeading("SHORT-STAY (STR) HOSPITALIZATION & ED"),
          metricTable(shortRows),
          sectionHeading("LONG-STAY (LT) HOSPITALIZATION & ED"),
          metricTable(longRows),

          new Paragraph({
            spacing: { before: 240 },
            children: [
              new TextRun({ text: "Source: ", color: SLATE }),
              new ExternalHyperlink({
                link: report.medicareUrl,
                children: [
                  new TextRun({
                    text: `Medicare Care Compare — official profile (CCN ${report.ccn})`,
                    style: "Hyperlink",
                    color: MAGENTA,
                    underline: {},
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({
            spacing: { before: 120 },
            children: [
              new TextRun({
                text: `Generated ${new Date().toLocaleDateString()} · CMS data processed ${report.processingDate ?? "n/a"}`,
                color: SLATE,
                size: 14,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `Facility_Assessment_${slug(displayName)}.docx`);
}
