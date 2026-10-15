/**
 * Save the human-confirmed library synthesis. Nothing AI-originated reaches this route without
 * the human confirming it in the UI (same trust boundary as artifacts/save). Content goes to
 * the encrypted document store; the manifest's audit entry (with a fresh `updatedAt` token)
 * commits to GitHub.
 */
import { NextRequest, NextResponse } from "next/server";
import { ConcurrencyError } from "@/lib/github";
import { LibrarySynthesis } from "@/lib/library-schemas";
import { saveSynthesis } from "@/lib/library-store";

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

  const envelope = {
    ...(payload as object),
    engagementId,
    aiAssisted: true,
    updatedAt: new Date().toISOString(),
    updatedBy: process.env.PRACTICE_ACTOR || "unknown",
  };

  const parsed = LibrarySynthesis.safeParse(envelope);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const sha = await saveSynthesis(engagementId, parsed.data, baseSha ?? null);
    return NextResponse.json({ ok: true, sha });
  } catch (err) {
    if (err instanceof ConcurrencyError) {
      return NextResponse.json({ error: "Stale write — reload and try again", code: "conflict" }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
