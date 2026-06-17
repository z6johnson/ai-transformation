import { isStorageConfigured } from "@/lib/github";
import { SetupNotice } from "@/components/SetupNotice";
import { EngagementForm } from "@/components/EngagementForm";

export const dynamic = "force-dynamic";

export default function NewEngagementPage() {
  if (!isStorageConfigured()) return <SetupNotice what="storage" />;

  return (
    <div className="stack-lg">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Engagements</a>
        <span aria-hidden="true">/</span>
        <span>New</span>
      </nav>

      <header className="stack">
        <h1 className="t-display">New engagement</h1>
        <p className="t-muted">
          Map one institutional service lifecycle. You can fill in what you know now and edit the rest as the engagement
          progresses.
        </p>
      </header>

      <EngagementForm mode="create" initial={{ stage: "mapping" }} baseSha={null} />
    </div>
  );
}
