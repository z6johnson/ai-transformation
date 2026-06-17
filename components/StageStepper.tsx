"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveEngagement } from "@/lib/client";
import { STAGES, STAGE_LABELS, type Engagement, type EngagementStage } from "@/lib/schemas";
import type { StageProgress } from "@/lib/progress";

/**
 * Lifecycle stepper — the spine of the engagement page. Each chip links to its
 * stage view (`?stage=…`); the persisted `engagement.stage` is the current pointer,
 * `activeStage` is what's being viewed, and `progress` drives the done marks and the
 * hybrid advance suggestion.
 */
export function StageStepper({
  engagement,
  activeStage,
  progress,
  baseSha,
}: {
  engagement: Engagement;
  activeStage: EngagementStage;
  progress: StageProgress;
  baseSha: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const currentIndex = STAGES.indexOf(engagement.stage);
  const next = currentIndex >= 0 && currentIndex < STAGES.length - 1 ? STAGES[currentIndex + 1] : null;
  const readyToAdvance = next != null && progress.byStage[engagement.stage].complete;

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
      // Move the view to the stage we just entered so the click has a visible effect.
      router.push(`?stage=${next}`);
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
      <ol className="stage-steps">
        {STAGES.map((s, i) => {
          const done = progress.byStage[s].complete;
          const isCurrent = s === engagement.stage;
          const isViewing = s === activeStage;
          const state = done ? "done" : isCurrent ? "current" : i > currentIndex ? "todo" : "current";
          return (
            <li key={s} className="stage-steps__step">
              <a
                href={`?stage=${s}`}
                className={`stage-steps__item stage-steps__item--${state}${
                  isViewing ? " stage-steps__item--viewing" : ""
                }`}
                aria-current={isViewing ? "step" : undefined}
              >
                <span className="stage-steps__marker" aria-hidden="true">
                  {done ? "✓" : i + 1}
                </span>
                <span className="stage-steps__label">{STAGE_LABELS[s]}</span>
              </a>
            </li>
          );
        })}
      </ol>
      <div className="row">
        {next ? (
          <button className="btn btn--primary" onClick={advance} disabled={busy}>
            {busy ? "Advancing…" : `Advance to ${STAGE_LABELS[next]}`}
          </button>
        ) : (
          <span className="t-faint t-system">Final stage reached.</span>
        )}
        {readyToAdvance && !busy && (
          <span className="t-faint t-system">
            {STAGE_LABELS[engagement.stage]} looks complete — advance to {STAGE_LABELS[next!]}.
          </span>
        )}
        {message && <span className="notice">{message}</span>}
      </div>
    </section>
  );
}
