import { notFound } from "next/navigation";
import { isStorageConfigured } from "@/lib/github";
import { loadEngagement, loadArtifact } from "@/lib/store";
import { SetupNotice } from "@/components/SetupNotice";
import { TemplateNav } from "@/components/TemplateNav";
import { ProcessEditor } from "@/components/ProcessEditor";

export const dynamic = "force-dynamic";

export default async function ProcessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isStorageConfigured()) return <SetupNotice what="storage" />;
  const engagement = await loadEngagement(id);
  if (!engagement) notFound();
  const { data, sha } = await loadArtifact(id, "04");

  return (
    <div className="stack-lg">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Engagements</a>
        <span aria-hidden="true">/</span>
        <a href={`/engagements/${id}`}>{engagement.name}</a>
        <span aria-hidden="true">/</span>
        <span>Process Documentation</span>
      </nav>
      <TemplateNav engagementId={id} activeId="04" />
      <header className="stack">
        <div className="t-system">04 · Process Documentation</div>
        <h1 className="t-display">Process documentation</h1>
        <p className="t-muted">Each step: what starts it, who does it, the rule, how long it takes, and what goes wrong.</p>
      </header>
      <ProcessEditor engagementId={id} initial={data.data} baseSha={sha} status={data.status} />
    </div>
  );
}
