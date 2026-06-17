import { notFound } from "next/navigation";
import { isStorageConfigured } from "@/lib/github";
import { loadEngagement, loadArtifact } from "@/lib/store";
import { isAiConfigured } from "@/lib/tritonai";
import { SetupNotice } from "@/components/SetupNotice";
import { TemplateNav } from "@/components/TemplateNav";
import { FrictionEditor } from "@/components/FrictionEditor";

export const dynamic = "force-dynamic";

export default async function FrictionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isStorageConfigured()) return <SetupNotice what="storage" />;
  const engagement = await loadEngagement(id);
  if (!engagement) notFound();
  const { data, sha } = await loadArtifact(id, "05");

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
        <h1 className="t-display">Where the service has friction</h1>
        <p className="t-muted">
          Grounded in evidence, not impression. AI drafts candidate entries and groups them by shared root; you keep,
          merge, or cut. The honest account is yours to write.
        </p>
      </header>
      {!isAiConfigured() && <SetupNotice what="ai" />}
      <FrictionEditor engagementId={id} initial={data.data} baseSha={sha} status={data.status} />
    </div>
  );
}
