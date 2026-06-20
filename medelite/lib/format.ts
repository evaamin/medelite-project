import type { FacilityReport, ManualInputs, MetricLine } from "./types";

/** Format a metric value with its unit. Returns "—" for missing data. */
export function formatMetric(value: number | null, unit: MetricLine["unit"]): string {
  if (value === null) return "—";
  if (unit === "%") return `${value.toFixed(1)}%`;
  return value.toFixed(2);
}

/** Full one-line address: "5280 SW 157th Ave, Miami, FL 33193". */
export function formatAddress(r: Pick<FacilityReport, "address" | "city" | "state" | "zip">): string {
  const tail = [r.city, r.state].filter(Boolean).join(", ");
  return [r.address, tail, r.zip].filter(Boolean).join(", ").replace(/, ,/g, ",");
}

/** Resolve the display name: manual override wins, else the CMS name. */
export function resolveDisplayName(cmsName: string, override: string): string {
  return override.trim() ? override.trim() : cmsName;
}

/** Is the facility doing better than a given benchmark on a "lower is better" line? */
export function comparison(
  facility: number | null,
  benchmark: number | null,
  lowerIsBetter: boolean
): "better" | "worse" | "even" | "unknown" {
  if (facility === null || benchmark === null) return "unknown";
  if (facility === benchmark) return "even";
  const facilityIsLower = facility < benchmark;
  if (lowerIsBetter) return facilityIsLower ? "better" : "worse";
  return facilityIsLower ? "worse" : "better";
}

export const EMPTY_MANUAL: ManualInputs = {
  nameOverride: "",
  emr: "",
  currentCensus: "",
  patientType: "",
  previousCoverage: "",
  previousPerformance: "",
  medicalCoverage: "",
};
