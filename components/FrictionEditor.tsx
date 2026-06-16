"use client";

import { useState } from "react";
import { saveArtifact, callAi } from "@/lib/client";
import type { FrictionEntry } from "@/lib/schemas";
import { FRICTION_TYPES } from "@/lib/schemas";
import type { AiMeta } from "@/lib/ai-meta";

type Cluster = { name: string; frIds: string[]; sharedRoot: string; origin: "human" | "ai-draft" | "ai-confirmed" };
type FrictionData = {
  header: { service: string; scope: string; lead: string };
  entries: FrictionEntry[];
  clusters: Cluster[];
  honestAccount: string;
};

function emptyEntry(n: number): FrictionEntry {
  return {
    id: `FR-${String(n).padStart(2, "0")}`,
    where: "",
    type: "Delay",
    whatsWrong: "",
    whoFeels: "",
    evidence: "",
    severity: "moderate",
    frequency: "occasional",
    atDecision: { yes: false, ref: "" },
    notes: "",
    origin: "human",
  };
}

export function FrictionEditor({
  engagementId,
  initial,
  baseSha,
  status,
}: {
  engagementId: string;
  initial: FrictionData;
  baseSha: string | null;
  status: string;
}) {
  const [header, setHeader] = useState(initial.header);
  const [entries, setEntries] = useState<FrictionEntry[]>(initial.entries);
  const [clusters, setClusters] = useState<Cluster[]>(initial.clusters);
  const [honest, setHonest] = useState(initial.honestAccount);
  const [draftCandidates, setDraftCandidates] = useState<FrictionEntry[]>([]);
  const [sha, setSha] = useState(baseSha);
  const [busy, setBusy] = useState<"idle" | "drafting" | "clustering" | "saving">("idle");
  const [message, setMessage] = useState("");
  const [lastMeta, setLastMeta] = useState<AiMeta | null>(null);

  function setEntry(i: number, patch: Partial<FrictionEntry>) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }

  async function draftEntries() {
    setBusy("drafting");
    setMessage("");
    const res = await callAi<{ degraded: boolean; draft: { entries?: Array<Record<string, string>> } | null; aiMeta?: AiMeta; message?: string }>(
      "/api/ai/draft",
      { engagementId, target: "friction" },
    );
    setBusy("idle");
    setLastMeta(res.aiMeta || null);
    if (res.degraded || !res.draft?.entries?.length) {
      setMessage(res.message || "No candidates returned. Log friction by hand.");
      return;
    }
    const base = entries.length;
    setDraftCandidates(
      res.draft.entries.map((d, i) => ({
        ...emptyEntry(base + i + 1),
        where: d.where || "",
        type: (FRICTION_TYPES.includes(d.type as (typeof FRICTION_TYPES)[number]) ? d.type : "Delay") as FrictionEntry["type"],
        whatsWrong: d.whatsWrong || "",
        whoFeels: d.whoFeels || "",
        evidence: d.evidence || "",
        severity: (["low", "moderate", "high"].includes(d.severity) ? d.severity : "moderate") as FrictionEntry["severity"],
        frequency: (["rare", "occasional", "frequent", "constant"].includes(d.frequency) ? d.frequency : "occasional") as FrictionEntry["frequency"],
        origin: "ai-draft",
      })),
    );
    setMessage(`${res.draft.entries.length} AI candidate(s). Keep or cut each.`);
  }

  function keepCandidate(c: FrictionEntry) {
    setEntries((prev) => [...prev, { ...c, origin: "ai-confirmed" }]);
    setDraftCandidates((prev) => prev.filter((x) => x.id !== c.id));
  }
  function cutCandidate(c: FrictionEntry) {
    setDraftCandidates((prev) => prev.filter((x) => x.id !== c.id));
  }

  async function cluster() {
    setBusy("clustering");
    setMessage("");
    const res = await callAi<{ degraded: boolean; clusters: Array<{ name: string; frIds: string[]; sharedRoot: string }>; aiMeta?: AiMeta; message?: string }>(
      "/api/ai/cluster-friction",
      { engagementId },
    );
    setBusy("idle");
    setLastMeta(res.aiMeta || null);
    if (res.degraded || !res.clusters?.length) {
      setMessage(res.message || "No clusters returned. Group by hand.");
      return;
    }
    setClusters((prev) => [...prev, ...res.clusters.map((c) => ({ ...c, origin: "ai-draft" as const }))]);
    setMessage(`${res.clusters.length} candidate cluster(s) added below as AI drafts. You decide which hold.`);
  }

  async function save() {
    setBusy("saving");
    setMessage("");
    const aiAssisted = entries.some((e) => e.origin !== "human") || clusters.some((c) => c.origin !== "human");
    const res = await saveArtifact({
      engagementId,
      artifactId: "05",
      payload: { status: "in-review", aiAssisted, data: { header, entries, clusters, honestAccount: honest } },
      baseSha: sha,
      aiLog: lastMeta
        ? {
            feature: "friction-assist",
            promptId: lastMeta.promptId,
            model: lastMeta.model,
            modelVersion: lastMeta.modelVersion,
            outcome: lastMeta.outcome,
            latencyMs: lastMeta.latencyMs,
            inputSummary: lastMeta.inputSummary,
            outputSummary: lastMeta.outputSummary,
            humanDecision: `register saved with ${entries.length} entries`,
          }
        : undefined,
    });
    setBusy("idle");
    if (res.ok) {
      setSha(res.sha);
      setMessage("Saved. A commit landed on the data branch.");
    } else {
      setMessage(res.conflict ? "This artifact changed elsewhere. Reload and reapply." : `Save failed: ${res.error}`);
    }
  }

  return (
    <div className="stack-lg">
      <fieldset className="card grid grid--2">
        <legend className="t-system">Register header</legend>
        {(
          [
            ["service", "Service / lifecycle"],
            ["scope", "Scope"],
            ["lead", "Lead"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="field">
            <span className="t-system">{label}</span>
            <input type="text" value={header[k]} onChange={(e) => setHeader({ ...header, [k]: e.target.value })} />
          </label>
        ))}
      </fieldset>

      <div className="row">
        <button className="btn btn--primary" onClick={draftEntries} disabled={busy !== "idle"}>
          {busy === "drafting" ? "Drafting…" : "Draft entries from interviews"}
          <span className="ai-mark" aria-hidden="true">AI</span>
        </button>
        <button className="btn" onClick={() => setEntries((prev) => [...prev, emptyEntry(prev.length + 1)])}>
          + Add entry by hand
        </button>
      </div>

      {message && <p className="notice">{message}</p>}

      {draftCandidates.length > 0 && (
        <section className="stack" aria-label="AI candidate entries">
          <div className="ai-banner">
            <span className="ai-mark">AI candidates</span>
            <span>Each carries the words that prompted it. Keep or cut.</span>
          </div>
          {draftCandidates.map((c) => (
            <div key={c.id} className="card row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <div className="stack" style={{ flex: 1, minWidth: "18rem" }}>
                <span>
                  <span className="tag-chip">{c.type}</span> {c.whatsWrong}
                </span>
                <span className="t-faint t-system">where: {c.where || "—"} · evidence: {c.evidence || "—"}</span>
              </div>
              <div className="row">
                <button className="btn btn--primary" onClick={() => keepCandidate(c)}>Keep</button>
                <button className="btn" onClick={() => cutCandidate(c)}>Cut</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="stack">
        <h2 className="t-heading">Register</h2>
        {entries.length === 0 ? (
          <p className="t-faint">No friction logged yet.</p>
        ) : (
          entries.map((e, i) => (
            <fieldset key={e.id} className="card stack">
              <legend className="t-system">
                {e.id} {e.origin !== "human" && <span className="ai-mark">AI-assisted</span>}
              </legend>
              <div className="grid grid--2">
                <label className="field">
                  <span className="t-system">Where (stage / step / H- / D-)</span>
                  <input type="text" value={e.where} onChange={(ev) => setEntry(i, { where: ev.target.value })} />
                </label>
                <label className="field">
                  <span className="t-system">Type</span>
                  <select value={e.type} onChange={(ev) => setEntry(i, { type: ev.target.value as FrictionEntry["type"] })}>
                    {FRICTION_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span className="t-system">What&apos;s wrong</span>
                <textarea rows={2} value={e.whatsWrong} onChange={(ev) => setEntry(i, { whatsWrong: ev.target.value })} />
              </label>
              <div className="grid grid--2">
                <label className="field">
                  <span className="t-system">Who feels it</span>
                  <input type="text" value={e.whoFeels} onChange={(ev) => setEntry(i, { whoFeels: ev.target.value })} />
                </label>
                <label className="field">
                  <span className="t-system">Evidence &amp; source</span>
                  <input type="text" value={e.evidence} onChange={(ev) => setEntry(i, { evidence: ev.target.value })} />
                </label>
                <label className="field">
                  <span className="t-system">Severity</span>
                  <select value={e.severity} onChange={(ev) => setEntry(i, { severity: ev.target.value as FrictionEntry["severity"] })}>
                    <option value="low">low</option>
                    <option value="moderate">moderate</option>
                    <option value="high">high</option>
                  </select>
                </label>
                <label className="field">
                  <span className="t-system">How often</span>
                  <select value={e.frequency} onChange={(ev) => setEntry(i, { frequency: ev.target.value as FrictionEntry["frequency"] })}>
                    <option value="rare">rare</option>
                    <option value="occasional">occasional</option>
                    <option value="frequent">frequent</option>
                    <option value="constant">constant</option>
                  </select>
                </label>
              </div>
              <button className="btn btn--text" onClick={() => setEntries((prev) => prev.filter((_, idx) => idx !== i))}>
                Remove entry
              </button>
            </fieldset>
          ))
        )}
      </section>

      <section className="stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="t-heading">Clusters</h2>
          <button className="btn" onClick={cluster} disabled={busy !== "idle"}>
            {busy === "clustering" ? "Clustering…" : "Cluster friction"}
            <span className="ai-mark" aria-hidden="true">AI</span>
          </button>
        </div>
        {clusters.length === 0 ? (
          <p className="t-faint">No clusters yet.</p>
        ) : (
          clusters.map((c, i) => (
            <div key={i} className="card">
              <span className="t-subhead">{c.name}</span>{" "}
              {c.origin !== "human" && <span className="ai-mark">AI draft</span>}
              <p className="t-muted">Shared root: {c.sharedRoot || "—"}</p>
              <p className="t-faint t-system">{c.frIds.join(", ")}</p>
              <button className="btn btn--text" onClick={() => setClusters((prev) => prev.filter((_, idx) => idx !== i))}>
                Remove
              </button>
            </div>
          ))
        )}
      </section>

      <section className="stack">
        <h2 className="t-heading">The honest account</h2>
        <p className="t-faint">
          Three to five sentences, no hedging. This one is yours to write, not the AI&apos;s.
        </p>
        <textarea rows={4} value={honest} onChange={(e) => setHonest(e.target.value)} />
      </section>

      <div className="row">
        <button className="btn btn--primary" onClick={save} disabled={busy !== "idle"}>
          {busy === "saving" ? "Saving…" : "Save register"}
        </button>
        <span className="t-faint t-system">Status: {status}</span>
      </div>
    </div>
  );
}
