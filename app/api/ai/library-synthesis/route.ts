/**
 * Synthesize the documented baseline: a structured, descriptive summary of what the reference
 * library's documents SAY should happen. Covers the whole library (every document), not a
 * query — so it reads from the built index's chunks rather than retrieving against the map.
 * The chunk text is already PII-redacted at index-build time (the index feeds the model).
 *
 * Never auto-saves — the client confirms each section (→ ai-confirmed) and saves. The result
 * is reference only, NOT ground truth; the as-is map (interviews/journey/friction) remains the
 * account of what actually happens. Every generation is logged for the audit trail.
 */
import { NextRequest, NextResponse } from "next/server";
import { callModel, parseJsonLoose, isAiConfigured, modelForFeature } from "@/lib/tritonai";
import { redactPII } from "@/lib/pii";
import { LIBRARY_SYNTHESIS, baselineBlock } from "@/lib/prompts";
import { metaFromResult } from "@/lib/ai-meta";
import { loadIndex } from "@/lib/library-store";
import { appendAiDecision } from "@/lib/ai-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bound the prompt so a large library can't crowd the model: keep coverage across documents
// (a per-document cap) while capping the overall passage count.
const PER_DOC = 12;
const MAX_TOTAL = 80;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export async function POST(req: NextRequest) {
  const { engagementId } = (await req.json().catch(() => ({}))) as { engagementId?: string };
  if (!engagementId) return NextResponse.json({ error: "engagementId is required" }, { status: 400 });
  if (!isAiConfigured()) {
    return NextResponse.json({ degraded: true, sections: [], summary: "", message: "AI assist is not configured." });
  }

  const { data: index } = await loadIndex(engagementId);
  if (!index.chunks.length) {
    return NextResponse.json({
      degraded: true,
      sections: [],
      summary: "",
      message: "No reference documents are indexed yet. Add documents and build the index first.",
    });
  }

  // Record retrieval mode for audit — even though synthesis reads all chunks, not a query.
  const retrievalMode: "embeddings" | "lexical" = index.embeddingModel ? "embeddings" : "lexical";

  // Full-coverage selection: cap per document, then cap the total. Map insertion order keeps
  // documents grouped and chunks in their original order.
  const byDoc = new Map<string, typeof index.chunks>();
  for (const c of index.chunks) {
    const list = byDoc.get(c.docId) || [];
    if (list.length < PER_DOC) list.push(c);
    byDoc.set(c.docId, list);
  }
  const selected = [...byDoc.values()].flat().slice(0, MAX_TOTAL);
  const passages = selected.map((c) => ({ ref: c.chunkId, text: c.text }));

  // Chunk text is already redacted at index time; redact again only to count for the log.
  const { text: baseline, redactions } = redactPII(baselineBlock(passages));
  const inputSummary = `${byDoc.size} document(s), ${passages.length} passage(s), ${redactions} PII redaction(s)`;
  const model = modelForFeature("draft");
  const result = await callModel({ messages: LIBRARY_SYNTHESIS.build(baseline), jsonObject: true, model });

  if (!result.ok) {
    const meta = metaFromResult({ result, promptId: LIBRARY_SYNTHESIS.id, model, inputSummary, outputSummary: "no output" });
    await appendAiDecision({
      ts: new Date().toISOString(),
      actor: process.env.PRACTICE_ACTOR || "unknown",
      feature: "library-synthesis",
      promptId: LIBRARY_SYNTHESIS.id,
      model,
      engagementId,
      inputSummary,
      outputSummary: "no output",
      latencyMs: result.latencyMs,
      outcome: result.reason === "timeout" ? "timeout" : "fallback",
    });
    return NextResponse.json({
      degraded: true,
      sections: [],
      summary: "",
      aiMeta: meta,
      retrievalMode,
      message: "AI assist is unavailable. Try again.",
    });
  }

  const parsed = parseJsonLoose<{ summary?: unknown; sections?: Array<Record<string, unknown>> }>(result.content);
  const sections = (parsed?.sections || [])
    .map((x, i) => ({
      id: `SEC-${String(i + 1).padStart(2, "0")}`,
      heading: str(x.heading),
      body: str(x.body),
      baselineRefs: arr(x.baselineRefs),
    }))
    .filter((s) => s.heading || s.body);
  const summary = str(parsed?.summary);

  const meta = metaFromResult({
    result,
    promptId: LIBRARY_SYNTHESIS.id,
    model,
    inputSummary,
    outputSummary: `${sections.length} section(s) (${retrievalMode})`,
  });
  await appendAiDecision({
    ts: new Date().toISOString(),
    actor: process.env.PRACTICE_ACTOR || "unknown",
    feature: "library-synthesis",
    promptId: LIBRARY_SYNTHESIS.id,
    model,
    modelVersion: meta.modelVersion,
    engagementId,
    inputSummary,
    outputSummary: `${sections.length} section(s) (${retrievalMode})`,
    latencyMs: result.latencyMs,
    outcome: "ok",
  });

  return NextResponse.json({ degraded: false, sections, summary, aiMeta: meta, retrievalMode });
}
