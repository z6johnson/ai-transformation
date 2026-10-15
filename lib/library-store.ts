/**
 * Server-side reads/writes for the Reference Library, split across two stores:
 *
 *  - GitHub holds the content-free manifest (LibraryManifest): doc ids, filenames,
 *    kinds, hashes, and analysis audit entries. Git history is the audit trail.
 *  - Vercel Blob (lib/docstore.ts) holds everything with content, encrypted at rest:
 *    original files, extracted text, the retrieval index, synthesis, gap analysis.
 *
 * Old libraries (documents.json in GitHub) migrate lazily on first access: text moves
 * into the store, a manifest is committed, and the legacy content files are deleted
 * from the branch. Git history still contains the old content — removing that would
 * require a history rewrite and is out of scope; nothing NEW lands in the repo.
 *
 * Concurrency: document saves round-trip the manifest's git sha (optimistic locking on
 * the commit); synthesis and gap saves round-trip their audit `updatedAt` token, and the
 * manifest commit still guards against races. Server-only.
 */
import { getJson, putFile, deleteFile, ConcurrencyError } from "./github";
import type { z } from "zod";
import { libraryManifestFile, libraryDocsFile, libraryIndexFile, gapAnalysisFile, librarySynthesisFile } from "./paths";
import {
  ReferenceLibrary,
  LibraryIndex,
  GapAnalysis,
  LibrarySynthesis,
  LibraryManifest,
  ManifestDocument,
} from "./library-schemas";
import {
  docTextPath,
  documentsPrefix,
  indexPath,
  synthesisPath,
  gapAnalysisPath,
  putObject,
  putJson,
  getObject,
  getJson as getStoreJson,
  sha256Hex,
} from "./docstore";

export type Loaded<T> = { data: T; sha: string | null };

const emptyManifest = (id: string) => LibraryManifest.parse({ engagementId: id });
const migrations = new Map<string, Promise<void>>();

// ---- Migration --------------------------------------------------------------

/**
 * One-time, lazy migration from the pre-document-store layout (content in GitHub) to
 * the split layout (content in Blob, manifest in GitHub). Idempotent and safe under
 * concurrency: blob writes are deterministic, the manifest commit is last-writer-wins
 * with identical content, and legacy-file deletes tolerate already-deleted files.
 */
