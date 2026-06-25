"use client";

import { useState } from "react";
import { callAi, saveSynthesis } from "@/lib/client";
import type { AiMeta } from "@/lib/ai-meta";
import type { SynthesisSection } from "@/lib/library-schemas";

const ACTOR = "you"; // The save route stamps the real actor server-side from PRACTICE_ACTOR.

type SynthesisResponse = {
  degraded: boolean;
  sections: Array<Omit<SynthesisSection, "origin">>;
  summary: string;
  aiMeta?: AiMeta;
  retrievalMode?: "embeddings" | "lexical";
  message?: string;
};

export function LibrarySynthesisPanel({
  engagementId,
  indexed,
  retrievalMode,
  initialSections,
  initialSummary,
  synBaseSha,
}: {
  engagementId: string;
  indexed: boolean;
  retrievalMode: "embeddings" | "lexical" | "none";
  initialSections: SynthesisSection[];
  initialSummary: string;
  synBaseSha: string | null;
}) {
  const [confirmed, setConfirmed] = useState<SynthesisSection[]>(initialSections);
  const [drafts, setDrafts] = useState<SynthesisSection[]>([]);
  const [summary, setSummary] = useState(initialSummary);
  const [mode, setMode] = useState<"embeddings" | "lexical" | "none">(retrievalMode);
  const [synSha, setSynSha] = useState(synBaseSha);
  const [busy, setBusy] = useState<"idle" | "running" | "saving">("idle");
  const [message, setMessage] = useState("");
  const [live, setLive] = useState("");

  async function run() {
    setBusy("running");
    setMessage("");
    const res = await callAi<SynthesisResponse>("/api/ai/library-synthesis", { engagementId });
    setBusy("idle");
    if (res.retrievalMode) setMode(res.retrievalMode);
    if (res.degraded || !res.sections?.length) {
      setDrafts([]);
      setMessage(res.message || "No synthesis returned, or it is unavailable right now.");
      return;
    }
    setDrafts(res.sections.map((s) => ({ ...s, origin: "ai-draft" as const })));
    if (res.summary) setSummary(res.summary);
    setMessage(`AI drafted ${res.sections.length} section(s). Confirm the ones that hold.`);
    setLive(`Synthesis returned ${res.sections.length} sections via ${res.retrievalMode} retrieval.`);
  }

  function confirmDraft(s: SynthesisSection) {
    const now = new Date().toISOString();
    setConfirmed((prev) => [...prev, { ...s, origin: "ai-confirmed", confirmedBy: ACTOR, confirmedAt: now }]);
    setDrafts((prev) => prev.filter((d) => d.id !== s.id));
    setLive(`Confirmed ${s.id}.`);
  }

  function rejectDraft(s: SynthesisSection) {
    setDrafts((prev) => prev.filter((d) => d.id !== s.id));
    setLive(`Rejected ${s.id}.`);
  }

  function removeConfirmed(id: string) {
    setConfirmed((prev) => prev.filter((s) => s.id !== id));
  }

  async function save() {
    setBusy("saving");
    setMessage("");
    const res = await saveSynthesis({
      engagementId,
      payload: {
        status: "in-review",
        data: { sections: confirmed, summary, generatedAt: new Date().toISOString(), retrievalMode: mode },
      },
      baseSha: synSha,
    });
    setBusy("idle");
    if (res.ok) {
      setSynSha(res.sha);
      setMessage("Saved. The mapping drafts can now read this baseline as reference context.");
    } else {
      setMessage(res.conflict ? "This changed elsewhere. Reload and reapply." : `Save failed: ${res.error}`);
    }
  }

  return (
    <section className="stack-lg" aria-label="Baseline synthesis">
      <div aria-live="polite" className="visually-hidden">
        {live}
      </div>

      <div className="card stack">
        <div className="row row--between row--baseline">
          <span className="t-system">Baseline synthesis</span>
          {mode !== "none" && <span className="t-faint t-system">retrieval: {mode}</span>}
        </div>
        <p className="t-faint t-system">
          A structured summary of what the reference documents <em>say</em> should happen — the documented baseline. It is
          reference only, never ground truth. Once confirmed, the mapping drafts can read it as clearly-labeled context to
          surface coverage gaps, without it overriding the interviews. Every section is a draft you confirm.
        </p>
        <div className="row">
          <button className="btn btn--primary" onClick={run} disabled={busy !== "idle" || !indexed}>
            {busy === "running" ? "Synthesizing…" : "Synthesize baseline"}
            <span className="ai-mark" aria-hidden="true">AI</span>
          </button>
          {!indexed && <span className="t-faint t-system">Build the library index first.</span>}
        </div>
        {message && <p className="notice">{message}</p>}
      </div>

      {drafts.length > 0 && (
        <section className="stack" aria-label="Drafted sections for review">
          <div className="ai-banner">
            <span className="ai-mark">AI drafted</span>
            <span>Confirm the sections that faithfully summarize the documents, or reject them.</span>
          </div>
          {drafts.map((s) => (
            <SectionCard key={s.id} s={s} actions={
              <>
                <button className="btn btn--primary" onClick={() => confirmDraft(s)}>Confirm</button>
                <button className="btn" onClick={() => rejectDraft(s)}>Reject</button>
              </>
            } />
          ))}
        </section>
      )}

      <section className="stack">
        <h2 className="t-heading">Confirmed baseline synthesis</h2>
        {confirmed.length === 0 ? (
          <p className="t-faint">None confirmed yet.</p>
        ) : (
          confirmed.map((s) => (
            <SectionCard key={s.id} s={s} actions={
              <button className="btn btn--text" onClick={() => removeConfirmed(s.id)}>Remove</button>
            } />
          ))
        )}
        <label className="field stack">
          <span className="t-system">Overall summary</span>
          <textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="A one-paragraph overview of the documented baseline." />
        </label>
        <div className="row">
          <button className="btn btn--primary" onClick={save} disabled={busy !== "idle"}>
            {busy === "saving" ? "Saving…" : "Save baseline synthesis"}
          </button>
        </div>
      </section>
    </section>
  );
}

function SectionCard({ s, actions }: { s: SynthesisSection; actions: React.ReactNode }) {
  return (
    <div className="card stack">
      <div className="row row--between row--baseline">
        <span className="t-system">{s.heading || "—"}</span>
        <span className="tag-chip">{s.id}</span>
      </div>
      <p>{s.body || "—"}</p>
      {s.baselineRefs.length > 0 && (
        <p className="t-faint t-system">baseline: {s.baselineRefs.join(", ")}</p>
      )}
      <div className="row">{actions}</div>
    </div>
  );
}
