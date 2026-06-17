"use client";

import { useState, type ReactNode } from "react";
import { useColumnPreference } from "@/lib/useColumnPreference";

/**
 * Reusable compact card grid for a list of editor entries (journey stages,
 * process steps, …). Cards are drag-sortable and keyboard-reorderable, and the
 * grid lays out in 1/2/3 columns via a user toggle.
 *
 * Reordering is SEMANTIC: it calls `onReorder(next)` so the parent mutates its
 * real array state (and thus persists order on save). Only the column count is a
 * cosmetic preference, remembered per editor in localStorage.
 */
export type SortableCardsProps<T> = {
  items: T[];
  /** Stable key per item, for DnD targeting and React keys. */
  getKey: (item: T, index: number) => string;
  /** Card body fields supplied by the parent editor. */
  renderCard: (item: T, index: number) => ReactNode;
  /** Replace the parent's array with the reordered one. */
  onReorder: (next: T[]) => void;
  /** Optional per-card remove. */
  onRemove?: (index: number) => void;
  /** Human label for aria, e.g. "Stage 1". */
  cardLabel: (item: T, index: number) => string;
  /** Optional per-card heading, rendered inside the <fieldset>. */
  legend?: (item: T, index: number) => ReactNode;
  /** localStorage key for the column preference, e.g. "card-cols:journey:<id>". */
  columnsStorageKey: string;
  defaultColumns?: 1 | 2 | 3;
};

const COLUMN_CHOICES = [1, 2, 3] as const;

export function SortableCards<T>({
  items,
  getKey,
  renderCard,
  onReorder,
  onRemove,
  cardLabel,
  legend,
  columnsStorageKey,
  defaultColumns = 2,
}: SortableCardsProps<T>) {
  const [cols, persistCols] = useColumnPreference(columnsStorageKey, defaultColumns);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  function move(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[index], next[to]] = [next[to], next[index]];
    onReorder(next);
  }

  function dropOnto(targetKey: string) {
    if (dragKey === null || dragKey === targetKey) return;
    const from = items.findIndex((it, i) => getKey(it, i) === dragKey);
    const to = items.findIndex((it, i) => getKey(it, i) === targetKey);
    if (from < 0 || to < 0) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next);
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

      <div className="card-grid" style={{ ["--cols" as string]: cols }}>
        {items.map((item, i) => {
          const key = getKey(item, i);
          return (
            <fieldset
              key={key}
              className={`card card--accent stack card-grid__item${overKey === key ? " is-over" : ""}${dragKey === key ? " is-dragging" : ""}`}
              draggable
              onDragStart={() => setDragKey(key)}
              onDragEnd={() => {
                setDragKey(null);
                setOverKey(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (overKey !== key) setOverKey(key);
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropOnto(key);
                setOverKey(null);
              }}
            >
              <div className="card-grid__bar">
                <span className="card-grid__handle t-system" aria-hidden="true" title="Drag to reorder">
                  ⠿
                </span>
                {legend?.(item, i)}
                <span className="card-grid__controls">
                  <button
                    type="button"
                    className="btn btn--text"
                    disabled={i === 0}
                    aria-label={`Move ${cardLabel(item, i)} up`}
                    onClick={() => move(i, -1)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="btn btn--text"
                    disabled={i === items.length - 1}
                    aria-label={`Move ${cardLabel(item, i)} down`}
                    onClick={() => move(i, 1)}
                  >
                    ▼
                  </button>
                </span>
              </div>
              {renderCard(item, i)}
              {onRemove && (
                <button
                  type="button"
                  className="btn btn--text"
                  aria-label={`Remove ${cardLabel(item, i)}`}
                  onClick={() => onRemove(i)}
                >
                  Remove
                </button>
              )}
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
