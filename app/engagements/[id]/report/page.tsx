import { notFound } from "next/navigation";
import { isStorageConfigured } from "@/lib/github";
import { loadEngagement, loadArtifact } from "@/lib/store";
import { SetupNotice } from "@/components/SetupNotice";
import { ReportEditor } from "@/components/ReportEditor";

export const dynamic = "force-dynamic";

const SEVERITY_ORDER = { high: 0, moderate: 1, low: 2 } as const;

const SYNTHESIS_LABELS: Array<[string, string]> = [
  ["whereItStands", "Where the service stands"],
  ["frictionPatterns", "Patterns across the friction"],
  ["decisionsForDesign", "Decisions the design phase will weigh"],
  ["openQuestions", "Open questions and known gaps"],
];

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isStorageConfigured()) return <SetupNotice what="storage" />;
  const engagement = await loadEngagement(id);
  if (!engagement) notFound();

  const [journey, blueprint, friction, validation, report] = await Promise.all([
    loadArtifact(id, "02"),
    loadArtifact(id, "03"),
    loadArtifact(id, "05"),
    loadArtifact(id, "06"),
    loadArtifact(id, "07"),
  ]);

  const j = journey.data.data;
  const b = blueprint.data.data;
  const f = friction.data.data;
  const v = validation.data.data;
  const r = report.data.data;

  const header = {
    service: r.header.service || engagement.service || j.header.service,
    scope: r.header.scope || `${engagement.scopeStart} → ${engagement.scopeEnd}`,
    lead: r.header.lead || engagement.lead,
  };
  const entriesBySeverity = [...f.entries].sort((a, b2) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b2.severity]);

  return (
    <div className="stack-lg">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Engagements</a>
        <span aria-hidden="true">/</span>
        <a href={`/engagements/${id}`}>{engagement.name}</a>
        <span aria-hidden="true">/</span>
        <span>Level 1 Report</span>
      </nav>

      <header className="stack">
        <div className="t-system">07 · Level 1 Report — design briefing</div>
        <h1 className="t-display">{header.service || engagement.name}</h1>
        <p className="t-muted">
          The lead-in briefing for the Design phase. It pulls the confirmed map together — what the service does, where it
          has friction, and the decisions Design will weigh. Layer 1 names no fixes; that is Design&rsquo;s job.
        </p>
        <p className="t-system t-faint">
          Scope: {header.scope || "—"} · Lead: {header.lead || "—"}
        </p>
      </header>

      {/* Synthesis (printable). Saved on the report; edited below. */}
      <section className="stack">
        <h2 className="t-heading">Synthesis</h2>
        {SYNTHESIS_LABELS.map(([k, label]) => {
          const prov = (r.synthesis as Record<string, { value: string; origin: string }>)[k];
          return (
            <div key={k} className="card stack">
              <p className="t-system">
                {label} {prov?.origin === "ai-applied" && <span className="ai-mark">AI applied</span>}
              </p>
              <p className="t-muted">{prov?.value || "—"}</p>
            </div>
          );
        })}
      </section>

      {/* Assembled roll-up (printable, read-only) straight from the confirmed artifacts. */}
      <section className="stack">
        <h2 className="t-heading">The journey at a glance</h2>
        <div className="card stack">
          <p className="t-system">Stages</p>
          <p className="t-muted">{j.stages.map((s) => s.name).filter(Boolean).join("  →  ") || "—"}</p>
          <p className="t-system">Moments that matter</p>
          <ul>
            {j.momentsThatMatter.length ? j.momentsThatMatter.map((m, i) => <li key={i}>{m.moment} — <span className="t-faint">{m.why}</span></li>) : <li className="t-faint">—</li>}
          </ul>
          <p className="t-system">Dropout points</p>
          <ul>
            {j.dropoutPoints.length ? j.dropoutPoints.map((d, i) => <li key={i}>{d.point} — <span className="t-faint">{d.what}</span></li>) : <li className="t-faint">—</li>}
          </ul>
        </div>
      </section>

      <section className="stack">
        <h2 className="t-heading">Decisions carried into Design</h2>
        <div className="card stack">
          {b.decisions.length ? (
            <ul>
              {b.decisions.map((d) => (
                <li key={d.id}>
                  <strong>{d.id}</strong> {d.decision || "—"} <span className="t-faint">({d.whoDecides || "—"} · {d.kind})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-faint">No decisions logged yet.</p>
          )}
        </div>
      </section>

      <section className="stack">
        <h2 className="t-heading">Handoffs &amp; systems</h2>
        <div className="grid grid--2">
          <div className="card stack">
            <p className="t-system">Handoffs</p>
            {b.handoffs.length ? (
              <ul>{b.handoffs.map((h) => <li key={h.id}><strong>{h.id}</strong> {h.from || "—"} → {h.to || "—"}: {h.whatMoves || "—"}</li>)}</ul>
            ) : (
              <p className="t-faint">—</p>
            )}
          </div>
          <div className="card stack">
            <p className="t-system">Systems &amp; data</p>
            {b.systems.length ? (
              <ul>{b.systems.map((s, i) => <li key={i}><strong>{s.name || "—"}</strong>: {s.usedFor || "—"}</li>)}</ul>
            ) : (
              <p className="t-faint">—</p>
            )}
          </div>
        </div>
      </section>

      <section className="stack">
        <h2 className="t-heading">Where the service has friction</h2>
        {f.honestAccount && (
          <div className="card stack">
            <p className="t-system">Friction summary (the lead&rsquo;s words)</p>
            <p className="t-muted">{f.honestAccount}</p>
          </div>
        )}
        {f.clusters.length > 0 && (
          <div className="card stack">
            <p className="t-system">Clusters</p>
            <ul>{f.clusters.map((c, i) => <li key={i}><strong>{c.name}</strong> — <span className="t-faint">{c.sharedRoot}</span> ({c.frIds.join(", ")})</li>)}</ul>
          </div>
        )}
        <div className="card stack">
          <p className="t-system">Register (most severe first)</p>
          {entriesBySeverity.length ? (
            <ul>
              {entriesBySeverity.map((e) => (
                <li key={e.id}>
                  <strong>{e.id}</strong> {e.whatsWrong || "—"} <span className="t-faint">[{e.type} · {e.severity}/{e.frequency} · {e.where}]</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-faint">No friction entries yet.</p>
          )}
        </div>
        {v.openQuestions && (
          <div className="card stack">
            <p className="t-system">Open questions</p>
            <p className="t-muted">{v.openQuestions}</p>
          </div>
        )}
      </section>

      {/* Editing workflow — drops out of print. */}
      <section className="stack no-print">
        <h2 className="t-heading">Edit synthesis</h2>
        <p className="t-faint">
          Draft the synthesis from the confirmed map, then review and edit. It stays descriptive — it names where friction
          concentrates and restates the decisions, but proposes no fix. Save, then reload to refresh the printable briefing
          above.
        </p>
        <ReportEditor engagementId={id} initial={r} baseSha={report.sha} status={report.data.status} />
      </section>
    </div>
  );
}
