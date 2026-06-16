/**
 * Draft a first cut of a journey map or friction-register entries from the tagged
 * interviews. Reads interviews from the repo, redacts PII, calls the model, and returns
 * a DRAFT marked ai-draft. Never auto-saved — the human rebuilds and confirms in the UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { callModel, parseJsonLoose, isAiConfigured, defaultModel } from "@/lib/tritonai";
import { redactPII } from "@/lib/pii";
import { DRAFT_JOURNEY, DRAFT_FRICTION } from "@/lib/prompts";
import { metaFromResult } from "@/lib/ai-meta";
import { loadArtifact } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { engagementId, target } = (await req.json().catch(() => ({}))) as {
    engagementId?: string;
    target?: "journey" | "friction";
  };
  if (!engagementId || (target !== "journey" && target !== "friction")) {
    return NextResponse.json({ error: "engagementId and target ('journey'|'friction') are required" }, { status: 400 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json({ degraded: true, draft: null, message: "AI assist is not configured. Build by hand." });
  }

  const guide = await loadArtifact(engagementId, "01");
  const interviews = guide.data.data.interviews;
  if (!interviews.length) {
    return NextResponse.json({ degraded: true, draft: null, message: "No interviews to draft from yet." });
  }

  // Build a tagged-notes digest: each interview's notes with its confirmed tags listed.
  const digest = interviews
    .map((iv) => {
      const tags = iv.tags.map((t) => `[${t.tag}] "${t.sourceWords}"`).join("; ");
      return `--- ${iv.header.role || iv.id} ---\n${iv.rawNotes}\nTAGS: ${tags || "(none)"}`;
    })
    .join("\n\n");
  const { text, redactions } = redactPII(digest);
  const inputSummary = `${interviews.length} interview(s), ${text.length} chars, ${redactions} PII redaction(s)`;

  const prompt = target === "journey" ? DRAFT_JOURNEY : DRAFT_FRICTION;
  const result = await callModel({ messages: prompt.build(text), jsonObject: true });

  if (!result.ok) {
    const meta = metaFromResult({ result, promptId: prompt.id, model: defaultModel(), inputSummary, outputSummary: "no output" });
    return NextResponse.json({ degraded: true, draft: null, aiMeta: meta, message: "AI assist is unavailable. Build by hand." });
  }

  const draft = parseJsonLoose<Record<string, unknown>>(result.content);
  const count = target === "journey" ? (draft?.stages as unknown[] | undefined)?.length : (draft?.entries as unknown[] | undefined)?.length;
  const meta = metaFromResult({
    result,
    promptId: prompt.id,
    model: defaultModel(),
    inputSummary,
    outputSummary: `${target} draft, ${count || 0} item(s)`,
  });

  return NextResponse.json({ degraded: false, draft, aiMeta: meta });
}
