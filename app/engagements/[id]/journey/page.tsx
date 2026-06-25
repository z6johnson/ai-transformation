import { notFound } from "next/navigation";
import { isStorageConfigured } from "@/lib/github";
import { loadEngagement, loadArtifact } from "@/lib/store";
import { loadSynthesis } from "@/lib/library-store";
import { isAiConfigured } from "@/lib/tritonai";
import { SetupNotice } from "@/components/SetupNotice";
import { TemplateNav } from "@/components/TemplateNav";
import { JourneyEditor } from "@/components/JourneyEditor";

export const dynamic = "force-dynamic";

export default async function JourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isStorageConfigured()) return <SetupNotice what="storage" />;
  const engagement = await loadEngagement(id);
  if (!engagement) notFound();
  const [{ data, sha }, synthesis] = await Promise.all([loadArtifact(id, "02"), loadSynthesis(id)]);
  const hasSynthesis = synthesis.data.data.sections.length > 0;

  return (
    <div className="stack-lg">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Engagements</a>
        <span aria-hidden="true">/</span>
        <a href={`/engagements/${id}`}>{engagement.name}</a>
        <span aria-hidden="true">/</span>
        <span>Journey Map</span>
      </nav>
      <TemplateNav engagementId={id} activeId="02" />
      <header className="stack">
        <div className="t-system">02 · Journey Map</div>
        <h1 className="t-display">Journey map</h1>
        <p className="t-muted">
          What the person does at each stage, and how it feels. AI can draft from the tagged interviews; you review and
          edit each stage.
        </p>
      </header>
      {!isAiConfigured() && <SetupNotice what="ai" />}
      <JourneyEditor engagementId={id} initial={data.data} baseSha={sha} status={data.status} hasSynthesis={hasSynthesis} />
    </div>
  );
}
