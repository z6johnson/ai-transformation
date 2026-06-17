/**
 * Pure, client-safe display helpers for dashboard measures. Kept separate from
 * lib/metrics.ts (which is server-only — it imports lib/github) so client
 * components can use them without pulling server code into the bundle.
 */
import type { BaselineKpi, ImpactDimension } from "./schemas";

export const DIMENSION_LABELS: Record<ImpactDimension, string> = {
  "operational-capacity": "Operational capacity",
  "institutional-readiness": "Institutional readiness",
  "risk-reduction": "Risk reduction",
  "system-level-influence": "System-level influence",
};

/** Format a KPI value for display given its unit. */
export function formatKpi(value: number | null, unit: BaselineKpi["unit"]): string {
  if (value === null || Number.isNaN(value)) return "—";
  switch (unit) {
    case "ratio":
      return `${Math.round(value * 100)}%`;
    case "percent":
      return `${value}%`;
    case "hours":
      return `${value} h`;
    case "days":
      return `${value} d`;
    default:
      return `${value}`;
  }
}

/** Direction of travel from baseline to current, relative to the KPI's better direction. */
export function delta(k: Pick<BaselineKpi, "current" | "baseline" | "betterDirection">): {
  text: string;
  cls: string;
} {
  if (k.current === null || k.baseline === null) return { text: "—", cls: "" };
  const diff = k.current - k.baseline;
  const improved = k.betterDirection === "up" ? diff > 0 : diff < 0;
  const word = diff === 0 ? "no change" : improved ? "improving" : "worsening";
  return { text: word, cls: diff === 0 ? "" : improved ? "delta-up" : "delta-down" };
}
