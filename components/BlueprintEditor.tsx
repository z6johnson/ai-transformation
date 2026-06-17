"use client";

import { useState } from "react";
import { saveArtifact } from "@/lib/client";

type Origin = "human" | "ai-draft" | "ai-confirmed";
type Handoff = { id: string; stage: string; from: string; to: string; whatMoves: string; how: string; whatBreaks: string; origin: Origin };
type Decision = { id: string; stage: string; decision: string; whoDecides: string; decidesOn: string; basis: string; failurePath: string; kind: "clear-cut" | "judgment"; origin: Origin };
type System = { name: string; usedFor: string; dataHeld: string; owner: string; connectsTo: string };
type BlueprintData = {
  header: { service: string; scope: string; lead: string };
  stageRows: unknown[];
  handoffs: Handoff[];
  decisions: Decision[];
  systems: System[];
  breakingPoints: unknown[];
};

export function BlueprintEditor({
  engagementId,
  initial,
  baseSha,
  status,
}: {
  engagementId: string;
  initial: BlueprintData;
  baseSha: string | null;
  status: string;
}) {
  const [header, setHeader] = useState(initial.header);
  const [handoffs, setHandoffs] = useState<Handoff[]>(initial.handoffs as Handoff[]);
  const [decisions, setDecisions] = useState<Decision[]>(initial.decisions as Decision[]);
  const [systems, setSystems] = useState<System[]>(initial.systems as System[]);
  const [sha, setSha] = useState(baseSha);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true);
    setMessage("");
    const res = await saveArtifact({
      engagementId,
      artifactId: "03",
      payload: { status: "in-review", aiAssisted: false, data: { ...initial, header, handoffs, decisions, systems } },
      baseSha: sha,
    });
    setBusy(false);
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

      <section className="stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="t-heading">Handoffs</h2>
          <button
            className="btn"
            onClick={() =>
              setHandoffs((p) => [...p, { id: `H-${String(p.length + 1).padStart(2, "0")}`, stage: "", from: "", to: "", whatMoves: "", how: "", whatBreaks: "", origin: "human" }])
            }
          >
            + Handoff
          </button>
        </div>
        {handoffs.map((h, i) => (
          <fieldset key={h.id} className="card card--accent grid grid--2">
            <legend className="t-system">{h.id}</legend>
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
                <input type="text" value={h[k]} onChange={(e) => setHandoffs((p) => p.map((x, idx) => (idx === i ? { ...x, [k]: e.target.value } : x)))} />
              </label>
            ))}
            <button className="btn btn--text" onClick={() => setHandoffs((p) => p.filter((_, idx) => idx !== i))}>Remove</button>
          </fieldset>
        ))}
      </section>

      <section className="stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="t-heading">Decisions</h2>
          <button
            className="btn"
            onClick={() =>
              setDecisions((p) => [...p, { id: `D-${String(p.length + 1).padStart(2, "0")}`, stage: "", decision: "", whoDecides: "", decidesOn: "", basis: "", failurePath: "", kind: "judgment", origin: "human" }])
            }
          >
            + Decision
          </button>
        </div>
        {decisions.map((d, i) => (
          <fieldset key={d.id} className="card card--accent grid grid--2">
            <legend className="t-system">{d.id}</legend>
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
                <input type="text" value={d[k]} onChange={(e) => setDecisions((p) => p.map((x, idx) => (idx === i ? { ...x, [k]: e.target.value } : x)))} />
              </label>
            ))}
            <label className="field">
              <span className="t-system">Clear-cut or judgment</span>
              <select value={d.kind} onChange={(e) => setDecisions((p) => p.map((x, idx) => (idx === i ? { ...x, kind: e.target.value as Decision["kind"] } : x)))}>
                <option value="clear-cut">clear-cut</option>
                <option value="judgment">judgment</option>
              </select>
            </label>
            <button className="btn btn--text" onClick={() => setDecisions((p) => p.filter((_, idx) => idx !== i))}>Remove</button>
          </fieldset>
        ))}
      </section>

      <section className="stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="t-heading">Systems &amp; data</h2>
          <button className="btn" onClick={() => setSystems((p) => [...p, { name: "", usedFor: "", dataHeld: "", owner: "", connectsTo: "" }])}>
            + System
          </button>
        </div>
        {systems.map((s, i) => (
          <fieldset key={i} className="card card--accent grid grid--2">
            <legend className="t-system">System {i + 1}</legend>
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
                <input type="text" value={s[k]} onChange={(e) => setSystems((p) => p.map((x, idx) => (idx === i ? { ...x, [k]: e.target.value } : x)))} />
              </label>
            ))}
            <button className="btn btn--text" onClick={() => setSystems((p) => p.filter((_, idx) => idx !== i))}>Remove</button>
          </fieldset>
        ))}
      </section>

      {message && <p className="notice">{message}</p>}
      <div className="row">
        <button className="btn btn--primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save blueprint"}
        </button>
        <span className="t-faint t-system">Status: {status}</span>
      </div>
    </div>
  );
}
