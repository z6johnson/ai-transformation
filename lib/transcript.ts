/**
 * Client-side helpers for turning a completed interview transcript — uploaded as a
 * file or pasted as raw text — into clean interview notes. Text-based formats only
 * (.txt, .md, .vtt); read entirely in the browser with no dependencies and no server
 * round-trip. The cleaned text lands in an interview's rawNotes, then flows through
 * the existing AI tagging pass like any hand-typed notes.
 */

export const ACCEPTED_TRANSCRIPT_EXT = [".txt", ".md", ".vtt"] as const;
export const ACCEPTED_TRANSCRIPT_ACCEPT = ACCEPTED_TRANSCRIPT_EXT.join(",");

export type TranscriptHeaderHints = Partial<{
  person: string;
  role: string;
  relationship: string;
  interviewer: string;
  date: string;
  consent: string;
}>;

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

const HEADER_FIELD_RE =
  /(?:^|\n)\s*(?:\*\*)?(person|participant|role|relationship(?: to service)?|interviewer|lead|date|interview date|consent|recording consent)(?:\*\*)?\s*:\s*([^\n]+)/gi;

function normalizeValue(value: string): string {
  return value.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

function labeledHeaderValues(text: string): TranscriptHeaderHints {
  const hints: TranscriptHeaderHints = {};
  for (const match of text.matchAll(HEADER_FIELD_RE)) {
    const label = match[1].toLowerCase();
    const value = normalizeValue(match[2]);
    if (!value) continue;
    if (label === "person" || label === "participant") hints.person ||= value;
    else if (label === "role") hints.role ||= value;
    else if (label.startsWith("relationship")) hints.relationship ||= value;
    else if (label === "interviewer" || label === "lead") hints.interviewer ||= value;
    else if (label.includes("date")) hints.date ||= value;
    else if (label.includes("consent")) hints.consent ||= value;
  }
  return hints;
}

const BRACKET_SPEAKER_RE = /^\[([^\]]+)\]/gm;
const PLAIN_SPEAKER_RE = /^([A-Z][A-Za-z .'-]{0,49}):\s+/gm;

function speakerLabels(text: string): Array<{ name: string; role: string }> {
  const speakers: Array<{ name: string; role: string }> = [];
  const add = (label: string) => {
    const [name, role = ""] = label.split(/\s+[-–—]\s*/);
    const cleanName = normalizeValue(name);
    if (!cleanName || speakers.some((s) => s.name === cleanName)) return;
    speakers.push({ name: cleanName, role: normalizeValue(role) });
  };
  for (const match of text.matchAll(BRACKET_SPEAKER_RE)) add(match[1]);
  if (!speakers.length) {
    for (const match of text.matchAll(PLAIN_SPEAKER_RE)) add(match[1]);
  }
  return speakers.slice(0, 5);
}

function roleFromIntroduction(text: string): string {
  const intro = text.match(/\b(?:I am|I'm)\s+((?:the|a|an|one of the)\s+[^.!?\n]{3,140})/i);
  const statedRole = text.match(/\b(?:my role is|i work as)\s+([^.!?\n]{3,140})/i);
  return normalizeValue(intro?.[1] || statedRole?.[1] || "");
}

function nameFromIntroduction(text: string): string {
  const name = text.match(/\bmy name is\s+([A-Z][A-Za-z .'-]{1,49})/);
  return normalizeValue(name?.[1] || "");
}

function personFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").trim();
  const candidate = base.split(/\s+[-–—]\s*/)[0];
  if (/^[A-Z][A-Za-z .'-]{0,49}$/.test(candidate) && candidate.split(/\s+/).length <= 3) return candidate;
  return "";
}

function dateFromFilename(filename: string): string {
  const match = filename.match(/(?:^|\D)(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})(?=\D|$)/);
  return match?.[1] || "";
}

function consentFromText(text: string): string {
  if (/\brecorded with consent\b/i.test(text)) return "recorded with consent";
  if (/\bconsent(?:ed)?(?: to (?:the )?recording)?\s*[:—-]\s*yes\b/i.test(text)) return "yes";
  return "";
}

/**
 * Best-effort header extraction from common transcript conventions: explicit
 * `Label: value` metadata, bracketed/VTT speaker labels, and a short self-intro.
 * Only fields with a confident match are returned, so people can correct them by hand.
 */
export function extractInterviewHeader(text: string, filename: string): TranscriptHeaderHints {
  const hints = labeledHeaderValues(text);
  const speakers = speakerLabels(text);
  const interviewee = speakers[0];
  const interviewerSpeaker = speakers.find((s) => /interviewer|lead|facilitator/i.test(s.name)) || speakers[1];

  hints.person ||= interviewee?.name || nameFromIntroduction(text) || personFromFilename(filename);
  hints.role ||= roleFromIntroduction(text) || interviewee?.role || "";
  hints.interviewer ||= interviewerSpeaker?.name || "";
  hints.date ||= dateFromFilename(filename);
  hints.consent ||= consentFromText(text);

  return Object.fromEntries(
    Object.entries(hints).filter(([, value]) => typeof value === "string" && value.trim()),
  ) as TranscriptHeaderHints;
}
