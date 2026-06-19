/**
 * Model to Map — interpret the Process Documentation (04) outline into a BPMN flow
 * graph (lanes, nodes, gateways, flows). Reads the steps from the request (so unsaved
 * edits are included), redacts PII, calls the model, and returns the graph. The client
 * serializes it to BPMN 2.0 XML and downloads it; nothing is auto-saved.
 *
 * Unlike /api/ai/draft, the export has no human "save" round-trip to carry the audit
 * record, so this route appends the AI decision to the engagement's log itself.
 */
import { NextRequest, NextResponse } from "next/server";
import { callModel, parseJsonLoose, isAiConfigured, modelForFeature } from "@/lib/tritonai";
import { redactPII } from "@/lib/pii";
import { MODEL_TO_MAP } from "@/lib/prompts";
import { metaFromResult } from "@/lib/ai-meta";
import { appendAiDecision } from "@/lib/ai-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Step = {
  id?: string;
  step?: string;
  trigger?: string;
  who?: string;
  system?: string;
  rule?: string;
  whatGoesWrong?: string;
};

/** One compact line per step for the prompt: id, what, who, trigger, rule, failure. */
function processDigest(header: { service?: string; scope?: string }, steps: Step[]): string {
  const head = `SERVICE: ${header.service || "—"}\nSCOPE: ${header.scope || "—"}`;
  const rows = steps
    .map((s, i) => {
      const id = s.id || `P-${String(i + 1).padStart(2, "0")}`;
      return (
        `${id} | step: ${s.step || "—"} | who: ${s.who || "—"} | trigger: ${s.trigger || "—"} | ` +
        `system: ${s.system || "—"} | rule: ${s.rule || "—"} | goes wrong: ${s.whatGoesWrong || "—"}`
      );
    })
    .join("\n");
  return `${head}\n\nSTEPS:\n${rows}`;
}

export async function POST(req: NextRequest) {
  const { engagementId, header, steps } = (await req.json().catch(() => ({}))) as {
    engagementId?: string;
    header?: { service?: string; scope?: string; stages?: string };
    steps?: Step[];
  };

  if (!engagementId || !Array.isArray(steps)) {
    return NextResponse.json({ error: "engagementId and steps are required" }, { status: 400 });
  }
  if (!steps.length) {
    return NextResponse.json({ degraded: true, graph: null, message: "Add process steps before generating a map." });
  }
  if (!isAiConfigured()) {
    return NextResponse.json({ degraded: true, graph: null, message: "AI assist is not configured. Build the map by hand." });
  }

  const { text, redactions } = redactPII(processDigest(header || {}, steps));
  const inputSummary = `${steps.length} step(s), ${text.length} chars, ${redactions} PII redaction(s)`;

  const prompt = MODEL_TO_MAP;
  const model = modelForFeature("draft");
  const result = await callModel({ messages: prompt.build(text), jsonObject: true, model });

  if (!result.ok) {
    const meta = metaFromResult({ result, promptId: prompt.id, model, inputSummary, outputSummary: "no output" });
    await appendAiDecision({
      ts: new Date().toISOString(),
      actor: process.env.PRACTICE_ACTOR || "unknown",
      feature: "model-to-map",
      promptId: meta.promptId,
      model: meta.model,
      modelVersion: meta.modelVersion,
      engagementId,
      artifactId: "04",
      inputSummary: meta.inputSummary,
      outputSummary: meta.outputSummary,
      latencyMs: meta.latencyMs,
      outcome: meta.outcome,
      humanDecision: "BPMN export — AI unavailable, no map produced",
    });
    return NextResponse.json({ degraded: true, graph: null, aiMeta: meta, message: "AI assist is unavailable. Build the map by hand." });
  }

  const graph = parseJsonLoose<{ lanes?: unknown[]; nodes?: unknown[]; flows?: unknown[] }>(result.content);
  const nodeCount = Array.isArray(graph?.nodes) ? graph!.nodes!.length : 0;
  const laneCount = Array.isArray(graph?.lanes) ? graph!.lanes!.length : 0;
  const meta = metaFromResult({
    result,
    promptId: prompt.id,
    model,
    inputSummary,
    outputSummary: `BPMN graph, ${nodeCount} node(s), ${laneCount} lane(s)`,
  });

  await appendAiDecision({
    ts: new Date().toISOString(),
    actor: process.env.PRACTICE_ACTOR || "unknown",
    feature: "model-to-map",
    promptId: meta.promptId,
    model: meta.model,
    modelVersion: meta.modelVersion,
    engagementId,
    artifactId: "04",
    inputSummary: meta.inputSummary,
    outputSummary: meta.outputSummary,
    latencyMs: meta.latencyMs,
    outcome: meta.outcome,
    humanDecision: "BPMN export downloaded for import into a process mapping tool",
  });

  if (!graph || !nodeCount) {
    return NextResponse.json({ degraded: true, graph: null, aiMeta: meta, message: "No map could be generated from these steps." });
  }

  return NextResponse.json({ degraded: false, graph, aiMeta: meta });
}
