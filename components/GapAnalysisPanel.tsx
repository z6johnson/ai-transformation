"use client";

import { useState } from "react";
import { callAi, saveGapAnalysis, saveArtifact } from "@/lib/client";
import type { AiMeta } from "@/lib/ai-meta";
import type { z } from "zod";
import type { GapFinding } from "@/lib/library-schemas";
import { FrictionRegister, type FrictionEntry } from "@/lib/schemas";

const ACTOR = "you"; // The save route stamps the real actor server-side from PRACTICE_ACTOR.

type FrictionData = z.infer<typeof FrictionRegister>["data"];

type GapResponse = {
  degraded: boolean;
  findings: Array<Omit<GapFinding, "origin">>;
  aiMeta?: AiMeta;
  retrievalMode?: "embeddings" | "lexical";
  message?: string;
};

export function GapAnalysisPanel({
  engagementId,
  indexed,
  retrievalMode,
  initialFindings,
  gapBaseSha,
  friction,
  frictionSha,
}: {
  engagementId: string;
  indexed: boolean;
  retrievalMode: "embeddings" | "lexical" | "none";
  initialFindings: GapFinding[];
  gapBaseSha: string | null;
  friction: FrictionData;
  frictionSha: string | null;
}) {
  const [confirmed, setConfirmed] = useState<GapFinding[]>(initialFindings);
  const [drafts, setDrafts] = useState<GapFinding[]>([]);
  const [mode, setMode] = useState<"embeddings" | "lexical" | "none">(retrievalMode);
  const [gapSha, setGapSha] = useState(gapBaseSha);
  const [frSha, setFrSha] = useState(frictionSha);
  const [busy, setBusy] = useState<"idle" | "running" | "saving" | "sending">("idle");
  const [message, setMessage] = useState("");
  const [live, setLive] = useState("");

  async function run() {
    setBusy("running");
    setMessage("");
    const res = await callAi<GapResponse>("/api/ai/gap-analysis", { engagementId });
    setBusy("idle");
    if (res.retrievalMode) setMode(res.retrievalMode);
    if (res.degraded || !res.findings?.length) {
      setDrafts([]);
      setMessage(res.message || "No divergences found, or the analysis is unavailable right now.");
      return;
    }
    setDrafts(res.findings.map((f) => ({ ...f, origin: "ai-draft" as const })));
    setMessage(`AI drafted ${res.findings.length} divergence(s). Confirm the ones that hold.`);
    setLive(`Gap analysis returned ${res.findings.length} findings via ${res.retrievalMode} retrieval.`);
  }

  function confirmDraft(f: GapFinding) {
    const now = new Date().toISOString();
    setConfirmed((prev) => [...prev, { ...f, origin: "ai-confirmed", confirmedBy: ACTOR, confirmedAt: now }]);
    setDrafts((prev) => prev.filter((d) => d.id !== f.id));
    setLive(`Confirmed ${f.id}.`);
  }

  function rejectDraft(f: GapFinding) {
    setDrafts((prev) => prev.filter((d) => d.id !== f.id));
    setLive(`Rejected ${f.id}.`);
  }

  function removeConfirmed(id: string) {
    setConfirmed((prev) => prev.filter((f) => f.id !== id));
  }

  async function save() {
    setBusy("saving");
    setMessage("");
    const res = await saveGapAnalysis({
      engagementId,
      payload: {
        status: "in-review",
        data: { findings: confirmed, generatedAt: new Date().toISOString(), retrievalMode: mode },
      },
      baseSha: gapSha,
    });
    setBusy("idle");
    if (res.ok) {
      setGapSha(res.sha);
      setMessage("Saved. A commit landed on the data branch.");
    } else {
      setMessage(res.conflict ? "This changed elsewhere. Reload and reapply." : `Save failed: ${res.error}`);
    }
  }

  // Push confirmed divergences into the Friction Register (05) as ai-draft entries the lead
  // can refine there. Descriptive only — names what diverges, never a fix.
  async function sendToFriction() {
    if (!confirmed.length) return;
    setBusy("sending");
    setMessage("");
    const newEntries: FrictionEntry[] = confirmed.map((g, i) => ({
      id: `FR-GAP-${String(i + 1).padStart(2, "0")}`,
      where: g.area,
      type: "Rework",
      whatsWrong: g.divergence,
      whoFeels: "",
      evidence: `Documented: ${g.documentedBaseline} — Actual: ${g.actualPractice}`.trim(),
      severity: "moderate",
      frequency: "occasional",
      atDecision: { yes: false, ref: "" },
      notes: g.baselineRefs.length ? `Baseline refs: ${g.baselineRefs.join(", ")}` : "",
      origin: "ai-draft",
    }));
    // Drop any prior gap-sourced entries so re-sending doesn't duplicate.
    const kept = friction.entries.filter((e) => !e.id.startsWith("FR-GAP-"));
    const res = await saveArtifact({
      engagementId,
      artifactId: "05",
      payload: { status: "in-review", aiAssisted: true, data: { ...friction, entries: [...kept, ...newEntries] } },
      baseSha: frSha,
      aiLog: {
        feature: "gap-analysis",
        promptId: "gap-analysis.v1",
        humanDecision: `pushed ${newEntries.length} divergence(s) to friction register`,
      },
    });
    setBusy("idle");
    if (res.ok) {
      setFrSha(res.sha);
      setMessage(`Added ${newEntries.length} entr(ies) to the Friction Register as AI-draft for your review.`);
    } else {
      setMessage(res.conflict ? "The friction register changed elsewhere. Reload and reapply." : `Could not update friction register: ${res.error}`);
    }
  }

  return (
    <section className="stack-lg" aria-label="Gap analysis">
      <div aria-live="polite" className="visually-hidden">
        {live}
      </div>

      <div className="card stack">
        <div className="row row--between row--baseline">
          <span className="t-system">Documented vs. actual — gap analysis</span>
          {mode !== "none" && <span className="t-faint t-system">retrieval: {mode}</span>}
        </div>
        <p className="t-faint t-system">
          Contrast the written policy/procedure baseline against the as-is map (interviews, journey, friction) and
          surface where they diverge. The map is the ground truth; the baseline is reference only. Every finding is a
          draft you confirm.
        </p>
        <div className="row">
          <button className="btn btn--primary" onClick={run} disabled={busy !== "idle" || !indexed}>
            {busy === "running" ? "Analyzing…" : "Run gap analysis"}
            <span className="ai-mark" aria-hidden="true">AI</span>
          </button>
          {!indexed && <span className="t-faint t-system">Build the library index first.</span>}
        </div>
        {message && <p className="notice">{message}</p>}
      </div>

      {drafts.length > 0 && (
        <section className="stack" aria-label="Drafted divergences for review">
          <div className="ai-banner">
            <span className="ai-mark">AI drafted</span>
            <span>Confirm the divergences that hold, or reject them.</span>
          </div>
          {drafts.map((f) => (
            <FindingCard key={f.id} f={f} actions={
              <>
                <button className="btn btn--primary" onClick={() => confirmDraft(f)}>Confirm</button>
                <button className="btn" onClick={() => rejectDraft(f)}>Reject</button>
              </>
            } />
          ))}
        </section>
      )}

      <section className="stack">
        <h2 className="t-heading">Confirmed divergences</h2>
        {confirmed.length === 0 ? (
          <p className="t-faint">None confirmed yet.</p>
        ) : (
          confirmed.map((f) => (
            <FindingCard key={f.id} f={f} actions={
              <button className="btn btn--text" onClick={() => removeConfirmed(f.id)}>Remove</button>
            } />
          ))
        )}
        <div className="row">
          <button className="btn btn--primary" onClick={save} disabled={busy !== "idle"}>
            {busy === "saving" ? "Saving…" : "Save gap analysis"}
          </button>
          <button className="btn" onClick={sendToFriction} disabled={busy !== "idle" || !confirmed.length}>
            {busy === "sending" ? "Adding…" : "Send to Friction Register"}
          </button>
        </div>
      </section>
    </section>
  );
}

function FindingCard({ f, actions }: { f: GapFinding; actions: React.ReactNode }) {
  return (
    <div className="card stack">
      <div className="row row--between row--baseline">
        <span className="t-system">{f.area || "—"}</span>
        <span className="tag-chip">{f.id}</span>
      </div>
      <p className="t-system"><strong>Documented:</strong> {f.documentedBaseline || "—"}</p>
      <p className="t-system"><strong>Actual:</strong> {f.actualPractice || "—"}</p>
      <p><strong>Divergence:</strong> {f.divergence || "—"}</p>
      {(f.baselineRefs.length > 0 || f.mapRefs.length > 0) && (
        <p className="t-faint t-system">
          {f.baselineRefs.length > 0 && <>baseline: {f.baselineRefs.join(", ")}</>}
          {f.baselineRefs.length > 0 && f.mapRefs.length > 0 && " · "}
          {f.mapRefs.length > 0 && <>map: {f.mapRefs.join(", ")}</>}
        </p>
      )}
      <div className="row">{actions}</div>
    </div>
  );
}
