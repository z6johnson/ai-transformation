/**
 * Helpers for the two sides of a service (external: the people served; internal: the staff
 * who run it). Pure, no I/O. Shared by the drafting routes, the report, and the editors so
 * every surface counts and labels the sides the same way.
 */
import type { Journey, JourneyMapData, SideNames, SideOrBoth, Side } from "./schemas";
import { sideLabel, EVIDENCE_LABELS, WHEN_LABELS } from "./schemas";

/** Every stage across every journey, each carrying its journey's side. */
export function allStages(j: JourneyMapData) {
  return j.journeys.flatMap((jr) => jr.stages.map((s) => ({ ...s, side: jr.side, journeyId: jr.id })));
}

export function journeysOn(j: JourneyMapData, side: Side): Journey[] {
  return j.journeys.filter((jr) => jr.side === side);
}

/**
 * An external stage is secondhand when its evidence comes only from internal accounts:
 * staff describing what fans go through, with no fan's own words and no observation.
 */
export function isSecondhand(stage: { evidence: { fromSides: Side[]; level: string } }, side: Side): boolean {
  if (side !== "external") return false;
  const from = stage.evidence.fromSides;
  return from.length > 0 && !from.includes("external") && stage.evidence.level !== "observed";
}

/** A prompt-ready view of every journey, labeled with its side, for the drafting routes. */
export function journeysDigest(j: JourneyMapData, names: SideNames, detail = false): string {
  if (!j.journeys.length) return "(no journeys confirmed yet)";
  return j.journeys
    .map((jr) => {
      const head = `[${jr.side.toUpperCase()}: ${sideLabel(names, jr.side)}] ${jr.id} ${jr.person || ""}`.trim();
      const stages = jr.stages.length
        ? jr.stages
            .map((s, i) => {
              const bits = [`does: ${s.doing.value || "—"}`, `touchpoints: ${s.touchpoints.value || "—"}`];
              if (s.when) bits.push(`when: ${WHEN_LABELS[s.when]}`);
              if (detail && s.evidence.level) bits.push(`evidence: ${EVIDENCE_LABELS[s.evidence.level]}`);
              return `  ${i + 1}. ${s.name || "(unnamed)"} — ${bits.join("; ")}`;
            })
            .join("\n")
        : "  (no stages)";
      return `${head}\n${stages}`;
    })
    .join("\n");
}

/** One-line stage names per journey, labeled by side. */
export function journeysLine(j: JourneyMapData, names: SideNames): string {
  return (
    j.journeys
      .map((jr) => `${sideLabel(names, jr.side)}: ${jr.stages.map((s) => s.name).filter(Boolean).join(" → ") || "—"}`)
      .join(" | ") || "—"
  );
}

/** The sides a cluster touches, from its member entries. */
export function clusterSides(frIds: string[], entries: { id: string; side: SideOrBoth }[]): SideOrBoth[] {
  const sides = new Set<Side>();
  for (const id of frIds) {
    const e = entries.find((x) => x.id === id);
    if (!e) continue;
    if (e.side === "both") {
      sides.add("external");
      sides.add("internal");
    } else sides.add(e.side);
  }
  if (sides.size === 2) return ["both"];
  return [...sides];
}

export function crossesSides(sides: SideOrBoth[]): boolean {
  return sides.includes("both") || (sides.includes("external") && sides.includes("internal"));
}

/** Count items by side. "both" counts once under its own key. */
export function countBySide<T>(items: T[], sideOf: (t: T) => SideOrBoth): Record<SideOrBoth, number> {
  const out: Record<SideOrBoth, number> = { external: 0, internal: 0, both: 0 };
  for (const it of items) out[sideOf(it)] += 1;
  return out;
}
