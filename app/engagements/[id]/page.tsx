import { notFound } from "next/navigation";
import { isStorageConfigured, getJson } from "@/lib/github";
import { loadEngagement, loadArtifact } from "@/lib/store";
import { engagementFile } from "@/lib/paths";
import { SetupNotice } from "@/components/SetupNotice";
import { StageStepper } from "@/components/StageStepper";
import { TemplateGrid } from "@/components/TemplateGrid";
import { TEMPLATE_ROUTES } from "@/lib/templates";
import { STAGE_LABELS, STAGES, type EngagementStage } from "@/lib/schemas";
import { deriveStageProgress } from "@/lib/progress";

export const dynamic = "force-dynamic";

export default async function EngagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const { id } = await params;
  if (!isStorageConfigured()) return <SetupNotice what="storage" />;

  const engagement = await loadEngagement(id);
  if (!engagement) notFound();

  const raw = await getJson<unknown>(engagementFile(id));

  // Read each artifact's status for the nav (cheap; v1 scale).
  const statuses = await Promise.all(
    TEMPLATE_ROUTES.map(async (r) => ({ ...r, status: (await loadArtifact(id, r.id)).data.status })),
  );

  const progress = deriveStageProgress(engagement, statuses);

  // The stepper drives which stage's content the page renders. Default to where the
  // engagement currently sits; ignore an unknown ?stage value.
  const { stage: stageParam } = await searchParams;
  const activeStage: EngagementStage = STAGES.includes(stageParam as EngagementStage)
    ? (stageParam as EngagementStage)
    : engagement.stage;

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
      </header>

      <StageStepper engagement={engagement} activeStage={activeStage} progress={progress} baseSha={raw?.sha ?? null} />

      {activeStage === "selection" && (
        <section className="stack">
          <h2 className="t-heading">Selection</h2>
          <p className="t-faint">The service to map, its boundaries, and who owns it.</p>
          <div className="card stack">
            <p className="t-system t-faint">
              Scope: {engagement.scopeStart || "—"} → {engagement.scopeEnd || "—"}
            </p>
            <p className="t-system t-faint">Lead: {engagement.lead || "—"}</p>
            <p className="t-system t-faint">
              Lifecycle owner: {engagement.lifecycleOwner?.name || "—"}
              {engagement.lifecycleOwner?.role ? ` · ${engagement.lifecycleOwner.role}` : ""}
            </p>
            <div className="row">
              <a className="btn btn--text" href={`/engagements/${id}/edit`}>
                Edit details
              </a>
            </div>
          </div>
        </section>
      )}

      {activeStage === "mapping" && (
        <>
          <section className="stack">
            <h2 className="t-heading">Templates</h2>
            <p className="t-faint">01 and 06 are fixed. Reorder 02–05 by dragging the handle or using ▲/▼.</p>
            <TemplateGrid engagementId={id} items={statuses} />
          </section>

          <section className="card card--accent">
            <p className="t-system">Method</p>
            <p className="t-muted">
              Layer 1 describes the service as it is; it proposes no fixes. AI tags notes, flags conflicts, groups
              friction, and drafts first cuts; a person reviews and confirms each one.
            </p>
          </section>
        </>
      )}

      {activeStage === "design" && (
        <section className="stack">
          <h2 className="t-heading">Design</h2>
          <div className="card card--accent stack">
            <p className="t-system">Not built yet</p>
            <p className="t-muted">
              Design is where the confirmed Layer 1 map turns into proposed changes — reworked steps, removed handoffs,
              and decisions to redesign — each traced back to the friction it addresses. There is no Design workspace in
              the product today; finish and confirm the Mapping templates first.
            </p>
          </div>
        </section>
      )}

      {activeStage === "implementation" && (
        <section className="stack">
          <h2 className="t-heading">Implementation &amp; transfer</h2>
          <div className="card card--accent stack">
            <p className="t-system">Not built yet</p>
            <p className="t-muted">
              Implementation &amp; transfer is where agreed changes are put into practice and ownership hands back to the
              lifecycle owner, with measures tracked over time. There is no Implementation workspace in the product
              today.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
