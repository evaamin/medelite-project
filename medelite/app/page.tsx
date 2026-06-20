"use client";

import { useMemo, useState } from "react";
import type { FacilityReport, ManualInputs, RenderModel } from "@/lib/types";
import { EMPTY_MANUAL, resolveDisplayName } from "@/lib/format";
import { ReportPreview } from "@/components/ReportPreview";

type Status = "idle" | "loading" | "ready" | "error";

export default function Home() {
  const [ccn, setCcn] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");
  const [report, setReport] = useState<FacilityReport | null>(null);
  const [manual, setManual] = useState<ManualInputs>(EMPTY_MANUAL);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);

  const model: RenderModel | null = useMemo(() => {
    if (!report) return null;
    return {
      report,
      manual,
      displayName: resolveDisplayName(report.cmsName, manual.nameOverride),
    };
  }, [report, manual]);

  async function lookup(e?: React.FormEvent) {
    e?.preventDefault();
    const clean = ccn.trim().toUpperCase();
    if (!/^[A-Za-z0-9]{6}$/.test(clean)) {
      setStatus("error");
      setError("Enter a valid 6-character CCN, like 686123.");
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const res = await fetch(`/api/facility/${clean}`);
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setError(data?.message ?? "Lookup failed. Please try again.");
        setReport(null);
        return;
      }
      const r = data as FacilityReport;
      setReport(r);
      // Prefill current census with CMS average residents/day as a sensible default.
      setManual({
        ...EMPTY_MANUAL,
        currentCensus: r.avgResidentsPerDay ? String(Math.round(r.avgResidentsPerDay)) : "",
      });
      setStatus("ready");
    } catch {
      setStatus("error");
      setError("Couldn't reach the server. Check your connection and retry.");
    }
  }

  function set<K extends keyof ManualInputs>(key: K, value: ManualInputs[K]) {
    setManual((m) => ({ ...m, [key]: value }));
  }

  async function onExport(kind: "pdf" | "docx") {
    if (!model) return;
    setExporting(kind);
    try {
      if (kind === "pdf") {
        const { downloadPdf } = await import("@/lib/pdf");
        await downloadPdf(model);
      } else {
        const { downloadDocx } = await import("@/lib/docx");
        await downloadDocx(model);
      }
    } catch {
      setError(`Couldn't generate the ${kind.toUpperCase()}. Please try again.`);
      setStatus("error");
    } finally {
      setExporting(null);
    }
  }

  return (
    <main className="app">
      <div className="app-head">
        <div className="app-brand">
          <span className="app-mark" aria-hidden />
          <span className="app-name">INFINITE</span>
          <span className="app-sub">managed by Medelite</span>
        </div>
        <p className="app-tagline">Facility Assessment Report Generator</p>
      </div>

      <form className="lookup" onSubmit={lookup}>
        <label htmlFor="ccn" className="lookup-label">
          CMS Certification Number
        </label>
        <div className="lookup-row">
          <input
            id="ccn"
            inputMode="numeric"
            autoComplete="off"
            placeholder="686123"
            value={ccn}
            maxLength={6}
            onChange={(e) => setCcn(e.target.value.replace(/\s/g, ""))}
            className="lookup-input"
          />
          <button className="btn-primary" type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Looking up…" : "Look up facility"}
          </button>
        </div>
        <p className="lookup-hint">
          Try <button type="button" className="link-inline" onClick={() => setCcn("686123")}>686123</button> — Kendall Lakes Healthcare and Rehab Center (FL)
        </p>
      </form>

      {status === "error" && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      {status === "ready" && report && model && (
        <div className="workspace">
          <section className="inputs-panel">
            <h2 className="panel-title">Operational inputs</h2>
            <p className="panel-note">
              These live outside CMS public data. The report updates as you type.
            </p>

            <Field label="Facility name override" hint="Defaults to the official CMS name">
              <input
                className="text-input"
                placeholder={report.cmsName}
                value={manual.nameOverride}
                onChange={(e) => set("nameOverride", e.target.value)}
              />
            </Field>

            <Field label="EMR">
              <input className="text-input" placeholder="PCC, MatrixCare…" value={manual.emr} onChange={(e) => set("emr", e.target.value)} />
            </Field>

            <Field label="Current census">
              <input className="text-input" inputMode="numeric" placeholder="112" value={manual.currentCensus} onChange={(e) => set("currentCensus", e.target.value)} />
            </Field>

            <Field label="Type of patient">
              <input className="text-input" placeholder="Long-term & Short-term" value={manual.patientType} onChange={(e) => set("patientType", e.target.value)} />
            </Field>

            <Field label="Previous coverage from Medelite">
              <select className="text-input" value={manual.previousCoverage} onChange={(e) => set("previousCoverage", e.target.value as ManualInputs["previousCoverage"])}>
                <option value="">Select…</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </Field>

            <Field label="Previous provider performance">
              <input className="text-input" placeholder="About 30 patients/day" value={manual.previousPerformance} onChange={(e) => set("previousPerformance", e.target.value)} />
            </Field>

            <Field label="Medical coverage">
              <input className="text-input" placeholder="Optometry, PCP, Podiatry" value={manual.medicalCoverage} onChange={(e) => set("medicalCoverage", e.target.value)} />
            </Field>

            <div className="export-row">
              <button className="btn-primary" onClick={() => onExport("pdf")} disabled={exporting !== null}>
                {exporting === "pdf" ? "Building PDF…" : "Download PDF"}
              </button>
              <button className="btn-ghost" onClick={() => onExport("docx")} disabled={exporting !== null}>
                {exporting === "docx" ? "Building Word…" : "Download Word (.docx)"}
              </button>
            </div>
          </section>

          <div className="preview-panel">
            <ReportPreview model={model} />
          </div>
        </div>
      )}

      {status === "idle" && (
        <div className="empty-state">
          <p>Enter a facility&apos;s CCN to pull its CMS profile, layer in your operational notes, and export a branded snapshot.</p>
        </div>
      )}
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint ? <span className="field-hint">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
