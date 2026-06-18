"use client";

import { useState } from "react";
import { saveArtifact, callAi } from "@/lib/client";
import type { Provenanced } from "@/lib/schemas";
import type { AiMeta } from "@/lib/ai-meta";

type Synthesis = {
  whereItStands: Provenanced;
  frictionPatterns: Provenanced;
  decisionsForDesign: Provenanced;
  openQuestions: Provenanced;
};

const FIELDS: Array<[keyof Synthesis, string]> = [
  ["whereItStands", "Where the service stands"],
  ["frictionPatterns", "Patterns across the friction"],
  ["decisionsForDesign", "Decisions the design phase will weigh"],
  ["openQuestions", "Open questions and known gaps"],
];

const p = (value = "", origin: Provenanced["origin"] = "human"): Provenanced => ({ value, origin });

export function ReportEditor({
  engagementId,
  initial,
  baseSha,
  status,
}: {
  engagementId: string;
  initial: { header: { service: string; scope: string; lead: string }; synthesis: Synthesis; generatedAt: string };
  baseSha: string | null;
  status: string;
}) {
  const [synthesis, setSynthesis] = useState<Synthesis>(initial.synthesis);
  const [sha, setSha] = useState(baseSha);
  const [busy, setBusy] = useState<"idle" | "drafting" | "saving">("idle");
  const [message, setMessage] = useState("");
  const [draftMeta, setDraftMeta] = useState<AiMeta | null>(null);

  const hasAiContent = FIELDS.some(([k]) => synthesis[k].origin === "ai-applied");

  async function draft() {
    setBusy("drafting");
    setMessage("");
    const res = await callAi<{ degraded: boolean; draft: Record<string, string> | null; aiMeta?: AiMeta; message?: string }>(
      "/api/ai/brief",
      { engagementId },
    );
    setBusy("idle");
    setDraftMeta(res.aiMeta || null);
    if (res.degraded || !res.draft) {
      setMessage(res.message || "No synthesis returned. Write the briefing by hand.");
      return;
    }
    const d = res.draft;
    setSynthesis({
      whereItStands: p(d.whereItStands || "", "ai-applied"),
      frictionPatterns: p(d.frictionPatterns || "", "ai-applied"),
      decisionsForDesign: p(d.decisionsForDesign || "", "ai-applied"),
      openQuestions: p(d.openQuestions || "", "ai-applied"),
    });
    setMessage("AI applied a synthesis from the confirmed map. Edit any section to replace it; your text takes over.");
  }

  async function save() {
    setBusy("saving");
    setMessage("");
    const edited = draftMeta ? FIELDS.filter(([k]) => synthesis[k].origin === "human" && synthesis[k].value).length : 0;
    const res = await saveArtifact({
      engagementId,
      artifactId: "07",
      payload: {
        status: "in-review",
        aiAssisted: hasAiContent || Boolean(draftMeta),
        data: { header: initial.header, synthesis, generatedAt: new Date().toISOString() },
      },
      baseSha: sha,
      aiLog: draftMeta
        ? {
            feature: "draft-report",
            promptId: draftMeta.promptId,
            model: draftMeta.model,
            modelVersion: draftMeta.modelVersion,
            outcome: draftMeta.outcome,
            latencyMs: draftMeta.latencyMs,
            inputSummary: draftMeta.inputSummary,
            outputSummary: draftMeta.outputSummary,
            humanDecision: `kept AI synthesis, edited ${edited} section(s)`,
          }
        : undefined,
    });
    setBusy("idle");
    if (res.ok) {
      setSha(res.sha);
      setMessage("Saved. A commit landed on the data branch.");
    } else {
      setMessage(res.conflict ? "This report changed elsewhere. Reload and reapply." : `Save failed: ${res.error}`);
    }
  }

  return (
    <div className="stack-lg no-print">
      <div className="row">
        <button className="btn btn--primary" onClick={draft} disabled={busy !== "idle"}>
          {busy === "drafting" ? "Drafting…" : "Draft synthesis from the map"}
          <span className="ai-mark" aria-hidden="true">AI</span>
        </button>
        <button className="btn" onClick={() => window.print()}>
          Print / save as PDF
        </button>
      </div>

      {message && <p className="notice">{message}</p>}

      {hasAiContent && (
        <div className="ai-banner">
          <span className="ai-mark">AI applied</span>
          <span>AI drafted the marked sections from the confirmed map. Edit any section to replace it.</span>
        </div>
      )}

      {FIELDS.map(([k, label]) => {
        const prov = synthesis[k];
        return (
          <label key={String(k)} className="field card">
            <span className="t-system">
              {label} {prov.origin === "ai-applied" && <span className="ai-mark">AI applied</span>}
            </span>
            <textarea
              rows={4}
              value={prov.value}
              onChange={(e) => setSynthesis((prev) => ({ ...prev, [k]: { value: e.target.value, origin: "human" } }))}
            />
          </label>
        );
      })}

      <div className="row">
        <button className="btn btn--primary" onClick={save} disabled={busy !== "idle"}>
          {busy === "saving" ? "Saving…" : "Save report"}
        </button>
        <span className="t-faint t-system">Status: {status}</span>
      </div>
    </div>
  );
}
