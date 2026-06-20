// Shared types for the Facility Assessment Report Generator.

/** A single hospitalization / ED metric line with its benchmarks. */
export interface MetricLine {
  /** Clean, Medelite-facing label (e.g. "Short Term Hospitalization"). */
  label: string;
  /** Stay type, used for grouping in the UI. */
  stay: "short" | "long";
  /** Whether this line is a hospitalization or an ED-visit metric. */
  kind: "hospitalization" | "ed";
  /** The facility's own value. null when CMS has no value (footnoted/suppressed). */
  facility: number | null;
  /** National average for the same measure. */
  national: number | null;
  /** State average for the same measure. */
  state: number | null;
  /** "%" for short-stay percentages, "per 1k" for long-stay rates. */
  unit: "%" | "per 1k";
  /** For percentages/rates: a lower facility value than the benchmark is better. */
  lowerIsBetter: boolean;
}

/** The four CMS Five-Star ratings (1-5, or null when not rated). */
export interface StarRatings {
  overall: number | null;
  healthInspection: number | null;
  staffing: number | null;
  qualityOfResidentCare: number | null;
}

/** Everything the report needs, normalized from the raw CMS payloads. */
export interface FacilityReport {
  ccn: string;
  /** Official legal/provider name from CMS (before any manual override). */
  cmsName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  /** "Number of Certified Beds" -> Census Capacity. */
  certifiedBeds: number | null;
  /** "Average Number of Residents per Day" (used as a fallback census hint). */
  avgResidentsPerDay: number | null;
  ownershipType: string | null;
  providerType: string | null;
  ratings: StarRatings;
  /** Up to 12 metric lines (4 measures x facility/national/state). */
  metrics: MetricLine[];
  /** Dynamic Medicare Care Compare deep link. */
  medicareUrl: string;
  /** CMS data processing date, surfaced for transparency. */
  processingDate: string | null;
  /** Per-source warnings (e.g. averages dataset unreachable) for graceful UX. */
  warnings: string[];
}

/** Manual operational inputs the user supplies (not in CMS public data). */
export interface ManualInputs {
  nameOverride: string;
  emr: string;
  currentCensus: string;
  patientType: string;
  previousCoverage: "Yes" | "No" | "";
  previousPerformance: string;
  medicalCoverage: string;
}

/** The final merged shape passed to the PDF / DOCX / preview renderers. */
export interface RenderModel {
  report: FacilityReport;
  manual: ManualInputs;
  /** Resolved display name: override if present, else CMS name. */
  displayName: string;
}
