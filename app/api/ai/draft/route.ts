/**
 * Draft a first cut of a downstream artifact from the tagged interviews, the confirmed
 * upstream artifacts, and — optionally — the confirmed reference-library synthesis as a
 * clearly-labeled documented baseline. Reads from the repo, redacts PII, calls the model,
 * and returns the draft. Never auto-saved here — the client applies it (marked ai-applied)
 * and the human edits or removes any of it before saving.
 *
 *   journey   ← interviews (01)
 *   blueprint ← interviews (01) + journey (02)
 *   process   ← interviews (01) + journey (02) + blueprint (03)
 *   friction  ← interviews (01) + journey (02) + blueprint (03)
 *
 * When `useBaseline` is set and a confirmed library synthesis exists, its sections are
 * appended LAST as a "documented baseline (reference only — NOT ground truth)" block. The
 * baseline never fills a drafted field; it only lets the model surface coverage gaps into a
 * separate `coverageNotes` array. Ordering (interviews → confirmed upstream → baseline) and
 * the baseline label keep the interviews the sole source of asserted facts.
 */
import { NextRequest, NextResponse } from "next/server";
import { callModel, parseJsonLoose, isAiConfigured, modelForFeature } from "@/lib/tritonai";
import { redactPII } from "@/lib/pii";
import { DRAFT_JOURNEY, DRAFT_FRICTION, DRAFT_BLUEPRINT, DRAFT_PROCESS, baselineBlock } from "@/lib/prompts";
import { metaFromResult } from "@/lib/ai-meta";
import { loadArtifact } from "@/lib/store";
import { loadSynthesis } from "@/lib/library-store";

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
  const { engagementId, target, useBaseline } = (await req.json().catch(() => ({}))) as {
    engagementId?: string;
    target?: Target;
    useBaseline?: boolean;
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

  // Tier 2 — confirmed upstream artifacts. Journey informs every downstream target; the
  // blueprint additionally informs process and friction. Load what's needed in parallel.
  const needJourney = target !== "journey";
  const needBlueprint = target === "process" || target === "friction";
  const [journey, blueprint, synthesis] = await Promise.all([
    needJourney ? loadArtifact(engagementId, "02") : Promise.resolve(null),
    needBlueprint ? loadArtifact(engagementId, "03") : Promise.resolve(null),
    useBaseline ? loadSynthesis(engagementId).then((r) => r.data) : Promise.resolve(null),
  ]);

  let context = taggedNotes;
  if (journey) context += `\n\n=== CONFIRMED JOURNEY STAGES ===\n${journeyDigest(journey.data.data.stages)}`;
  if (blueprint) context += `\n\n=== CONFIRMED BLUEPRINT ===\n${blueprintDigest(blueprint.data.data)}`;

  // Tier 3 — documented baseline, appended LAST and clearly labeled. Reference only; it can
  // only seed coverageNotes, never a drafted field (enforced in the prompt's system message).
  const baselineSections = (synthesis?.data.sections || []).filter((s) => s.heading || s.body);
  const withBaseline = baselineSections.length > 0;
  if (withBaseline) {
    const passages = baselineSections.map((s) => ({ ref: s.id, text: `${s.heading}: ${s.body}`.trim() }));
    context += `\n\n${baselineBlock(passages)}`;
  }

  const { text, redactions } = redactPII(context);
  const inputSummary =
    `${interviews.length} interview(s), ${text.length} chars, ${redactions} PII redaction(s)` +
    (withBaseline ? `, +${baselineSections.length} baseline section(s)` : "");

  const prompt = PROMPTS[target];
  const promptId = withBaseline ? `${prompt.id}+baseline` : prompt.id;
  const model = modelForFeature("draft");
  const result = await callModel({ messages: prompt.build(text, withBaseline), jsonObject: true, model });

  if (!result.ok) {
    const meta = metaFromResult({ result, promptId, model, inputSummary, outputSummary: "no output" });
    return NextResponse.json({ degraded: true, draft: null, aiMeta: meta, message: "AI assist is unavailable. Build by hand." });
  }

  const draft = parseJsonLoose<Record<string, unknown>>(result.content);
  const count = countItems(target, draft);
  const coverage = Array.isArray(draft?.coverageNotes) ? (draft!.coverageNotes as unknown[]).length : 0;
  const meta = metaFromResult({
    result,
    promptId,
    model,
    inputSummary,
    outputSummary: `${target} draft, ${count} item(s)${withBaseline ? `, ${coverage} coverage note(s)` : ""}`,
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
