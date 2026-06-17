"use client";

import { useState } from "react";
import { saveArtifact, callAi } from "@/lib/client";
import type { Provenanced } from "@/lib/schemas";
import type { AiMeta } from "@/lib/ai-meta";
import { SortableCards } from "./SortableCards";

type Stage = {
  name: string;
  order: number;
  doing: Provenanced;
  wants: Provenanced;
  touchpoints: Provenanced;
  thinkingFeeling: Provenanced;
  waitingFor: Provenanced;
  effort: "low" | "moderate" | "high";
  effortWhy: Provenanced;
  frictionRefs: string[];
  duration: string;
};
type JourneyData = {
  header: { service: string; scope: string; person: string; others: string; sources: string[] };
  stages: Stage[];
  momentsThatMatter: { moment: string; why: string }[];
  dropoutPoints: { point: string; what: string }[];
};

const p = (value = "", origin: Provenanced["origin"] = "human"): Provenanced => ({ value, origin });
const FIELDS: Array<[keyof Stage, string]> = [
  ["doing", "What the person is doing"],
  ["wants", "What they want here"],
  ["touchpoints", "Points of contact"],
  ["thinkingFeeling", "Thinking & feeling"],
  ["waitingFor", "What they wait for"],
  ["effortWhy", "Why this effort level"],
];

function emptyStage(order: number): Stage {
  return {
    name: "",
    order,
    doing: p(),
    wants: p(),
    touchpoints: p(),
    thinkingFeeling: p(),
    waitingFor: p(),
    effort: "moderate",
    effortWhy: p(),
    frictionRefs: [],
    duration: "",
  };
}