async function migrate(id: string): Promise<void> {
  if (await getJson(libraryManifestFile(id))) return;

  const [oldDocsRaw, oldIndexRaw, oldSynthRaw, oldGapRaw] = await Promise.all([
    getJson<unknown>(libraryDocsFile(id)),
    getJson<unknown>(libraryIndexFile(id)),
    getJson<unknown>(librarySynthesisFile(id)),
    getJson<unknown>(gapAnalysisFile(id)),
  ]);
  if (!oldDocsRaw && !oldIndexRaw && !oldSynthRaw && !oldGapRaw) return;

  const documents: ManifestDocument[] = [];
  const docsParsed = ReferenceLibrary.safeParse(oldDocsRaw?.data);
  if (docsParsed.success) {
    for (const doc of docsParsed.data.data.documents) {
      const text = doc.text;
      await putObject(docTextPath(id, doc.id), Buffer.from(text, "utf8"));
      documents.push(
        ManifestDocument.parse({
          id: doc.id,
          filename: doc.filename,
          kind: doc.kind,
          hash: sha256Hex(text),
          bytes: doc.source.bytes,
          textBytes: Buffer.byteLength(text, "utf8"),
          format: doc.source.format,
          pages: doc.source.pages,
          parseWarnings: doc.source.parseWarnings,
          piiRedactions: doc.source.piiRedactions,
          originalStored: false, // originals were never stored pre-migration
          source: {
            type: doc.source.format === "paste" ? "paste" : "upload",
            uploadedBy: doc.uploadedBy,
            parsedAt: doc.parsedAt,
          },
          protectionLevel: "P2",
          textUpdatedAt: "",
        }),
      );
    }
  }

  const index = { updatedAt: "", updatedBy: "", mode: "", count: 0 };
  if (oldIndexRaw?.data) {
    await putJson(indexPath(id), oldIndexRaw.data);
    const parsed = LibraryIndex.safeParse(oldIndexRaw.data);
    if (parsed.success) {
      index.updatedAt = parsed.data.builtAt || "";
      index.mode = parsed.data.embeddingModel ? "embeddings" : "lexical";
      index.count = parsed.data.chunkCount;
    }
  }

  const synthesis = { updatedAt: "", updatedBy: "", mode: "", count: 0 };
  if (oldSynthRaw?.data) {
    await putJson(synthesisPath(id), oldSynthRaw.data);
    const parsed = LibrarySynthesis.safeParse(oldSynthRaw.data);
    if (parsed.success) {
      synthesis.updatedAt = parsed.data.updatedAt || "";
      synthesis.updatedBy = parsed.data.updatedBy || "";
      synthesis.mode = parsed.data.data.retrievalMode;
      synthesis.count = parsed.data.data.sections.length;
    }
  }

  const gap = { updatedAt: "", updatedBy: "", mode: "", count: 0 };
  if (oldGapRaw?.data) {
    await putJson(gapAnalysisPath(id), oldGapRaw.data);
    const parsed = GapAnalysis.safeParse(oldGapRaw.data);
    if (parsed.success) {
      gap.updatedAt = parsed.data.updatedAt || "";
      gap.updatedBy = parsed.data.updatedBy || "";
      gap.mode = parsed.data.data.retrievalMode;
      gap.count = parsed.data.data.findings.length;
    }
  }

  const manifest = LibraryManifest.parse({
    engagementId: id,
    status: "in-review",
    data: { documents, analyses: { index, synthesis, gap } },
  });
  await putFile({
    path: libraryManifestFile(id),
    content: JSON.stringify(manifest, null, 2) + "\n",
    message: `chore(${id}): migrate reference library to document store (${documents.length} doc(s))`,
    expectedSha: undefined,
  });
  await Promise.all([
    deleteFile(libraryDocsFile(id), `chore(${id}): remove legacy library documents`),
    deleteFile(libraryIndexFile(id), `chore(${id}): remove legacy library index`),
    deleteFile(librarySynthesisFile(id), `chore(${id}): remove legacy library synthesis`),
    deleteFile(gapAnalysisFile(id), `chore(${id}): remove legacy gap analysis`),
  ]);
}

/** Serialize migration per engagement so parallel first reads cannot race the commit. */
export function ensureMigrated(id: string): Promise<void> {
  const existing = migrations.get(id);
  if (existing) return existing;
  const migration = migrate(id).finally(() => migrations.delete(id));
  migrations.set(id, migration);
  return migration;
}

// ---- Manifest & documents ---------------------------------------------------

export async function loadManifest(id: string): Promise<Loaded<z.infer<typeof LibraryManifest>>> {
  await ensureMigrated(id);
  const raw = await getJson<unknown>(libraryManifestFile(id));
  if (!raw) return { data: emptyManifest(id), sha: null };
  const parsed = LibraryManifest.safeParse(raw.data);
  return { data: parsed.success ? parsed.data : emptyManifest(id), sha: raw.sha };
}

/** Fetch one document's text from the store (null when it was never written). */
export async function loadDocumentText(id: string, docId: string): Promise<string | null> {
  await ensureMigrated(id);
  const text = await getObject(docTextPath(id, docId));
  return text === null ? null : text.toString("utf8");
}

/** Fetch several documents' texts in parallel, in bounded batches. */
export async function loadTextsFor(id: string, docIds: string[]): Promise<Map<string, string>> {
  await ensureMigrated(id);
  const out = new Map<string, string>();
  for (let i = 0; i < docIds.length; i += 10) {
    await Promise.all(
      docIds.slice(i, i + 10).map(async (docId) => {
        const text = await getObject(docTextPath(id, docId));
        const value = text === null ? null : text.toString("utf8");
        if (value !== null) out.set(docId, value);
      }),
    );
  }
  return out;
}

// ---- Derived analyses (content in the store, audit in the manifest) ----------

export async function loadIndex(id: string): Promise<Loaded<z.infer<typeof LibraryIndex>>> {
  await ensureMigrated(id);
  const empty = LibraryIndex.parse({ engagementId: id });
  const raw = await getStoreJson<unknown>(indexPath(id));
  if (!raw) return { data: empty, sha: null };
  const parsed = LibraryIndex.safeParse(raw);
  return { data: parsed.success ? parsed.data : empty, sha: null };
}

