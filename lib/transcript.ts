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

const BRACKET_SPEAKER_RE = /^\[([^\]]+)\][^\n]*(?:\n|$)/gm;
const PLAIN_SPEAKER_RE = /^([A-Z][A-Za-z .'-]{0,49}):[^\n]*(?:\n|$)/gm;

type Speaker = { name: string; role: string; utterances: string[] };

function speakerLabels(text: string): Speaker[] {
  const speakers: Speaker[] = [];
  const add = (label: string, utterance: string) => {
    const [name, role = ""] = label.split(/\s+[-–—]\s*/);
    const cleanName = normalizeValue(name);
    const cleanUtterance = normalizeValue(utterance);
    if (!cleanName) return;
    const existing = speakers.find((s) => s.name === cleanName);
    if (existing) {
      if (cleanUtterance) existing.utterances.push(cleanUtterance);
      return;
    }
    speakers.push({ name: cleanName, role: normalizeValue(role), utterances: cleanUtterance ? [cleanUtterance] : [] });
  };

  let matches = [...text.matchAll(BRACKET_SPEAKER_RE)];
  if (!matches.length) {
    matches = [...text.matchAll(PLAIN_SPEAKER_RE)];
  }
  matches.forEach((match, i) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[i + 1]?.index ?? text.length;
    add(match[1], text.slice(start, end));
  });
  return speakers.slice(0, 5);
}

function isInterviewPrompt(utterance: string): boolean {
  return /\b(?:let me know|tell me|walk me through|introduce yourself|your name|your role|what(?:'s| is) your role)\b/i.test(
    utterance,
  );
}

function isSelfIntroduction(utterance: string): boolean {
  return /\b(?:my name is|i(?:'| a)m|i work as|my role is)\b/i.test(utterance);
}

function chooseInterviewSpeakers(speakers: Speaker[]): {
  interviewee?: Speaker;
  interviewer?: Speaker;
} {
  if (!speakers.length) return {};

  const explicitInterviewer = speakers.find((s) => /interviewer|lead|facilitator/i.test(s.name));
  if (explicitInterviewer) {
    return {
      interviewee: speakers.find((s) => s !== explicitInterviewer),
      interviewer: explicitInterviewer,
    };
  }

  let interviewee = speakers[0];
  let interviewer = speakers[1];

  // Meeting tools order speakers by who talks first, not by interview role. An opening
  // prompt ("let me know your name...") is a strong signal that the first voice is the
  // interviewer, even though earlier code treated that speaker as the interviewee.
  if (speakers[1] && isInterviewPrompt(speakers[0].utterances[0] || "")) {
    interviewee = speakers[1];
    interviewer = speakers[0];
  } else if (
    speakers[1] &&
    isSelfIntroduction(speakers[1].utterances[0] || "") &&
    !isSelfIntroduction(speakers[0].utterances[0] || "")
  ) {
    interviewee = speakers[1];
    interviewer = speakers[0];
  }

  return { interviewee, interviewer };
}

function relationshipFromIntroduction(text: string): string {
  if (/\bI(?:'| a)m\s+(?:the\s+)?(?:service\s+)?owner\b/i.test(text)) return "owner";
  if (/\bI\s+(?:run|manage)\b[^.!?]{0,120}\bday(?:\s*to\s*|-)?day\b/i.test(text)) return "runs it day to day";
  if (/\b(?:I(?:'| a)m\s+(?:a\s+)?|my role is\s+(?:a\s+)?|i work as\s+(?:a\s+)?)front(?:\s*|-)?line\b/i.test(text)) {
    return "frontline";
  }
  if (/\bI(?:'| a)m\s+(?:a\s+)?handoff\s+partner\b/i.test(text)) return "handoff partner";
  if (/\bI\s+(?:use|receive)\s+(?:this|the)\s+service\b/i.test(text)) return "person it serves";
  return "";
}

function roleFromIntroduction(text: string): string {
  // Stop before a second first-person clause ("... Director, and I run this service")
  // so a relationship statement does not become part of the job title.
  const intro = text.match(/\bI(?:'m| am)\s+((?:the|a|an|one of the)\s+[^.!?\n]{2,139}?)(?:\s*,?\s+and\s+I\s+|[.!?]|\n|$)/i);
  const statedRole = text.match(
    /\b(?:my role is|i work as)\s+([^.!?\n]{2,139}?)(?:\s*,?\s+and\s+I\s+|[.!?]|\n|$)/i,
  );
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
  const { interviewee, interviewer: interviewerSpeaker } = chooseInterviewSpeakers(speakers);
  const introductionText = interviewee?.utterances.join("\n") || text;

  hints.person ||= interviewee?.name || nameFromIntroduction(introductionText) || personFromFilename(filename);
  hints.role ||= roleFromIntroduction(introductionText) || interviewee?.role || "";
  hints.relationship ||= relationshipFromIntroduction(introductionText);
  hints.interviewer ||= interviewerSpeaker?.name || "";
  hints.date ||= dateFromFilename(filename);
  hints.consent ||= consentFromText(text);

  return Object.fromEntries(
    Object.entries(hints).filter(([, value]) => typeof value === "string" && value.trim()),
  ) as TranscriptHeaderHints;
}
