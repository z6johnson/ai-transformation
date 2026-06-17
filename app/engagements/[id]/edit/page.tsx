import { notFound } from "next/navigation";
import { isStorageConfigured, getJson } from "@/lib/github";
import { loadEngagement } from "@/lib/store";
import { engagementFile } from "@/lib/paths";
import { SetupNotice } from "@/components/SetupNotice";
import { EngagementForm } from "@/components/EngagementForm";

export const dynamic = "force-dynamic";

export default async function EditEngagementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isStorageConfigured()) return <SetupNotice what="storage" />;

  const engagement = await loadEngagement(id);
  if (!engagement) notFound();

  const raw = await getJson<unknown>(engagementFile(id));

  return (
    <div className="stack-lg">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Engagements</a>
        <span aria-hidden="true">/</span>
        <a href={`/engagements/${id}`}>{engagement.name}</a>
        <span aria-hidden="true">/</span>
        <span>Edit</span>
      </nav>

      <header className="stack">
        <h1 className="t-display">Edit engagement</h1>
        <p className="t-muted">Update the details or move the engagement to a different stage.</p>
      </header>

      <EngagementForm mode="edit" initial={engagement} baseSha={raw?.sha ?? null} />
    </div>
  );
}
