/**
 * Parse an uploaded reference document (PDF/DOCX/txt/md) to plain text and stage the
 * ORIGINAL file, encrypted, in the Vercel Blob document store at the document's final
 * path. Server-side because PDF/DOCX need Node libraries. Returns the extracted text
 * plus a PII-redaction COUNT for transparency — the text itself is returned unredacted
 * and stored as-is (redaction happens only on the path to the model). Does NOT save:
 * the client reviews, assigns a kind, then saves via /api/library/save, which writes
 * the text blob and commits the content-free manifest.
 *
 * Dedupe: the text's sha-256 is checked against the manifest, so a re-upload of an
 * already-ingested document is flagged (and its original is not stored) instead of
 * silently duplicating baseline content.
 */
import { NextRequest, NextResponse } from "next/server";
import { redactPII } from "@/lib/pii";
import { parseToText } from "@/lib/library-parse";
import { isAcceptedDoc, formatFor, MAX_DOC_BYTES } from "@/lib/library-format";
import { isDocStoreConfigured, putObject, docOriginalPath, sha256Hex } from "@/lib/docstore";
import { loadManifest } from "@/lib/library-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeRelativePath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/[\u0000-\u001f]/g, "")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/")
    .slice(0, 500);
}

export async function POST(req: NextRequest) {
  if (!isDocStoreConfigured()) {
    return NextResponse.json(
      { error: "Document store is not configured. Set BLOB_READ_WRITE_TOKEN and LIBRARY_ENCRYPTION_KEY." },
      { status: 503 },
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form-data with a file" }, { status: 400 });

  const file = form.get("file");
  const engagementId = String(form.get("engagementId") || "");
  const docId = String(form.get("docId") || "");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (!engagementId || !docId) {
    return NextResponse.json({ error: "engagementId and docId are required" }, { status: 400 });
  }
  if (file.size > MAX_DOC_BYTES) return NextResponse.json({ error: "File too large. Max 2 MB." }, { status: 413 });
  if (!isAcceptedDoc(file.name)) {
    return NextResponse.json({ error: "Unsupported format. Use .pdf, .docx, .txt, or .md." }, { status: 415 });
  }
  const path = safeRelativePath(String(form.get("path") || file.name));

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseToText(buffer, file.name);
    const { redactions } = redactPII(parsed.text); // count only; stored text stays as-is
    const hash = sha256Hex(parsed.text);

    const { data: manifest } = await loadManifest(engagementId);
    const duplicate = manifest.data.documents.find((d) => d.hash === hash && d.id !== docId);
    if (!duplicate) {
      await putObject(docOriginalPath(engagementId, docId), buffer);
    }

    return NextResponse.json({
      filename: file.name,
      text: parsed.text,
      hash,
      duplicateOf: duplicate
        ? { id: duplicate.id, filename: duplicate.filename, path: duplicate.source.path || duplicate.filename }
        : null,
      originalStored: !duplicate,
      source: {
        path,
        format: formatFor(file.name),
        bytes: file.size,
        parser: parsed.parser,
        pages: parsed.pages,
        parseWarnings: parsed.warnings,
        piiRedactions: redactions,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not parse the document.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
