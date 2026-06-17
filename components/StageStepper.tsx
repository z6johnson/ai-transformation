"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveEngagement } from "@/lib/client";
import { STAGES, STAGE_LABELS, type Engagement } from "@/lib/schemas";

/** Compact lifecycle indicator with a one-click "advance" control on the detail page. */
export function StageStepper({ engagement, baseSha }: { engagement: Engagement; baseSha: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const currentIndex = STAGES.indexOf(engagement.stage);
  const next = currentIndex >= 0 && currentIndex < STAGES.length - 1 ? STAGES[currentIndex + 1] : null;

  async function advance() {
    if (!next) return;
    setBusy(true);
    setMessage("");
    const res = await saveEngagement({
      id: engagement.id,
      name: engagement.name,
      service: engagement.service,
      scopeStart: engagement.scopeStart,
      scopeEnd: engagement.scopeEnd,
      lead: engagement.lead,
      lifecycleOwner: engagement.lifecycleOwner,
      stage: next,
      baseSha,
    });
    if (res.ok) {
      router.refresh();
      setBusy(false);
    } else {
      setMessage(
        res.conflict ? "This engagement changed elsewhere. Reload and try again." : `Could not advance: ${res.error}`,
      );
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <div className="row" style={{ flexWrap: "wrap", gap: "var(--space-2)" }}>
        {STAGES.map((s, i) => {
          const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "todo";
          return (
            <span key={s} className="tag-chip t-system" aria-current={state === "current" ? "step" : undefined}>
              <span style={{ opacity: state === "todo" ? 0.5 : 1, fontWeight: state === "current" ? 600 : 400 }}>
                {i + 1}. {STAGE_LABELS[s]}
              </span>
            </span>
          );
        })}
      </div>
      <div className="row">
        {next ? (
          <button className="btn btn--primary" onClick={advance} disabled={busy}>
            {busy ? "Advancing…" : `Advance to ${STAGE_LABELS[next]}`}
          </button>
        ) : (
          <span className="t-faint t-system">Final stage reached.</span>
        )}
        {message && <span className="notice">{message}</span>}
      </div>
    </section>
  );
}
