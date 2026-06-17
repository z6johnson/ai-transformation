import { isStorageConfigured } from "@/lib/github";
import { listEngagements } from "@/lib/store";
import { SetupNotice } from "@/components/SetupNotice";
import { EngagementGrid } from "@/components/EngagementGrid";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!isStorageConfigured()) {
    return (
      <div className="stack-lg">
        <header className="stack">
          <h1 className="t-display">Engagements</h1>
          <p className="t-muted">Mapping workspace for the AI Transformation Practice.</p>
        </header>
        <SetupNotice what="storage" />
      </div>
    );
  }

  const engagements = await listEngagements();

  return (
    <div className="stack-lg">
      <header className="stack">
        <div className="row row--between row--baseline">
          <h1 className="t-display">Engagements</h1>
          <a className="btn btn--primary" href="/engagements/new">
            New engagement
          </a>
        </div>
        <p className="t-muted">
          Each engagement maps one service lifecycle through the six Layer 1 templates. AI drafts; a person confirms.
        </p>
      </header>

      {engagements.length === 0 ? (
        <div className="card stack">
          <p className="t-muted">No engagements yet.</p>
          <div className="row">
            <a className="btn btn--primary" href="/engagements/new">
              Create your first engagement
            </a>
          </div>
        </div>
      ) : (
        <EngagementGrid engagements={engagements} />
      )}
    </div>
  );
}
