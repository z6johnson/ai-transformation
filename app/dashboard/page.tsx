import { isStorageConfigured } from "@/lib/github";
import { getDashboard, DIMENSION_LABELS, formatKpi, type DashboardKpi } from "@/lib/metrics";
import { IMPACT_DIMENSIONS } from "@/lib/schemas";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

function pctToTarget(k: DashboardKpi): string {
  if (k.current === null || k.target === null || k.baseline === null) return "—";
  const span = k.target - k.baseline;
  if (span === 0) return "—";
  return `${Math.round(((k.current - k.baseline) / span) * 100)}%`;
}

function delta(k: DashboardKpi): { text: string; cls: string } {
  if (k.current === null || k.baseline === null) return { text: "—", cls: "" };
  const diff = k.current - k.baseline;
  const improved = k.betterDirection === "up" ? diff > 0 : diff < 0;
  const word = diff === 0 ? "no change" : improved ? "improving" : "worsening";
  return { text: word, cls: diff === 0 ? "" : improved ? "delta-up" : "delta-down" };
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
        <h1 className="t-display">What transformation is worth</h1>
        <p className="t-muted">
          A working definition of AI ROI and the four-dimension impact framework. Destination measures track what
          engagements promised; adaptive-capacity measures track whether the institution is becoming more able to evolve.
          Both re-baseline quarterly.
        </p>
      </header>

      {dash.roiDefinition && (
        <section className="card card--accent">
          <p className="t-system">Definition of AI ROI</p>
          <p>{dash.roiDefinition}</p>
        </section>
      )}

      <section className="stack">
        <h2 className="t-heading">Four-dimension impact</h2>
        <div className="grid grid--2">
          {IMPACT_DIMENSIONS.map((dim) => {
            const kpis = dash.dimensions[dim];
            return (
              <div key={dim} className="card stack">
                <p className="t-system">{DIMENSION_LABELS[dim]}</p>
                {kpis.length === 0 ? (
                  <p className="t-faint">No measures yet.</p>
                ) : (
                  kpis.map((k) => {
                    const dl = delta(k);
                    return (
                      <div key={`${k.engagementId}-${k.id}`} className="stack" style={{ gap: "var(--space-1)" }}>
                        <span className="t-display">{formatKpi(k.current, k.unit)}</span>
                        <span className="t-subhead">{k.label}</span>
                        <span className={`t-system ${dl.cls}`}>
                          {dl.text} · baseline {formatKpi(k.baseline, k.unit)} → target {formatKpi(k.target, k.unit)}
                        </span>
                        <span className="t-faint t-system">{k.engagementName}</span>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="stack">
        <h2 className="t-heading">Destination measures</h2>
        <p className="t-faint">Progress against what each engagement explicitly promised.</p>
        {dash.destination.length === 0 ? (
          <p className="t-faint">No destination KPIs recorded.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">KPI</th>
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
        <p className="t-faint">Whether the institution is becoming more able to evolve — the leading indicators.</p>
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
