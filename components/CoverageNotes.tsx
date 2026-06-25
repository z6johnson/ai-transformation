"use client";

/**
 * Shared UI for the documented-baseline coverage pass used by the mapping editors. The toggle
 * lets the lead pull the confirmed library synthesis into a draft as reference context; the
 * panel shows what the documents mention that the interviews are silent on. Coverage notes are
 * open questions for the lead — they are NEVER written into the artifact.
 */
export type CoverageNote = { note: string; baselineRefs: string[] };

/** Normalize the loosely-typed `coverageNotes` a draft may return into clean notes. */
export function toCoverageNotes(raw: unknown): CoverageNote[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      const note = typeof o.note === "string" ? o.note : "";
      const refs = Array.isArray(o.baselineRefs) ? o.baselineRefs.filter((r): r is string => typeof r === "string") : [];
      return { note, baselineRefs: refs };
    })
    .filter((n) => n.note.trim());
}

export function BaselineToggle({
  show,
  checked,
  disabled,
  onChange,
}: {
  show: boolean;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  if (!show) return null;
  return (
    <label className="row row--baseline t-system" style={{ gap: "0.4rem" }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>Also consider the documented baseline (reference only)</span>
    </label>
  );
}

export function CoverageNotesPanel({ notes }: { notes: CoverageNote[] }) {
  if (!notes.length) return null;
  return (
    <section className="card stack" aria-label="Baseline coverage — open questions">
      <div className="ai-banner">
        <span className="ai-mark">Baseline</span>
        <span>
          The documents mention these; the interviews don&apos;t. They are open questions to resolve — not added to the
          artifact.
        </span>
      </div>
      <ul className="stack">
        {notes.map((n, i) => (
          <li key={i} className="t-system">
            {n.note}
            {n.baselineRefs.length > 0 && <span className="t-faint t-mono"> ({n.baselineRefs.join(", ")})</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
