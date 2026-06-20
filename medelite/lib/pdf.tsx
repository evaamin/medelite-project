"use client";

import {
  Document,
  Page,
  View,
  Text,
  Link,
  StyleSheet,
  pdf,
  Font,
} from "@react-pdf/renderer";
import type { RenderModel } from "./types";
import { formatAddress, formatMetric, comparison } from "./format";

// Brand palette (kept in sync with the on-screen report).
const INK = "#15131A";
const MAGENTA = "#E5147E";
const VIOLET = "#7B2FF7";
const CYAN = "#21C7E8";
const SLATE = "#5A5566";
const HAIR = "#E7E4EC";
const BETTER = "#0E8C5A";
const WORSE = "#C8364B";

Font.registerHyphenationCallback((w) => [w]); // avoid awkward hyphen breaks

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 40, paddingHorizontal: 38, fontSize: 9, color: INK, fontFamily: "Helvetica" },
  // Branding banner — hardcoded platform brand, never the facility name.
  brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  brandMark: { width: 14, height: 14, borderRadius: 7, backgroundColor: MAGENTA, marginRight: 6 },
  brandInfinite: { fontSize: 15, fontFamily: "Helvetica-Bold", color: VIOLET, letterSpacing: 1 },
  brandManaged: { fontSize: 9, color: SLATE, marginLeft: 6, marginTop: 4 },
  rule: { height: 2, backgroundColor: MAGENTA, marginTop: 6, marginBottom: 12 },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "center", letterSpacing: 1.5 },
  stateCode: { fontSize: 10, fontFamily: "Helvetica-Bold", color: SLATE, textAlign: "center", marginTop: 2, marginBottom: 12 },

  table: { borderWidth: 1, borderColor: HAIR, borderRadius: 4 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: HAIR },
  rowLast: { flexDirection: "row" },
  th: { width: "52%", padding: 6, fontFamily: "Helvetica-Bold", backgroundColor: "#FAF9FB" },
  td: { width: "48%", padding: 6 },
  sectionBar: { backgroundColor: VIOLET, color: "#fff", padding: 6, fontFamily: "Helvetica-Bold", fontSize: 8.5, letterSpacing: 0.5, marginTop: 14, borderTopLeftRadius: 4, borderTopRightRadius: 4 },

  starWrap: { flexDirection: "row" },
  star: { fontSize: 10, marginRight: 1 },

  metricGrid: { borderWidth: 1, borderColor: HAIR, borderRadius: 4 },
  metricHead: { flexDirection: "row", backgroundColor: "#FAF9FB", borderBottomWidth: 1, borderBottomColor: HAIR },
  metricRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: HAIR },
  mLabel: { width: "40%", padding: 6 },
  mVal: { width: "20%", padding: 6, textAlign: "right", fontFamily: "Helvetica-Bold" },
  mHead: { fontFamily: "Helvetica-Bold", fontSize: 8 },

  footer: { position: "absolute", bottom: 22, left: 38, right: 38, fontSize: 7.5, color: SLATE, flexDirection: "row", justifyContent: "space-between" },
  link: { color: MAGENTA, textDecoration: "underline" },
});

function Stars({ value }: { value: number | null }) {
  if (value === null) return <Text style={{ color: SLATE }}>Not rated</Text>;
  return (
    <View style={s.starWrap}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Text key={i} style={[s.star, { color: i <= value ? MAGENTA : HAIR }]}>★</Text>
      ))}
      <Text style={{ marginLeft: 4, color: SLATE }}>{value}/5</Text>
    </View>
  );
}

function Field({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <View style={last ? s.rowLast : s.row}>
      <Text style={s.th}>{label}</Text>
      <View style={s.td}><Text>{children as string}</Text></View>
    </View>
  );
}

function MetricValue({ value, unit, color }: { value: number | null; unit: "%" | "per 1k"; color?: string }) {
  return <Text style={[s.mVal, color ? { color } : {}]}>{formatMetric(value, unit)}</Text>;
}

