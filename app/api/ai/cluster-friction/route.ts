/**
 * Group friction-register entries into clusters by shared root cause. Reads the register,
 * sends a compact digest (entry id/where/type/what's-wrong) to the model, returns
 * candidate clusters marked ai-draft. The human decides which clusters hold.
 */
import { NextRequest, NextResponse } from "next/server";
import { callModel, parseJsonLoose, isAiConfigured, defaultModel } from "@/lib/tritonai";
import { redactPII } from "@/lib/pii";
import { CLUSTER_FRICTION } from "@/lib/prompts";
import { metaFromResult } from "@/lib/ai-meta";
import { loadArtifact } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { engagementId } = (await req.json().catch(() => ({}))) as { engagementId?: string };
  if (!engagementId) return NextResponse.json({ error: "engagementId is required" }, { status: 400 });
  if (!isAiConfigured()) {
    return NextResponse.json({ degraded: true, clusters: [], message: "AI assist is not configured. Cluster by hand." });
  }

  const register = await loadArtifact(engagementId, "05");
  const entries = register.data.data.entries;
  if (entries.length < 2) {
    return NextResponse.json({ degraded: true, clusters: [], message: "Need at least two friction entries to cluster." });
  }

  const digest = entries.map((e) => `${e.id} | ${e.where} | ${e.type} | ${e.whatsWrong}`).join("\n");
  const { text, redactions } = redactPII(digest);
  const inputSummary = `${entries.length} friction entries, ${redactions} PII redaction(s)`;

  const result = await callModel({ messages: CLUSTER_FRICTION.build(text), jsonObject: true });
  if (!result.ok) {
    const meta = metaFromResult({ result, promptId: CLUSTER_FRICTION.id, model: defaultModel(), inputSummary, outputSummary: "no output" });
    return NextResponse.json({ degraded: true, clusters: [], aiMeta: meta, message: "AI assist is unavailable. Cluster by hand." });
  }

  const parsed = parseJsonLoose<{ clusters?: Array<{ name?: string; frIds?: string[]; sharedRoot?: string }> }>(result.content);
  const clusters = (parsed?.clusters || [])
    .filter((c) => c.name)
    .map((c) => ({ name: c.name as string, frIds: Array.isArray(c.frIds) ? c.frIds : [], sharedRoot: c.sharedRoot || "" }));

  const meta = metaFromResult({
    result,
    promptId: CLUSTER_FRICTION.id,
    model: defaultModel(),
    inputSummary,
    outputSummary: `${clusters.length} cluster(s)`,
  });

  return NextResponse.json({ degraded: false, clusters, aiMeta: meta });
}
