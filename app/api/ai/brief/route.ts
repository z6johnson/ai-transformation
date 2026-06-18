/**
 * Draft the synthesis section of the Level 1 report (artifact 07) from the CONFIRMED
 * map — journey (02), blueprint (03), friction register (05), validation packet (06).
 * No raw interview text is needed here; the synthesis works from the already-confirmed
 * artifacts. Never auto-saved — the client applies it (ai-applied) and a human edits it.
 *
 * Per template 00 the synthesis stays descriptive: it names where friction concentrates
 * and restates the decisions carried forward, but proposes no fix.
 */
import { NextRequest, NextResponse } from "next/server";
import { callModel, parseJsonLoose, isAiConfigured, modelForFeature } from "@/lib/tritonai";
import { redactPII } from "@/lib/pii";
import { DRAFT_REPORT } from "@/lib/prompts";
import { metaFromResult } from "@/lib/ai-meta";
import { loadArtifact } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { engagementId } = (await req.json().catch(() => ({}))) as { engagementId?: string };
  if (!engagementId) {
    return NextResponse.json({ error: "engagementId is required" }, { status: 400 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json({ degraded: true, draft: null, message: "AI assist is not configured. Write the briefing by hand." });
  }

  const [journey, blueprint, friction, validation] = await Promise.all([
    loadArtifact(engagementId, "02"),
    loadArtifact(engagementId, "03"),
    loadArtifact(engagementId, "05"),
    loadArtifact(engagementId, "06"),
  ]);

  const j = journey.data.data;
  const b = blueprint.data.data;
  const f = friction.data.data;
  const v = validation.data.data;

  if (!j.stages.length && !f.entries.length) {
    return NextResponse.json({ degraded: true, draft: null, message: "The map is too thin to synthesize yet. Build the journey and friction register first." });
  }

  const mapSummary = [
    `SERVICE: ${j.header.service || "—"} | SCOPE: ${j.header.scope || "—"}`,
    `STAGES: ${j.stages.map((s) => s.name).filter(Boolean).join(" → ") || "—"}`,
    `MOMENTS THAT MATTER: ${j.momentsThatMatter.map((m) => `${m.moment} (${m.why})`).join("; ") || "—"}`,
    `DROPOUT POINTS: ${j.dropoutPoints.map((d) => `${d.point} (${d.what})`).join("; ") || "—"}`,
    `DECISIONS: ${b.decisions.map((d) => `${d.id} ${d.decision} [${d.kind}]`).join("; ") || "—"}`,
    `SYSTEMS: ${b.systems.map((s) => s.name).filter(Boolean).join(", ") || "—"}`,
    `FRICTION CLUSTERS: ${f.clusters.map((c) => `${c.name} → ${c.sharedRoot}`).join("; ") || "—"}`,
    `FRICTION ENTRIES: ${f.entries.map((e) => `${e.id} ${e.whatsWrong} [${e.severity}/${e.frequency}]`).join("; ") || "—"}`,
    `FRICTION SUMMARY (lead's words): ${f.honestAccount || "—"}`,
    `OPEN QUESTIONS: ${v.openQuestions || "—"}`,
  ].join("\n");

  const { text, redactions } = redactPII(mapSummary);
  const inputSummary = `confirmed map, ${text.length} chars, ${redactions} PII redaction(s)`;

  const prompt = DRAFT_REPORT;
  const model = modelForFeature("draft");
  const result = await callModel({ messages: prompt.build(text), jsonObject: true, model });

  if (!result.ok) {
    const meta = metaFromResult({ result, promptId: prompt.id, model, inputSummary, outputSummary: "no output" });
    return NextResponse.json({ degraded: true, draft: null, aiMeta: meta, message: "AI assist is unavailable. Write the briefing by hand." });
  }

  const draft = parseJsonLoose<Record<string, unknown>>(result.content);
  const meta = metaFromResult({ result, promptId: prompt.id, model, inputSummary, outputSummary: "report synthesis drafted" });
  return NextResponse.json({ degraded: false, draft, aiMeta: meta });
}
