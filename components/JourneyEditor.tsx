"use client";

import { useState } from "react";
import { saveArtifact, callAi } from "@/lib/client";
import type { Provenanced } from "@/lib/schemas";
import type { AiMeta } from "@/lib/ai-meta";

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
  const [needsReview, setNeedsReview] = useState(false);
  const [reviewed, setReviewed] = useState(false);

  const hasAiDraft = stages.some((s) =>
    (["doing", "wants", "touchpoints", "thinkingFeeling", "waitingFor", "effortWhy"] as const).some((k) => s[k].origin === "ai-draft"),
  );

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
      doing: p(d.doing || "", "ai-draft"),
      wants: p(d.wants || "", "ai-draft"),
      touchpoints: p(d.touchpoints || "", "ai-draft"),
      thinkingFeeling: p(d.thinkingFeeling || "", "ai-draft"),
      waitingFor: p(d.waitingFor || "", "ai-draft"),
      effortWhy: p("", "ai-draft"),
    }));
    setStages(drafted);
    setNeedsReview(true);
    setReviewed(false);
    setMessage("AI draft loaded. Review and rebuild every stage, then take ownership to enable saving.");
  }

  async function save() {
    setBusy("saving");
    setMessage("");
    const res = await saveArtifact({
      engagementId,
      artifactId: "02",
      payload: { status: "in-review", aiAssisted: hasAiDraft || Boolean(draftMeta), data: { ...initial, header, stages } },
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
            humanDecision: "reviewed and rebuilt AI draft",
          }
        : undefined,
    });
    setBusy("idle");
    if (res.ok) {
      setSha(res.sha);
      setNeedsReview(false);
      setMessage("Saved. A commit landed on the data branch.");
    } else {
      setMessage(res.conflict ? "This artifact changed elsewhere. Reload and reapply." : `Save failed: ${res.error}`);
    }
  }

  const saveDisabled = busy !== "idle" || (needsReview && !reviewed);

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

      {hasAiDraft && (
        <div className="ai-banner">
          <span className="ai-mark">AI draft — not yet yours</span>
          <span>Rebuild each field in your own account of the service. Editing a field marks it as yours.</span>
        </div>
      )}

      {stages.map((s, i) => (
        <fieldset key={i} className="card card--accent stack">
          <legend className="t-system">Stage {i + 1}</legend>
          <label className="field">
            <span className="t-system">Stage name</span>
            <input type="text" value={s.name} onChange={(e) => setStages((prev) => prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))} />
          </label>
          {FIELDS.map(([key, label]) => {
            const prov = s[key] as Provenanced;
            return (
              <label key={String(key)} className="field">
                <span className="t-system">
                  {label} {prov.origin === "ai-draft" && <span className="ai-mark">AI draft</span>}
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
          <button className="btn btn--text" onClick={() => setStages((prev) => prev.filter((_, idx) => idx !== i))}>
            Remove stage
          </button>
        </fieldset>
      ))}

      {needsReview && (
        <label className="row">
          <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} style={{ width: "auto" }} />
          <span>I have reviewed the AI draft and take ownership of this map.</span>
        </label>
      )}

      <div className="row">
        <button className="btn btn--primary" onClick={save} disabled={saveDisabled}>
          {busy === "saving" ? "Saving…" : "Save journey map"}
        </button>
        <span className="t-faint t-system">Status: {status}</span>
      </div>
    </div>
  );
}
