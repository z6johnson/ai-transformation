/**
 * Save the human-confirmed gap-analysis findings. Nothing AI-originated reaches this route
 * without the human confirming it in the UI (same trust boundary as artifacts/save). Writes
 * gap-analysis.json with a SHA round-trip.
 */
import { NextRequest, NextResponse } from "next/server";
import { putFile, ConcurrencyError } from "@/lib/github";
import { gapAnalysisFile } from "@/lib/paths";
import { GapAnalysis } from "@/lib/library-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { engagementId?: string; payload?: unknown; baseSha?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { engagementId, payload, baseSha } = body;
  if (!engagementId) return NextResponse.json({ error: "engagementId is required" }, { status: 400 });

  const actor = process.env.PRACTICE_ACTOR || "unknown";
  const envelope = {
    ...(payload as object),
    engagementId,
    aiAssisted: true,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };

  const parsed = GapAnalysis.safeParse(envelope);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const { sha } = await putFile({
      path: gapAnalysisFile(engagementId),
      content: JSON.stringify(parsed.data, null, 2) + "\n",
      message: `chore(${engagementId}): save gap analysis (${parsed.data.data.findings.length} finding(s))`,
      expectedSha: baseSha,
    });
    return NextResponse.json({ ok: true, sha });
  } catch (err) {
    if (err instanceof ConcurrencyError) {
      return NextResponse.json({ error: "Stale write — reload and try again", code: "conflict" }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
