"use client";

import { useState } from "react";
import { parseDocumentFile, saveLibrary, callAi } from "@/lib/client";
import type { ReferenceDocument, DocKind } from "@/lib/library-schemas";
import { DOC_KINDS } from "@/lib/library-schemas";
import {
  ACCEPTED_DOC_ACCEPT,
  isAcceptedDoc,
  MAX_DOC_BYTES,
  normalizeText,
} from "@/lib/library-format";

const ACTOR = "you"; // The save route stamps the real actor server-side from PRACTICE_ACTOR.

type Preview = {
  filename: string;
  text: string;
  kind: DocKind;
  source: ReferenceDocument["source"];
};

function nextId(docs: ReferenceDocument[]): string {
  const max = docs.reduce((m, d) => {
    const n = Number(d.id.replace(/[^0-9]/g, ""));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return `DOC-${String(max + 1).padStart(2, "0")}`;
}

export function LibraryEditor({
  engagementId,
  initial,
  baseSha,
  indexMode,
  indexChunks,
}: {
  engagementId: string;
  initial: ReferenceDocument[];
  baseSha: string | null;
  indexMode: "embeddings" | "lexical" | "none";
  indexChunks: number;
}) {
  const [documents, setDocuments] = useState<ReferenceDocument[]>(initial);
  const [sha, setSha] = useState(baseSha);
  const [busy, setBusy] = useState<"idle" | "parsing" | "saving" | "indexing">("idle");
  const [message, setMessage] = useState("");
  const [live, setLive] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteKind, setPasteKind] = useState<DocKind>("policy");
  const [index, setIndex] = useState<{ mode: typeof indexMode; chunks: number }>({ mode: indexMode, chunks: indexChunks });
  const [stale, setStale] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setMessage("");
    if (file.size > MAX_DOC_BYTES) {
      setMessage("File too large. Use a file under 2 MB.");
      return;
    }
    if (!isAcceptedDoc(file.name)) {
      setMessage("Unsupported format. Use .pdf, .docx, .txt, or .md.");
      return;
    }
    setBusy("parsing");
    const res = await parseDocumentFile(file);
    setBusy("idle");
    if (res.error) {
      setMessage(res.error);
      return;
    }
    setPreview({
      filename: res.filename,
      text: res.text,
      kind: "policy",
      source: {
        format: res.source.format as ReferenceDocument["source"]["format"],
        bytes: res.source.bytes,
        parser: res.source.parser,
        pages: res.source.pages,
        parseWarnings: res.source.parseWarnings,
        piiRedactions: res.source.piiRedactions,
      },
    });
    setMessage(
      res.source.parseWarnings.length
        ? res.source.parseWarnings.join(" ")
        : `Parsed ${res.filename}. Review the text and the document kind, then add it.`,
    );
  }

  function addPreview() {
    if (!preview) return;
    const doc: ReferenceDocument = {
      id: nextId(documents),
      filename: preview.filename,
      kind: preview.kind,
      text: preview.text,
      parsedAt: new Date().toISOString(),
      uploadedBy: ACTOR,
      source: preview.source,
      origin: "human",
    };
    setDocuments((prev) => [...prev, doc]);
    setPreview(null);
    setStale(true);
    setLive(`Added ${doc.filename} as ${doc.kind}.`);
  }

  function addPaste() {
    const text = normalizeText(pasteText);
    if (!text) return;
    const doc: ReferenceDocument = {
      id: nextId(documents),
      filename: "pasted text",
      kind: pasteKind,
      text,
      parsedAt: new Date().toISOString(),
      uploadedBy: ACTOR,
      source: { format: "paste", bytes: text.length, parser: "paste", parseWarnings: [], piiRedactions: 0 },
      origin: "human",
    };
    setDocuments((prev) => [...prev, doc]);
    setPasteText("");
    setStale(true);
    setLive(`Added pasted ${pasteKind} document.`);
  }

  function setKind(id: string, kind: DocKind) {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, kind } : d)));
    setStale(true);
  }

  function removeDoc(id: string) {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    setStale(true);
  }

  async function save() {
    setBusy("saving");
    setMessage("");
    const res = await saveLibrary({
      engagementId,
      payload: { status: "in-review", data: { documents } },
      baseSha: sha,
    });
    setBusy("idle");
    if (res.ok) {
      setSha(res.sha);
      setMessage("Saved. A commit landed on the data branch. Rebuild the index to make the new text searchable.");
    } else {
      setMessage(res.conflict ? "This library changed elsewhere. Reload and reapply." : `Save failed: ${res.error}`);
    }
  }

  async function buildIndex() {
    setBusy("indexing");
    setMessage("");
    const res = await callAi<{ ok: boolean; mode: "embeddings" | "lexical"; chunkCount: number; degraded?: boolean }>(
      "/api/library/index",
      { engagementId },
    );
    setBusy("idle");
    if (res.ok) {
      setIndex({ mode: res.mode, chunks: res.chunkCount });
      setStale(false);
      setMessage(
        res.degraded
          ? `Index built with lexical retrieval (${res.chunkCount} chunks) — the embeddings model was unavailable, so search falls back to keyword matching.`
          : `Index built with ${res.mode} retrieval (${res.chunkCount} chunks).`,
      );
      setLive(`Index built: ${res.mode}, ${res.chunkCount} chunks.`);
    } else {
      setMessage("Could not build the index. Save the documents first, then try again.");
    }
  }

  return (
    <div className="stack-lg">
      <div aria-live="polite" className="visually-hidden">
        {live}
      </div>

      {/* Import a document */}
      <section className="card stack" aria-label="Add a reference document">
        <div className="stack">
          <span className="t-system">Add a baseline document</span>
          <p className="t-faint t-system">
            Upload the unit&apos;s existing policies, procedures, or historical context. PDF and Word are parsed to text on
            the server; .txt/.md and pasted text work too. These describe how the service is <em>supposed</em> to run —
            the baseline the map is read against.
          </p>
        </div>
        <div className="row">
          <label className="btn">
            Upload document
            <input
              type="file"
              accept={ACCEPTED_DOC_ACCEPT}
              className="visually-hidden"
              disabled={busy !== "idle"}
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <span className="t-faint t-system">.pdf · .docx · .txt · .md · up to 2 MB</span>
        </div>

        {preview && (
          <div className="card stack" aria-label="Parsed document preview">
            <div className="row row--between row--baseline">
              <span className="t-system">Preview: {preview.filename}</span>
              <span className="t-faint t-system">
                {preview.source.parser}
                {preview.source.pages ? ` · ${preview.source.pages} page(s)` : ""}
                {preview.source.piiRedactions ? ` · ${preview.source.piiRedactions} PII match(es)` : ""}
              </span>
            </div>
            <label className="field">
              <span className="t-system">Document kind</span>
              <select
                value={preview.kind}
                onChange={(e) => setPreview({ ...preview, kind: e.target.value as DocKind })}
              >
                {DOC_KINDS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </label>
            <label className="field stack">
              <span className="t-system">Extracted text — edit before adding if needed</span>
              <textarea rows={8} value={preview.text} onChange={(e) => setPreview({ ...preview, text: e.target.value })} />
            </label>
            <div className="row">
              <button className="btn btn--primary" onClick={addPreview} disabled={!preview.text.trim()}>Add to library</button>
              <button className="btn" onClick={() => setPreview(null)}>Discard</button>
            </div>
          </div>
        )}

        <div className="row">
          <label>
            <span className="visually-hidden">Pasted document kind</span>
            <select value={pasteKind} onChange={(e) => setPasteKind(e.target.value as DocKind)}>
              {DOC_KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field stack">
          <span className="t-system">Or paste document text</span>
          <textarea
            rows={4}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste the policy or procedure text here."
          />
        </label>
        <div className="row">
          <button className="btn" onClick={addPaste} disabled={busy !== "idle" || !pasteText.trim()}>Add as document</button>
        </div>
      </section>

      {message && <p className="notice">{message}</p>}

      {/* Library */}
      <section className="stack">
        <h2 className="t-heading">Reference library</h2>
        {documents.length === 0 ? (
          <p className="t-faint">No documents yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Kind</th>
                <th scope="col">Source</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>
                    <details>
                      <summary>{d.filename || d.id}</summary>
                      <pre className="t-system" style={{ whiteSpace: "pre-wrap" }}>{d.text.slice(0, 4000)}{d.text.length > 4000 ? "…" : ""}</pre>
                    </details>
                    {d.source.parseWarnings.length > 0 && (
                      <span className="t-faint t-system">{d.source.parseWarnings.join(" ")}</span>
                    )}
                  </td>
                  <td>
                    <label>
                      <span className="visually-hidden">Kind for {d.filename}</span>
                      <select value={d.kind} onChange={(e) => setKind(d.id, e.target.value as DocKind)}>
                        {DOC_KINDS.map((k) => (
                          <option key={k} value={k}>{k}</option>
                        ))}
                      </select>
                    </label>
                  </td>
                  <td className="t-system t-faint">{d.source.format}</td>
                  <td>
                    <button className="btn btn--text" onClick={() => removeDoc(d.id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="row row--between row--wrap">
        <div className="row">
          <button className="btn btn--primary" onClick={save} disabled={busy !== "idle"}>
            {busy === "saving" ? "Saving…" : "Save library"}
          </button>
          <button className="btn" onClick={buildIndex} disabled={busy !== "idle" || documents.length === 0}>
            {busy === "indexing" ? "Building…" : "Build index"}
          </button>
        </div>
        <span className="t-faint t-system">
          Index: {index.mode === "none" ? "not built" : `${index.mode}, ${index.chunks} chunk(s)`}
          {stale ? " · rebuild to include the latest edits" : ""}
        </span>
      </div>
    </div>
  );
}
