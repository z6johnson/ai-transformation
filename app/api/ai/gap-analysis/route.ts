/**
 * Gap analysis: contrast the DOCUMENTED baseline (reference library) against the AS-IS map
 * (interviews/journey/friction) and surface where they diverge. The map is the ground
 * truth; the baseline is reference only. Retrieval uses embeddings when the index has them
 * and degrades to lexical otherwise. Never auto-saves — the client confirms each finding
 * (→ ai-confirmed) and may push divergences into the Friction Register.
 */
import { NextRequest, NextResponse } from "next/server";
import { callModel, callEmbeddings, parseJsonLoose, isAiConfigured, isEmbeddingsConfigured, modelForFeature } from "@/lib/tritonai";
import { redactPII } from "@/lib/pii";
import { GAP_ANALYSIS, baselineBlock } from "@/lib/prompts";
import { metaFromResult } from "@/lib/ai-meta";
import { loadArtifact } from "@/lib/store";
import { loadIndex } from "@/lib/library-store";
import { retrieve } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export async function POST(req: NextRequest) {
  const { engagementId } = (await req.json().catch(() => ({}))) as { engagementId?: string };
  if (!engagementId) return NextResponse.json({ error: "engagementId is required" }, { status: 400 });
  if (!isAiConfigured()) {
    return NextResponse.json({ degraded: true, findings: [], message: "AI assist is not configured." });
  }

  const { data: index } = await loadIndex(engagementId);
  if (!index.chunks.length) {
    return NextResponse.json({
      degraded: true,
      findings: [],
      message: "No reference documents are indexed yet. Add documents and build the index first.",
    });
  }

  const [guide, journey, friction] = await Promise.all([
    loadArtifact(engagementId, "01"),
    loadArtifact(engagementId, "02"),
    loadArtifact(engagementId, "05"),
  ]);
  const j = journey.data.data;
  const f = friction.data.data;
  const interviews = guide.data.data.interviews;

  if (!j.stages.length && !f.entries.length && !interviews.length) {
    return NextResponse.json({
      degraded: true,
      findings: [],
      message: "The as-is map is too thin. Build the journey or friction register first.",
    });
  }

  // Compact map summary — the ground truth side of the comparison.
  const mapSummary = [
    `SERVICE: ${j.header.service || "—"} | SCOPE: ${j.header.scope || "—"}`,
    `STAGES: ${j.stages.map((s) => s.name).filter(Boolean).join(" → ") || "—"}`,
    "STAGE DETAIL:",
    j.stages
      .map((s, i) => `  ${i + 1}. ${s.name || "(unnamed)"} — does: ${s.doing.value || "—"}; touchpoints: ${s.touchpoints.value || "—"}`)
      .join("\n") || "  —",
    `FRICTION: ${f.entries.map((e) => `${e.id} ${e.where}: ${e.whatsWrong} [${e.severity}/${e.frequency}]`).join("; ") || "—"}`,
  ].join("\n");

  // Retrieval queries from each stage and friction entry.
  const queries: string[] = [];
  for (const s of j.stages) {
    const q = [s.name, s.doing.value, s.touchpoints.value].filter(Boolean).join(" ");
    if (q.trim()) queries.push(q);
  }
  for (const e of f.entries) {
    const q = [e.where, e.whatsWrong].filter(Boolean).join(" ");
    if (q.trim()) queries.push(q);
  }
  if (!queries.length) queries.push(mapSummary.slice(0, 500));

  // Resolve retrieval mode: embeddings when the index has them and the call succeeds.
  let retrievalMode: "embeddings" | "lexical" = index.embeddingModel ? "embeddings" : "lexical";
  let queryVectors: number[][] = [];
  if (retrievalMode === "embeddings" && isEmbeddingsConfigured()) {
    const emb = await callEmbeddings({ input: queries, model: index.embeddingModel });
    if (emb.ok && emb.vectors.length === queries.length) queryVectors = emb.vectors;
    else retrievalMode = "lexical";
  } else {
    retrievalMode = "lexical";
  }

  // Collect top passages across queries, keep the best score per chunk, cap to bound tokens.
  const picked = new Map<string, { ref: string; text: string; score: number }>();
  queries.forEach((qtext, qi) => {
    for (const h of retrieve(index, { queryText: qtext, queryVector: queryVectors[qi], k: 3 })) {
      const prev = picked.get(h.chunk.chunkId);
      if (!prev || h.score > prev.score) picked.set(h.chunk.chunkId, { ref: h.chunk.chunkId, text: h.chunk.text, score: h.score });
    }
  });
  const passages = [...picked.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((p) => ({ ref: p.ref, text: p.text }));

  if (!passages.length) {
    return NextResponse.json({
      degraded: true,
      findings: [],
      retrievalMode,
      message: "No baseline passages matched the map. Add more reference detail or rebuild the index.",
    });
  }

  const { text: redactedMap, redactions } = redactPII(mapSummary);
  const inputSummary = `${passages.length} baseline passage(s), ${j.stages.length} stage(s), ${f.entries.length} friction entr(ies), ${redactions} PII redaction(s)`;
  const model = modelForFeature("draft");
  const result = await callModel({
    messages: GAP_ANALYSIS.build(redactedMap, baselineBlock(passages)),
    jsonObject: true,
    model,
  });

  if (!result.ok) {
    const meta = metaFromResult({ result, promptId: GAP_ANALYSIS.id, model, inputSummary, outputSummary: "no output" });
    return NextResponse.json({
      degraded: true,
      findings: [],
      aiMeta: meta,
      retrievalMode,
      message: "AI assist is unavailable. Try again.",
    });
  }

  const parsed = parseJsonLoose<{ findings?: Array<Record<string, unknown>> }>(result.content);
  const findings = (parsed?.findings || [])
    .map((x, i) => ({
      id: `GAP-${String(i + 1).padStart(2, "0")}`,
      area: str(x.area),
      documentedBaseline: str(x.documentedBaseline),
      actualPractice: str(x.actualPractice),
      divergence: str(x.divergence),
      baselineRefs: arr(x.baselineRefs),
      mapRefs: arr(x.mapRefs),
    }))
    .filter((g) => g.divergence || g.documentedBaseline || g.actualPractice);

  const meta = metaFromResult({
    result,
    promptId: GAP_ANALYSIS.id,
    model,
    inputSummary,
    outputSummary: `${findings.length} gap finding(s) (${retrievalMode})`,
  });
  return NextResponse.json({ degraded: false, findings, aiMeta: meta, retrievalMode });
}
