/**
 * Retrieval helpers for the Reference Library: chunking, cosine similarity, a lexical
 * (term-overlap / idf-weighted) fallback, and a `retrieve` that uses embeddings when the
 * index has them and degrades to lexical otherwise. Pure functions — no I/O, no model
 * calls (those live in lib/tritonai.ts). The "embeddings never block retrieval" mirror of
 * the app's "AI never blocks the human" philosophy lives here.
 */
import type { LibraryIndex, LibraryChunk } from "./library-schemas";

const CHUNK_CHARS = 1600; // ~400 tokens at ~4 chars/token
const OVERLAP_CHARS = 240;

/** Split text into overlapping, paragraph-aware chunks. */
export function chunkText(text: string): { ord: number; text: string }[] {
  const clean = text.trim();
  if (!clean) return [];
  const paras = clean
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf.trim()) out.push(buf.trim());
  };

  for (const p of paras) {
    if (buf && buf.length + p.length + 2 > CHUNK_CHARS) {
      flush();
      const tail = buf.slice(-OVERLAP_CHARS); // carry overlap for continuity
      buf = `${tail}\n\n${p}`;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
    // A single very long paragraph: hard-split it.
    while (buf.length > CHUNK_CHARS * 1.5) {
      out.push(buf.slice(0, CHUNK_CHARS).trim());
      buf = buf.slice(CHUNK_CHARS - OVERLAP_CHARS);
    }
  }
  flush();
  return out.map((t, i) => ({ ord: i, text: t }));
}

/** Cosine similarity. Returns 0 for empty/zero vectors. */
export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const STOP = new Set(
  "the a an and or of to in on for with is are be as at by from that this it its their there here was were has have had will would can could should into over under than then them they you your our we us".split(
    " ",
  ),
);

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w));
}

/** Inverse-document-frequency weights across the index, for the lexical scorer. */
function buildIdf(chunks: { text: string }[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const c of chunks) {
    for (const t of new Set(tokenize(c.text))) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = chunks.length || 1;
  const idf = new Map<string, number>();
  for (const [t, d] of df) idf.set(t, Math.log(1 + N / d));
  return idf;
}

/** idf-weighted term-overlap score of a chunk against query tokens. */
function lexicalScore(queryTokens: Set<string>, chunkText: string, idf: Map<string, number>): number {
  const tf = new Map<string, number>();
  for (const t of tokenize(chunkText)) tf.set(t, (tf.get(t) || 0) + 1);
  let score = 0;
  for (const q of queryTokens) {
    const f = tf.get(q) || 0;
    if (f) score += (idf.get(q) ?? 1) * (f / (f + 1)); // saturating tf
  }
  return score;
}

export type Retrieved = { chunk: LibraryChunk; score: number };

/**
 * Top-k passages for a query. Uses cosine over stored vectors when the index is embedded
 * and a query vector is supplied; otherwise falls back to lexical scoring on the text.
 */
export function retrieve(
  index: LibraryIndex,
  opts: { queryText: string; queryVector?: number[]; k: number },
): Retrieved[] {
  if (!index.chunks.length) return [];
  const useEmbeddings = Boolean(index.embeddingModel) && Boolean(opts.queryVector?.length);

  let scored: Retrieved[];
  if (useEmbeddings) {
    scored = index.chunks
      .filter((c) => c.vector.length)
      .map((c) => ({ chunk: c, score: cosine(opts.queryVector as number[], c.vector) }));
  } else {
    const idf = buildIdf(index.chunks);
    const q = new Set(tokenize(opts.queryText));
    scored = index.chunks.map((c) => ({ chunk: c, score: lexicalScore(q, c.text, idf) }));
  }

  return scored
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.k);
}
