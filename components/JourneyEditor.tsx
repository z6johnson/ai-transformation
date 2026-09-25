"use client";

import { useState } from "react";
import { saveArtifact, callAi } from "@/lib/client";
import type { Provenanced, Journey, JourneyStage, JourneyMapData, Side, SideNames } from "@/lib/schemas";
import { sideLabel, EVIDENCE_LABELS, WHEN_LABELS, SIDES } from "@/lib/schemas";
import { isSecondhand } from "@/lib/sides";
import type { AiMeta } from "@/lib/ai-meta";
import { SortableCards } from "./SortableCards";
import { SideChip } from "./SideChip";
import { BaselineToggle, CoverageNotesPanel, toCoverageNotes, type CoverageNote } from "./CoverageNotes";

type Stage = JourneyStage;

const p = (value = "", origin: Provenanced["origin"] = "human"): Provenanced => ({ value, origin });
const FIELDS: Array<[keyof Stage, string]> = [
  ["doing", "What the person is doing"],
  ["wants", "What they want here"],
  ["touchpoints", "Points of contact"],
  ["thinkingFeeling", "Thinking & feeling"],
  ["waitingFor", "What they wait for"],
  ["effortWhy", "Why this effort level"],
];
const PROV_FIELDS = ["doing", "wants", "touchpoints", "thinkingFeeling", "waitingFor", "effortWhy"] as const;

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
    when: "",
    evidence: { level: "", fromSides: [] },
  };
}

function nextJourneyId(journeys: Journey[]): string {
  const n = journeys.reduce((m, j) => Math.max(m, Number(j.id.replace(/\D/g, "")) || 0), 0);
  return `J-${n + 1}`;
}

function emptyJourney(side: Side, journeys: Journey[]): Journey {
  return { id: nextJourneyId(journeys), side, person: "", stages: [], momentsThatMatter: [], dropoutPoints: [] };
}

const asSides = (v: unknown): Side[] =>
  Array.isArray(v) ? (v.filter((x) => x === "external" || x === "internal") as Side[]) : [];

