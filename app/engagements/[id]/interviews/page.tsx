import { notFound } from "next/navigation";
import { isStorageConfigured } from "@/lib/github";
import { loadEngagement, loadArtifact } from "@/lib/store";
import { isAiConfigured } from "@/lib/tritonai";
import { SetupNotice } from "@/components/SetupNotice";
import { TemplateNav } from "@/components/TemplateNav";
import { InterviewEditor } from "@/components/InterviewEditor";

export const dynamic = "force-dynamic";

export default async function InterviewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isStorageConfigured()) return <SetupNotice what="storage" />;
  const engagement = await loadEngagement(id);
  if (!engagement) notFound();
  const { data, sha } = await loadArtifact(id, "01");

  return (
    <div className="stack-lg">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Engagements</a>
        <span aria-hidden="true">/</span>
        <a href={`/engagements/${id}`}>{engagement.name}</a>
        <span aria-hidden="true">/</span>
        <span>Interview Guide</span>
      </nav>
      <TemplateNav engagementId={id} activeId="01" />
      <header className="stack">
        <div className="t-system">01 · Interview Guide</div>
        <h1 className="t-display">Interviews &amp; tagging</h1>
        <p className="t-muted">
          Capture notes in the person&apos;s own words. AI suggests tags and shows the words behind each one; you confirm or
          reject every tag.
        </p>
      </header>
      {!isAiConfigured() && <SetupNotice what="ai" />}
      <InterviewEditor engagementId={id} initial={data.data} baseSha={sha} status={data.status} />
    </div>
  );
}
