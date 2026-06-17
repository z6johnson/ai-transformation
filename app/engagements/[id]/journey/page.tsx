import { notFound } from "next/navigation";
import { isStorageConfigured } from "@/lib/github";
import { loadEngagement, loadArtifact } from "@/lib/store";
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
  const { data, sha } = await loadArtifact(id, "02");

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
        <h1 className="t-display">The experience view</h1>
        <p className="t-muted">
          What the person the service is for does, stage by stage, and how it feels. AI can draft a first cut from the
          tagged interviews; you rebuild it before it counts.
        </p>
      </header>
      {!isAiConfigured() && <SetupNotice what="ai" />}
      <JourneyEditor engagementId={id} initial={data.data} baseSha={sha} status={data.status} />
    </div>
  );
}
