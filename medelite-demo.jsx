import React, { useState, useMemo } from "react";

// ───────────────────────────────────────────────────────────────────────────
// Medelite — Facility Assessment Report Generator (interactive demo)
//
// This is a self-contained preview of the real Next.js app. It pulls LIVE data
// from the CMS Provider Data Catalog client-side, and seeds the Kendall Lakes
// sample (CCN 686123) so you see a fully rendered snapshot immediately.
//
// The production repo runs the same data engine SERVER-SIDE (no CORS, plus
// @react-pdf/renderer + docx export). This demo reproduces the lookup → preview
// experience so the mapping + branding can be eyeballed in one click.
// ───────────────────────────────────────────────────────────────────────────

const C = {
  ink: "#15131a",
  slate: "#5a5566",
  magenta: "#e5147e",
  violet: "#7b2ff7",
  cyan: "#21c7e8",
  hair: "#e7e4ec",
  surface: "#ffffff",
  bg: "#f6f5f8",
  better: "#0e8c5a",
  worse: "#c8364b",
  grad: "linear-gradient(95deg,#e5147e 0%,#7b2ff7 52%,#21c7e8 100%)",
};
const display = '"Space Grotesk",system-ui,sans-serif';
const body = '"Inter",system-ui,sans-serif';
const mono = '"IBM Plex Mono",ui-monospace,monospace';

const PDC = "https://data.cms.gov/provider-data/api/1/datastore/query";
const DATASETS = {
  providerInfo: "4pq5-n9py",
  claims: "ijh5-nb2v",
  stateAverages: "xcdc-v8bm",
};

// ── Measure mapping (mirrors lib/cms.ts: keyword-based, not numeric codes) ──
const MEASURES = [
  {
    label: "Short Term Hospitalization", stay: "short", unit: "%",
    matchClaim: (d, rt) => rt.includes("short") && d.includes("rehospitalized"),
    matchAvg: (d) => d.includes("short stay") && d.includes("rehospitalized"),
  },
  {
    label: "Short Term ED Visit", stay: "short", unit: "%",
    matchClaim: (d, rt) => rt.includes("short") && d.includes("outpatient emergency department"),
    matchAvg: (d) => d.includes("short stay") && d.includes("outpatient emergency department"),
  },
  {
    label: "Long Term Hospitalization", stay: "long", unit: "per 1k",
    matchClaim: (d, rt) => rt.includes("long") && d.includes("hospitalizations per 1000"),
    matchAvg: (d) => d.includes("hospitalizations per 1000"),
  },
  {
    label: "Long Term ED Visit", stay: "long", unit: "per 1k",
    matchClaim: (d, rt) => rt.includes("long") && d.includes("outpatient emergency department visits per 1000"),
    matchAvg: (d) => d.includes("outpatient emergency department visits per 1000"),
  },
];

