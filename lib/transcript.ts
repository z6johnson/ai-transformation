/**
 * Client-side helpers for turning a completed interview transcript — uploaded as a
 * file or pasted as raw text — into clean interview notes. Text-based formats only
 * (.txt, .md, .vtt); read entirely in the browser with no dependencies and no server
 * round-trip. The cleaned text lands in an interview's rawNotes, then flows through
 * the existing AI tagging pass like any hand-typed notes.
 */

export const ACCEPTED_TRANSCRIPT_EXT = [".txt", ".md", ".vtt"] as const;
export const ACCEPTED_TRANSCRIPT_ACCEPT = ACCEPTED_TRANSCRIPT_EXT.join(",");

/** Reject anything larger than this before we even read it. */
export const MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024; // 2 MB

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

/** Is this file an accepted transcript format and within the size cap? */
export function isAcceptedTranscript(file: File): boolean {
  return (
    ACCEPTED_TRANSCRIPT_EXT.includes(extOf(file.name) as (typeof ACCEPTED_TRANSCRIPT_EXT)[number]) &&
    file.size <= MAX_TRANSCRIPT_BYTES
  );
}

/** Read a text file in the browser. Rejects on read error. */
export function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsText(file);
  });
}

const TIMESTAMP_LINE = /-->/;
const CUE_ID_LINE = /^\d+$/;
const INLINE_TAG = /<\/?[^>]+>/g;
const VOICE_TAG = /<v\s+([^>]+)>/i;

/**
 * Strip WebVTT scaffolding (header, NOTE/STYLE blocks, cue ids, timestamps, inline
 * tags) down to readable speaker text. Converts `<v Speaker>line` cues into
 * `Speaker: line` so attribution survives.
 */
function cleanVtt(text: string): string {
  const out: string[] = [];
  let lastSpeaker = "";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      out.push("");
      continue;
    }
    if (/^WEBVTT/i.test(line)) continue;
    if (/^(NOTE|STYLE|REGION)\b/i.test(line)) continue;
    if (TIMESTAMP_LINE.test(line)) continue;
    if (CUE_ID_LINE.test(line)) continue;

    const voice = line.match(VOICE_TAG);
    const stripped = line.replace(INLINE_TAG, "").trim();
    if (!stripped) continue;

    const speaker = voice ? voice[1].split(".")[0].trim() : "";
    if (speaker && speaker !== lastSpeaker) {
      out.push(`${speaker}: ${stripped}`);
      lastSpeaker = speaker;
    } else {
      out.push(stripped);
    }
  }
  return out.join("\n");
}

/** Collapse runs of 3+ blank lines down to a single blank line and trim the ends. */
function collapseBlankLines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Normalize transcript content into interview notes. `.vtt` gets cue/timestamp
 * stripping; everything else (.txt/.md, pasted text) is whitespace-normalized
 * pass-through. `filename` selects the cleaner by extension.
 */
export function cleanTranscript(text: string, filename: string): string {
  const cleaned = extOf(filename) === ".vtt" ? cleanVtt(text) : text;
  return collapseBlankLines(cleaned);
}
