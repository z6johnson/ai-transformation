/**
 * Client-safe constants and helpers for reference-document ingestion. NO heavy imports
 * (no pdf-parse / mammoth) so this is safe to import from client components like the
 * LibraryEditor. The actual binary parsing lives in lib/library-parse.ts (server-only).
 */
import type { DocFormat } from "./library-schemas";

export const ACCEPTED_DOC_EXT = [".pdf", ".docx", ".txt", ".md"] as const;
export const ACCEPTED_DOC_ACCEPT = ACCEPTED_DOC_EXT.join(",");

/** Reject anything larger than this before we read or upload it (mirrors transcripts). */
export const MAX_DOC_BYTES = 2 * 1024 * 1024; // 2 MB

export function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

export function isAcceptedDoc(filename: string): boolean {
  return ACCEPTED_DOC_EXT.includes(extOf(filename) as (typeof ACCEPTED_DOC_EXT)[number]);
}

/** Map a filename to the stored source format. */
export function formatFor(filename: string): DocFormat {
  switch (extOf(filename)) {
    case ".pdf":
      return "pdf";
    case ".docx":
      return "docx";
    case ".md":
      return "md";
    case ".txt":
      return "txt";
    default:
      return "txt";
  }
}

/** Collapse runs of 3+ blank lines to one and trim. Shared by the parser and paste path. */
export function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