export function JourneyEditor({
  engagementId,
  initial,
  sideNames,
  baseSha,
  status,
  hasSynthesis = false,
}: {
  engagementId: string;
  initial: JourneyMapData;
  sideNames: SideNames;
  baseSha: string | null;
  status: string;
  hasSynthesis?: boolean;
}) {
  const [header, setHeader] = useState(initial.header);
  // A new map starts with one journey per side, so the staff journey is never an afterthought.
  const [journeys, setJourneys] = useState<Journey[]>(() =>
    initial.journeys.length
      ? initial.journeys
      : [
          { ...emptyJourney("external", []), id: "J-1" },
          { ...emptyJourney("internal", []), id: "J-2" },
        ],
  );
  const [view, setView] = useState<number | "compare">(0);
  const [sha, setSha] = useState(baseSha);
  const [busy, setBusy] = useState<"idle" | "drafting" | "saving">("idle");
  const [message, setMessage] = useState("");
  const [draftMeta, setDraftMeta] = useState<AiMeta | null>(null);
  const [useBaseline, setUseBaseline] = useState(hasSynthesis);
  const [coverage, setCoverage] = useState<CoverageNote[]>([]);

  const active = typeof view === "number" ? journeys[view] : null;
  const hasAiContent = journeys.some((j) => j.stages.some((s) => PROV_FIELDS.some((k) => s[k].origin === "ai-applied")));

  function updateJourney(idx: number, patch: Partial<Journey>) {
    setJourneys((prev) => prev.map((j, i) => (i === idx ? { ...j, ...patch } : j)));
  }
  function setStages(idx: number, fn: (prev: Stage[]) => Stage[]) {
    setJourneys((prev) => prev.map((j, i) => (i === idx ? { ...j, stages: fn(j.stages) } : j)));
  }
  function setStage(idx: number, si: number, patch: Partial<Stage>) {
    setStages(idx, (prev) => prev.map((s, k) => (k === si ? { ...s, ...patch } : s)));
  }

  function addJourney(side: Side) {
    setJourneys((prev) => [...prev, emptyJourney(side, prev)]);
    setView(journeys.length);
  }
  function removeJourney(idx: number) {
    if (!window.confirm("Remove this journey and all its stages?")) return;
    setJourneys((prev) => prev.filter((_, i) => i !== idx));
    setView(0);
  }

  async function draft(idx: number) {
    const side = journeys[idx].side;
    setBusy("drafting");
    setMessage("");
    const res = await callAi<{
      degraded: boolean;
      draft: { person?: string; stages?: Array<Record<string, unknown>>; coverageNotes?: unknown } | null;
      aiMeta?: AiMeta;
      message?: string;
    }>("/api/ai/draft", { engagementId, target: "journey", useBaseline, side });
    setBusy("idle");
    setDraftMeta(res.aiMeta || null);
    setCoverage(toCoverageNotes(res.draft?.coverageNotes));
    if (res.degraded || !res.draft?.stages?.length) {
      setMessage(res.message || "No draft returned. Build the map by hand.");
      return;
    }
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const drafted: Stage[] = res.draft.stages.map((d, i) => ({
      ...emptyStage(i + 1),
      name: str(d.name),
      duration: str(d.duration),
      effort: (["low", "moderate", "high"].includes(str(d.effort)) ? d.effort : "moderate") as Stage["effort"],
      when: (["year-round", "game-day"].includes(str(d.when)) ? d.when : "") as Stage["when"],
      evidence: {
        level: (["observed", "several", "one"].includes(str(d.evidenceLevel)) ? d.evidenceLevel : "") as Stage["evidence"]["level"],
        fromSides: asSides(d.evidenceFrom),
      },
      doing: p(str(d.doing), "ai-applied"),
      wants: p(str(d.wants), "ai-applied"),
      touchpoints: p(str(d.touchpoints), "ai-applied"),
      thinkingFeeling: p(str(d.thinkingFeeling), "ai-applied"),
      waitingFor: p(str(d.waitingFor), "ai-applied"),
      effortWhy: p("", "ai-applied"),
    }));
    updateJourney(idx, { stages: drafted, person: journeys[idx].person || str(res.draft.person) });
    setMessage(
      `AI applied a draft of the ${sideLabel(sideNames, side)} journey. Edit any field to replace it, or remove stages that don't hold.`,
    );
  }

  async function save() {
    setBusy("saving");
    setMessage("");
    const all = journeys.flatMap((j) => j.stages);
    const draftedFields = all.length * PROV_FIELDS.length;
    const stillApplied = all.reduce((n, s) => n + PROV_FIELDS.filter((k) => s[k].origin === "ai-applied").length, 0);
    const edited = draftMeta ? Math.max(0, draftedFields - stillApplied) : 0;
    const res = await saveArtifact({
      engagementId,
      artifactId: "02",
      payload: {
        status: "in-review",
        aiAssisted: hasAiContent || Boolean(draftMeta),
        data: { header, journeys: journeys.map((j) => ({ ...j, stages: j.stages.map((s, i) => ({ ...s, order: i })) })) },
      },
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

  const tabLabel = (j: Journey) => `${j.id} · ${sideLabel(sideNames, j.side)}${j.person ? ` · ${j.person}` : ""}`;
  const idx = typeof view === "number" ? view : -1;

  return (
    <div className="stack-lg">
      <fieldset className="card grid grid--3">
        <legend className="t-system">Map header</legend>
        {(
          [
            ["service", "Service / lifecycle"],
            ["scope", "Scope"],
            ["others", "Others involved"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="field">
            <span className="t-system">{label}</span>
            <input type="text" value={header[k]} onChange={(e) => setHeader({ ...header, [k]: e.target.value })} />
          </label>
        ))}
      </fieldset>

      <div className="stack">
        <div className="t-system">Journeys</div>
        <div className="tabbar" role="tablist" aria-label="Journeys">
          {journeys.map((j, i) => (
            <button key={j.id + i} role="tab" aria-selected={view === i} onClick={() => setView(i)}>
              <SideChip side={j.side} names={sideNames} short /> {tabLabel(j)} ({j.stages.length})
            </button>
          ))}
          <button role="tab" aria-selected={view === "compare"} onClick={() => setView("compare")}>
            Side by side
          </button>
        </div>
        <div className="row row--wrap">
          {SIDES.map((s) => (
            <button key={s} className="btn btn--text" onClick={() => addJourney(s)}>
              + Add {sideLabel(sideNames, s)} journey
            </button>
          ))}
        </div>
      </div>

      {message && <p className="notice">{message}</p>}

      <CoverageNotesPanel notes={coverage} />

      {hasAiContent && (
        <div className="ai-banner">
          <span className="ai-mark">AI applied</span>
          <span>AI filled these fields. Edit any field to replace it; your text takes over.</span>
        </div>
      )}

      {view === "compare" && <SideBySide journeys={journeys} sideNames={sideNames} />}

      {active && (
        <div className="stack-lg">
          <fieldset className="card grid grid--3">
            <legend className="t-system">
              Journey {active.id} <SideChip side={active.side} names={sideNames} />
            </legend>
            <label className="field">
              <span className="t-system">Side</span>
              <select value={active.side} onChange={(e) => updateJourney(idx, { side: e.target.value as Side })}>
                {SIDES.map((s) => (
                  <option key={s} value={s}>
                    {s === "external" ? "External" : "Internal"}: {sideLabel(sideNames, s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="t-system">Whose journey (a role, not a name)</span>
              <input type="text" value={active.person} onChange={(e) => updateJourney(idx, { person: e.target.value })} />
            </label>
            <div className="field">
              <span className="t-system">&nbsp;</span>
              <button className="btn" onClick={() => removeJourney(idx)} disabled={journeys.length < 2}>
                Remove journey
              </button>
            </div>
          </fieldset>

          <div className="row">
            <button className="btn btn--primary" onClick={() => draft(idx)} disabled={busy !== "idle"}>
              {busy === "drafting" ? "Drafting…" : `Draft ${sideLabel(sideNames, active.side)} journey from interviews`}
              <span className="ai-mark" aria-hidden="true">AI</span>
            </button>
            <button className="btn" onClick={() => setStages(idx, (prev) => [...prev, emptyStage(prev.length + 1)])}>
              + Add stage by hand
            </button>
            <BaselineToggle show={hasSynthesis} checked={useBaseline} disabled={busy !== "idle"} onChange={setUseBaseline} />
          </div>

          <SortableCards
            items={active.stages}
            getKey={(_, i) => `${active.id}-${i}`}
            onReorder={(next) => setStages(idx, () => next)}
            onRemove={(i) => setStages(idx, (prev) => prev.filter((_, k) => k !== i))}
            cardLabel={(_, i) => `Stage ${i + 1}`}
            legend={(_, i) => <legend className="t-system">Stage {i + 1}</legend>}
            columnsStorageKey={`card-cols:journey:${engagementId}`}
            defaultColumns={2}
            renderCard={(s, i) => (
              <>
                <label className="field">
                  <span className="t-system">Stage name</span>
                  <input type="text" value={s.name} onChange={(e) => setStage(idx, i, { name: e.target.value })} />
                </label>
                {isSecondhand(s, active.side) && (
                  <p className="notice">
                    Known only from {sideLabel(sideNames, "internal")} accounts. No one from this side has described it and it
                    hasn&apos;t been observed.
                  </p>
                )}
                {FIELDS.map(([key, label]) => {
                  const prov = s[key] as Provenanced;
                  return (
                    <label key={String(key)} className="field">
                      <span className="t-system">
                        {label} {prov.origin === "ai-applied" && <span className="ai-mark">AI applied</span>}
                      </span>
                      <textarea rows={2} value={prov.value} onChange={(e) => setStage(idx, i, { [key]: { value: e.target.value, origin: "human" } })} />
                    </label>
                  );
                })}
                <div className="grid grid--3">
                  <label className="field">
                    <span className="t-system">Effort</span>
                    <select value={s.effort} onChange={(e) => setStage(idx, i, { effort: e.target.value as Stage["effort"] })}>
                      <option value="low">low</option>
                      <option value="moderate">moderate</option>
                      <option value="high">high</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="t-system">Typical duration</span>
                    <input type="text" value={s.duration} onChange={(e) => setStage(idx, i, { duration: e.target.value })} />
                  </label>
                  <label className="field">
                    <span className="t-system">When</span>
                    <select value={s.when} onChange={(e) => setStage(idx, i, { when: e.target.value as Stage["when"] })}>
                      {(Object.keys(WHEN_LABELS) as Stage["when"][]).map((w) => (
                        <option key={w} value={w}>
                          {WHEN_LABELS[w]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid grid--2">
                  <label className="field">
                    <span className="t-system">Evidence</span>
                    <select
                      value={s.evidence.level}
                      onChange={(e) => setStage(idx, i, { evidence: { ...s.evidence, level: e.target.value as Stage["evidence"]["level"] } })}
                    >
                      {(Object.keys(EVIDENCE_LABELS) as Stage["evidence"]["level"][]).map((l) => (
                        <option key={l} value={l}>
                          {EVIDENCE_LABELS[l]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="field">
                    <span className="t-system">Evidence comes from</span>
                    <div className="row row--wrap">
                      {SIDES.map((sd) => (
                        <label key={sd} className="row" style={{ gap: "var(--space-1)" }}>
                          <input
                            type="checkbox"
                            checked={s.evidence.fromSides.includes(sd)}
                            onChange={(e) =>
                              setStage(idx, i, {
                                evidence: {
                                  ...s.evidence,
                                  fromSides: e.target.checked
                                    ? [...s.evidence.fromSides, sd]
                                    : s.evidence.fromSides.filter((x) => x !== sd),
                                },
                              })
                            }
                          />
                          {sideLabel(sideNames, sd)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </>
            )}
          />
        </div>
      )}

      <div className="row">
        <button className="btn btn--primary" onClick={save} disabled={busy !== "idle"}>
          {busy === "saving" ? "Saving…" : "Save journey map"}
        </button>
        <span className="t-faint t-system">
          Status: <span className="t-mono">{status}</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Read-only view of one external and one internal journey next to each other, so the fan's
 * stage and the staff's stage at the same point in the season can be read together.
 */
function SideBySide({ journeys, sideNames }: { journeys: Journey[]; sideNames: SideNames }) {
  const ext = journeys.filter((j) => j.side === "external");
  const int = journeys.filter((j) => j.side === "internal");
  const [left, setLeft] = useState(ext[0]?.id || "");
  const [right, setRight] = useState(int[0]?.id || "");
  const L = journeys.find((j) => j.id === left);
  const R = journeys.find((j) => j.id === right);

  const column = (j: Journey | undefined, side: Side, value: string, onChange: (v: string) => void, options: Journey[]) => (
    <div className="stack">
      <label className="field">
        <span className="t-system">
          <SideChip side={side} names={sideNames} /> journey
        </span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {options.length === 0 && <option value="">No {sideLabel(sideNames, side)} journey yet</option>}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.id} {o.person}
            </option>
          ))}
        </select>
      </label>
      {j?.stages.map((s, i) => (
        <div key={i} className="card stack">
          <div className="row row--between">
            <span className="t-subhead">
              {i + 1}. {s.name || "(unnamed)"}
            </span>
            <span className="t-system">{s.when ? WHEN_LABELS[s.when] : ""}</span>
          </div>
          <p>{s.doing.value || <span className="t-faint">—</span>}</p>
          <p className="t-muted">
            Effort: {s.effort}
            {s.evidence.level ? ` · ${EVIDENCE_LABELS[s.evidence.level]}` : ""}
            {isSecondhand(s, j.side) ? ` · known only from ${sideLabel(sideNames, "internal")}` : ""}
          </p>
        </div>
      ))}
      {j && !j.stages.length && <p className="t-faint">No stages yet.</p>}
    </div>
  );

  return (
    <div className="side-by-side">
      {column(L, "external", left, setLeft, ext)}
      {column(R, "internal", right, setRight, int)}
    </div>
  );
}
