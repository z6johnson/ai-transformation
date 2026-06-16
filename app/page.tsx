import { isStorageConfigured } from "@/lib/github";
import { listEngagements } from "@/lib/store";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  selection: "Selection",
  mapping: "Mapping",
  design: "Design",
  implementation: "Implementation & transfer",
};

export default async function HomePage() {
  if (!isStorageConfigured()) {
    return (
      <div className="stack-lg">
        <header className="stack">
          <h1 className="t-display">Engagements</h1>
          <p className="t-muted">The mapping workspace for the AI Transformation Practice.</p>
        </header>
        <SetupNotice what="storage" />
      </div>
    );
  }

  const engagements = await listEngagements();

  return (
    <div className="stack-lg">
      <header className="stack">
        <h1 className="t-display">Engagements</h1>
        <p className="t-muted">
          Each engagement maps one institutional service lifecycle through the six Layer 1 templates. AI helps build the
          map; a person decides what is true.
        </p>
      </header>

      {engagements.length === 0 ? (
        <p className="t-muted">No engagements yet. Add one by committing <code>data/engagements/&lt;id&gt;/engagement.json</code> to the data branch.</p>
      ) : (
        <ul className="grid grid--2" style={{ listStyle: "none", padding: 0 }}>
          {engagements.map((e) => (
            <li key={e.id} className="card card--accent">
              <div className="stack">
                <div className="t-system">{STAGE_LABEL[e.stage] || e.stage}</div>
                <a href={`/engagements/${e.id}`} className="t-subhead">
                  {e.name}
                </a>
                <p className="t-muted">{e.service}</p>
                <p className="t-system t-faint">
                  Lead {e.lead || "—"} · Owner {e.lifecycleOwner?.name || "—"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
