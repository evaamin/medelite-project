// CMS Provider Data Catalog data engine.
//
// Queries three public PDC datasets and normalizes them into one FacilityReport:
//   - 4pq5-n9py  Provider Information (name, address, beds, star ratings)
//   - ijh5-nb2v  Medicare Claims Quality Measures (per-facility hospitalization/ED rates)
//   - xcdc-v8bm  State & US Averages (state + national benchmarks)
//
// All requests run server-side (see app/api/facility/[ccn]/route.ts) so the
// browser never hits CMS directly -> no CORS surprises.

import type { FacilityReport, MetricLine, StarRatings } from "./types";

const PDC = "https://data.cms.gov/provider-data/api/1/datastore/query";

export const DATASETS = {
  providerInfo: "4pq5-n9py",
  claims: "ijh5-nb2v",
  stateAverages: "xcdc-v8bm",
} as const;

/** Equality-filtered datastore query. Returns parsed JSON (results + schema). */
async function queryDataset(
  datasetId: string,
  property: string,
  value: string,
  limit = 500
): Promise<{ results: Record<string, string>[]; schema: SchemaFields }> {
  const params = new URLSearchParams();
  params.set("conditions[0][property]", property);
  params.set("conditions[0][operator]", "=");
  params.set("conditions[0][value]", value);
  params.set("limit", String(limit));

  const url = `${PDC}/${datasetId}/0?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    // PDC data refreshes monthly; cache for an hour to stay snappy.
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new CmsError(
      `CMS dataset ${datasetId} returned HTTP ${res.status}.`,
      res.status
    );
  }

  const json = await res.json();
  return {
    results: Array.isArray(json?.results) ? json.results : [],
    schema: extractSchema(json),
  };
}

type SchemaFields = Record<string, { description?: string }>;

/** The DKAN query response nests field metadata under schema[<distId>].fields. */
function extractSchema(json: unknown): SchemaFields {
  const schema = (json as { schema?: Record<string, { fields?: SchemaFields }> })
    ?.schema;
  if (!schema) return {};
  const first = Object.values(schema)[0];
  return first?.fields ?? {};
}

export class CmsError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "CmsError";
    this.status = status;
  }
}

const num = (v: string | undefined | null): number | null => {
  if (v === undefined || v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------------------
// Measure mapping
// ---------------------------------------------------------------------------
// The CMS dictionary uses verbose government names. We map them to Medelite's
// clean labels. Matching is done by keyword + stay type rather than brittle
// numeric codes, so a measure-code increment upstream won't silently break us.

interface MeasureDef {
  label: string;
  stay: "short" | "long";
  kind: "hospitalization" | "ed";
  unit: "%" | "per 1k";
  /** Predicate against a lower-cased measure description from the claims file. */
  matchClaim: (desc: string, residentType: string) => boolean;
  /** Predicate against a lower-cased column description in the averages file. */
  matchAverage: (desc: string) => boolean;
}

const isShort = (rt: string) => rt.includes("short");
const isLong = (rt: string) => rt.includes("long");

export const MEASURES: MeasureDef[] = [
  {
    label: "Short Term Hospitalization",
    stay: "short",
    kind: "hospitalization",
    unit: "%",
    matchClaim: (d, rt) => isShort(rt) && d.includes("rehospitalized"),
    matchAverage: (d) =>
      d.includes("short stay") && d.includes("rehospitalized"),
  },
  {
    label: "Short Term ED Visit",
    stay: "short",
    kind: "ed",
    unit: "%",
    matchClaim: (d, rt) =>
      isShort(rt) &&
      d.includes("outpatient emergency department"),
    matchAverage: (d) =>
      d.includes("short stay") &&
      d.includes("outpatient emergency department"),
  },
  {
    label: "Long Term Hospitalization",
    stay: "long",
    kind: "hospitalization",
    unit: "per 1k",
    matchClaim: (d, rt) =>
      isLong(rt) &&
      d.includes("hospitalizations per 1000"),
    matchAverage: (d) => d.includes("hospitalizations per 1000"),
  },
  {
    label: "Long Term ED Visit",
    stay: "long",
    kind: "ed",
    unit: "per 1k",
    matchClaim: (d, rt) =>
      isLong(rt) &&
      d.includes("outpatient emergency department visits per 1000"),
    matchAverage: (d) =>
      d.includes("outpatient emergency department visits per 1000"),
  },
];

/** Pick the displayed facility value: risk-adjusted preferred, then observed. */
function claimScore(row: Record<string, string>): number | null {
  return num(row.adjusted_score) ?? num(row.observed_score) ?? num(row.score);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function buildFacilityReport(ccn: string): Promise<FacilityReport> {
  // 1) Provider Information — the only required source for the MVP.
  const { results: providerRows } = await queryDataset(
    DATASETS.providerInfo,
    "cms_certification_number_ccn",
    ccn,
    1
  );

  if (providerRows.length === 0) {
    throw new CmsError(`No facility found for CCN ${ccn}.`, 404);
  }

  const p = providerRows[0];
  const state = (p.state ?? "").trim().toUpperCase();
  const warnings: string[] = [];

  const ratings: StarRatings = {
    overall: num(p.overall_rating),
    healthInspection: num(p.health_inspection_rating),
    staffing: num(p.staffing_rating),
    qualityOfResidentCare: num(p.qm_rating),
  };

  // 2) Claims measures (bonus) — facility's own hospitalization/ED rates.
  const facilityValues = new Map<string, number | null>();
  try {
    const { results: claimRows } = await queryDataset(
      DATASETS.claims,
      "cms_certification_number_ccn",
      ccn
    );
    for (const m of MEASURES) {
      const row = claimRows.find((r) =>
        m.matchClaim(
          (r.measure_description ?? "").toLowerCase(),
          (r.resident_type ?? "").toLowerCase()
        )
      );
      facilityValues.set(m.label, row ? claimScore(row) : null);
    }
  } catch {
    warnings.push("Claims-based metrics are temporarily unavailable from CMS.");
  }

  // 3) State & national averages (bonus) — schema-introspective so the very
  //    long CMS column names (which get truncated + hashed in the API) don't
  //    have to be hard-coded.
  const stateAvg = new Map<string, number | null>();
  const nationalAvg = new Map<string, number | null>();
  try {
    const { results: stateRows, schema } = await queryDataset(
      DATASETS.stateAverages,
      "state_or_nation",
      state,
      1
    );
    const { results: nationRows } = await queryDataset(
      DATASETS.stateAverages,
      "state_or_nation",
      "NATION",
      1
    );

    // Build description -> machine-field-name map from the response schema.
    const byDescription = Object.entries(schema).map(([field, meta]) => ({
      field,
      desc: (meta.description ?? field).toLowerCase(),
    }));

    const resolveField = (predicate: (d: string) => boolean) =>
      byDescription.find((c) => predicate(c.desc))?.field ?? null;

    for (const m of MEASURES) {
      const field = resolveField(m.matchAverage);
      stateAvg.set(m.label, field && stateRows[0] ? num(stateRows[0][field]) : null);
      nationalAvg.set(
        m.label,
        field && nationRows[0] ? num(nationRows[0][field]) : null
      );
    }
  } catch {
    warnings.push("State/national benchmarks are temporarily unavailable from CMS.");
  }

  const metrics: MetricLine[] = MEASURES.map((m) => ({
    label: m.label,
    stay: m.stay,
    kind: m.kind,
    unit: m.unit,
    lowerIsBetter: true, // fewer hospitalizations/ED visits is always better
    facility: facilityValues.get(m.label) ?? null,
    state: stateAvg.get(m.label) ?? null,
    national: nationalAvg.get(m.label) ?? null,
  }));

  return {
    ccn,
    cmsName: p.provider_name || p.legal_business_name || "Unknown Facility",
    address: p.provider_address ?? "",
    city: p.citytown ?? "",
    state,
    zip: p.zip_code ?? "",
    certifiedBeds: num(p.number_of_certified_beds),
    avgResidentsPerDay: num(p.average_number_of_residents_per_day),
    ownershipType: p.ownership_type || null,
    providerType: p.provider_type || null,
    ratings,
    metrics,
    medicareUrl: medicareCareCompareUrl(ccn, state),
    processingDate: p.processing_date || null,
    warnings,
  };
}

/** Dynamic Care Compare deep link, e.g. .../nursing-home/686123/view-all?state=FL */
export function medicareCareCompareUrl(ccn: string, state?: string): string {
  const base = `https://www.medicare.gov/care-compare/details/nursing-home/${ccn}/view-all`;
  return state ? `${base}?state=${state}` : base;
}
