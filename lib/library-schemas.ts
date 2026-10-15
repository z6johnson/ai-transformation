/**
 * Zod schemas for the per-engagement Reference Library — the historical/contextual and
 * existing process/policy/procedure documents a unit already has when we engage them.
 *
 * Kept SEPARATE from lib/schemas.ts on purpose: the library is a baseline INPUT, not a
 * Layer 1 mapping artifact, so it must not enter the fixed `ARTIFACT_IDS` union (which is
 * wired into save validation, the stage stepper, progress, labels and the dashboard). It
 * reuses the `Origin`/`Envelope` conventions so provenance and audit stay uniform, and
 * lives under data/engagements/<id>/_library/ alongside the existing _ai-log.jsonl.
 */
import { z } from "zod";
import { Origin, Envelope } from "./schemas";

/** The kind of baseline a document represents. */
export const DOC_KINDS = ["policy", "procedure", "historical", "other"] as const;
export const DocKind = z.enum(DOC_KINDS);
export type DocKind = z.infer<typeof DocKind>;

/** How the document text was obtained. */
export const DOC_FORMATS = ["pdf", "docx", "txt", "md", "paste"] as const;
export const DocFormat = z.enum(DOC_FORMATS);
export type DocFormat = z.infer<typeof DocFormat>;

/** A single reference document: human-curated baseline, browsable by the practice lead. */
export const ReferenceDocument = z.object({
  id: z.string(), // "DOC-01"
  filename: z.string().default(""),
  kind: DocKind.default("other"),
  text: z.string().default(""), // extracted plain text (stored as-is; redacted only before model calls)
  parsedAt: z.string().default(""),
  uploadedBy: z.string().default(""),
  source: z
    .object({
      format: DocFormat.default("paste"),
      bytes: z.number().default(0),
      parser: z.string().default(""), // "pdf-parse", "mammoth", "utf8", "paste"
      pages: z.number().optional(),
      parseWarnings: z.array(z.string()).default([]),
      piiRedactions: z.number().default(0), // count only — text is stored unredacted
    })
    .default({ format: "paste", bytes: 0, parser: "", parseWarnings: [], piiRedactions: 0 }),
  origin: Origin.default("human"),
});
export type ReferenceDocument = z.infer<typeof ReferenceDocument>;

/** The browsable library file. Envelope-shaped (minus artifactId) for audit consistency. */
export const ReferenceLibrary = Envelope.omit({ artifactId: true }).extend({
  data: z.object({ documents: z.array(ReferenceDocument).default([]) }).default({ documents: [] }),
});
export type ReferenceLibrary = z.infer<typeof ReferenceLibrary>;

/** UC IS-3 protection level recorded per imported document. P4 never enters this app. */
export const PROTECTION_LEVELS = ["P1", "P2", "P3"] as const;
export const ProtectionLevel = z.enum(PROTECTION_LEVELS);
export type ProtectionLevel = z.infer<typeof ProtectionLevel>;

/**
 * Manifest entry for one reference document. Deliberately CONTENT-FREE: GitHub holds
 * this, while the document's original file and extracted text live encrypted in the
 * Vercel Blob document store (lib/docstore.ts). `hash` is the sha-256 of the text —
 * it drives dedupe and lets the save route write only texts that actually changed.
 */
export const ManifestDocument = z.object({
  id: z.string().regex(/^[A-Za-z0-9-]{1,64}$/, "invalid document id"),
  filename: z.string().default(""),
  kind: DocKind.default("other"),
  hash: z.string().default(""),
  bytes: z.number().default(0), // original file size (0 for pasted text)
  textBytes: z.number().default(0),
  format: DocFormat.default("paste"),
  pages: z.number().optional(),
  parseWarnings: z.array(z.string()).default([]),
  piiRedactions: z.number().default(0), // count only — text is stored unredacted
  originalStored: z.boolean().default(false), // original.bin exists in the store
  source: z
    .object({
      type: z.enum(["upload", "paste"]).default("upload"),
      path: z.string().default(""),
      uploadedBy: z.string().default(""),
      parsedAt: z.string().default(""),
    })
    .default({ type: "upload", path: "", uploadedBy: "", parsedAt: "" }),
  protectionLevel: ProtectionLevel.default("P2"),
  textUpdatedAt: z.string().default(""),
});
export type ManifestDocument = z.infer<typeof ManifestDocument>;

/** A document as it travels in the save payload — manifest entry plus (optionally) its text. */
export const LibrarySaveDocument = ManifestDocument.extend({ text: z.string().optional() });
export type LibrarySaveDocument = z.infer<typeof LibrarySaveDocument>;

/** Audit metadata for one derived library analysis. Content lives in the document store. */
export const AnalysisAudit = z.object({
  updatedAt: z.string().default(""),
  updatedBy: z.string().default(""),
  mode: z.string().default(""), // embeddings | lexical | none
  count: z.number().default(0), // chunks / sections / findings
});
export type AnalysisAudit = z.infer<typeof AnalysisAudit>;

