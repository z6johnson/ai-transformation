/**
 * Draft a first cut of a downstream artifact from the tagged interviews and the
 * confirmed upstream artifacts. Reads from the repo, redacts PII, calls the model, and
 * returns the draft. Never auto-saved here — the client applies it (marked ai-applied)
 * and the human edits or removes any of it before saving.
 *
 *   journey   ← interviews (01)
 *   friction  ← interviews (01)
 *   blueprint ← interviews (01) + journey (02)
 *   process   ← interviews (01) + journey (02) + blueprint (03)
 */
import { NextRequest, NextResponse } from "next/server";
import { callModel, parseJsonLoose, isAiConfigured, modelForFeature } from "@/lib/tritonai";
import { redactPII } from "@/lib/pii";
import { DRAFT_JOURNEY, DRAFT_FRICTION, DRAFT_BLUEPRINT, DRAFT_PROCESS } from "@/lib/prompts";
import { metaFromResult } from "@/lib/ai-meta";
import { loadArtifact } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Target = "journey" | "friction" | "blueprint" | "process";
const TARGETS: Target[] = ["journey", "friction", "blueprint", "process"];

const PROMPTS = {
  journey: DRAFT_JOURNEY,
  friction: DRAFT_FRICTION,
  blueprint: DRAFT_BLUEPRINT,
  process: DRAFT_PROCESS,
} as const;

/** A compact, line-per-item view of the confirmed journey for downstream prompts. */
function journeyDigest(stages: { name: string; doing: { value: string }; touchpoints: { value: string } }[]): string {
  if (!stages.length) return "(no journey stages confirmed yet)";
  return stages
    .map((s, i) => `${i + 1}. ${s.name || "(unnamed)"} — does: ${s.doing.value || "—"}; touchpoints: ${s.touchpoints.value || "—"}`)
    .join("\n");
}

/** A compact view of the confirmed blueprint handoffs/decisions/systems for the process prompt. */
function blueprintDigest(bp: {
  handoffs: { id: string; from: string; to: string; whatMoves: string }[];
  decisions: { id: string; decision: string; whoDecides: string; kind: string }[];
  systems: { name: string; usedFor: string }[];
}): string {
  const h = bp.handoffs.map((x) => `${x.id} ${x.from}→${x.to}: ${x.whatMoves}`).join("; ") || "(none)";
  const d = bp.decisions.map((x) => `${x.id} ${x.decision} (${x.whoDecides}, ${x.kind})`).join("; ") || "(none)";
  const s = bp.systems.map((x) => `${x.name}: ${x.usedFor}`).join("; ") || "(none)";
  return `HANDOFFS: ${h}\nDECISIONS: ${d}\nSYSTEMS: ${s}`;
}

export async function POST(req: NextRequest) {
  const { engagementId, target } = (await req.json().catch(() => ({}))) as {
    engagementId?: string;
    target?: Target;
  };
  if (!engagementId || !target || !TARGETS.includes(target)) {
    return NextResponse.json({ error: `engagementId and target (${TARGETS.join("|")}) are required` }, { status: 400 });
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
  const taggedNotes = interviews
    .map((iv) => {
      const tags = iv.tags.map((t) => `[${t.tag}] "${t.sourceWords}"`).join("; ");
      return `--- ${iv.header.role || iv.id} ---\n${iv.rawNotes}\nTAGS: ${tags || "(none)"}`;
    })
    .join("\n\n");

  // Downstream targets are also informed by the confirmed upstream artifacts.
  let context = taggedNotes;
  if (target === "blueprint" || target === "process") {
    const journey = await loadArtifact(engagementId, "02");
    context += `\n\n=== CONFIRMED JOURNEY STAGES ===\n${journeyDigest(journey.data.data.stages)}`;
  }
  if (target === "process") {
    const blueprint = await loadArtifact(engagementId, "03");
    context += `\n\n=== CONFIRMED BLUEPRINT ===\n${blueprintDigest(blueprint.data.data)}`;
  }

  const { text, redactions } = redactPII(context);
  const inputSummary = `${interviews.length} interview(s), ${text.length} chars, ${redactions} PII redaction(s)`;

  const prompt = PROMPTS[target];
  const model = modelForFeature("draft");
  const result = await callModel({ messages: prompt.build(text), jsonObject: true, model });

  if (!result.ok) {
    const meta = metaFromResult({ result, promptId: prompt.id, model, inputSummary, outputSummary: "no output" });
    return NextResponse.json({ degraded: true, draft: null, aiMeta: meta, message: "AI assist is unavailable. Build by hand." });
  }

  const draft = parseJsonLoose<Record<string, unknown>>(result.content);
  const count = countItems(target, draft);
  const meta = metaFromResult({
    result,
    promptId: prompt.id,
    model,
    inputSummary,
    outputSummary: `${target} draft, ${count} item(s)`,
  });

  return NextResponse.json({ degraded: false, draft, aiMeta: meta });
}

/** Count drafted items for the log's output summary, per target shape. */
function countItems(target: Target, draft: Record<string, unknown> | null): number {
  if (!draft) return 0;
  const len = (k: string) => (Array.isArray(draft[k]) ? (draft[k] as unknown[]).length : 0);
  if (target === "journey") return len("stages");
  if (target === "friction") return len("entries");
  if (target === "process") return len("steps");
  return len("handoffs") + len("decisions") + len("systems"); // blueprint
}
