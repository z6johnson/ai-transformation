/**
 * Server-only document text extraction for the Reference Library. PDF and DOCX need
 * Node libraries (contrast with lib/transcript.ts, which reads text formats in the
 * browser), so this runs inside a `runtime = "nodejs"` route. Parsing is wrapped so a
 * failure (e.g. a scanned/image-only PDF) returns empty text + a warning rather than
 * throwing — the consultant can always paste the text instead. No OCR.
 *
 * Heavy deps are imported lazily so they only load when that format is actually parsed,
 * and never reach any client bundle (client code imports lib/library-format.ts instead).
 */
import { extOf, normalizeText } from "./library-format";

export type ParsedDoc = { text: string; pages?: number; parser: string; warnings: string[] };

export async function parseToText(buffer: Buffer, filename: string): Promise<ParsedDoc> {
  const ext = extOf(filename);

  if (ext === ".pdf") {
    try {
      // Import the implementation directly, not the package index, to dodge pdf-parse's
      // debug harness that reads a bundled test file when `module.parent` is undefined.
      const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
      const res = await pdfParse(buffer);
      const text = normalizeText(res.text || "");
      const warnings = text
        ? []
        : ["No extractable text — the PDF may be scanned or image-only. Paste the text instead."];
      return { text, pages: res.numpages, parser: "pdf-parse", warnings };
    } catch (err) {
      return { text: "", parser: "pdf-parse", warnings: [`Could not parse PDF: ${msg(err)}`] };
    }
  }

  if (ext === ".docx") {
    try {
      const mammoth = await import("mammoth");
      const res = await mammoth.extractRawText({ buffer });
      const text = normalizeText(res.value || "");
      const warnings = (res.messages || []).map((m) => m.message).filter(Boolean);
      if (!text) warnings.push("No extractable text in the document.");
      return { text, parser: "mammoth", warnings };
    } catch (err) {
      return { text: "", parser: "mammoth", warnings: [`Could not parse DOCX: ${msg(err)}`] };
    }
  }

  // .txt / .md — plain UTF-8.
  const text = normalizeText(buffer.toString("utf8"));
  return { text, parser: "utf8", warnings: text ? [] : ["Empty file."] };
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : "unknown error";
}
