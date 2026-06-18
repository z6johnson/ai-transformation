"use client";

import { useState } from "react";
import { saveArtifact, callAi } from "@/lib/client";
import type { AiMeta } from "@/lib/ai-meta";
import { SortableCards } from "./SortableCards";

type Origin = "human" | "ai-draft" | "ai-applied" | "ai-confirmed";
type Step = {
  id: string;
  step: string;
  trigger: string;
  who: string;
  system: string;
  rule: string;
  handsOnTime: string;
  waitTime: string;
  whatGoesWrong: string;
  origin: Origin;
};
type ProcessData = { header: { service: string; scope: string; stages: string }; steps: Step[] };

const pad = (n: number) => String(n).padStart(2, "0");

export function ProcessEditor({
  engagementId,
  initial,
  baseSha,
  status,
}: {
  engagementId: string;
  initial: ProcessData;
  baseSha: string | null;
  status: string;
}) {
  const [header, setHeader] = useState(initial.header);
  const [steps, setSteps] = useState<Step[]>(initial.steps as Step[]);
  const [sha, setSha] = useState(baseSha);
  const [busy, setBusy] = useState<"idle" | "drafting" | "saving">("idle");
  const [message, setMessage] = useState("");
  const [draftMeta, setDraftMeta] = useState<AiMeta | null>(null);

  const hasAiContent = steps.some((s) => s.origin === "ai-applied");

  function setStep(i: number, k: keyof Step, v: string) {
    setSteps((p) => p.map((x, idx) => (idx === i ? { ...x, [k]: v, origin: "human" } : x)));
  }

  async function draft() {
    setBusy("drafting");
    setMessage("");
    const res = await callAi<{ degraded: boolean; draft: { steps?: Array<Record<string, string>> } | null; aiMeta?: AiMeta; message?: string }>(
      "/api/ai/draft",
      { engagementId, target: "process" },
    );
    setBusy("idle");
    setDraftMeta(res.aiMeta || null);
    if (res.degraded || !res.draft?.steps?.length) {
      setMessage(res.message || "No draft returned. Build the process by hand.");
      return;
    }
    setSteps((prev) => [
      ...prev,
      ...res.draft!.steps!.map((s, i) => ({
        id: `P-${pad(prev.length + i + 1)}`,
        step: s.step || "",
        trigger: s.trigger || "",
        who: s.who || "",
        system: s.system || "",
        rule: s.rule || "",
        handsOnTime: s.handsOnTime || "",
        waitTime: s.waitTime || "",
        whatGoesWrong: s.whatGoesWrong || "",
        origin: "ai-applied" as Origin,
      })),
    ]);
    setMessage("AI applied a draft from the interviews, journey, and blueprint. Edit any field to replace it, or remove steps that don't hold.");
  }

  async function save() {
    setBusy("saving");
    setMessage("");
    const res = await saveArtifact({
      engagementId,
      artifactId: "04",
      payload: { status: "in-review", aiAssisted: hasAiContent || Boolean(draftMeta), data: { header, steps } },
      baseSha: sha,
      aiLog: draftMeta
        ? {
            feature: "draft-process",
            promptId: draftMeta.promptId,
            model: draftMeta.model,
            modelVersion: draftMeta.modelVersion,
            outcome: draftMeta.outcome,
            latencyMs: draftMeta.latencyMs,
            inputSummary: draftMeta.inputSummary,
            outputSummary: draftMeta.outputSummary,
            humanDecision: `kept AI draft; ${steps.length} step(s) after review`,
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
        <legend className="t-system">Header</legend>
        {(
          [
            ["service", "Service / lifecycle"],
            ["scope", "Scope"],
            ["stages", "Stages covered"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="field">
            <span className="t-system">{label}</span>
            <input type="text" value={header[k]} onChange={(e) => setHeader({ ...header, [k]: e.target.value })} />
          </label>
        ))}
      </fieldset>

      <div className="row">
        <button className="btn btn--primary" onClick={draft} disabled={busy !== "idle"}>
          {busy === "drafting" ? "Drafting…" : "Draft from interviews"}
          <span className="ai-mark" aria-hidden="true">AI</span>
        </button>
        <button
          className="btn"
          onClick={() =>
            setSteps((p) => [...p, { id: `P-${pad(p.length + 1)}`, step: "", trigger: "", who: "", system: "", rule: "", handsOnTime: "", waitTime: "", whatGoesWrong: "", origin: "human" }])
          }
        >
          + Add step by hand
        </button>
      </div>

      {message && <p className="notice">{message}</p>}

      {hasAiContent && (
        <div className="ai-banner">
          <span className="ai-mark">AI applied</span>
          <span>AI drafted the marked steps. Edit any field to replace it; your text takes over.</span>
        </div>
      )}

      <h2 className="t-heading">Steps</h2>
      <SortableCards
        items={steps}
        getKey={(s) => s.id}
        onReorder={setSteps}
        onRemove={(i) => setSteps((p) => p.filter((_, idx) => idx !== i))}
        cardLabel={(s) => s.id}
        legend={(s) => (
          <legend className="t-system">
            {s.id} {s.origin === "ai-applied" && <span className="ai-mark">AI applied</span>}
          </legend>
        )}
        columnsStorageKey={`card-cols:process:${engagementId}`}
        defaultColumns={2}
        renderCard={(s, i) => (
          <div className="grid grid--2">
            {(
              [
                ["step", "What happens"],
                ["trigger", "What sets it off"],
                ["who", "Who does it"],
                ["system", "System"],
                ["rule", "Rule / standard"],
                ["handsOnTime", "Hands-on time"],
                ["waitTime", "Wait time"],
                ["whatGoesWrong", "What goes wrong"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="field">
                <span className="t-system">{label}</span>
                <input type="text" value={s[k]} onChange={(e) => setStep(i, k, e.target.value)} />
              </label>
            ))}
          </div>
        )}
      />

      {message && <p className="notice">{message}</p>}
      <div className="row">
        <button className="btn btn--primary" onClick={save} disabled={busy !== "idle"}>
          {busy === "saving" ? "Saving…" : "Save process documentation"}
        </button>
        <span className="t-faint t-system">Status: {status}</span>
      </div>
    </div>
  );
}
