"use client";

import { useState } from "react";
import { saveArtifact, callAi } from "@/lib/client";
import type { AiMeta } from "@/lib/ai-meta";
import { SortableCards } from "./SortableCards";
import { BaselineToggle, CoverageNotesPanel, toCoverageNotes, type CoverageNote } from "./CoverageNotes";

type Origin = "human" | "ai-draft" | "ai-applied" | "ai-confirmed";
type Handoff = { id: string; stage: string; from: string; to: string; whatMoves: string; how: string; whatBreaks: string; origin: Origin };
type Decision = { id: string; stage: string; decision: string; whoDecides: string; decidesOn: string; basis: string; failurePath: string; kind: "clear-cut" | "judgment"; origin: Origin };
type System = { name: string; usedFor: string; dataHeld: string; owner: string; connectsTo: string; origin: Origin };
type BlueprintData = {
  header: { service: string; scope: string; lead: string };
  stageRows: unknown[];
  handoffs: Handoff[];
  decisions: Decision[];
  systems: System[];
  breakingPoints: unknown[];
};

const pad = (n: number) => String(n).padStart(2, "0");

export function BlueprintEditor({
  engagementId,
  initial,
  baseSha,
  status,
  hasSynthesis = false,
}: {
  engagementId: string;
  initial: BlueprintData;
  baseSha: string | null;
  status: string;
  hasSynthesis?: boolean;
}) {
  const [header, setHeader] = useState(initial.header);
  const [handoffs, setHandoffs] = useState<Handoff[]>(initial.handoffs as Handoff[]);
  const [decisions, setDecisions] = useState<Decision[]>(initial.decisions as Decision[]);
  const [systems, setSystems] = useState<System[]>(initial.systems as System[]);
  const [sha, setSha] = useState(baseSha);
  const [busy, setBusy] = useState<"idle" | "drafting" | "saving">("idle");
  const [message, setMessage] = useState("");
  const [draftMeta, setDraftMeta] = useState<AiMeta | null>(null);
  const [useBaseline, setUseBaseline] = useState(hasSynthesis);
  const [coverage, setCoverage] = useState<CoverageNote[]>([]);

  const hasAiContent =
    handoffs.some((h) => h.origin === "ai-applied") ||
    decisions.some((d) => d.origin === "ai-applied") ||
    systems.some((s) => s.origin === "ai-applied");

  async function draft() {
    setBusy("drafting");
    setMessage("");
    const res = await callAi<{
      degraded: boolean;
      draft: { handoffs?: Array<Record<string, string>>; decisions?: Array<Record<string, string>>; systems?: Array<Record<string, string>>; coverageNotes?: unknown } | null;
      aiMeta?: AiMeta;
      message?: string;
    }>("/api/ai/draft", { engagementId, target: "blueprint", useBaseline });
    setBusy("idle");
    setDraftMeta(res.aiMeta || null);
    setCoverage(toCoverageNotes(res.draft?.coverageNotes));
    const d = res.draft;
    if (res.degraded || !d || !(d.handoffs?.length || d.decisions?.length || d.systems?.length)) {
      setMessage(res.message || "No draft returned. Build the blueprint by hand.");
      return;
    }
    setHandoffs((prev) => [
      ...prev,
      ...(d.handoffs || []).map((h, i) => ({
        id: `H-${pad(prev.length + i + 1)}`,
        stage: h.stage || "",
        from: h.from || "",
        to: h.to || "",
        whatMoves: h.whatMoves || "",
        how: h.how || "",
        whatBreaks: h.whatBreaks || "",
        origin: "ai-applied" as Origin,
      })),
    ]);
    setDecisions((prev) => [
      ...prev,
      ...(d.decisions || []).map((x, i) => ({
        id: `D-${pad(prev.length + i + 1)}`,
        stage: x.stage || "",
        decision: x.decision || "",
        whoDecides: x.whoDecides || "",
        decidesOn: x.decidesOn || "",
        basis: x.basis || "",
        failurePath: x.failurePath || "",
        kind: (x.kind === "clear-cut" ? "clear-cut" : "judgment") as Decision["kind"],
        origin: "ai-applied" as Origin,
      })),
    ]);
    setSystems((prev) => [
      ...prev,
      ...(d.systems || []).map((s) => ({
        name: s.name || "",
        usedFor: s.usedFor || "",
        dataHeld: s.dataHeld || "",
        owner: s.owner || "",
        connectsTo: s.connectsTo || "",
        origin: "ai-applied" as Origin,
      })),
    ]);
    setMessage("AI applied a draft from the interviews and journey. Edit any field to replace it, or remove items that don't hold.");
  }

  async function save() {
    setBusy("saving");
    setMessage("");
    const res = await saveArtifact({
      engagementId,
      artifactId: "03",
      payload: { status: "in-review", aiAssisted: hasAiContent || Boolean(draftMeta), data: { ...initial, header, handoffs, decisions, systems } },
      baseSha: sha,
      aiLog: draftMeta
        ? {
            feature: "draft-blueprint",
            promptId: draftMeta.promptId,
            model: draftMeta.model,
            modelVersion: draftMeta.modelVersion,
            outcome: draftMeta.outcome,
            latencyMs: draftMeta.latencyMs,
            inputSummary: draftMeta.inputSummary,
            outputSummary: draftMeta.outputSummary,
            humanDecision: `kept AI draft; ${handoffs.length} handoff(s), ${decisions.length} decision(s), ${systems.length} system(s) after review`,
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
        <legend className="t-system">Blueprint header</legend>
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
        <button className="btn btn--primary" onClick={draft} disabled={busy !== "idle"}>
          {busy === "drafting" ? "Drafting…" : "Draft from interviews"}
          <span className="ai-mark" aria-hidden="true">AI</span>
        </button>
        <BaselineToggle show={hasSynthesis} checked={useBaseline} disabled={busy !== "idle"} onChange={setUseBaseline} />
      </div>

      {message && <p className="notice">{message}</p>}

      <CoverageNotesPanel notes={coverage} />

      {hasAiContent && (
        <div className="ai-banner">
          <span className="ai-mark">AI applied</span>
          <span>AI drafted items marked below. Edit any field to replace it; your text takes over.</span>
        </div>
      )}

      <section className="stack">
        <div className="row row--between">
          <h2 className="t-heading">Handoffs</h2>
          <button
            className="btn"
            onClick={() =>
              setHandoffs((p) => [...p, { id: `H-${pad(p.length + 1)}`, stage: "", from: "", to: "", whatMoves: "", how: "", whatBreaks: "", origin: "human" }])
            }
          >
            + Handoff
          </button>
        </div>
        <SortableCards
          items={handoffs}
          getKey={(h) => h.id}
          onReorder={setHandoffs}
          onRemove={(i) => setHandoffs((p) => p.filter((_, idx) => idx !== i))}
          cardLabel={(h) => h.id}
          legend={(h) => (
            <legend className="t-system">
              {h.id} {h.origin === "ai-applied" && <span className="ai-mark">AI applied</span>}
            </legend>
          )}
          columnsStorageKey={`card-cols:blueprint-handoffs:${engagementId}`}
          defaultColumns={2}
          renderCard={(h, i) => (
            <div className="grid grid--2">
              {(
                [
                  ["stage", "Stage"],
                  ["from", "From"],
                  ["to", "To"],
                  ["whatMoves", "What moves"],
                  ["how", "How it moves"],
                  ["whatBreaks", "What can break"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="field">
                  <span className="t-system">{label}</span>
                  <input type="text" value={h[k]} onChange={(e) => setHandoffs((p) => p.map((x, idx) => (idx === i ? { ...x, [k]: e.target.value, origin: "human" } : x)))} />
                </label>
              ))}
            </div>
          )}
        />
      </section>

      <section className="stack">
        <div className="row row--between">
          <h2 className="t-heading">Decisions</h2>
          <button
            className="btn"
            onClick={() =>
              setDecisions((p) => [...p, { id: `D-${pad(p.length + 1)}`, stage: "", decision: "", whoDecides: "", decidesOn: "", basis: "", failurePath: "", kind: "judgment", origin: "human" }])
            }
          >
            + Decision
          </button>
        </div>
        <SortableCards
          items={decisions}
          getKey={(d) => d.id}
          onReorder={setDecisions}
          onRemove={(i) => setDecisions((p) => p.filter((_, idx) => idx !== i))}
          cardLabel={(d) => d.id}
          legend={(d) => (
            <legend className="t-system">
              {d.id} {d.origin === "ai-applied" && <span className="ai-mark">AI applied</span>}
            </legend>
          )}
          columnsStorageKey={`card-cols:blueprint-decisions:${engagementId}`}
          defaultColumns={2}
          renderCard={(d, i) => (
            <div className="grid grid--2">
              {(
                [
                  ["stage", "Stage"],
                  ["decision", "The decision"],
                  ["whoDecides", "Who decides"],
                  ["decidesOn", "Decides on"],
                  ["basis", "Rule or basis"],
                  ["failurePath", "Failure path"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="field">
                  <span className="t-system">{label}</span>
                  <input type="text" value={d[k]} onChange={(e) => setDecisions((p) => p.map((x, idx) => (idx === i ? { ...x, [k]: e.target.value, origin: "human" } : x)))} />
                </label>
              ))}
              <label className="field">
                <span className="t-system">Clear-cut or judgment</span>
                <select value={d.kind} onChange={(e) => setDecisions((p) => p.map((x, idx) => (idx === i ? { ...x, kind: e.target.value as Decision["kind"], origin: "human" } : x)))}>
                  <option value="clear-cut">clear-cut</option>
                  <option value="judgment">judgment</option>
                </select>
              </label>
            </div>
          )}
        />
      </section>

      <section className="stack">
        <div className="row row--between">
          <h2 className="t-heading">Systems &amp; data</h2>
          <button className="btn" onClick={() => setSystems((p) => [...p, { name: "", usedFor: "", dataHeld: "", owner: "", connectsTo: "", origin: "human" }])}>
            + System
          </button>
        </div>
        <SortableCards
          items={systems}
          getKey={(_, i) => String(i)}
          onReorder={setSystems}
          onRemove={(i) => setSystems((p) => p.filter((_, idx) => idx !== i))}
          cardLabel={(_, i) => `System ${i + 1}`}
          legend={(s, i) => (
            <legend className="t-system">
              System {i + 1} {s.origin === "ai-applied" && <span className="ai-mark">AI applied</span>}
            </legend>
          )}
          columnsStorageKey={`card-cols:blueprint-systems:${engagementId}`}
          defaultColumns={2}
          renderCard={(s, i) => (
            <div className="grid grid--2">
              {(
                [
                  ["name", "Name"],
                  ["usedFor", "Used for"],
                  ["dataHeld", "Data held"],
                  ["owner", "Owner"],
                  ["connectsTo", "Connects to"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="field">
                  <span className="t-system">{label}</span>
                  <input type="text" value={s[k]} onChange={(e) => setSystems((p) => p.map((x, idx) => (idx === i ? { ...x, [k]: e.target.value, origin: "human" } : x)))} />
                </label>
              ))}
            </div>
          )}
        />
      </section>

      {message && <p className="notice">{message}</p>}
      <div className="row">
        <button className="btn btn--primary" onClick={save} disabled={busy !== "idle"}>
          {busy === "saving" ? "Saving…" : "Save blueprint"}
        </button>
        <span className="t-faint t-system">Status: {status}</span>
      </div>
    </div>
  );
}