const emptyAudit = (): AnalysisAudit => ({ updatedAt: "", updatedBy: "", mode: "", count: 0 });
const emptyAnalyses = () => ({ index: emptyAudit(), synthesis: emptyAudit(), gap: emptyAudit() });

/**
 * The content-free library manifest committed to GitHub. Git history remains the audit
 * trail (who added/removed/edited what, and when) while document content stays out of
 * the repo entirely. Each analysis audit's `updatedAt` doubles as the optimistic-
 * concurrency token the UI round-trips on save (the manifest's git sha guards documents).
 */
export const LibraryManifest = Envelope.omit({ artifactId: true }).extend({
  data: z
    .object({
      documents: z.array(ManifestDocument).default([]),
      analyses: z
        .object({
          index: AnalysisAudit.default(emptyAudit()),
          synthesis: AnalysisAudit.default(emptyAudit()),
          gap: AnalysisAudit.default(emptyAudit()),
        })
        .default(emptyAnalyses()),
    })
    .default({ documents: [], analyses: emptyAnalyses() }),
});
export type LibraryManifest = z.infer<typeof LibraryManifest>;

/**
 * One retrieval chunk. `vector` is empty when the index is lexical-only (no embeddings
 * model provisioned, or the embeddings call failed and we fell back to term-overlap).
 */
export const LibraryChunk = z.object({
  chunkId: z.string(), // "DOC-01#3"
  docId: z.string(),
  ord: z.number().default(0),
  text: z.string().default(""),
  vector: z.array(z.number()).default([]),
});
export type LibraryChunk = z.infer<typeof LibraryChunk>;

/**
 * The machine-generated chunk index. `embeddingModel === ""` signals lexical-only
 * retrieval. Kept in a separate file from the documents so browsing never loads vectors.
 */
export const LibraryIndex = z.object({
  engagementId: z.string(),
  embeddingModel: z.string().default(""),
  dims: z.number().default(0),
  builtAt: z.string().default(""),
  chunkCount: z.number().default(0),
  chunks: z.array(LibraryChunk).default([]),
});
export type LibraryIndex = z.infer<typeof LibraryIndex>;

/** One documented-vs-actual divergence. Descriptive only — names no fix, assigns no blame. */
export const GapFinding = z.object({
  id: z.string(), // "GAP-01"
  area: z.string().default(""),
  documentedBaseline: z.string().default(""), // what the docs say SHOULD happen
  actualPractice: z.string().default(""), // what the as-is map shows happens
  divergence: z.string().default(""), // descriptive contrast
  baselineRefs: z.array(z.string()).default([]), // chunkIds the finding draws on
  mapRefs: z.array(z.string()).default([]), // journey/friction refs
  origin: Origin.default("ai-draft"),
  promptId: z.string().optional(),
  confirmedBy: z.string().optional(),
  confirmedAt: z.string().optional(),
});
export type GapFinding = z.infer<typeof GapFinding>;

/** The human-confirmed gap-analysis result. Envelope-shaped for audit consistency. */
export const GapAnalysis = Envelope.omit({ artifactId: true }).extend({
  data: z
    .object({
      findings: z.array(GapFinding).default([]),
      generatedAt: z.string().default(""),
      retrievalMode: z.enum(["embeddings", "lexical", "none"]).default("none"),
    })
    .default({ findings: [], generatedAt: "", retrievalMode: "none" }),
});
export type GapAnalysis = z.infer<typeof GapAnalysis>;

/**
 * One section of the documented-baseline synthesis: a faithful, descriptive summary of what
 * the reference documents SAY should happen. It is baseline only — never a statement of what
 * actually happens (that is the as-is map). `baselineRefs` are the chunkIds it draws on, so
 * every claim traces back to a passage, exactly like a GapFinding.
 */
export const SynthesisSection = z.object({
  id: z.string(), // "SEC-01"
  heading: z.string().default(""),
  body: z.string().default(""),
  baselineRefs: z.array(z.string()).default([]), // chunkIds, e.g. "DOC-01#3"
  origin: Origin.default("ai-draft"),
  promptId: z.string().optional(),
  confirmedBy: z.string().optional(),
  confirmedAt: z.string().optional(),
});
export type SynthesisSection = z.infer<typeof SynthesisSection>;

/**
 * The human-confirmed synthesis of the reference library. A reusable, audited summary of the
 * documented baseline that the mapping drafts can read as clearly-labeled, lower-weight
 * context (reference only — never ground truth). Envelope-shaped for audit consistency.
 */
export const LibrarySynthesis = Envelope.omit({ artifactId: true }).extend({
  data: z
    .object({
      sections: z.array(SynthesisSection).default([]),
      summary: z.string().default(""),
      generatedAt: z.string().default(""),
      retrievalMode: z.enum(["embeddings", "lexical", "none"]).default("none"),
    })
    .default({ sections: [], summary: "", generatedAt: "", retrievalMode: "none" }),
});
export type LibrarySynthesis = z.infer<typeof LibrarySynthesis>;
