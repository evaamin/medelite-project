"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { MetricLine } from "@/lib/types";

/**
 * Short-stay (%) and long-stay (per-1k) measures live on different scales, so
 * we render two small charts rather than one misleading axis.
 */
export function MetricsChart({ metrics }: { metrics: MetricLine[] }) {
  const short = metrics.filter((m) => m.stay === "short");
  const long = metrics.filter((m) => m.stay === "long");

  return (
    <div className="chart-grid">
      <ChartPanel title="Short-stay (STR) — % of residents" suffix="%" rows={short} />
      <ChartPanel title="Long-stay (LT) — per 1,000 resident days" suffix="" rows={long} />
    </div>
  );
}

function ChartPanel({
  title,
  rows,
  suffix,
}: {
  title: string;
  rows: MetricLine[];
  suffix: string;
}) {
  const data = rows.map((m) => ({
    name: m.kind === "ed" ? "ED Visit" : "Hospitalization",
    Facility: m.facility ?? 0,
    National: m.national ?? 0,
    State: m.state ?? 0,
  }));

  return (
    <figure className="chart-panel">
      <figcaption className="chart-title">{title}</figcaption>
      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="2 4" stroke="#EDEAF1" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#5A5566" }} tickLine={false} axisLine={{ stroke: "#E7E4EC" }} />
          <YAxis tick={{ fontSize: 11, fill: "#5A5566" }} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(v: number) => `${v}${suffix}`}
            contentStyle={{ borderRadius: 10, border: "1px solid #E7E4EC", fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Facility" fill="#E5147E" radius={[3, 3, 0, 0]} />
          <Bar dataKey="National" fill="#7B2FF7" radius={[3, 3, 0, 0]} />
          <Bar dataKey="State" fill="#21C7E8" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
