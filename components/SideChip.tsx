import { sideLabel, type SideNames, type SideOrBoth } from "@/lib/schemas";

/**
 * Badge naming which side of the service something belongs to. Always shows the engagement's
 * own label as text; the fill (solid / outlined / double rule) is a second signal, never the
 * only one.
 */
export function SideChip({ side, names, short = false }: { side: SideOrBoth; names?: Partial<SideNames>; short?: boolean }) {
  const label = short ? (side === "both" ? "Both" : side === "external" ? "External" : "Internal") : sideLabel(names, side);
  return (
    <span className={`side-chip side-chip--${side}`} title={sideLabel(names, side)}>
      {label}
    </span>
  );
}

/** "External 4 · Internal 9 · Both 2", with each count labeled. Omits "both" when it can't occur. */
export function SideCounts({
  counts,
  names,
  label,
  showBoth = true,
}: {
  counts: Record<SideOrBoth, number>;
  names?: Partial<SideNames>;
  label?: string;
  showBoth?: boolean;
}) {
  const sides: SideOrBoth[] = showBoth ? ["external", "internal", "both"] : ["external", "internal"];
  return (
    <div className="side-counts">
      {label && <span className="t-system">{label}</span>}
      {sides.map((s) => (
        <span key={s} className="row" style={{ gap: "var(--space-1)" }}>
          <SideChip side={s} names={names} />
          <span className="t-mono">{counts[s]}</span>
        </span>
      ))}
    </div>
  );
}