function analysisToken(manifest: z.infer<typeof LibraryManifest>, key: "synthesis" | "gap"): string | null {
  const value = manifest.data.analyses[key].updatedAt;
  return value || null;
}

export async function loadSynthesis(id: string): Promise<Loaded<z.infer<typeof LibrarySynthesis>>> {
  const { data: manifest } = await loadManifest(id);
  const empty = LibrarySynthesis.parse({ engagementId: id });
  const raw = await getStoreJson<unknown>(synthesisPath(id));
  if (!raw) return { data: empty, sha: analysisToken(manifest, "synthesis") };
  const parsed = LibrarySynthesis.safeParse(raw);
  return { data: parsed.success ? parsed.data : empty, sha: analysisToken(manifest, "synthesis") };
}

export async function loadGapAnalysis(id: string): Promise<Loaded<z.infer<typeof GapAnalysis>>> {
  const { data: manifest } = await loadManifest(id);
  const empty = GapAnalysis.parse({ engagementId: id });
  const raw = await getStoreJson<unknown>(gapAnalysisPath(id));
  if (!raw) return { data: empty, sha: analysisToken(manifest, "gap") };
  const parsed = GapAnalysis.safeParse(raw);
  return { data: parsed.success ? parsed.data : empty, sha: analysisToken(manifest, "gap") };
}

/**
 * Save a human-confirmed analysis: content to the encrypted store, audit entry (with a
 * fresh `updatedAt` token) to the manifest. Throws ConcurrencyError when the client's
 * token is stale or the manifest moved underneath the write.
 */
async function saveAnalysis(args: {
  engagementId: string;
  key: "index" | "synthesis" | "gap";
  storePath: string;
  payload: unknown;
  baseSha: string | null;
  mode: string;
  count: number;
  message: string;
}): Promise<string> {
  const { data: manifest, sha } = await loadManifest(args.engagementId);
  const current = manifest.data.analyses[args.key].updatedAt || null;
  if (current !== (args.baseSha ?? null)) throw new ConcurrencyError(libraryManifestFile(args.engagementId));

  await putJson(args.storePath, args.payload);

  const updatedAt = new Date().toISOString();
  const updatedBy = process.env.PRACTICE_ACTOR || "unknown";
  const next = LibraryManifest.parse({
    ...manifest,
    data: {
      ...manifest.data,
      analyses: {
        ...manifest.data.analyses,
        [args.key]: { updatedAt, updatedBy, mode: args.mode, count: args.count },
      },
    },
  });
  await putFile({
    path: libraryManifestFile(args.engagementId),
    content: JSON.stringify(next, null, 2) + "\n",
    message: args.message,
    expectedSha: sha,
  });
  return updatedAt;
}

export function saveSynthesis(
  engagementId: string,
  payload: z.infer<typeof LibrarySynthesis>,
  baseSha: string | null,
): Promise<string> {
  return saveAnalysis({
    engagementId,
    key: "synthesis",
    storePath: synthesisPath(engagementId),
    payload,
    baseSha,
    mode: payload.data.retrievalMode,
    count: payload.data.sections.length,
    message: `chore(${engagementId}): save library synthesis (${payload.data.sections.length} section(s))`,
  });
}

export function saveGapAnalysis(
  engagementId: string,
  payload: z.infer<typeof GapAnalysis>,
  baseSha: string | null,
): Promise<string> {
  return saveAnalysis({
    engagementId,
    key: "gap",
    storePath: gapAnalysisPath(engagementId),
    payload,
    baseSha,
    mode: payload.data.retrievalMode,
    count: payload.data.findings.length,
    message: `chore(${engagementId}): save gap analysis (${payload.data.findings.length} finding(s))`,
  });
}

export function saveIndex(
  engagementId: string,
  payload: z.infer<typeof LibraryIndex>,
  baseSha: string | null,
): Promise<string> {
  return saveAnalysis({
    engagementId,
    key: "index",
    storePath: indexPath(engagementId),
    payload,
    baseSha,
    mode: payload.embeddingModel ? "embeddings" : "lexical",
    count: payload.chunkCount,
    message: `chore(${engagementId}): build library index (${payload.embeddingModel ? "embeddings" : "lexical"}, ${payload.chunkCount} chunk(s))`,
  });
}

// Re-exported for the save route's orphan sweep.
export { documentsPrefix };
