/**
 * Create or update an engagement record (data/engagements/<id>/engagement.json).
 *
 * Data path: receives engagement metadata from the create/edit form, validates it
 * against the Engagement schema, and commits the JSON to the repo via the GitHub
 * Contents API. Creating an engagement here is what lets an OSI user start one from
 * the browser instead of hand-committing a file to the data branch.
 *
 * - Create (no id): derive a unique slug from the name, stamp owner + createdAt.
 * - Update (id present): preserve owner/createdAt, use a SHA round-trip for
 *   optimistic concurrency (409 on stale write), matching /api/artifacts/save.
 */
import { NextRequest, NextResponse } from "next/server";
import { putFile, getJson, ConcurrencyError } from "@/lib/github";
import { engagementFile } from "@/lib/paths";
import { Engagement } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** name → url-safe slug: lowercase, non-alphanumeric → "-", collapsed and trimmed. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** First available slug, appending -2, -3, … if the base is taken. */
async function uniqueSlug(base: string): Promise<string> {
  const root = base || "engagement";
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const existing = await getJson<unknown>(engagementFile(candidate));
    if (!existing) return candidate;
  }
}

export async function POST(req: NextRequest) {
  let body: {
    id?: string;
    name?: string;
    service?: string;
    scopeStart?: string;
    scopeEnd?: string;
    lead?: string;
    lifecycleOwner?: { name?: string; role?: string };
    stage?: string;
    baseSha?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "A name is required" }, { status: 400 });
  }

  const actor = process.env.PRACTICE_ACTOR || "unknown";
  const isCreate = !body.id;

  // Preserve owner/createdAt on update; stamp them on create.
  let id: string;
  let owner = actor;
  let createdAt: string | undefined = new Date().toISOString();
  if (isCreate) {
    id = await uniqueSlug(slugify(name));
  } else {
    id = body.id as string;
    const current = await getJson<{ owner?: string; createdAt?: string }>(engagementFile(id));
    if (!current) {
      return NextResponse.json({ error: "Engagement not found" }, { status: 404 });
    }
    owner = current.data.owner || actor;
    createdAt = current.data.createdAt;
  }

  const candidate = {
    id,
    name,
    service: body.service ?? "",
    scopeStart: body.scopeStart ?? "",
    scopeEnd: body.scopeEnd ?? "",
    lead: body.lead ?? "",
    lifecycleOwner: { name: body.lifecycleOwner?.name ?? "", role: body.lifecycleOwner?.role ?? "" },
    stage: body.stage ?? "mapping",
    owner,
    createdAt,
  };

  const parsed = Engagement.safeParse(candidate);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const { sha } = await putFile({
      path: engagementFile(id),
      content: JSON.stringify(parsed.data, null, 2) + "\n",
      message: `chore(${id}): ${isCreate ? "create" : "update"} engagement`,
      // Only enforce concurrency on update; create writes a brand-new file.
      expectedSha: isCreate ? undefined : body.baseSha,
    });
    return NextResponse.json({ ok: true, id, sha });
  } catch (err) {
    if (err instanceof ConcurrencyError) {
      return NextResponse.json({ error: "Stale write — reload and try again", code: "conflict" }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
