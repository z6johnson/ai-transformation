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
import { loadArtifact, loadEngagement } from "@/lib/store";
import { allStages, journeysLine, clusterSides } from "@/lib/sides";
import { DEFAULT_SIDE_NAMES, sideLabel } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Bound the function so a slow model call gives up and answers rather than being killed
// mid-flight, which returns a gateway error and leaves NO line in the AI decision log.
// lib/tritonai.ts clamps its retry budget to fit inside this.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { engagementId } = (await req.json().catch(() => ({}))) as { engagementId?: string };
  if (!engagementId) {
    return NextResponse.json({ error: "engagementId is required" }, { status: 400 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json({ degraded: true, draft: null, message: "AI assist is not configured. Write the briefing by hand." });
  }

  const [engagement, journey, blueprint, friction, validation] = await Promise.all([
    loadEngagement(engagementId),
    loadArtifact(engagementId, "02"),
    loadArtifact(engagementId, "03"),
    loadArtifact(engagementId, "05"),
    loadArtifact(engagementId, "06"),
  ]);

  const j = journey.data.data;
  const b = blueprint.data.data;
  const f = friction.data.data;
  const v = validation.data.data;

  const names = engagement?.sides || DEFAULT_SIDE_NAMES;

  if (!allStages(j).length && !f.entries.length) {
    return NextResponse.json({ degraded: true, draft: null, message: "The map is too thin to synthesize yet. Build the journey and friction register first." });
  }

  const mapSummary = [
    `SERVICE: ${j.header.service || "—"} | SCOPE: ${j.header.scope || "—"}`,
    `SIDES: EXTERNAL = ${names.external}; INTERNAL = ${names.internal}`,
    `JOURNEYS: ${journeysLine(j, names)}`,
    `MOMENTS THAT MATTER: ${j.journeys.flatMap((jr) => jr.momentsThatMatter.map((m) => `[${jr.side}] ${m.moment} (${m.why})`)).join("; ") || "—"}`,
    `DROPOUT POINTS: ${j.journeys.flatMap((jr) => jr.dropoutPoints.map((d) => `[${jr.side}] ${d.point} (${d.what})`)).join("; ") || "—"}`,
    `EXTERNAL STAGES KNOWN ONLY FROM STAFF ACCOUNTS: ${
      j.journeys
        .filter((jr) => jr.side === "external")
        .flatMap((jr) => jr.stages)
        .filter((s) => s.evidence.fromSides.length && !s.evidence.fromSides.includes("external") && s.evidence.level !== "observed")
        .map((s) => s.name)
        .join(", ") || "none marked"
    }`,
    `DECISIONS: ${b.decisions.map((d) => `${d.id} ${d.decision} [${d.kind}]`).join("; ") || "—"}`,
    `SYSTEMS: ${b.systems.map((s) => s.name).filter(Boolean).join(", ") || "—"}`,
    `FRICTION CLUSTERS: ${
      f.clusters
        .map((c) => {
          const sides = c.sides.length ? c.sides : clusterSides(c.frIds, f.entries);
          return `${c.name} [${sides.join("+") || "—"}] → ${c.sharedRoot}`;
        })
        .join("; ") || "—"
    }`,
    `FRICTION ENTRIES: ${f.entries.map((e) => `${e.id} [${e.side}: ${sideLabel(names, e.side)}] ${e.whatsWrong} [${e.severity}/${e.frequency}]`).join("; ") || "—"}`,
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
