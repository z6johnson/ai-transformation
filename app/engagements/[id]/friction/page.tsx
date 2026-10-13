import { notFound } from "next/navigation";
import { isStorageConfigured } from "@/lib/github";
import { loadEngagement, loadArtifact } from "@/lib/store";
import { loadGapAnalysis, loadIndex, loadSynthesis } from "@/lib/library-store";
import { isAiConfigured } from "@/lib/tritonai";
import { SetupNotice } from "@/components/SetupNotice";
import { TemplateNav } from "@/components/TemplateNav";
import { FrictionEditor } from "@/components/FrictionEditor";
import { GapAnalysisPanel } from "@/components/GapAnalysisPanel";

export const dynamic = "force-dynamic";

export default async function FrictionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isStorageConfigured()) return <SetupNotice what="storage" />;
  const engagement = await loadEngagement(id);
  if (!engagement) notFound();
  const [{ data, sha }, synthesis, libraryIndex, gap] = await Promise.all([
    loadArtifact(id, "05"),
    loadSynthesis(id),
    loadIndex(id),
    loadGapAnalysis(id),
  ]);
  const hasSynthesis = synthesis.data.data.sections.length > 0;

  return (
    <div className="stack-lg">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Engagements</a>
        <span aria-hidden="true">/</span>
        <a href={`/engagements/${id}`}>{engagement.name}</a>
        <span aria-hidden="true">/</span>
        <span>Friction Register</span>
      </nav>
      <TemplateNav engagementId={id} activeId="05" />
      <header className="stack">
        <div className="t-system">05 · Friction Register</div>
        <h1 className="t-display">Friction register</h1>
        <p className="t-muted">
          Each entry is backed by evidence and says which side feels it: the people served, the staff, or both. AI
          drafts candidate entries and groups them by shared root, surfacing the roots that land on both sides; you
          keep, merge, or cut. You write the summary.
        </p>
      </header>
      {!isAiConfigured() && <SetupNotice what="ai" />}
      <FrictionEditor engagementId={id} initial={data.data} sideNames={engagement.sides} baseSha={sha} status={data.status} hasSynthesis={hasSynthesis} />
      <GapAnalysisPanel
        engagementId={id}
        indexed={libraryIndex.data.chunkCount > 0}
        retrievalMode={gap.data.data.retrievalMode}
        initialFindings={gap.data.data.findings}
        gapBaseSha={gap.sha}
        friction={data.data}
        frictionSha={sha}
      />
    </div>
  );
}
