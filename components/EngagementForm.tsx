"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveEngagement } from "@/lib/client";
import { STAGES, STAGE_LABELS, type Engagement } from "@/lib/schemas";

export function EngagementForm({
  mode,
  initial,
  baseSha,
}: {
  mode: "create" | "edit";
  initial: Partial<Engagement>;
  baseSha: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name ?? "");
  const [service, setService] = useState(initial.service ?? "");
  const [scopeStart, setScopeStart] = useState(initial.scopeStart ?? "");
  const [scopeEnd, setScopeEnd] = useState(initial.scopeEnd ?? "");
  const [lead, setLead] = useState(initial.lead ?? "");
  const [ownerName, setOwnerName] = useState(initial.lifecycleOwner?.name ?? "");
  const [ownerRole, setOwnerRole] = useState(initial.lifecycleOwner?.role ?? "");
  const [stage, setStage] = useState<string>(initial.stage ?? "mapping");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    if (!name.trim()) {
      setMessage("A name is required.");
      return;
    }
    setBusy(true);
    setMessage("");
    const res = await saveEngagement({
      id: mode === "edit" ? initial.id : undefined,
      name: name.trim(),
      service,
      scopeStart,
      scopeEnd,
      lead,
      lifecycleOwner: { name: ownerName, role: ownerRole },
      stage,
      baseSha,
    });
    if (res.ok) {
      if (mode === "create") {
        router.push(`/engagements/${res.id}`);
        return; // keep the button busy through navigation
      }
      setMessage("Saved. A commit landed on the data branch.");
      router.refresh();
      setBusy(false);
    } else {
      setMessage(
        res.conflict ? "This engagement changed elsewhere. Reload and reapply." : `Save failed: ${res.error}`,
      );
      setBusy(false);
    }
  }

  return (
    <div className="stack-lg">
      <section className="card stack">
        <h2 className="t-heading">Engagement</h2>
        <label className="field">
          <span className="t-system">Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HR Performance Appraisal Pilot" />
        </label>
        <label className="field">
          <span className="t-system">Service</span>
          <textarea rows={2} value={service} onChange={(e) => setService(e.target.value)} placeholder="The institutional service lifecycle being mapped" />
        </label>
        <div className="grid grid--2">
          <label className="field">
            <span className="t-system">Scope start</span>
            <input type="text" value={scopeStart} onChange={(e) => setScopeStart(e.target.value)} placeholder="e.g. Goal setting" />
          </label>
          <label className="field">
            <span className="t-system">Scope end</span>
            <input type="text" value={scopeEnd} onChange={(e) => setScopeEnd(e.target.value)} placeholder="e.g. Formal review and close" />
          </label>
        </div>
      </section>

      <section className="card stack">
        <h2 className="t-heading">People &amp; stage</h2>
        <label className="field">
          <span className="t-system">Practice lead</span>
          <input type="text" value={lead} onChange={(e) => setLead(e.target.value)} placeholder="Who is running the engagement" />
        </label>
        <div className="grid grid--2">
          <label className="field">
            <span className="t-system">Lifecycle owner</span>
            <input type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Name" />
          </label>
          <label className="field">
            <span className="t-system">Lifecycle owner role</span>
            <input type="text" value={ownerRole} onChange={(e) => setOwnerRole(e.target.value)} placeholder="e.g. Chief Human Resources Officer" />
          </label>
        </div>
        <label className="field">
          <span className="t-system">Stage</span>
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
      </section>

      {message && <p className="notice">{message}</p>}
      <div className="row">
        <button className="btn btn--primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : mode === "create" ? "Create engagement" : "Save changes"}
        </button>
        <span className="t-faint t-system">
          {mode === "create" ? "A new commit lands on the data branch." : "Edits commit to the data branch."}
        </span>
      </div>
    </div>
  );
}
