/**
 * Save an artifact back to the repo.
 *
 * Data path: receives a human-confirmed payload from the client, validates it against
 * the artifact schema, commits the JSON to the repo via the GitHub Contents API with a
 * SHA round-trip (optimistic concurrency → 409 on stale write), and optionally appends a
 * record to the engagement's AI decision log. Nothing AI-originated reaches this route
 * without the human having confirmed it in the UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { putFile, ConcurrencyError } from "@/lib/github";
import { artifactFile } from "@/lib/paths";
import { ARTIFACT_SCHEMAS, ARTIFACT_IDS, type ArtifactId } from "@/lib/schemas";
import { appendAiDecision, type AiLogRecord } from "@/lib/ai-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: {
    engagementId?: string;
    artifactId?: string;
    payload?: unknown;
    baseSha?: string | null;
    aiLog?: Partial<AiLogRecord>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { engagementId, artifactId, payload, baseSha, aiLog } = body;
  if (!engagementId || !artifactId || !ARTIFACT_IDS.includes(artifactId as ArtifactId)) {
    return NextResponse.json({ error: "engagementId and a valid artifactId are required" }, { status: 400 });
  }

  const schema = ARTIFACT_SCHEMAS[artifactId as ArtifactId];
  const actor = process.env.PRACTICE_ACTOR || "unknown";
  const envelope = {
    ...(payload as object),
    artifactId,
    engagementId,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };

  const parsed = schema.safeParse(envelope);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const { sha } = await putFile({
      path: artifactFile(engagementId, artifactId as ArtifactId),
      content: JSON.stringify(parsed.data, null, 2) + "\n",
      message: `chore(${engagementId}): save ${artifactId}${aiLog?.humanDecision ? ` — ${aiLog.humanDecision}` : ""}`,
      expectedSha: baseSha,
    });

    if (aiLog && aiLog.feature) {
      await appendAiDecision({
        ts: new Date().toISOString(),
        actor,
        feature: aiLog.feature,
        promptId: aiLog.promptId || "",
        model: aiLog.model || "",
        modelVersion: aiLog.modelVersion,
        engagementId,
        artifactId,
        inputSummary: aiLog.inputSummary || "",
        outputSummary: aiLog.outputSummary || "",
        latencyMs: aiLog.latencyMs || 0,
        outcome: aiLog.outcome || "ok",
        humanDecision: aiLog.humanDecision,
      });
    }

    return NextResponse.json({ ok: true, sha });
  } catch (err) {
    if (err instanceof ConcurrencyError) {
      return NextResponse.json({ error: "Stale write — reload and try again", code: "conflict" }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
