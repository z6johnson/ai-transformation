import { notFound } from "next/navigation";
import { isStorageConfigured, getJson } from "@/lib/github";
import { loadEngagement, loadArtifact } from "@/lib/store";
import { engagementFile } from "@/lib/paths";
import { SetupNotice } from "@/components/SetupNotice";
import { StageStepper } from "@/components/StageStepper";
import { TemplateGrid } from "@/components/TemplateGrid";
import { TEMPLATE_ROUTES } from "@/lib/templates";
import { STAGE_LABELS } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export default async function EngagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isStorageConfigured()) return <SetupNotice what="storage" />;

  const engagement = await loadEngagement(id);
  if (!engagement) notFound();

  const raw = await getJson<unknown>(engagementFile(id));

  // Read each artifact's status for the nav (cheap; v1 scale).
  const statuses = await Promise.all(
    TEMPLATE_ROUTES.map(async (r) => ({ ...r, status: (await loadArtifact(id, r.id)).data.status })),
  );

  return (
    <div className="stack-lg">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Engagements</a>
        <span aria-hidden="true">/</span>
        <span>{engagement.name}</span>
      </nav>

      <header className="stack">
        <div className="row row--between row--baseline">
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
        <p className="t-faint">Open any template to work on it.</p>
        <TemplateGrid engagementId={id} items={statuses} />
      </section>

      <section className="card card--accent">
        <p className="t-system">Method</p>
        <p className="t-muted">
          Layer 1 describes the service as it is; it proposes no fixes. AI tags notes, flags conflicts, groups friction,
          and drafts first cuts; a person reviews and confirms each one.
        </p>
      </section>
    </div>
  );
}
