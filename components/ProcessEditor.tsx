"use client";

import { useState } from "react";
import { saveArtifact } from "@/lib/client";
import { SortableCards } from "./SortableCards";

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
  origin: "human" | "ai-draft" | "ai-confirmed";
};
type ProcessData = { header: { service: string; scope: string; stages: string }; steps: Step[] };

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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function setStep(i: number, k: keyof Step, v: string) {
    setSteps((p) => p.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  }

  async function save() {
    setBusy(true);
    setMessage("");
    const res = await saveArtifact({
      engagementId,
      artifactId: "04",
      payload: { status: "in-review", aiAssisted: false, data: { header, steps } },
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

      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 className="t-heading">Steps</h2>
        <button
          className="btn"
          onClick={() =>
            setSteps((p) => [...p, { id: `P-${String(p.length + 1).padStart(2, "0")}`, step: "", trigger: "", who: "", system: "", rule: "", handsOnTime: "", waitTime: "", whatGoesWrong: "", origin: "human" }])
          }
        >
          + Step
        </button>
      </div>
      <SortableCards
        items={steps}
        getKey={(s) => s.id}
        onReorder={setSteps}
        onRemove={(i) => setSteps((p) => p.filter((_, idx) => idx !== i))}
        cardLabel={(s) => s.id}
        legend={(s) => <legend className="t-system">{s.id}</legend>}
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
        <button className="btn btn--primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save process documentation"}
        </button>
        <span className="t-faint t-system">Status: {status}</span>
      </div>
    </div>
  );
}
