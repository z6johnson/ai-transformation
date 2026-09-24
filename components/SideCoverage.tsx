import { sideLabel, type SideNames, type Interview, type JourneyMapData, type FrictionEntry, type SideOrBoth } from "@/lib/schemas";
import { allStages, clusterSides, crossesSides, countBySide, isSecondhand } from "@/lib/sides";
import { SideCounts } from "./SideChip";

/**
 * How much of the map rests on each side's evidence: interviews, journey stages, friction,
 * clusters that land on both sides, and stages about the people served that are known only
 * from staff accounts. Read-only; shared by the validation packet and the Level 1 report.
 */
export function SideCoverage({
  names,
  interviews,
  journey,
  entries,
  clusters,
}: {
  names: SideNames;
  interviews: Interview[];
  journey: JourneyMapData;
  entries: FrictionEntry[];
  clusters: { frIds: string[] }[];
}) {
  const stages = allStages(journey);
  const shared = clusters.filter((c) => crossesSides(clusterSides(c.frIds, entries)));
  const secondhand = stages.filter((s) => isSecondhand(s, s.side));
  const twoSided = (counts: Record<SideOrBoth, number>) => ({ ...counts, both: 0 });
  const observations = interviews.filter((iv) => iv.header.sourceType === "observation").length;
  const missing = (["external", "internal"] as const).filter(
    (sd) => !journey.journeys.some((j) => j.side === sd && j.stages.length) || !interviews.some((iv) => iv.header.side === sd),
  );

  return (
    <div className="card stack">
      <SideCounts label="Interviews" names={names} showBoth={false} counts={twoSided(countBySide(interviews, (iv) => iv.header.side))} />
      <SideCounts label="Journey stages" names={names} showBoth={false} counts={twoSided(countBySide(stages, (s) => s.side))} />
      <SideCounts label="Friction entries" names={names} counts={countBySide(entries, (e) => e.side)} />
      <p className="t-muted">
        {observations} observation(s) on file. {shared.length} of {clusters.length} friction cluster(s) land on both sides.
      </p>
      <p className="t-muted">
        {secondhand.length
          ? `${secondhand.length} ${sideLabel(names, "external")} stage(s) are known only from ${sideLabel(names, "internal")} accounts: ${secondhand.map((s) => s.name || "(unnamed)").join(", ")}.`
          : `No ${sideLabel(names, "external")} stage is marked as known only from ${sideLabel(names, "internal")} accounts.`}
      </p>
      {missing.length > 0 && (
        <p className="notice">
          Not yet mapped: {missing.map((sd) => sideLabel(names, sd)).join(" and ")} (needs interviews and a journey with stages).
        </p>
      )}
    </div>
  );
}
