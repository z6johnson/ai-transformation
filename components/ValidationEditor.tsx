"use client";

import { useState } from "react";
import { saveArtifact } from "@/lib/client";

type Coverage = {
  scopeAligned: boolean;
  stepsTrace: boolean;
  handoffsDecisionsLogged: boolean;
  frictionGrounded: boolean;
  conflictsSettled: boolean;
};
type ValidationData = {
  header: { service: string; scope: string; lifecycleOwner: { name: string; role: string }; businessOwners: string; lead: string };
  coverageCheck: Coverage;
  reviewSession: { date: string; attendees: string; confirmed: string; corrected: string; contested: string };
  honestAccount: string;
  openQuestions: string;
  signOff: { ownerName: string; ownerSigned: boolean; ownerDate: string; leadName: string; leadSubmitted: boolean; leadDate: string };
};

const COVERAGE_LABELS: Array<[keyof Coverage, string]> = [
  ["scopeAligned", "Journey and blueprint cover the scope and line up stage for stage"],
  ["stepsTrace", "Every process step traces to a map stage"],
  ["handoffsDecisionsLogged", "Every handoff (H-) and decision (D-) is written down"],
  ["frictionGrounded", "Every friction point has place, type, and evidence"],
  ["conflictsSettled", "Contradictions are flagged or settled"],
];

export function ValidationEditor({
  engagementId,
  initial,
  baseSha,
  status,
}: {
  engagementId: string;
  initial: ValidationData;
  baseSha: string | null;
  status: string;
}) {
  const [d, setD] = useState<ValidationData>(initial);
  const [sha, setSha] = useState(baseSha);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true);
    setMessage("");
    const fullySigned = d.signOff.ownerSigned && d.signOff.leadSubmitted;
    const res = await saveArtifact({
      engagementId,
      artifactId: "06",
      payload: { status: fullySigned ? "confirmed" : "in-review", aiAssisted: false, data: d },
      baseSha: sha,
    });
    setBusy(false);
    if (res.ok) {
      setSha(res.sha);
      setMessage(fullySigned ? "Signed and saved. The mapping stage is closed." : "Saved. A commit landed on the data branch.");
    } else {
      setMessage(res.conflict ? "This artifact changed elsewhere. Reload and reapply." : `Save failed: ${res.error}`);
    }
  }

  return (
    <div className="stack-lg">
      <section className="card stack">
        <h2 className="t-heading">Coverage check</h2>
        {COVERAGE_LABELS.map(([k, label]) => (
          <label key={k} className="row">
            <input
              type="checkbox"
              checked={d.coverageCheck[k]}
              onChange={(e) => setD({ ...d, coverageCheck: { ...d.coverageCheck, [k]: e.target.checked } })}
              style={{ width: "auto" }}
            />
            <span>{label}</span>
          </label>
        ))}
      </section>

      <section className="card stack">
        <h2 className="t-heading">Review session</h2>
        <div className="grid grid--2">
          <label className="field">
            <span className="t-system">Date &amp; who was there</span>
            <input type="text" value={d.reviewSession.attendees} onChange={(e) => setD({ ...d, reviewSession: { ...d.reviewSession, attendees: e.target.value } })} />
          </label>
          <label className="field">
            <span className="t-system">Date</span>
            <input type="text" value={d.reviewSession.date} onChange={(e) => setD({ ...d, reviewSession: { ...d.reviewSession, date: e.target.value } })} />
          </label>
        </div>
        {(
          [
            ["confirmed", "What was confirmed"],
            ["corrected", "What was corrected"],
            ["contested", "What was contested"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="field">
            <span className="t-system">{label}</span>
            <textarea rows={2} value={d.reviewSession[k]} onChange={(e) => setD({ ...d, reviewSession: { ...d.reviewSession, [k]: e.target.value } })} />
          </label>
        ))}
      </section>

      <section className="card stack">
        <h2 className="t-heading">The honest account of friction</h2>
        <p className="t-faint">Three to six sentences in the lead&apos;s voice. Names the worst without softening.</p>
        <textarea rows={4} value={d.honestAccount} onChange={(e) => setD({ ...d, honestAccount: e.target.value })} />
        <label className="field">
          <span className="t-system">Open questions &amp; known gaps</span>
          <textarea rows={2} value={d.openQuestions} onChange={(e) => setD({ ...d, openQuestions: e.target.value })} />
        </label>
      </section>

      <section className="card stack">
        <h2 className="t-heading">Sign-off</h2>
        <div className="grid grid--2">
          <label className="field">
            <span className="t-system">Lifecycle owner</span>
            <input type="text" value={d.signOff.ownerName} onChange={(e) => setD({ ...d, signOff: { ...d.signOff, ownerName: e.target.value } })} />
          </label>
          <label className="row" style={{ alignItems: "end" }}>
            <input type="checkbox" checked={d.signOff.ownerSigned} onChange={(e) => setD({ ...d, signOff: { ...d.signOff, ownerSigned: e.target.checked } })} style={{ width: "auto" }} />
            <span>Owner has signed</span>
          </label>
          <label className="field">
            <span className="t-system">Lead</span>
            <input type="text" value={d.signOff.leadName} onChange={(e) => setD({ ...d, signOff: { ...d.signOff, leadName: e.target.value } })} />
          </label>
          <label className="row" style={{ alignItems: "end" }}>
            <input type="checkbox" checked={d.signOff.leadSubmitted} onChange={(e) => setD({ ...d, signOff: { ...d.signOff, leadSubmitted: e.target.checked } })} style={{ width: "auto" }} />
            <span>Lead has submitted</span>
          </label>
        </div>
      </section>

      {message && <p className="notice">{message}</p>}
      <div className="row">
        <button className="btn btn--primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save validation packet"}
        </button>
        <span className="t-faint t-system">Status: {status}</span>
      </div>
    </div>
  );
}
