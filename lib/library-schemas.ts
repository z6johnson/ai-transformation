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