export function ReportPdf({ model }: { model: RenderModel }) {
  const { report, manual, displayName } = model;
  const shortRows = report.metrics.filter((m) => m.stay === "short");
  const longRows = report.metrics.filter((m) => m.stay === "long");

  const MetricBlock = ({ title, rows }: { title: string; rows: typeof report.metrics }) => (
    <View wrap={false}>
      <Text style={s.sectionBar}>{title}</Text>
      <View style={s.metricGrid}>
        <View style={s.metricHead}>
          <Text style={[s.mLabel, s.mHead]}>Measure</Text>
          <Text style={[s.mVal, s.mHead]}>Facility</Text>
          <Text style={[s.mVal, s.mHead]}>National</Text>
          <Text style={[s.mVal, s.mHead]}>State</Text>
        </View>
        {rows.map((m, i) => {
          const vs = comparison(m.facility, m.national, m.lowerIsBetter);
          const color = vs === "better" ? BETTER : vs === "worse" ? WORSE : undefined;
          return (
            <View key={m.label} style={i === rows.length - 1 ? { flexDirection: "row" } : s.metricRow}>
              <Text style={s.mLabel}>{m.kind === "ed" ? "ED Visit" : "Hospitalization"}</Text>
              <MetricValue value={m.facility} unit={m.unit} color={color} />
              <MetricValue value={m.national} unit={m.unit} />
              <MetricValue value={m.state} unit={m.unit} />
            </View>
          );
        })}
      </View>
    </View>
  );

  return (
    <Document title={`Facility Assessment Snapshot — ${displayName}`} author="INFINITE, managed by Medelite">
      <Page size="A4" style={s.page}>
        {/* === Hardcoded corporate branding banner === */}
        <View style={s.brandRow}>
          <View style={s.brandMark} />
          <Text style={s.brandInfinite}>INFINITE</Text>
          <Text style={s.brandManaged}>Managed by MEDELITE</Text>
        </View>
        <View style={s.rule} />
        <Text style={s.title}>FACILITY ASSESSMENT SNAPSHOT</Text>
        <Text style={s.stateCode}>{report.state || "—"}</Text>

        {/* === Facility profile === */}
        <View style={s.table}>
          <Field label="Name of Facility">{displayName}</Field>
          <Field label="Location">{formatAddress(report)}</Field>
          <Field label="EMR">{manual.emr || "—"}</Field>
          <Field label="Census Capacity">{report.certifiedBeds ?? "—"}</Field>
          <Field label="Current Census">{manual.currentCensus || "—"}</Field>
          <Field label="Type of Patient">{manual.patientType || "—"}</Field>
          <Field label="Previous Coverage from Medelite">{manual.previousCoverage || "—"}</Field>
          <Field label="Previous Provider Performance from Medelite">{manual.previousPerformance || "—"}</Field>
          <Field label="Medical Coverage" last>{manual.medicalCoverage || "—"}</Field>
        </View>

        {/* === Star ratings === */}
        <Text style={s.sectionBar}>CMS FIVE-STAR RATINGS</Text>
        <View style={s.table}>
          <View style={s.row}><Text style={s.th}>Overall Star Rating</Text><View style={s.td}><Stars value={report.ratings.overall} /></View></View>
          <View style={s.row}><Text style={s.th}>Health Inspection</Text><View style={s.td}><Stars value={report.ratings.healthInspection} /></View></View>
          <View style={s.row}><Text style={s.th}>Staffing</Text><View style={s.td}><Stars value={report.ratings.staffing} /></View></View>
          <View style={s.rowLast}><Text style={s.th}>Quality of Resident Care</Text><View style={s.td}><Stars value={report.ratings.qualityOfResidentCare} /></View></View>
        </View>

        {/* === Hospitalization & ED metrics (12 lines) === */}
        <MetricBlock title="SHORT-STAY (STR) HOSPITALIZATION & ED" rows={shortRows} />
        <MetricBlock title="LONG-STAY (LT) HOSPITALIZATION & ED" rows={longRows} />

        <View style={{ marginTop: 14 }}>
          <Text style={{ color: SLATE }}>
            Source:{" "}
            <Link style={s.link} src={report.medicareUrl}>
              Medicare Care Compare — official profile (CCN {report.ccn})
            </Link>
          </Text>
        </View>

        <View style={s.footer} fixed>
          <Text>INFINITE, managed by Medelite · Generated {new Date().toLocaleDateString()}</Text>
          <Text>CMS data processed {report.processingDate ?? "n/a"}</Text>
        </View>
      </Page>
    </Document>
  );
}

/** Build the PDF and trigger a direct browser download. */
export async function downloadPdf(model: RenderModel) {
  const blob = await pdf(<ReportPdf model={model} />).toBlob();
  triggerDownload(blob, `Facility_Assessment_${slug(model.displayName)}.pdf`);
}

export function slug(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "facility";
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
