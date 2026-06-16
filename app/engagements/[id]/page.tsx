import { notFound } from "next/navigation";
import { isStorageConfigured } from "@/lib/github";
import { loadEngagement, loadArtifact } from "@/lib/store";
import { SetupNotice } from "@/components/SetupNotice";
import { ARTIFACT_LABELS, type ArtifactId } from "@/lib/schemas";

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
        <div className="t-system">Mapping · Layer 1</div>
        <h1 className="t-display">{engagement.name}</h1>
        <p className="t-muted">{engagement.service}</p>
        <p className="t-system t-faint">
          Scope: {engagement.scopeStart || "—"} → {engagement.scopeEnd || "—"} · Lead {engagement.lead || "—"} · Owner{" "}
          {engagement.lifecycleOwner?.name || "—"}
        </p>
      </header>

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
