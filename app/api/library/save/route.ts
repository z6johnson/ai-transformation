/**
 * Save the reference-library documents back to the repo. Validates the human-curated
 * payload against ReferenceLibrary and commits documents.json with a SHA round-trip
 * (optimistic concurrency → 409 on stale write). Mirrors app/api/artifacts/save.
 */
import { NextRequest, NextResponse } from "next/server";
import { putFile, ConcurrencyError } from "@/lib/github";
import { libraryDocsFile } from "@/lib/paths";
import { ReferenceLibrary } from "@/lib/library-schemas";

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
  const envelope = { ...(payload as object), engagementId, updatedAt: new Date().toISOString(), updatedBy: actor };

  const parsed = ReferenceLibrary.safeParse(envelope);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const { sha } = await putFile({
      path: libraryDocsFile(engagementId),
      content: JSON.stringify(parsed.data, null, 2) + "\n",
      message: `chore(${engagementId}): save reference library (${parsed.data.data.documents.length} doc(s))`,
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
