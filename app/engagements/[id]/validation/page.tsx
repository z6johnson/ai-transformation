import { notFound } from "next/navigation";
import { isStorageConfigured } from "@/lib/github";
import { loadEngagement, loadArtifact, readAiLog } from "@/lib/store";
import { SetupNotice } from "@/components/SetupNotice";
import { TemplateNav } from "@/components/TemplateNav";
import { ValidationEditor } from "@/components/ValidationEditor";

export const dynamic = "force-dynamic";

export default async function ValidationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isStorageConfigured()) return <SetupNotice what="storage" />;
  const engagement = await loadEngagement(id);
  if (!engagement) notFound();
  const { data, sha } = await loadArtifact(id, "06");
  const aiLog = await readAiLog(id);

  return (
    <div className="stack-lg">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="/">Engagements</a>
        <span aria-hidden="true">/</span>
        <a href={`/engagements/${id}`}>{engagement.name}</a>
        <span aria-hidden="true">/</span>
        <span>Validation Packet</span>
      </nav>
      <TemplateNav engagementId={id} activeId="06" />
      <header className="stack">
        <div className="t-system">06 · Validation Packet</div>
        <h1 className="t-display">Closing the mapping stage</h1>
        <p className="t-muted">
          Coverage check, the review session, the honest account, and sign-off. On the lifecycle owner&apos;s sign-off, the
          stage closes and the engagement moves to Design.
        </p>
      </header>

      <section className="card stack">
        <h2 className="t-heading">How AI was used</h2>
        <p className="t-faint">Read straight from the engagement&apos;s AI decision log, so it cannot drift from what happened.</p>
        {aiLog.length === 0 ? (
          <p className="t-faint">No AI assistance recorded for this engagement.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Feature</th>
                <th scope="col">Model</th>
                <th scope="col">Input</th>
                <th scope="col">Human decision</th>
                <th scope="col">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {aiLog.map((r, i) => (
                <tr key={i}>
                  <td className="t-system">{new Date(r.ts).toLocaleString()}</td>
                  <td>{r.feature}</td>
                  <td className="t-system">{r.model}</td>
                  <td className="t-faint">{r.inputSummary}</td>
                  <td>{r.humanDecision || "—"}</td>
                  <td className="t-system">{r.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <dl className="outcome-legend t-faint">
          <div>
            <dt className="t-system">ok</dt>
            <dd>The model call succeeded and returned valid, parseable content.</dd>
          </div>
          <div>
            <dt className="t-system">timeout</dt>
            <dd>The call ran past the configured time limit; no result was used.</dd>
          </div>
          <div>
            <dt className="t-system">fallback</dt>
            <dd>The call failed (rate limit, error, malformed, or unconfigured) and a person completed the step by hand.</dd>
          </div>
          <div>
            <dt className="t-system">error</dt>
            <dd>An unexpected failure.</dd>
          </div>
        </dl>
        <p className="t-faint">
          Outcome describes whether the AI <em>call</em> ran — not whether its suggestion was accepted. Acceptance is the
          separate &ldquo;Human decision&rdquo; column.
        </p>
      </section>

      <ValidationEditor engagementId={id} initial={data.data} baseSha={sha} status={data.status} />
    </div>
  );
}
