"use client";

import { STAGE_LABELS, type Engagement } from "@/lib/schemas";
import { useColumnPreference, type ColumnCount } from "@/lib/useColumnPreference";

const COLUMN_CHOICES: ColumnCount[] = [1, 2, 3];

/**
 * Compact card grid for the engagement list, with a 1/2/3-column toggle
 * remembered in localStorage. Mirrors the template-page card grid
 * (SortableCards) but without drag-reorder — engagements have no fixed order.
 */
export function EngagementGrid({ engagements }: { engagements: Engagement[] }) {
  const [cols, persistCols] = useColumnPreference("card-cols:engagements", 2);

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
            onClick={() => persistCols(n)}
          >
            {n}
          </button>
        ))}
      </div>

      <ul className="card-grid" style={{ ["--cols" as string]: cols, listStyle: "none", padding: 0 }}>
        {engagements.map((e) => (
          <li key={e.id} className="card card--accent">
            <div className="stack">
              <div className="t-system">{STAGE_LABELS[e.stage] || e.stage}</div>
              <a href={`/engagements/${e.id}`} className="t-subhead">
                {e.name}
              </a>
              <p className="t-muted">{e.service}</p>
              <p className="t-system t-faint">
                Lead {e.lead || "—"} · Owner {e.lifecycleOwner?.name || "—"}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
