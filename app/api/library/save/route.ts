/**
 * Save the reference library. Content and metadata take different paths:
 *  - each document's text goes to the encrypted Vercel Blob store — written only when
 *    its hash changed, so re-saves don't re-upload unchanged content;
 *  - the content-free manifest (metadata + hashes + analyses audit) commits to GitHub
 *    with a SHA round-trip (optimistic concurrency → 409 on stale write);
 *  - store objects for documents no longer in the manifest are deleted — this covers
 *    removed documents AND originals staged at parse time for files that were never
 *    added (discarded previews, duplicates, unsupported after all).
 */
import { NextRequest, NextResponse } from "next/server";
import { putFile, ConcurrencyError } from "@/lib/github";
import { libraryManifestFile } from "@/lib/paths";
import { LibraryManifest, LibrarySaveDocument } from "@/lib/library-schemas";
import { isDocStoreConfigured, putObject, docTextPath, sha256Hex } from "@/lib/docstore";
import { loadManifest, documentsPrefix } from "@/lib/library-store";
import { listObjects, deleteObjects } from "@/lib/docstore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { engagementId?: string; payload?: { status?: string; data?: { documents?: unknown } }; baseSha?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { engagementId, payload, baseSha } = body;
  if (!engagementId) return NextResponse.json({ error: "engagementId is required" }, { status: 400 });
  if (!isDocStoreConfigured()) {
    return NextResponse.json(
      { error: "Document store is not configured. Set BLOB_READ_WRITE_TOKEN and LIBRARY_ENCRYPTION_KEY." },
      { status: 503 },
    );
  }

  const documents = Array.isArray(payload?.data?.documents) ? payload.data.documents : [];
  const parsedDocs = LibrarySaveDocument.array().safeParse(documents);
  if (!parsedDocs.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsedDocs.error.issues }, { status: 422 });
  }

  try {
    const { data: manifest, sha } = await loadManifest(engagementId);
    if (baseSha !== undefined && (baseSha ?? null) !== sha) {
      throw new ConcurrencyError(libraryManifestFile(engagementId));
    }
    const byId = new Map(manifest.data.documents.map((d) => [d.id, d]));
    const keptIds = new Set(parsedDocs.data.map((d) => d.id));

    const writes: Promise<void>[] = [];
    const nextDocs = parsedDocs.data.map((input) => {
      const { text, ...meta } = input;
      const entry = LibrarySaveDocument.parse(meta);
      const existing = byId.get(entry.id);

      if (typeof text === "string") {
        const hash = sha256Hex(text);
        if (!existing || existing.hash !== hash) {
          writes.push(putObject(docTextPath(engagementId, entry.id), Buffer.from(text, "utf8")));
        }
        entry.hash = hash;
        entry.textBytes = Buffer.byteLength(text, "utf8");
        entry.textUpdatedAt = new Date().toISOString();
      } else if (existing) {
        entry.hash = existing.hash;
        entry.textBytes = existing.textBytes;
        entry.textUpdatedAt = existing.textUpdatedAt;
      }
      entry.originalStored = existing ? existing.originalStored || entry.originalStored : entry.originalStored;
      return entry;
    });

    // Orphan sweep: delete store objects whose doc id is no longer (or never was) in the manifest.
    const prefix = documentsPrefix(engagementId);
    const orphans = (await listObjects(prefix))
      .map((o) => o.pathname)
      .filter((pathname) => {
        const docId = pathname.slice(prefix.length).split("/")[0];
        return !keptIds.has(docId);
      });

    await Promise.all([...writes, deleteObjects(orphans)]);

    const next = LibraryManifest.parse({
      engagementId,
      status: payload?.status || "in-review",
      aiAssisted: false,
      updatedAt: new Date().toISOString(),
      updatedBy: process.env.PRACTICE_ACTOR || "unknown",
      data: { documents: nextDocs, analyses: manifest.data.analyses },
    });

    const { sha: newSha } = await putFile({
      path: libraryManifestFile(engagementId),
      content: JSON.stringify(next, null, 2) + "\n",
      message: `chore(${engagementId}): save reference library (${nextDocs.length} doc(s))`,
      expectedSha: baseSha ?? undefined,
    });
    return NextResponse.json({ ok: true, sha: newSha });
  } catch (err) {
    if (err instanceof ConcurrencyError) {
      return NextResponse.json({ error: "Stale write — reload and try again", code: "conflict" }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
