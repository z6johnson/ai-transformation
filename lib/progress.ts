/**
 * Stage progress derivation — pure, no I/O. Turns the engagement metadata and the
 * (already-loaded) artifact statuses into a per-stage completion picture plus a
 * suggested next stage. The stepper uses this for its visual state and for the
 * hybrid "advance" suggestion; the persisted `engagement.stage` stays the source of
 * truth for where the engagement actually is.
 */
import { type Engagement, type EngagementStage, STAGES } from "./schemas";

export type StageState = { complete: boolean };

export type StageProgress = {
  byStage: Record<EngagementStage, StageState>;
  /** Furthest stage whose prerequisites look done — what we nudge the user toward. */
  suggested: EngagementStage;
};

export function deriveStageProgress(
  engagement: Engagement,
  artifactStatuses: { id: string; status: string }[],
): StageProgress {
  // Selection is done once the engagement is actually defined.
  const selectionComplete = Boolean(
    engagement.name &&
      engagement.service &&
      engagement.scopeStart &&
      engagement.scopeEnd &&
      engagement.lead &&
      engagement.lifecycleOwner?.name,
  );

  // Mapping is done when the validation packet (06) is confirmed. A truer signal is
  // the sign-off inside artifact 06's data, but status is what the page loads cheaply.
  const mappingComplete = artifactStatuses.some((a) => a.id === "06" && a.status === "confirmed");

  // Design / Implementation have no built content yet, so there is nothing to derive.
  const byStage: Record<EngagementStage, StageState> = {
    selection: { complete: selectionComplete },
    mapping: { complete: mappingComplete },
    design: { complete: false },
    implementation: { complete: false },
  };

  // Suggest the first incomplete stage whose predecessor is complete. Tops out at
  // `design` because design/implementation cannot report completion today.
  let suggested: EngagementStage = STAGES[0];
  for (const stage of STAGES) {
    if (byStage[stage].complete) {
      const idx = STAGES.indexOf(stage);
      suggested = STAGES[Math.min(idx + 1, STAGES.length - 1)];
    } else {
      break;
    }
  }

  return { byStage, suggested };
}
