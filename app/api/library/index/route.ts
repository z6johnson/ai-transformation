/**
 * Build the retrieval index for an engagement's reference library. Text comes from the
 * encrypted document store (never GitHub); chunks are embedded via TritonAI when an
 * embeddings model is configured, with a lexical fallback that always works. The index
 * itself is written back to the document store (it contains document text), and the
 * manifest's audit entry records the build. PII is redacted on the chunk text before it
 * is embedded or stored (the index feeds the model).
 *
 * Explicit step (not auto-run on save): the editor prompts a rebuild when documents change.
 */
import { NextRequest, NextResponse } from "next/server";
import { loadManifest, loadTextsFor, saveIndex } from "@/lib/library-store";
import { chunkText } from "@/lib/embeddings";
import { callEmbeddings, isEmbeddingsConfigured, embeddingModel } from "@/lib/tritonai";
import { redactPII } from "@/lib/pii";
import { LibraryIndex, type LibraryChunk } from "@/lib/library-schemas";
import { appendAiDecision } from "@/lib/ai-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// This route runs one embedding call per batch, back to back, so it is the longest-running
// route in the app after synthesis. Bound it so a large library fails cleanly to a lexical
// index rather than being killed mid-rebuild.
export const maxDuration = 60;

// Sized against the embedding model's input window, not throughput. api-tgpt-embeddings caps at
// 33K tokens per request; chunkText hard-splits at CHUNK_CHARS * 1.5 (~600 tokens), so 64 dense
// chunks can reach ~38K and fail the batch — which drops the whole library to lexical retrieval.
// 32 leaves headroom for the worst case at the same total token cost.
const BATCH = 32;
const round = (v: number) => Math.round(v * 1e6) / 1e6; // bound index size

export async function POST(req: NextRequest) {
  const { engagementId } = (await req.json().catch(() => ({}))) as { engagementId?: string };
  if (!engagementId) return NextResponse.json({ error: "engagementId is required" }, { status: 400 });

  const { data: manifest } = await loadManifest(engagementId);
  const docs = manifest.data.documents;
  const texts = await loadTextsFor(engagementId, docs.map((d) => d.id));

  // Chunk every doc; redact on the chunk text (this text is sent to the model at retrieval).
  const chunks: LibraryChunk[] = [];
  for (const doc of docs) {
    const raw = texts.get(doc.id);
    if (!raw) continue;
    const { text } = redactPII(raw);
    for (const c of chunkText(text)) {
      chunks.push({ chunkId: `${doc.id}#${c.ord}`, docId: doc.id, ord: c.ord, text: c.text, vector: [] });
    }
  }

  let mode: "embeddings" | "lexical" = "lexical";
  let usedModel = "";
  let dims = 0;
  let latencyMs = 0;
  let degraded = false;

  if (chunks.length && isEmbeddingsConfigured()) {
    let ok = true;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      const res = await callEmbeddings({ input: slice.map((c) => c.text) });
      latencyMs += res.latencyMs;
      if (!res.ok || res.vectors.length !== slice.length) {
        ok = false;
        break;
      }
      slice.forEach((c, j) => (c.vector = res.vectors[j].map(round)));
      if (res.vectors[0]) dims = res.vectors[0].length;
    }
    if (ok) {
      mode = "embeddings";
      usedModel = embeddingModel();
    } else {
      // Fall back cleanly: drop any partial vectors, keep a lexical index.
      chunks.forEach((c) => (c.vector = []));
      degraded = true;
    }
  }

  const index = LibraryIndex.parse({
    engagementId,
    embeddingModel: usedModel,
    dims,
    builtAt: new Date().toISOString(),
    chunkCount: chunks.length,
    chunks,
  });

  // The index is a derived artifact: the editor does not round-trip a concurrency token
  // for it, so pass the manifest's current token — the manifest commit still guards races.
  const currentToken = manifest.data.analyses.index.updatedAt || null;
  await saveIndex(engagementId, index, currentToken);

  await appendAiDecision({
    ts: new Date().toISOString(),
    actor: process.env.PRACTICE_ACTOR || "unknown",
    feature: "library-index",
    promptId: "",
    model: usedModel,
    engagementId,
    inputSummary: `${docs.length} document(s), ${chunks.length} chunk(s)`,
    outputSummary: `index built (${mode})`,
    latencyMs,
    outcome: degraded ? "fallback" : "ok",
  });

  return NextResponse.json({ ok: true, mode, chunkCount: chunks.length, degraded });
}