const num = (v) => {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function medicareUrl(ccn, state) {
  const base = `https://www.medicare.gov/care-compare/details/nursing-home/${ccn}/view-all`;
  return state ? `${base}?state=${state}` : base;
}

async function queryDataset(datasetId, property, value, limit = 500) {
  const p = new URLSearchParams();
  p.set("conditions[0][property]", property);
  p.set("conditions[0][operator]", "=");
  p.set("conditions[0][value]", value);
  p.set("limit", String(limit));
  const res = await fetch(`${PDC}/${datasetId}/0?${p.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`CMS ${datasetId} HTTP ${res.status}`);
  const json = await res.json();
  const schemaRoot = json?.schema ? Object.values(json.schema)[0] : null;
  return {
    results: Array.isArray(json?.results) ? json.results : [],
    schema: schemaRoot?.fields ?? {},
  };
}

async function buildReport(ccn) {
  const { results: providerRows } = await queryDataset(
    DATASETS.providerInfo, "cms_certification_number_ccn", ccn, 1
  );
  if (providerRows.length === 0) {
    const err = new Error(`No facility found for CCN ${ccn}.`);
    err.code = 404;
    throw err;
  }
  const p = providerRows[0];
  const state = (p.state ?? "").trim().toUpperCase();
  const warnings = [];

  const ratings = {
    overall: num(p.overall_rating),
    healthInspection: num(p.health_inspection_rating),
    staffing: num(p.staffing_rating),
    qualityOfResidentCare: num(p.qm_rating),
  };

  const facilityValues = new Map();
  try {
    const { results: claimRows } = await queryDataset(
      DATASETS.claims, "cms_certification_number_ccn", ccn
    );
    for (const m of MEASURES) {
      const row = claimRows.find((r) =>
        m.matchClaim((r.measure_description ?? "").toLowerCase(), (r.resident_type ?? "").toLowerCase())
      );
      const v = row ? (num(row.adjusted_score) ?? num(row.observed_score) ?? num(row.score)) : null;
      facilityValues.set(m.label, v);
    }
  } catch {
    warnings.push("Claims-based metrics are temporarily unavailable from CMS.");
  }

  const stateAvg = new Map();
  const nationalAvg = new Map();
  try {
    const { results: stateRows, schema } = await queryDataset(
      DATASETS.stateAverages, "state_or_nation", state, 1
    );
    const { results: nationRows } = await queryDataset(
      DATASETS.stateAverages, "state_or_nation", "NATION", 1
    );
    const byDesc = Object.entries(schema).map(([field, meta]) => ({
      field, desc: (meta.description ?? field).toLowerCase(),
    }));
    const resolve = (pred) => byDesc.find((c) => pred(c.desc))?.field ?? null;
    for (const m of MEASURES) {
      const field = resolve(m.matchAvg);
      stateAvg.set(m.label, field && stateRows[0] ? num(stateRows[0][field]) : null);
      nationalAvg.set(m.label, field && nationRows[0] ? num(nationRows[0][field]) : null);
    }
  } catch {
    warnings.push("State/national benchmarks are temporarily unavailable from CMS.");
  }

  const metrics = MEASURES.map((m) => ({
    label: m.label, stay: m.stay, unit: m.unit, lowerIsBetter: true,
    facility: facilityValues.get(m.label) ?? null,
    state: stateAvg.get(m.label) ?? null,
    national: nationalAvg.get(m.label) ?? null,
  }));

  return {
    ccn, live: true,
    cmsName: p.provider_name || p.legal_business_name || "Unknown Facility",
    address: p.provider_address ?? "", city: p.citytown ?? "", state, zip: p.zip_code ?? "",
    certifiedBeds: num(p.number_of_certified_beds),
    avgResidentsPerDay: num(p.average_number_of_residents_per_day),
    ratings, metrics, medicareUrl: medicareUrl(ccn, state),
    processingDate: p.processing_date || null, warnings,
  };
}

// ── Seeded sample for CCN 686123 (from the provided Kendall Lakes snapshot) ──
const SAMPLE_686123 = {
  ccn: "686123", live: false,
  cmsName: "Kendall Lakes Healthcare and Rehab Center",
  address: "5280 SW 157th Ave", city: "Miami", state: "FL", zip: "33193",
  certifiedBeds: 120, avgResidentsPerDay: 112,
  ratings: { overall: 1, healthInspection: 1, staffing: 2, qualityOfResidentCare: 4 },
  metrics: [
    { label: "Short Term Hospitalization", stay: "short", unit: "%", lowerIsBetter: true, facility: 18.7, national: 21.5, state: 23.8 },
    { label: "Short Term ED Visit", stay: "short", unit: "%", lowerIsBetter: true, facility: 13.9, national: 11.6, state: 9.3 },
    { label: "Long Term Hospitalization", stay: "long", unit: "per 1k", lowerIsBetter: true, facility: 1.86, national: 1.65, state: 1.95 },
    { label: "Long Term ED Visit", stay: "long", unit: "per 1k", lowerIsBetter: true, facility: 6.94, national: 1.65, state: 1.21 },
  ],
  medicareUrl: medicareUrl("686123", "FL"),
  processingDate: null, warnings: [],
};

// ── Helpers ──
const fmt = (v, unit) => (v === null ? "—" : unit === "%" ? `${v.toFixed(1)}%` : v.toFixed(2));
const fullAddress = (r) =>
  [r.address, [r.city, r.state].filter(Boolean).join(", "), r.zip].filter(Boolean).join(", ");
const resolveName = (cms, ov) => (ov.trim() ? ov.trim() : cms);
function cmp(facility, bench, lowerIsBetter) {
  if (facility === null || bench === null) return "unknown";
  if (facility === bench) return "even";
  const lower = facility < bench;
  return lowerIsBetter ? (lower ? "better" : "worse") : lower ? "worse" : "better";
}

// ── Brand banner (HARDCODED — never replaced by facility name) ──
function Banner({ state }) {
  return (
    <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <svg width="34" height="30" viewBox="0 0 34 30" aria-hidden>
          <defs>
            <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={C.magenta} />
              <stop offset="60%" stopColor={C.violet} />
              <stop offset="100%" stopColor={C.cyan} />
            </linearGradient>
          </defs>
          <path d="M17 27C7 20 1 14 1 8.2 1 4.2 4.2 1 8.2 1c2.9 0 5.6 1.7 6.8 4.3h4C20.2 2.7 22.9 1 25.8 1 29.8 1 33 4.2 33 8.2 33 14 27 20 17 27z"
            fill="none" stroke="url(#hg)" strokeWidth="2" />
        </svg>
        <span style={{ fontFamily: display, fontWeight: 700, fontSize: 30, letterSpacing: 1,
          background: C.grad, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
          INFINITE
        </span>
      </div>
      <div style={{ fontSize: 13, color: C.slate, marginTop: 2 }}>
        Managed by <strong style={{ color: C.violet }}>MEDELITE</strong>
      </div>
      <div style={{ fontFamily: display, fontWeight: 700, fontSize: 16, marginTop: 14, letterSpacing: 0.5 }}>
        FACILITY ASSESSMENT SNAPSHOT
      </div>
      <div style={{ fontFamily: mono, fontWeight: 600, fontSize: 14, color: C.ink, marginTop: 2 }}>
        {state || "—"}
      </div>
    </div>
  );
}

function Stars({ value }) {
  if (value === null) return <span style={{ color: C.slate }}>Not rated</span>;
  return (
    <span style={{ letterSpacing: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: i <= value ? C.violet : C.hair, fontSize: 15 }}>★</span>
      ))}
      <span style={{ fontFamily: mono, fontSize: 12, color: C.slate, marginLeft: 6 }}>{value}/5</span>
    </span>
  );
}

function Row({ label, children, mono: m }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(180px,42%) 1fr", borderTop: `1px solid ${C.hair}` }}>
      <div style={{ padding: "9px 14px", fontWeight: 600, fontSize: 13 }}>{label}</div>
      <div style={{ padding: "9px 14px", fontSize: 13, fontStyle: m ? "italic" : "normal", color: m ? C.slate : C.ink,
        fontFamily: m ? body : body }}>{children}</div>
    </div>
  );
}

function MetricCard({ m }) {
  const vN = cmp(m.facility, m.national, m.lowerIsBetter);
  const vS = cmp(m.facility, m.state, m.lowerIsBetter);
  const tone = (c) => (c === "better" ? C.better : c === "worse" ? C.worse : C.slate);
  return (
    <div style={{ border: `1px solid ${C.hair}`, borderRadius: 12, padding: 14, background: "#fff" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.slate, textTransform: "uppercase", letterSpacing: 0.05 }}>
        {m.label}
      </div>
      <div style={{ fontFamily: mono, fontSize: 26, fontWeight: 600, margin: "4px 0 8px" }}>
        {fmt(m.facility, m.unit)}
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
        <span>Nat'l <strong style={{ color: tone(vN) }}>{fmt(m.national, m.unit)}</strong></span>
        <span>State <strong style={{ color: tone(vS) }}>{fmt(m.state, m.unit)}</strong></span>
      </div>
    </div>
  );
}

export default function MedeliteDemo() {
  const [ccn, setCcn] = useState("686123");
  const [report, setReport] = useState(SAMPLE_686123);
  const [status, setStatus] = useState("seed"); // seed | loading | live | error
  const [error, setError] = useState("");
  const [manual, setManual] = useState({
    nameOverride: "", emr: "PCC", currentCensus: "112",
    patientType: "Long-term & Short-term", previousCoverage: "Yes",
    previousPerformance: "About 30 patients/day", medicalCoverage: "Optometry, PCP, Podiatry",
  });

  const displayName = resolveName(report?.cmsName ?? "", manual.nameOverride);
  const censusCapacity = report?.certifiedBeds ?? null;

  async function lookup(value) {
    const code = (value ?? ccn).trim().toUpperCase();
    if (!/^[A-Za-z0-9]{6}$/.test(code)) {
      setStatus("error"); setError("CCN must be exactly 6 letters/digits.");
      return;
    }
    setStatus("loading"); setError("");
    try {
      const r = await buildReport(code);
      setReport(r); setStatus("live");
    } catch (e) {
      // Fall back to the seeded sample if it's the known demo CCN.
      if (code === "686123") {
        setReport(SAMPLE_686123); setStatus("seed");
        setError("Live CMS fetch blocked here — showing the bundled 686123 sample. In the deployed app this loads live.");
      } else {
        setStatus("error");
        setError(e.code === 404 ? `No facility found for CCN ${code}.` : "Couldn't reach CMS for this CCN from the demo sandbox. The deployed app fetches server-side.");
      }
    }
  }

  const fieldStyle = {
    width: "100%", padding: "8px 10px", border: `1.4px solid ${C.hair}`,
    borderRadius: 8, fontSize: 13, marginTop: 4, background: "#fcfbfd", color: C.ink,
  };
  const labelStyle = { display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase",
    letterSpacing: 0.06, color: C.slate, marginBottom: 2 };

  const shortMetrics = useMemo(() => report?.metrics.filter((m) => m.stay === "short") ?? [], [report]);
  const longMetrics = useMemo(() => report?.metrics.filter((m) => m.stay === "long") ?? [], [report]);

  return (
    <div style={{ fontFamily: body, color: C.ink, background: C.bg, padding: "26px 20px", borderRadius: 14 }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500&family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet" />

      {/* App header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: display, fontWeight: 700, fontSize: 18 }}>Facility Assessment Report Generator</div>
          <div style={{ fontSize: 12.5, color: C.slate }}>Live CMS Provider Data Catalog lookup → branded snapshot</div>
        </div>
        <span style={{ fontSize: 11, fontFamily: mono, padding: "4px 10px", borderRadius: 20,
          background: status === "live" ? "#e9f8f0" : "#f0edf9",
          color: status === "live" ? C.better : C.violet, border: `1px solid ${C.hair}` }}>
          {status === "live" ? "LIVE CMS DATA" : status === "loading" ? "FETCHING…" : "SAMPLE DATA"}
        </span>
      </div>

      {/* Lookup */}
      <div style={{ background: "#fff", border: `1px solid ${C.hair}`, borderRadius: 14, padding: 18 }}>
        <label style={labelStyle}>CMS Certification Number (CCN)</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={ccn}
            onChange={(e) => setCcn(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
            placeholder="686123"
            style={{ flex: 1, minWidth: 160, fontFamily: mono, fontSize: 19, letterSpacing: 4,
              padding: "10px 14px", border: `1.5px solid ${C.hair}`, borderRadius: 10, background: "#fcfbfd" }}
          />
          <button onClick={() => lookup()} disabled={status === "loading"}
            style={{ border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 600, fontSize: 14,
              color: "#fff", background: C.grad, boxShadow: "0 6px 16px rgba(229,20,126,0.25)",
              opacity: status === "loading" ? 0.6 : 1, cursor: status === "loading" ? "progress" : "pointer" }}>
            {status === "loading" ? "Looking up…" : "Generate snapshot"}
          </button>
        </div>
        <div style={{ fontSize: 12.5, color: C.slate, marginTop: 10 }}>
          Try the sample:{" "}
          <button onClick={() => { setCcn("686123"); lookup("686123"); }}
            style={{ background: "none", border: "none", padding: 0, color: C.magenta, font: "inherit", textDecoration: "underline", cursor: "pointer" }}>
            686123 — Kendall Lakes (FL)
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 12, background: status === "error" ? "#fdecef" : "#fff8e8",
            border: `1px solid ${status === "error" ? "#f6c6d2" : "#f3e0a8"}`,
            color: status === "error" ? C.worse : "#8a6d1a", borderRadius: 10, padding: "9px 13px", fontSize: 12.5 }}>
            {error}
          </div>
        )}
      </div>

      {report && status !== "error" && (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 22, marginTop: 22, alignItems: "start" }}>
          {/* Manual inputs */}
          <div style={{ background: "#fff", border: `1px solid ${C.hair}`, borderRadius: 14, padding: 18 }}>
            <div style={{ fontFamily: display, fontSize: 15, fontWeight: 700 }}>Operational inputs</div>
            <div style={{ fontSize: 12, color: C.slate, margin: "2px 0 14px" }}>
              Not in CMS public data — supplied by your team.
            </div>
            {[
              ["nameOverride", "Facility name override (optional)"],
              ["emr", "EMR"],
              ["currentCensus", "Current census"],
              ["patientType", "Type of patient"],
              ["previousPerformance", "Previous provider performance"],
              ["medicalCoverage", "Medical coverage"],
            ].map(([k, lbl]) => (
              <div key={k} style={{ marginBottom: 12 }}>
                <label style={labelStyle}>{lbl}</label>
                <input value={manual[k]} onChange={(e) => setManual({ ...manual, [k]: e.target.value })} style={fieldStyle} />
              </div>
            ))}
            <div style={{ marginBottom: 4 }}>
              <label style={labelStyle}>Previous coverage from Medelite</label>
              <select value={manual.previousCoverage}
                onChange={(e) => setManual({ ...manual, previousCoverage: e.target.value })} style={fieldStyle}>
                <option value="">—</option><option value="Yes">Yes</option><option value="No">No</option>
              </select>
            </div>
          </div>

          {/* Snapshot preview */}
          <div style={{ background: "#fff", border: `1px solid ${C.hair}`, borderRadius: 14, padding: "20px 22px" }}>
            <Banner state={report.state} />

            <div style={{ border: `1px solid ${C.hair}`, borderRadius: 10, overflow: "hidden", marginTop: 4 }}>
              <Row label="Name of Facility">{displayName}</Row>
              <Row label="Location" mono>{fullAddress(report)}</Row>
              <Row label="EMR" mono>{manual.emr || "—"}</Row>
              <Row label="Census Capacity" mono>{censusCapacity ?? "—"}</Row>
              <Row label="Current Census" mono>{manual.currentCensus || "—"}</Row>
              <Row label="Type of Patient" mono>{manual.patientType || "—"}</Row>
              <Row label="Previous Coverage from Medelite" mono>{manual.previousCoverage || "—"}</Row>
              <Row label="Previous Provider Performance from Medelite" mono>{manual.previousPerformance || "—"}</Row>
              <Row label="Medical Coverage" mono>{manual.medicalCoverage || "—"}</Row>
              <Row label="Overall Star Rating"><Stars value={report.ratings.overall} /></Row>
              <Row label="Health Inspection"><Stars value={report.ratings.healthInspection} /></Row>
              <Row label="Staffing"><Stars value={report.ratings.staffing} /></Row>
              <Row label="Quality of Resident Care"><Stars value={report.ratings.qualityOfResidentCare} /></Row>
            </div>

            {/* Metric cards */}
            <div style={{ marginTop: 18 }}>
              <div style={{ fontFamily: display, fontSize: 13, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.06, marginBottom: 8 }}>
                Short-stay measures
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {shortMetrics.map((m) => <MetricCard key={m.label} m={m} />)}
              </div>
              <div style={{ fontFamily: display, fontSize: 13, fontWeight: 700, color: C.slate, textTransform: "uppercase", letterSpacing: 0.06, margin: "16px 0 8px" }}>
                Long-stay measures
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {longMetrics.map((m) => <MetricCard key={m.label} m={m} />)}
              </div>
            </div>

            {report.warnings.length > 0 && (
              <div style={{ marginTop: 14, background: "#fff8e8", border: "1px solid #f3e0a8", color: "#8a6d1a",
                borderRadius: 10, padding: "9px 13px", fontSize: 12 }}>
                {report.warnings.join(" ")}
              </div>
            )}

            {/* Export row (demo: real app emits PDF + DOCX) */}
            <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: C.slate }}>In the deployed app:</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, border: `1.4px solid ${C.hair}`, borderRadius: 8, padding: "6px 12px" }}>⬇ Export PDF</span>
              <span style={{ fontSize: 12.5, fontWeight: 600, border: `1.4px solid ${C.hair}`, borderRadius: 8, padding: "6px 12px" }}>⬇ Export Word</span>
              <a href={report.medicareUrl} target="_blank" rel="noreferrer"
                style={{ fontSize: 12.5, color: C.magenta, marginLeft: "auto" }}>
                View on Medicare Care Compare ↗
              </a>
            </div>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: C.slate, marginTop: 18, textAlign: "center" }}>
        Source: CMS Provider Data Catalog (public domain). Branding banner is fixed; facility name appears only in the body.
      </div>

      <style>{`
        @media (max-width: 760px) {
          div[style*="grid-template-columns: 320px"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
