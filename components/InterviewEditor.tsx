"use client";

import { useState } from "react";
import { saveArtifact, callAi } from "@/lib/client";
import type { Interview, InterviewTag } from "@/lib/schemas";
import { TAGS } from "@/lib/schemas";
import type { AiMeta } from "@/lib/ai-meta";

type Suggestion = { id: string; tag: string; sourceWords: string; span?: { start: number; end: number }; confidence?: number };
type GuideData = { interviews: Interview[] };

const ACTOR = "you"; // The save route stamps the real actor server-side from PRACTICE_ACTOR.
const AUTO_APPLY_MIN = 0.5; // At/above this confidence, AI applies the tag; below, it flags for review.

function newInterview(n: number): Interview {
  return {
    id: `INT-${String(n).padStart(2, "0")}`,
    header: { person: "", role: "", relationship: "", interviewer: "", date: "", consent: "" },
    rawNotes: "",
    tags: [],
  };
}

export function InterviewEditor({
  engagementId,
  initial,
  baseSha,
  status,
}: {
  engagementId: string;
  initial: GuideData;
  baseSha: string | null;
  status: string;
}) {
  const [interviews, setInterviews] = useState<Interview[]>(initial.interviews.length ? initial.interviews : [newInterview(1)]);
  const [sel, setSel] = useState(0);
  const [sha, setSha] = useState(baseSha);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [lastMeta, setLastMeta] = useState<AiMeta | null>(null);
  const [decisions, setDecisions] = useState({ applied: 0, confirmed: 0, rejected: 0, removed: 0 });
  const [busy, setBusy] = useState<"idle" | "suggesting" | "saving">("idle");
  const [message, setMessage] = useState("");
  const [live, setLive] = useState("");

  const current = interviews[sel];

  function update(mut: (iv: Interview) => Interview) {
    setInterviews((prev) => prev.map((iv, i) => (i === sel ? mut(iv) : iv)));
  }

  async function suggest() {
    if (!current.rawNotes.trim()) {
      setMessage("Add interview notes before requesting tags.");
      return;
    }
    setBusy("suggesting");
    setMessage("");
    const res = await callAi<{ degraded: boolean; suggestions: Suggestion[]; aiMeta?: AiMeta; message?: string }>(
      "/api/ai/suggest-tags",
      { notes: current.rawNotes },
    );
    setBusy("idle");
    setLastMeta(res.aiMeta || null);
    if (res.degraded || !res.suggestions?.length) {
      setSuggestions([]);
      setMessage(res.message || "No suggestions returned. Add tags by hand.");
      return;
    }

    // Trusted-assistant flow: apply high-confidence tags straight onto the interview;
    // surface only the low-confidence ones for a human call. Everything stays editable
    // and removable in the table below (responsible-ai §6 — override path is first-class).
    const high = res.suggestions.filter((s) => (s.confidence ?? 1) >= AUTO_APPLY_MIN);
    const low = res.suggestions.filter((s) => (s.confidence ?? 1) < AUTO_APPLY_MIN);
    const now = new Date().toISOString();
    const applied: InterviewTag[] = high.map((s, i) => ({
      id: `T-${Date.now().toString(36)}-${i}`,
      tag: s.tag as InterviewTag["tag"],
      sourceWords: s.sourceWords,
      span: s.span,
      origin: "ai-applied",
      promptId: res.aiMeta?.promptId,
      confidence: s.confidence,
      confirmedAt: now, // when AI applied it; confirmedBy is left unset — no human confirmed
    }));
    if (applied.length) update((iv) => ({ ...iv, tags: [...iv.tags, ...applied] }));
    setSuggestions(low);
    setDecisions((d) => ({ ...d, applied: d.applied + applied.length }));
    setMessage(
      low.length
        ? `AI applied ${applied.length} tag(s). ${low.length} low-confidence tag(s) are below for your review.`
        : `AI applied ${applied.length} tag(s). Review the table below — edit or remove any.`,
    );
    setLive(`AI applied ${applied.length} tags. ${low.length} flagged for review.`);
  }

  function confirmSuggestion(s: Suggestion, tag: string) {
    const t: InterviewTag = {
      id: `T-${Date.now().toString(36)}`,
      tag: tag as InterviewTag["tag"],
      sourceWords: s.sourceWords,
      span: s.span,
      origin: "ai-confirmed",
      promptId: lastMeta?.promptId,
      confidence: s.confidence,
      confirmedBy: ACTOR,
      confirmedAt: new Date().toISOString(),
    };
    update((iv) => ({ ...iv, tags: [...iv.tags, t] }));
    setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
    setDecisions((d) => ({ ...d, confirmed: d.confirmed + 1 }));
    setLive(`Confirmed ${tag}.`);
  }

  function rejectSuggestion(s: Suggestion) {
    setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
    setDecisions((d) => ({ ...d, rejected: d.rejected + 1 }));
    setLive("Suggestion rejected.");
  }

  function addManualTag(tag: string, words: string) {
    if (!words.trim()) return;
    const idx = current.rawNotes.toLowerCase().indexOf(words.toLowerCase());
    update((iv) => ({
      ...iv,
      tags: [
        ...iv.tags,
        {
          id: `T-${Date.now().toString(36)}`,
          tag: tag as InterviewTag["tag"],
          sourceWords: words,
          span: idx >= 0 ? { start: idx, end: idx + words.length } : undefined,
          origin: "human",
          confirmedBy: ACTOR,
          confirmedAt: new Date().toISOString(),
        },
      ],
    }));
  }

  function removeTag(tagId: string) {
    const removed = current.tags.find((t) => t.id === tagId);
    update((iv) => ({ ...iv, tags: iv.tags.filter((t) => t.id !== tagId) }));
    if (removed && removed.origin !== "human") {
      setDecisions((d) => ({ ...d, removed: d.removed + 1 }));
      setLive(`Removed ${removed.tag}.`);
    }
  }

  async function save() {
    setBusy("saving");
    setMessage("");
    const aiAssisted = interviews.some((iv) => iv.tags.some((t) => t.origin === "ai-applied" || t.origin === "ai-confirmed"));
    const res = await saveArtifact({
      engagementId,
      artifactId: "01",
      payload: { status: "in-review", aiAssisted, data: { interviews } },
      baseSha: sha,
      aiLog: lastMeta
        ? {
            feature: "tagging",
            promptId: lastMeta.promptId,
            model: lastMeta.model,
            modelVersion: lastMeta.modelVersion,
            outcome: lastMeta.outcome,
            latencyMs: lastMeta.latencyMs,
            inputSummary: lastMeta.inputSummary,
            outputSummary: lastMeta.outputSummary,
            humanDecision: `applied ${decisions.applied}, confirmed ${decisions.confirmed}, rejected ${decisions.rejected}, removed ${decisions.removed}`,
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
      <div aria-live="polite" className="visually-hidden">
        {live}
      </div>

      {/* Interview selector */}
      <div className="row" role="group" aria-label="Interviews">
        {interviews.map((iv, i) => (
          <button
            key={iv.id}
            className={`btn${i === sel ? " btn--primary" : ""}`}
            onClick={() => setSel(i)}
            aria-pressed={i === sel}
          >
            {iv.header.role || iv.id}
          </button>
        ))}
        <button className="btn btn--text" onClick={() => { setInterviews((p) => [...p, newInterview(p.length + 1)]); setSel(interviews.length); }}>
          + Add interview
        </button>
      </div>

      {/* Header fields */}
      <fieldset className="card grid grid--2">
        <legend className="t-system">Interview header</legend>
        {(
          [
            ["person", "Person"],
            ["role", "Role"],
            ["relationship", "Relationship to service"],
            ["interviewer", "Interviewer (lead)"],
            ["date", "Date"],
            ["consent", "Recording / consent"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="field">
            <span className="t-system">{label}</span>
            <input
              type="text"
              value={current.header[key]}
              onChange={(e) => update((iv) => ({ ...iv, header: { ...iv.header, [key]: e.target.value } }))}
            />
          </label>
        ))}
      </fieldset>

      {/* Raw notes */}
      <label className="field stack">
        <span className="t-system">Raw notes — the person&apos;s own words</span>
        <textarea
          value={current.rawNotes}
          rows={10}
          onChange={(e) => update((iv) => ({ ...iv, rawNotes: e.target.value }))}
          placeholder="Write answers in the person's own words."
        />
      </label>

      <div className="row">
        <button className="btn btn--primary" onClick={suggest} disabled={busy !== "idle"}>
          {busy === "suggesting" ? "Asking AI…" : "Tag with AI"}
          <span className="ai-mark" aria-hidden="true">AI</span>
        </button>
        <span className="t-faint t-system">AI applies confident tags · you review</span>
      </div>

      {message && <p className="notice">{message}</p>}

      {/* Only low-confidence suggestions surface here — AI flagged them rather than apply.
          High-confidence tags are already applied to the table below. */}
      {suggestions.length > 0 && (
        <section className="stack" aria-label="AI tag suggestions flagged for review">
          <div className="ai-banner">
            <span className="ai-mark">AI flagged for review</span>
            <span>Low-confidence — AI did not apply these. Confirm, change the tag, or reject.</span>
          </div>
          {suggestions.map((s) => (
            <SuggestionRow key={s.id} s={s} onConfirm={confirmSuggestion} onReject={rejectSuggestion} />
          ))}
        </section>
      )}

      {/* Confirmed tags */}
      <section className="stack">
        <h2 className="t-heading">Tags on this interview</h2>
        {current.tags.length === 0 ? (
          <p className="t-faint">No tags yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Tag</th>
                <th scope="col">Source words</th>
                <th scope="col">Origin</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {current.tags.map((t) => (
                <tr key={t.id}>
                  <td>
                    <span className="tag-chip">{t.tag}</span>
                  </td>
                  <td>&ldquo;{t.sourceWords}&rdquo;</td>
                  <td>
                    {t.origin === "human" ? (
                      <span className="t-system">By hand</span>
                    ) : t.origin === "ai-applied" ? (
                      <span className="t-system" title="AI applied this at high confidence; remove it if it doesn't hold">AI-applied</span>
                    ) : (
                      <span className="t-system" title={`confirmed by ${t.confirmedBy}`}>AI-assisted, confirmed</span>
                    )}
                  </td>
                  <td>
                    <button className="btn btn--text" onClick={() => removeTag(t.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <ManualTagForm onAdd={addManualTag} />
      </section>

      <div className="row">
        <button className="btn btn--primary" onClick={save} disabled={busy !== "idle"}>
          {busy === "saving" ? "Saving…" : "Save interviews"}
        </button>
        <span className="t-faint t-system">Status: {status}</span>
      </div>
    </div>
  );
}

function SuggestionRow({
  s,
  onConfirm,
  onReject,
}: {
  s: Suggestion;
  onConfirm: (s: Suggestion, tag: string) => void;
  onReject: (s: Suggestion) => void;
}) {
  const [tag, setTag] = useState(s.tag);
  return (
    <div className="card row row--between row--wrap">
      <div className="stack grow grow--min">
        <span>&ldquo;{s.sourceWords}&rdquo;</span>
        {typeof s.confidence === "number" && <span className="t-system t-faint">confidence {Math.round(s.confidence * 100)}%</span>}
      </div>
      <div className="row">
        <label>
          <span className="visually-hidden">Tag</span>
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            {TAGS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn--primary" onClick={() => onConfirm(s, tag)}>
          Confirm
        </button>
        <button className="btn" onClick={() => onReject(s)}>
          Reject
        </button>
      </div>
    </div>
  );
}

function ManualTagForm({ onAdd }: { onAdd: (tag: string, words: string) => void }) {
  const [tag, setTag] = useState<string>(TAGS[0]);
  const [words, setWords] = useState("");
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(tag, words);
        setWords("");
      }}
    >
      <label>
        <span className="visually-hidden">Tag</span>
        <select value={tag} onChange={(e) => setTag(e.target.value)}>
          {TAGS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="grow">
        <span className="visually-hidden">Source words</span>
        <input type="text" value={words} onChange={(e) => setWords(e.target.value)} placeholder="Source words by hand" />
      </label>
      <button className="btn" type="submit">
        Add tag
      </button>
    </form>
  );
}
