import { notFound } from "next/navigation";
import { isStorageConfigured } from "@/lib/github";
import { loadEngagement, loadArtifact } from "@/lib/store";
import { loadLibrary, loadIndex, loadGapAnalysis, loadSynthesis } from "@/lib/library-store";
import { isAiConfigured } from "@/lib/tritonai";
import { SetupNotice } from "@/components/SetupNotice";
import { LibraryEditor } from "@/components/LibraryEditor";
import { GapAnalysisPanel } from "@/components/GapAnalysisPanel";
import { LibrarySynthesisPanel } from "@/components/LibrarySynthesisPanel";

export const dynamic = "force-dynamic";

export default async function LibraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isStorageConfigured()) return <SetupNotice what="storage" />;
  const engagement = await loadEngagement(id);
  if (!engagement) notFound();

  const [library, index, gap, synthesis, friction] = await Promise.all([
    loadLibrary(id),
    loadIndex(id),
    loadGapAnalysis(id),
    loadSynthesis(id),
    loadArtifact(id, "05"),
  ]);

  const indexMode: "embeddings" | "lexical" | "none" = index.data.chunkCount
    ? index.data.embeddingModel
      ? "embeddings"
      : "lexical"
    : "none";

  return (
    <div className="stack-lg">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Engagements</a>
        <span aria-hidden="true">/</span>
        <a href={`/engagements/${id}`}>{engagement.name}</a>
        <span aria-hidden="true">/</span>
        <span>Reference Library</span>
      </nav>
      <header className="stack">
        <div className="t-system">Baseline · Reference Library</div>
        <h1 className="t-display">Existing documents &amp; gap analysis</h1>
        <p className="t-muted">
          The unit&apos;s existing policies, procedures, and historical context — the documented baseline. It is reference
          for the lead and grounding for the model. The map (interviews, journey, friction) remains the ground truth for
          how the service actually runs.
        </p>
      </header>
      {!isAiConfigured() && <SetupNotice what="ai" />}

      <LibraryEditor
        engagementId={id}
        initial={library.data.data.documents}
        baseSha={library.sha}
        indexMode={indexMode}
        indexChunks={index.data.chunkCount}
      />

      <LibrarySynthesisPanel
        engagementId={id}
        indexed={index.data.chunkCount > 0}
        retrievalMode={synthesis.data.data.retrievalMode}
        initialSections={synthesis.data.data.sections}
        initialSummary={synthesis.data.data.summary}
        synBaseSha={synthesis.sha}
      />

      <GapAnalysisPanel
        engagementId={id}
        indexed={index.data.chunkCount > 0}
        retrievalMode={gap.data.data.retrievalMode}
        initialFindings={gap.data.data.findings}
        gapBaseSha={gap.sha}
        friction={friction.data.data}
        frictionSha={friction.sha}
      />
    </div>
  );
}