export function JourneyEditor({
  engagementId,
  initial,
  baseSha,
  status,
}: {
  engagementId: string;
  initial: JourneyData;
  baseSha: string | null;
  status: string;
}) {
  const [header, setHeader] = useState(initial.header);
  const [stages, setStages] = useState<Stage[]>(initial.stages);
  const [sha, setSha] = useState(baseSha);
  const [busy, setBusy] = useState<"idle" | "drafting" | "saving">("idle");
  const [message, setMessage] = useState("");
  const [draftMeta, setDraftMeta] = useState<AiMeta | null>(null);

  const PROV_FIELDS = ["doing", "wants", "touchpoints", "thinkingFeeling", "waitingFor", "effortWhy"] as const;
  const hasAiContent = stages.some((s) => PROV_FIELDS.some((k) => s[k].origin === "ai-applied"));

  function setStageField(i: number, key: keyof Stage, prov: Provenanced) {
    setStages((prev) => prev.map((s, idx) => (idx === i ? { ...s, [key]: prov } : s)));
  }

  async function draft() {
    setBusy("drafting");
    setMessage("");
    const res = await callAi<{ degraded: boolean; draft: { stages?: Array<Record<string, string>> } | null; aiMeta?: AiMeta; message?: string }>(
      "/api/ai/draft",
      { engagementId, target: "journey" },
    );
    setBusy("idle");
    setDraftMeta(res.aiMeta || null);
    if (res.degraded || !res.draft?.stages?.length) {
      setMessage(res.message || "No draft returned. Build the map by hand.");
      return;
    }
    const drafted: Stage[] = res.draft.stages.map((d, i) => ({
      ...emptyStage(i + 1),
      name: d.name || "",
      duration: d.duration || "",
      effort: (["low", "moderate", "high"].includes(d.effort) ? d.effort : "moderate") as Stage["effort"],
      doing: p(d.doing || "", "ai-applied"),
      wants: p(d.wants || "", "ai-applied"),
      touchpoints: p(d.touchpoints || "", "ai-applied"),
      thinkingFeeling: p(d.thinkingFeeling || "", "ai-applied"),
      waitingFor: p(d.waitingFor || "", "ai-applied"),
      effortWhy: p("", "ai-applied"),
    }));
    setStages(drafted);
    setMessage("AI applied a draft. Edit any field to replace it, or remove stages that don't hold.");
  }

  async function save() {
    setBusy("saving");
    setMessage("");
    // Count how many AI-applied fields the human edited (origin flipped to human).
    const draftedFields = stages.length * PROV_FIELDS.length;
    const stillApplied = stages.reduce((n, s) => n + PROV_FIELDS.filter((k) => s[k].origin === "ai-applied").length, 0);
    const edited = draftMeta ? Math.max(0, draftedFields - stillApplied) : 0;
    const res = await saveArtifact({
      engagementId,
      artifactId: "02",
      payload: { status: "in-review", aiAssisted: hasAiContent || Boolean(draftMeta), data: { ...initial, header, stages: stages.map((s, i) => ({ ...s, order: i })) } },
      baseSha: sha,
      aiLog: draftMeta
        ? {
            feature: "draft-journey",
            promptId: draftMeta.promptId,
            model: draftMeta.model,
            modelVersion: draftMeta.modelVersion,
            outcome: draftMeta.outcome,
            latencyMs: draftMeta.latencyMs,
            inputSummary: draftMeta.inputSummary,
            outputSummary: draftMeta.outputSummary,
            humanDecision: `kept AI draft, edited ${edited} field(s)`,
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

  const saveDisabled = busy !== "idle";

  return (
    <div className="stack-lg">
      <fieldset className="card grid grid--2">
        <legend className="t-system">Map header</legend>
        {(
          [
            ["service", "Service / lifecycle"],
            ["scope", "Scope"],
            ["person", "The person"],
            ["others", "Others involved"],
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
        <button className="btn" onClick={() => setStages((p2) => [...p2, emptyStage(p2.length + 1)])}>
          + Add stage by hand
        </button>
      </div>

      {message && <p className="notice">{message}</p>}

      {hasAiContent && (
        <div className="ai-banner">
          <span className="ai-mark">AI applied</span>
          <span>AI filled these fields. Edit any field to replace it; your text takes over.</span>
        </div>
      )}

      <SortableCards
        items={stages}
        getKey={(_, i) => String(i)}
        onReorder={setStages}
        onRemove={(i) => setStages((prev) => prev.filter((_, idx) => idx !== i))}
        cardLabel={(_, i) => `Stage ${i + 1}`}
        legend={(_, i) => <legend className="t-system">Stage {i + 1}</legend>}
        columnsStorageKey={`card-cols:journey:${engagementId}`}
        defaultColumns={2}
        renderCard={(s, i) => (
          <>
            <label className="field">
              <span className="t-system">Stage name</span>
              <input type="text" value={s.name} onChange={(e) => setStages((prev) => prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))} />
            </label>
            {FIELDS.map(([key, label]) => {
              const prov = s[key] as Provenanced;
              return (
                <label key={String(key)} className="field">
                  <span className="t-system">
                    {label} {prov.origin === "ai-applied" && <span className="ai-mark">AI applied</span>}
                  </span>
                  <textarea
                    rows={2}
                    value={prov.value}
                    onChange={(e) => setStageField(i, key, { value: e.target.value, origin: "human" })}
                  />
                </label>
              );
            })}
            <div className="grid grid--2">
              <label className="field">
                <span className="t-system">Effort</span>
                <select value={s.effort} onChange={(e) => setStages((prev) => prev.map((x, idx) => (idx === i ? { ...x, effort: e.target.value as Stage["effort"] } : x)))}>
                  <option value="low">low</option>
                  <option value="moderate">moderate</option>
                  <option value="high">high</option>
                </select>
              </label>
              <label className="field">
                <span className="t-system">Typical duration</span>
                <input type="text" value={s.duration} onChange={(e) => setStages((prev) => prev.map((x, idx) => (idx === i ? { ...x, duration: e.target.value } : x)))} />
              </label>
            </div>
          </>
        )}
      />

      <div className="row">
        <button className="btn btn--primary" onClick={save} disabled={saveDisabled}>
          {busy === "saving" ? "Saving…" : "Save journey map"}
        </button>
        <span className="t-faint t-system">Status: {status}</span>
      </div>
    </div>
  );
}
