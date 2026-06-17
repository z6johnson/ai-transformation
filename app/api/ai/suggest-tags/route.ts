/**
 * Suggest interview tags from raw notes.
 *
 * Data path: notes arrive from the client → PII is redacted server-side (lib/pii) →
 * sent to TritonAI (default api-gpt-oss-120b, on-prem) → suggestions returned to the
 * client. NOTHING is persisted here: the human confirms each suggestion first, and the
 * save route writes the confirmed tags plus the AI log record. AI suggests; the human
 * decides.
 */
import { NextRequest, NextResponse } from "next/server";
import { callModel, parseJsonLoose, isAiConfigured, modelForFeature } from "@/lib/tritonai";
import { redactPII } from "@/lib/pii";
import { SUGGEST_TAGS } from "@/lib/prompts";
import { metaFromResult } from "@/lib/ai-meta";
import { TAGS } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { notes } = (await req.json().catch(() => ({}))) as { notes?: string };
  if (!notes || !notes.trim()) {
    return NextResponse.json({ error: "notes are required" }, { status: 400 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json({
      degraded: true,
      suggestions: [],
      message: "AI assist is not configured. Add tags by hand.",
    });
  }

  const { text, redactions } = redactPII(notes);
  const inputSummary = `interview notes, ${notes.length} chars, ${redactions} PII redaction(s)`;
  const model = modelForFeature("tagging");
  const result = await callModel({ messages: SUGGEST_TAGS.build(text), jsonObject: true, model });

  if (!result.ok) {
    const meta = metaFromResult({ result, promptId: SUGGEST_TAGS.id, model, inputSummary, outputSummary: "no output" });
    return NextResponse.json({
      degraded: true,
      suggestions: [],
      aiMeta: meta,
      message: "AI assist is unavailable right now. Add tags by hand.",
    });
  }

  const parsed = parseJsonLoose<{ suggestions?: Array<{ tag?: string; sourceWords?: string; confidence?: number }> }>(result.content);
  const raw = parsed?.suggestions || [];
  const suggestions = raw
    .filter((s) => s.tag && TAGS.includes(s.tag as (typeof TAGS)[number]) && s.sourceWords)
    .map((s, i) => {
      // Locate the source words in the ORIGINAL (unredacted) notes for highlighting.
      const idx = notes.toLowerCase().indexOf((s.sourceWords as string).toLowerCase());
      return {
        id: `S-${i + 1}`,
        tag: s.tag as string,
        sourceWords: s.sourceWords as string,
        span: idx >= 0 ? { start: idx, end: idx + (s.sourceWords as string).length } : undefined,
        confidence: typeof s.confidence === "number" ? Math.max(0, Math.min(1, s.confidence)) : undefined,
      };
    });

  const meta = metaFromResult({
    result,
    promptId: SUGGEST_TAGS.id,
    model,
    inputSummary,
    outputSummary: `${suggestions.length} tag suggestion(s)`,
  });

  return NextResponse.json({ degraded: false, suggestions, aiMeta: meta });
}
