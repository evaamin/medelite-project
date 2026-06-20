"use client";

import type { RenderModel } from "@/lib/types";
import { formatAddress, formatMetric, comparison } from "@/lib/format";
import { StarRating } from "./StarRating";
import { BrandingBanner } from "./BrandingBanner";
import { MetricsChart } from "./MetricsChart";

export function ReportPreview({ model }: { model: RenderModel }) {
  const { report, manual, displayName } = model;
  const short = report.metrics.filter((m) => m.stay === "short");
  const long = report.metrics.filter((m) => m.stay === "long");

  return (
    <article className="report-surface" aria-label="Report preview">
      <BrandingBanner state={report.state} />

      <section className="kv-table">
        <Row label="Name of Facility" value={displayName} emphasize />
        <Row label="Location" value={formatAddress(report)} />
        <Row label="EMR" value={manual.emr} />
        <Row label="Census Capacity" value={report.certifiedBeds?.toString() ?? null} hint="CMS certified beds" />
        <Row label="Current Census" value={manual.currentCensus} />
        <Row label="Type of Patient" value={manual.patientType} />
        <Row label="Previous Coverage from Medelite" value={manual.previousCoverage} />
        <Row label="Previous Provider Performance" value={manual.previousPerformance} />
        <Row label="Medical Coverage" value={manual.medicalCoverage} />
      </section>

      <h3 className="sec-head">CMS Five-Star Ratings</h3>
      <section className="kv-table">
        <Row label="Overall Star Rating" node={<StarRating value={report.ratings.overall} />} />
        <Row label="Health Inspection" node={<StarRating value={report.ratings.healthInspection} />} />
        <Row label="Staffing" node={<StarRating value={report.ratings.staffing} />} />
        <Row label="Quality of Resident Care" node={<StarRating value={report.ratings.qualityOfResidentCare} />} />
      </section>

      <h3 className="sec-head">Hospitalization &amp; ED Metrics</h3>
      <div className="metric-cards">
        {[...short, ...long].map((m) => {
          const vs = comparison(m.facility, m.national, m.lowerIsBetter);
          return (
            <div key={m.label} className={`metric-card vs-${vs}`}>
              <div className="metric-tag">{m.stay === "short" ? "STR" : "LT"}</div>
              <div className="metric-label">{m.label}</div>
              <div className="metric-facility">{formatMetric(m.facility, m.unit)}</div>
              <div className="metric-bench">
                <span>Nat&apos;l {formatMetric(m.national, m.unit)}</span>
                <span>State {formatMetric(m.state, m.unit)}</span>
              </div>
              {vs !== "unknown" && (
                <div className={`metric-flag ${vs}`}>
                  {vs === "better" ? "Below national avg" : vs === "worse" ? "Above national avg" : "At national avg"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <MetricsChart metrics={report.metrics} />

      <p className="source-line">
        Source:{" "}
        <a href={report.medicareUrl} target="_blank" rel="noreferrer">
          Medicare Care Compare — official profile (CCN {report.ccn})
        </a>
      </p>

      {report.warnings.length > 0 && (
        <div className="warn-box" role="status">
          {report.warnings.map((w) => (
            <div key={w}>⚠ {w}</div>
          ))}
        </div>
      )}
    </article>
  );
}

function Row({
  label,
  value,
  node,
  hint,
  emphasize,
}: {
  label: string;
  value?: string | null;
  node?: React.ReactNode;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div className="kv-row">
      <div className="kv-label">
        {label}
        {hint ? <span className="kv-hint">{hint}</span> : null}
      </div>
      <div className={`kv-value${emphasize ? " emphasize" : ""}`}>
        {node ?? (value && value.trim() ? value : <span className="kv-blank">—</span>)}
      </div>
    </div>
  );
}
