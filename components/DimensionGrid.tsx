"use client";

import { IMPACT_DIMENSIONS, type ImpactDimension } from "@/lib/schemas";
import type { DashboardKpi } from "@/lib/metrics";
import { DIMENSION_LABELS, formatKpi, delta } from "@/lib/metrics-format";
import { useColumnPreference, type ColumnCount } from "@/lib/useColumnPreference";

const COLUMN_CHOICES: ColumnCount[] = [1, 2, 3];

/** Group KPIs by engagement, preserving first-seen order, so units stay separate. */
function groupByEngagement(kpis: DashboardKpi[]): Array<{ name: string; kpis: DashboardKpi[] }> {
  const groups: Array<{ name: string; kpis: DashboardKpi[] }> = [];
  for (const k of kpis) {
    let g = groups.find((x) => x.name === k.engagementName);
    if (!g) {
      g = { name: k.engagementName, kpis: [] };
      groups.push(g);
    }
    g.kpis.push(k);
  }
  return groups;
}

/**
 * The four-dimension impact section: one accent card per impact dimension, laid out
 * as a compact card grid with a 1/2/3-column toggle, matching the home and template
 * pages. Data is fetched server-side and passed in.
 */
export function DimensionGrid({ dimensions }: { dimensions: Record<ImpactDimension, DashboardKpi[]> }) {
  const [cols, setCols] = useColumnPreference("card-cols:dimensions", 2);

  return (
    <div className="stack">
      <div className="card-cols-toggle" role="group" aria-label="Columns">
        {COLUMN_CHOICES.map((n) => (
          <button
            key={n}
            type="button"
            className={`btn${cols === n ? " btn--primary" : ""}`}
            aria-pressed={cols === n}
            aria-label={`${n} column${n > 1 ? "s" : ""}`}
            onClick={() => setCols(n)}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="card-grid" style={{ ["--cols" as string]: cols }}>
        {IMPACT_DIMENSIONS.map((dim) => {
          const kpis = dimensions[dim];
          return (
            <div key={dim} className="card card--accent stack">
              <p className="t-system">{DIMENSION_LABELS[dim]}</p>
              {kpis.length === 0 ? (
                <p className="t-faint">No measures yet.</p>
              ) : (
                groupByEngagement(kpis).map((group) => (
                  <div key={group.name} className="stack" style={{ gap: "var(--space-2)" }}>
                    <span className="t-faint t-system">{group.name}</span>
                    {group.kpis.map((k) => {
                      const dl = delta(k);
                      return (
                        <div key={`${k.engagementId}-${k.id}`} className="stack" style={{ gap: "var(--space-1)" }}>
                          <span className="t-display">{formatKpi(k.current, k.unit)}</span>
                          <span className="t-subhead">{k.label}</span>
                          <span className={`t-system ${dl.cls}`}>
                            {dl.text} · baseline {formatKpi(k.baseline, k.unit)} → target {formatKpi(k.target, k.unit)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
