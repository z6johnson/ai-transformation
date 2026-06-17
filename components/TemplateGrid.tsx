"use client";

import { useEffect, useState } from "react";
import { ARTIFACT_LABELS, type ArtifactId } from "@/lib/schemas";
import { REORDERABLE_IDS } from "@/lib/templates";

export type TemplateItem = { id: ArtifactId; slug: string; blurb: string; status: string };

/**
 * Engagement-overview template list. 01 (input) and 06 (output) are fixed bookends;
 * 02–05 are reorderable by drag handle or ▲/▼ buttons. The chosen order is a local
 * preference, persisted per-engagement in localStorage — it doesn't change the data.
 */
export function TemplateGrid({ engagementId, items }: { engagementId: string; items: TemplateItem[] }) {
  const byId = (id: ArtifactId) => items.find((i) => i.id === id)!;
  const leading = items.filter((i) => !REORDERABLE_IDS.includes(i.id) && i.id < REORDERABLE_IDS[0]);
  const trailing = items.filter((i) => !REORDERABLE_IDS.includes(i.id) && i.id > REORDERABLE_IDS[REORDERABLE_IDS.length - 1]);
  const middleDefault = REORDERABLE_IDS.filter((id) => items.some((i) => i.id === id));

  const storageKey = `template-order:${engagementId}`;
  const [order, setOrder] = useState<ArtifactId[]>(middleDefault);
  const [dragId, setDragId] = useState<ArtifactId | null>(null);
  const [overId, setOverId] = useState<ArtifactId | null>(null);

  // Apply any stored order on mount, guarding against stale/invalid ids.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const stored = JSON.parse(raw) as unknown;
      if (!Array.isArray(stored)) return;
      const valid = stored.filter((id): id is ArtifactId => middleDefault.includes(id as ArtifactId));
      // Only accept a complete permutation of the current middle set.
      if (valid.length === middleDefault.length && new Set(valid).size === middleDefault.length) {
        setOrder(valid);
      }
    } catch {
      /* ignore malformed storage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(next: ArtifactId[]) {
    setOrder(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* storage may be unavailable; the in-memory order still works */
    }
  }

  function move(id: ArtifactId, dir: -1 | 1) {
    const from = order.indexOf(id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    persist(next);
  }

  function dropOnto(targetId: ArtifactId) {
    if (dragId === null || dragId === targetId) return;
    const next = order.filter((id) => id !== dragId);
    next.splice(next.indexOf(targetId), 0, dragId);
    persist(next);
  }

  function card(item: TemplateItem) {
    return (
      <a href={`/engagements/${engagementId}/${item.slug}`}>
        <span>
          <span className="t-system">{item.id}</span> {ARTIFACT_LABELS[item.id]}
          <span className="t-faint t-block">
            {item.blurb}
          </span>
        </span>
        <span className="t-system">{item.status}</span>
      </a>
    );
  }

  return (
    <div className="template-grid">
      {leading.map((item) => (
        <div key={item.id} className="template-row template-row--fixed">
          {card(item)}
        </div>
      ))}

      {order.map((id, i) => {
        const item = byId(id);
        return (
          <div
            key={id}
            className={`template-row template-row--draggable${overId === id ? " is-over" : ""}${dragId === id ? " is-dragging" : ""}`}
            draggable
            onDragStart={() => setDragId(id)}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (overId !== id) setOverId(id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              dropOnto(id);
              setOverId(null);
            }}
          >
            <span className="template-row__handle t-system" aria-hidden="true" title="Drag to reorder">
              ⠿
            </span>
            {card(item)}
            <span className="template-row__controls">
              <button
                type="button"
                className="btn btn--text"
                onClick={() => move(id, -1)}
                disabled={i === 0}
                aria-label={`Move ${ARTIFACT_LABELS[id]} up`}
              >
                ▲
              </button>
              <button
                type="button"
                className="btn btn--text"
                onClick={() => move(id, 1)}
                disabled={i === order.length - 1}
                aria-label={`Move ${ARTIFACT_LABELS[id]} down`}
              >
                ▼
              </button>
            </span>
          </div>
        );
      })}

      {trailing.map((item) => (
        <div key={item.id} className="template-row template-row--fixed">
          {card(item)}
        </div>
      ))}
    </div>
  );
}
