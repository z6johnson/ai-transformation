/**
 * Parse an uploaded reference document (PDF/DOCX/txt/md) to plain text. Server-side
 * because PDF/DOCX need Node libraries. Returns the extracted text plus a PII-redaction
 * COUNT for transparency — but the text itself is returned unredacted and stored as-is,
 * mirroring how interview rawNotes are kept (redaction happens only on the path to the
 * model: at index build and in gap analysis). Does NOT save: the client previews, the
 * consultant assigns a kind, then saves via /api/library/save.
 */
import { NextRequest, NextResponse } from "next/server";
import { redactPII } from "@/lib/pii";
import { parseToText } from "@/lib/library-parse";
import { isAcceptedDoc, formatFor, MAX_DOC_BYTES } from "@/lib/library-format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form-data with a file" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
  if (file.size > MAX_DOC_BYTES) return NextResponse.json({ error: "File too large. Max 2 MB." }, { status: 413 });
  if (!isAcceptedDoc(file.name)) {
    return NextResponse.json({ error: "Unsupported format. Use .pdf, .docx, .txt, or .md." }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = await parseToText(buffer, file.name);
  const { redactions } = redactPII(parsed.text); // count only; stored text stays as-is

  return NextResponse.json({
    filename: file.name,
    text: parsed.text,
    source: {
      format: formatFor(file.name),
      bytes: file.size,
      parser: parsed.parser,
      pages: parsed.pages,
      parseWarnings: parsed.warnings,
      piiRedactions: redactions,
    },
  });
}
