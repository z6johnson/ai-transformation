import { notFound } from "next/navigation";
import { isStorageConfigured, getJson } from "@/lib/github";
import { loadEngagement, loadArtifact } from "@/lib/store";
import { engagementFile } from "@/lib/paths";
import { SetupNotice } from "@/components/SetupNotice";
import { StageStepper } from "@/components/StageStepper";
import { ARTIFACT_LABELS, STAGE_LABELS, type ArtifactId } from "@/lib/schemas";

export const dynamic = "force-dynamic";

const ROUTES: Array<{ id: ArtifactId; slug: string; blurb: string }> = [
  { id: "01", slug: "interviews", blurb: "Raw notes + AI-assisted tagging pass" },
  { id: "02", slug: "journey", blurb: "The experience view, stage by stage" },
  { id: "03", slug: "blueprint", blurb: "Operations, handoffs, decisions, systems" },
  { id: "04", slug: "process", blurb: "Step-by-step record underneath the blueprint" },
  { id: "05", slug: "friction", blurb: "Evidence-grounded friction register + clusters" },
  { id: "06", slug: "validation", blurb: "Coverage, review, honest account, sign-off" },
];

export default async function EngagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isStorageConfigured()) return <SetupNotice what="storage" />;

  const engagement = await loadEngagement(id);
  if (!engagement) notFound();

  const raw = await getJson<unknown>(engagementFile(id));

  // Read each artifact's status for the nav (cheap; v1 scale).
  const statuses = await Promise.all(
    ROUTES.map(async (r) => ({ ...r, status: (await loadArtifact(id, r.id)).data.status })),
  );

  return (
    <div className="stack-lg">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Engagements</a>
        <span aria-hidden="true">/</span>
        <span>{engagement.name}</span>
      </nav>

      <header className="stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <div className="t-system">{STAGE_LABELS[engagement.stage]} · Layer 1</div>
          <a className="btn btn--text" href={`/engagements/${id}/edit`}>
            Edit details
          </a>
        </div>
        <h1 className="t-display">{engagement.name}</h1>
        <p className="t-muted">{engagement.service}</p>
        <p className="t-system t-faint">
          Scope: {engagement.scopeStart || "—"} → {engagement.scopeEnd || "—"} · Lead {engagement.lead || "—"} · Owner{" "}
          {engagement.lifecycleOwner?.name || "—"}
        </p>
      </header>

      <StageStepper engagement={engagement} baseSha={raw?.sha ?? null} />

      <section className="stack">
        <h2 className="t-heading">Templates</h2>
        <div className="artifact-nav">
          {statuses.map((r) => (
            <a key={r.id} href={`/engagements/${id}/${r.slug}`}>
              <span>
                <span className="t-system">{r.id}</span> {ARTIFACT_LABELS[r.id]}
                <span className="t-faint" style={{ display: "block" }}>
                  {r.blurb}
                </span>
              </span>
              <span className="t-system">{r.status}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="card card--accent">
        <p className="t-system">Method</p>
        <p className="t-muted">
          Layer 1 describes the service as it is and proposes no fixes. AI tags notes, flags conflicts, groups friction,
          and drafts first cuts — a person rebuilds and confirms everything before it counts.
        </p>
      </section>
    </div>
  );
}
