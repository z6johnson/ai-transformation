/**
 * Build the retrieval index for an engagement's reference library. Chunks every document,
 * then embeds the chunks via TritonAI when an embeddings model is configured. If embeddings
 * are unconfigured OR any batch fails, it writes a LEXICAL-only index (empty vectors) so
 * retrieval still works — embeddings never block retrieval. PII is redacted on the chunk
 * text before it is embedded or stored in the index (the index feeds the model).
 *
 * Explicit step (not auto-run on save): the editor prompts a rebuild when documents change.
 */
import { NextRequest, NextResponse } from "next/server";
import { putFile } from "@/lib/github";
import { libraryIndexFile } from "@/lib/paths";
import { loadLibrary, loadIndex } from "@/lib/library-store";
import { chunkText } from "@/lib/embeddings";
import { callEmbeddings, isEmbeddingsConfigured, embeddingModel } from "@/lib/tritonai";
import { redactPII } from "@/lib/pii";
import { LibraryIndex, type LibraryChunk } from "@/lib/library-schemas";
import { appendAiDecision } from "@/lib/ai-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH = 64;
const round = (v: number) => Math.round(v * 1e6) / 1e6; // bound index.json size

export async function POST(req: NextRequest) {
  const { engagementId } = (await req.json().catch(() => ({}))) as { engagementId?: string };
  if (!engagementId) return NextResponse.json({ error: "engagementId is required" }, { status: 400 });

  const { data: library } = await loadLibrary(engagementId);
  const docs = library.data.documents;

  // Chunk every doc; redact on the chunk text (this text is sent to the model at retrieval).
  const chunks: LibraryChunk[] = [];
  for (const doc of docs) {
    const { text } = redactPII(doc.text);
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

  const existing = await loadIndex(engagementId);
  await putFile({
    path: libraryIndexFile(engagementId),
    content: JSON.stringify(index, null, 2) + "\n",
    message: `chore(${engagementId}): build library index (${mode}, ${chunks.length} chunk(s))`,
    expectedSha: existing.sha,
  });

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
