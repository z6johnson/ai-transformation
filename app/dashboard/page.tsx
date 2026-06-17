import { isStorageConfigured } from "@/lib/github";
import { getDashboard, type DashboardKpi } from "@/lib/metrics";
import { DIMENSION_LABELS, formatKpi, delta } from "@/lib/metrics-format";
import { SetupNotice } from "@/components/SetupNotice";
import { DimensionGrid } from "@/components/DimensionGrid";

export const dynamic = "force-dynamic";

function pctToTarget(k: DashboardKpi): string {
  if (k.current === null || k.target === null || k.baseline === null) return "—";
  const span = k.target - k.baseline;
  if (span === 0) return "—";
  return `${Math.round(((k.current - k.baseline) / span) * 100)}%`;
}

export default async function DashboardPage() {
  if (!isStorageConfigured()) {
    return (
      <div className="stack-lg">
        <h1 className="t-display">Executive measurement</h1>
        <SetupNotice what="storage" />
      </div>
    );
  }

  const dash = await getDashboard();

  return (
    <div className="stack-lg">
      <header className="stack">
        <div className="t-system">Executive measurement layer</div>
        <h1 className="t-display">Executive measurement</h1>
        <p className="t-muted">
          AI ROI definition and the four-dimension impact framework. Destination measures track what engagements
          promised; adaptive-capacity measures track the institution&apos;s capacity to change. Both re-baseline quarterly.
        </p>
      </header>

      {dash.roiDefinition && (
        <section className="card card--accent">
          <p className="t-system">Definition of AI ROI</p>
          <p>{dash.roiDefinition}</p>
        </section>
      )}

      <section className="card card--accent">
        <p className="t-system">Reconciling measures across engagements</p>
        <p className="t-muted">
          Outcomes are not comparable unit to unit, so raw values are never compared across engagements. Each KPI is
          tracked against <em>its own</em> baseline and target. What is common across units: the four impact dimensions
          below, and each measure&apos;s normalized progress-to-target and trend. KPIs are grouped by engagement.
        </p>
      </section>

      <section className="stack">
        <h2 className="t-heading">Four-dimension impact</h2>
        <DimensionGrid dimensions={dash.dimensions} />
      </section>

      <section className="stack">
        <h2 className="t-heading">Destination measures</h2>
        <p className="t-faint">Progress against what each engagement promised.</p>
        {dash.destination.length === 0 ? (
          <p className="t-faint">No destination KPIs recorded.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">KPI</th>
                <th scope="col">Engagement</th>
                <th scope="col">Dimension</th>
                <th scope="col">Baseline</th>
                <th scope="col">Current</th>
                <th scope="col">Target</th>
                <th scope="col">To target</th>
                <th scope="col">Trend</th>
              </tr>
            </thead>
            <tbody>
              {dash.destination.map((k) => {
                const dl = delta(k);
                return (
                  <tr key={`${k.engagementId}-${k.id}`}>
                    <td>{k.label}</td>
                    <td className="t-faint">{k.engagementName}</td>
                    <td className="t-system">{DIMENSION_LABELS[k.dimension]}</td>
                    <td>{formatKpi(k.baseline, k.unit)}</td>
                    <td>{formatKpi(k.current, k.unit)}</td>
                    <td>{formatKpi(k.target, k.unit)}</td>
                    <td>{pctToTarget(k)}</td>
                    <td className={dl.cls}>{dl.text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="stack">
        <h2 className="t-heading">Adaptive-capacity measures</h2>
        <p className="t-faint">Leading indicators of the institution&apos;s capacity to change.</p>
        {dash.adaptive.length === 0 ? (
          <p className="t-faint">No adaptive-capacity measures recorded.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">Value</th>
                <th scope="col">Baseline</th>
                <th scope="col">Quarter</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {dash.adaptive.map((a, i) => (
                <tr key={i}>
                  <td>{a.label}</td>
                  <td className="t-subhead">{a.value ?? "—"}</td>
                  <td>{a.baseline ?? "—"}</td>
                  <td className="t-system">{a.quarter || "—"}</td>
                  <td className="t-faint">{a.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="card">
        <p className="t-system">
          Re-baselined {dash.rebaselinedQuarter || "—"} · {dash.engagementCount} engagement(s) · Values are authored and
          re-baselined quarterly, not telemetric.
        </p>
      </footer>
    </div>
  );
}
