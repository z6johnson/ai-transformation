import { notFound } from "next/navigation";
import { isStorageConfigured } from "@/lib/github";
import { loadEngagement, loadArtifact } from "@/lib/store";
import { SetupNotice } from "@/components/SetupNotice";
import { TemplateNav } from "@/components/TemplateNav";
import { BlueprintEditor } from "@/components/BlueprintEditor";

export const dynamic = "force-dynamic";

export default async function BlueprintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isStorageConfigured()) return <SetupNotice what="storage" />;
  const engagement = await loadEngagement(id);
  if (!engagement) notFound();
  const { data, sha } = await loadArtifact(id, "03");

  return (
    <div className="stack-lg">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Engagements</a>
        <span aria-hidden="true">/</span>
        <a href={`/engagements/${id}`}>{engagement.name}</a>
        <span aria-hidden="true">/</span>
        <span>Service Blueprint</span>
      </nav>
      <TemplateNav engagementId={id} activeId="03" />
      <header className="stack">
        <div className="t-system">03 · Service Blueprint</div>
        <h1 className="t-display">Service blueprint</h1>
        <p className="t-muted">
          Handoffs and decisions, recorded separately. Layer 2 uses these to find AI opportunities; the clear-cut vs.
          judgment call on each decision feeds Layer 3 guardrails.
        </p>
      </header>
      <BlueprintEditor engagementId={id} initial={data.data} baseSha={sha} status={data.status} />
    </div>
  );
}
