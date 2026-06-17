"use client";

import { useEffect, useState } from "react";
import { STAGE_LABELS, type Engagement } from "@/lib/schemas";

const COLUMN_CHOICES = [1, 2, 3] as const;
const COLUMNS_STORAGE_KEY = "card-cols:engagements";

/**
 * Compact card grid for the engagement list, with a 1/2/3-column toggle
 * remembered in localStorage. Mirrors the template-page card grid
 * (SortableCards) but without drag-reorder — engagements have no fixed order.
 */
export function EngagementGrid({ engagements }: { engagements: Engagement[] }) {
  const [cols, setCols] = useState<1 | 2 | 3>(2);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
      const n = Number(raw);
      if (n === 1 || n === 2 || n === 3) setCols(n);
    } catch {
      /* storage may be unavailable; the in-memory default still works */
    }
  }, []);

  function persistCols(n: 1 | 2 | 3) {
    setCols(n);
    try {
      window.localStorage.setItem(COLUMNS_STORAGE_KEY, String(n));
    } catch {
      /* ignore unavailable storage */
    }
  }

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
