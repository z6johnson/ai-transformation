"use client";

import { useEffect, useRef, useState } from "react";
import { callAi, fetchDocumentText, parseDocumentFile, saveLibrary } from "@/lib/client";
import type { DocKind, ManifestDocument, ProtectionLevel } from "@/lib/library-schemas";
import { DOC_KINDS, PROTECTION_LEVELS } from "@/lib/library-schemas";
import { ACCEPTED_DOC_ACCEPT, isAcceptedDoc, MAX_DOC_BYTES, normalizeText } from "@/lib/library-format";

const ACTOR = "you"; // The save route stamps the real actor server-side from PRACTICE_ACTOR.
const SOFT_DOC_LIMIT = 100;
const PARALLEL_PARSES = 5;

type Busy = "idle" | "parsing" | "saving" | "indexing";
type ImportStatus = "imported" | "duplicate" | "skipped" | "error";
type ImportResult = { filename: string; status: ImportStatus; details: string };

function nextDocNumber(docs: ManifestDocument[]): number {
  return docs.reduce((max, doc) => {
    const value = Number(doc.id.replace(/[^0-9]/g, ""));
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
}

function docIdFor(number: number): string {
  return `DOC-${String(number).padStart(2, "0")}`;
}

function importStatusLabel(status: ImportStatus): string {
  if (status === "imported") return "Imported";
  if (status === "duplicate") return "Duplicate";
  return status === "skipped" ? "Skipped" : "Error";
}

function displayPath(file: File): string {
  return file.webkitRelativePath || file.name;
}

export function LibraryEditor({
  engagementId,
  initial,
  baseSha,
  indexMode,
  indexChunks,
}: {
  engagementId: string;
  initial: ManifestDocument[];
  baseSha: string | null;
  indexMode: "embeddings" | "lexical" | "none";
  indexChunks: number;
}) {
  const [documents, setDocuments] = useState<ManifestDocument[]>(initial);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [textErrors, setTextErrors] = useState<Record<string, string>>({});
  const [sha, setSha] = useState(baseSha);
  const [busy, setBusy] = useState<Busy>("idle");
  const [message, setMessage] = useState("");
  const [live, setLive] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [pasteKind, setPasteKind] = useState<DocKind>("policy");
  const [protection, setProtection] = useState<ProtectionLevel>("P2");
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importKind, setImportKind] = useState<"single" | "bulk">("bulk");
  const [importLog, setImportLog] = useState<ImportResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);
  const [index, setIndex] = useState<{ mode: typeof indexMode; chunks: number }>({
    mode: indexMode,
    chunks: indexChunks,
  });
  const [stale, setStale] = useState(false);

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  function appendImportResults(results: ImportResult[]) {
    if (!results.length) return;
    setImportLog((prev) => [...prev, ...results]);
  }

  async function handleFiles(fileList: FileList | null) {
    if (busy !== "idle") return;
    const selected = Array.from(fileList ?? []);
    if (!selected.length) return;

    setMessage("");
    const unsupported = selected.filter((file) => !isAcceptedDoc(file.name));
    const tooLarge = selected.filter((file) => isAcceptedDoc(file.name) && file.size > MAX_DOC_BYTES);
    const rejectedFiles = new Set([...unsupported, ...tooLarge]);
    const files = selected.filter((file) => !rejectedFiles.has(file));

    if (!files.length) {
      const results = selected.map((file) => ({
        filename: displayPath(file),
        status: "skipped" as ImportStatus,
        details: unsupported.includes(file)
          ? "Unsupported format. Use .pdf, .docx, .txt, or .md."
          : "File too large. Use a file under 2 MB.",
      }));
      appendImportResults(results);
      setMessage("No supported files were imported.");
      return;
    }

    if (protection === "P3") {
      const confirmed = window.confirm(
        "This import is marked P3. Confirm these files are approved for this workspace and contain no P4 material.",
      );
      if (!confirmed) return;
    }
    if (documents.length + files.length > SOFT_DOC_LIMIT) {
      const confirmed = window.confirm(
        `This import would bring the library to ${documents.length + files.length} documents. Continue anyway?`,
      );
      if (!confirmed) return;
    }

    appendImportResults(
      selected
        .filter((file) => rejectedFiles.has(file))
        .map((file) => ({
          filename: displayPath(file),
          status: "skipped" as ImportStatus,
          details: unsupported.includes(file)
            ? "Unsupported format. Use .pdf, .docx, .txt, or .md."
            : "File too large. Use a file under 2 MB.",
        })),
    );

    setBusy("parsing");
    setImportKind(files.length === 1 ? "single" : "bulk");
    setImportProgress({ done: 0, total: files.length });

    const seenHashes = new Set(documents.map((doc) => doc.hash).filter(Boolean));
    const firstDocNumber = nextDocNumber(documents) + 1;
    let imported = 0;
    let duplicates = 0;
    let skipped = 0;
    let failed = 0;

    try {
      for (let offset = 0; offset < files.length; offset += PARALLEL_PARSES) {
        const wave = files.slice(offset, offset + PARALLEL_PARSES);
        const jobs = wave.map((file, index) => ({
          file,
          docId: docIdFor(firstDocNumber + offset + index),
        }));
        const results = await Promise.all(
          jobs.map((job) => parseDocumentFile(job.file, engagementId, job.docId)),
        );
        const additions: ManifestDocument[] = [];
        const addedTexts: Record<string, string> = {};
        const waveResults: ImportResult[] = [];

        results.forEach((result, index) => {
          const job = jobs[index];
          if (result.error) {
            failed += 1;
            waveResults.push({ filename: displayPath(job.file), status: "error", details: result.error });
            return;
          }
          if (!result.text.trim()) {
            skipped += 1;
            waveResults.push({
              filename: displayPath(job.file),
              status: "skipped",
              details: "No text could be extracted.",
            });
            return;
          }

          const duplicateLabel = result.duplicateOf?.path || result.duplicateOf?.filename;
          const duplicateInBatch = seenHashes.has(result.hash);
          if (result.duplicateOf || duplicateInBatch) {
            duplicates += 1;
            waveResults.push({
              filename: displayPath(job.file),
              status: "duplicate",
              details: duplicateLabel
                ? `Matches ${duplicateLabel || result.duplicateOf?.id}.`
                : "Matches another file in this import.",
            });
            return;
          }

          seenHashes.add(result.hash);
          const parsedAt = new Date().toISOString();
          const doc: ManifestDocument = {
            id: job.docId,
            filename: result.filename,
            kind: "policy",
            hash: result.hash,
            bytes: result.source.bytes,
            textBytes: result.text.length,
            format: result.source.format as ManifestDocument["format"],
            pages: result.source.pages,
            parseWarnings: result.source.parseWarnings,
            piiRedactions: result.source.piiRedactions,
            originalStored: result.originalStored,
            source: { type: "upload", path: displayPath(job.file), uploadedBy: ACTOR, parsedAt },
            protectionLevel: protection,
            textUpdatedAt: "",
          };
          additions.push(doc);
          addedTexts[doc.id] = result.text;
          imported += 1;
          waveResults.push({
            filename: displayPath(job.file),
            status: "imported",
            details: result.source.parseWarnings.join(" ") || `Ready for review as ${doc.id}.`,
          });
        });

        if (additions.length) {
          setDocuments((prev) => [...prev, ...additions]);
          setTexts((prev) => ({ ...prev, ...addedTexts }));
          setStale(true);
        }
        appendImportResults(waveResults);
        setImportProgress({ done: Math.min(offset + wave.length, files.length), total: files.length });
      }
    } finally {
      setBusy("idle");
      setImportProgress(null);
    }

    const summary = [
      `${imported} imported`,
      duplicates ? `${duplicates} duplicate(s)` : "",
      skipped ? `${skipped} skipped` : "",
      failed ? `${failed} failed` : "",
    ].filter(Boolean);
    setMessage(
      imported
        ? `Import finished: ${summary.join(", ")}. Review the documents, then save the library.`
        : `Import finished: ${summary.join(", ")}.`,
    );
    setLive(`Import finished: ${summary.join(", ")}.`);
  }

  function addPaste() {
    if (busy !== "idle") return;
    const text = normalizeText(pasteText);
    if (!text) return;
    if (protection === "P3") {
      const confirmed = window.confirm(
        "This pasted document is marked P3. Confirm it is approved for this workspace and contains no P4 material.",
      );
      if (!confirmed) return;
    }

    const id = docIdFor(nextDocNumber(documents) + 1);
    const doc: ManifestDocument = {
      id,
      filename: "pasted text",
      kind: pasteKind,
      hash: "",
      bytes: 0,
      textBytes: text.length,
      format: "paste",
      parseWarnings: [],
      piiRedactions: 0,
      originalStored: false,
      source: { type: "paste", path: "", uploadedBy: ACTOR, parsedAt: new Date().toISOString() },
      protectionLevel: protection,
      textUpdatedAt: "",
    };
    setDocuments((prev) => [...prev, doc]);
    setTexts((prev) => ({ ...prev, [id]: text }));
    setPasteText("");
    setStale(true);
    setLive(`Added pasted ${pasteKind} document.`);
  }

  function setKind(id: string, kind: DocKind) {
    setDocuments((prev) => prev.map((doc) => (doc.id === id ? { ...doc, kind } : doc)));
    setStale(true);
  }

  function setProtectionLevel(id: string, level: ProtectionLevel) {
    setDocuments((prev) => prev.map((doc) => (doc.id === id ? { ...doc, protectionLevel: level } : doc)));
    setStale(true);
  }

  function removeDoc(id: string) {
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    setTexts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setTextErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setStale(true);
  }

  async function ensureText(id: string) {
    if (texts[id] !== undefined || loadingDoc === id) return;
    setLoadingDoc(id);
    setTextErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const result = await fetchDocumentText(engagementId, id);
    if ("text" in result) {
      setTexts((prev) => ({ ...prev, [id]: result.text }));
    } else {
      setTextErrors((prev) => ({ ...prev, [id]: result.error }));
      setMessage(result.error);
    }
    setLoadingDoc(null);
  }

  function editText(id: string, text: string) {
    setTexts((prev) => ({ ...prev, [id]: text }));
    setTextErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setStale(true);
  }

  async function save() {
    setBusy("saving");
    setMessage("");
    const payloadDocuments = documents.map((doc) => ({ ...doc, text: texts[doc.id] }));
    const result = await saveLibrary({
      engagementId,
      payload: { status: "in-review", data: { documents: payloadDocuments } },
      baseSha: sha,
    });
    setBusy("idle");
    if (result.ok) {
      setSha(result.sha);
      setMessage("Saved. Encrypted content is in Vercel Blob; the manifest commit landed on the data branch.");
    } else {
      setMessage(
        result.conflict ? "This library changed elsewhere. Reload and reapply your changes." : `Save failed: ${result.error}`,
      );
    }
  }

  async function buildIndex() {
    setBusy("indexing");
    setMessage("");
    const result = await callAi<{
      ok: boolean;
      mode: "embeddings" | "lexical";
      chunkCount: number;
      degraded?: boolean;
    }>("/api/library/index", { engagementId });
    setBusy("idle");
    if (result.ok) {
      setIndex({ mode: result.mode, chunks: result.chunkCount });
      setStale(false);
      setMessage(
        result.degraded
          ? `Index built with lexical retrieval (${result.chunkCount} chunks) — the embeddings model was unavailable, so search falls back to keyword matching.`
          : `Index built with ${result.mode} retrieval (${result.chunkCount} chunks).`,
      );
      setLive(`Index built: ${result.mode}, ${result.chunkCount} chunks.`);
    } else {
      setMessage("Could not build the index. Save the documents first, then try again.");
    }
  }

  return (
    <div className="stack-lg">
      <div aria-live="polite" className="visually-hidden">
        {live}
      </div>

      <section
        className={`card stack${dragOver ? " card--drag" : ""}`}
        aria-label="Add baseline documents"
        aria-busy={busy === "parsing"}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void handleFiles(event.dataTransfer.files);
        }}
      >
        <div className="stack">
          <span className="t-system">Add baseline documents</span>
          <p className="t-faint t-system">
            Upload the unit&apos;s existing policies, procedures, or historical context. For a Teams shared folder, sync it
            with OneDrive or download it first, then select the files here. PDF and Word are parsed on the server; .txt,
            .md, and pasted text work too.
          </p>
        </div>

        <div className="row row--wrap">
          <input
            id="library-file-upload"
            type="file"
            accept={ACCEPTED_DOC_ACCEPT}
            multiple
            className="visually-hidden"
            disabled={busy !== "idle"}
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <label htmlFor="library-file-upload" className="btn">
            {busy === "parsing" ? "Importing…" : "Upload documents"}
          </label>
          <input
            id="library-folder-upload"
            ref={folderInputRef}
            type="file"
            accept={ACCEPTED_DOC_ACCEPT}
            multiple
            className="visually-hidden"
            disabled={busy !== "idle"}
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <label htmlFor="library-folder-upload" className="btn">
            Upload folder
          </label>
          <span className="t-faint t-system">.pdf · .docx · .txt · .md · up to 2 MB each</span>
        </div>
        <p className="t-faint t-system">
          Drag and drop multiple files onto this card, upload individual files, or select a synced Teams/OneDrive folder.
          Relative folder paths are stored as metadata.
        </p>

        <label className="field" htmlFor="library-protection">
          <span className="t-system">Protection level for new documents</span>
          <select
            id="library-protection"
            value={protection}
            onChange={(event) => setProtection(event.target.value as ProtectionLevel)}
          >
            {PROTECTION_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <p className="t-faint t-system">
          P1–P3 only. P4 material must never be uploaded. Filenames and metadata are committed to GitHub; file and text
          content is encrypted in Vercel Blob.
        </p>

        {busy === "parsing" && importProgress && (
          <p className="t-faint t-system">
            Parsing {importProgress.done} of {importProgress.total} {importKind} file(s)…
          </p>
        )}

        <div className="row">
          <label>
            <span className="visually-hidden">Pasted document kind</span>
            <select value={pasteKind} onChange={(event) => setPasteKind(event.target.value as DocKind)}>
              {DOC_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field stack" htmlFor="library-paste">
          <span className="t-system">Or paste document text</span>
          <textarea
            id="library-paste"
            rows={4}
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder="Paste the policy or procedure text here."
          />
        </label>
        <div className="row">
          <button className="btn" onClick={addPaste} disabled={busy !== "idle" || !pasteText.trim()}>
            Add as document
          </button>
        </div>
      </section>

      {message && <p className="notice">{message}</p>}

      {importLog.length > 0 && (
        <details>
          <summary className="t-system">Import results ({importLog.length})</summary>
          <div className="stack">
            <table>
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Status</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {importLog.map((result, index) => (
                  <tr key={`${result.filename}-${index}`}>
                    <td>{result.filename}</td>
                    <td>{importStatusLabel(result.status)}</td>
                    <td className="t-system t-faint">{result.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row">
              <button className="btn btn--text" onClick={() => setImportLog([])}>
                Clear import results
              </button>
            </div>
          </div>
        </details>
      )}

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
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <details
                      onToggle={(event) => {
                        if (event.currentTarget.open) void ensureText(doc.id);
                      }}
                    >
                      <summary>{doc.source.path || doc.filename || doc.id}</summary>
                      <div className="stack">
                        {textErrors[doc.id] ? (
                          <p className="notice">{textErrors[doc.id]}</p>
                        ) : texts[doc.id] === undefined ? (
                          <p className="t-faint t-system">Loading text…</p>
                        ) : (
                          <label className="field stack">
                            <span className="t-system">Extracted text — edit if needed</span>
                            <textarea
                              rows={10}
                              value={texts[doc.id]}
                              onChange={(event) => editText(doc.id, event.target.value)}
                            />
                          </label>
                        )}
                      </div>
                    </details>
                    {doc.parseWarnings.length > 0 && (
                      <span className="t-faint t-system">{doc.parseWarnings.join(" ")}</span>
                    )}
                  </td>
                  <td>
                    <label>
                      <span className="visually-hidden">Kind for {doc.filename || doc.id}</span>
                      <select value={doc.kind} onChange={(event) => setKind(doc.id, event.target.value as DocKind)}>
                        {DOC_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {kind}
                          </option>
                        ))}
                      </select>
                    </label>
                  </td>
                  <td className="t-system t-faint">
                    <div>
                      {doc.source.type} · {doc.format} · {doc.protectionLevel}
                      {doc.pages ? ` · ${doc.pages} page(s)` : ""}
                    </div>
                    <label>
                      <span className="visually-hidden">Protection level for {doc.filename || doc.id}</span>
                      <select
                        value={doc.protectionLevel}
                        onChange={(event) => setProtectionLevel(doc.id, event.target.value as ProtectionLevel)}
                      >
                        {PROTECTION_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    </label>
                  </td>
                  <td>
                    <button className="btn btn--text" onClick={() => removeDoc(doc.id)}>
                      Remove
                    </button>
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
