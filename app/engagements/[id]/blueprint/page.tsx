import { notFound } from "next/navigation";
import { isStorageConfigured } from "@/lib/github";
import { loadEngagement, loadArtifact } from "@/lib/store";
import { SetupNotice } from "@/components/SetupNotice";
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
      <header className="stack">
        <div className="t-system">03 · Service Blueprint</div>
        <h1 className="t-display">The operations view</h1>
        <p className="t-muted">
          Handoffs and decisions get written down on their own — they are where work breaks and where Layer 2 looks for
          AI opportunities. The clear-cut vs. judgment call on each decision matters for Layer 3 guardrails.
        </p>
      </header>
      <BlueprintEditor engagementId={id} initial={data.data} baseSha={sha} status={data.status} />
    </div>
  );
}
