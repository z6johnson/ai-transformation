/**
 * Heuristic PII redaction applied to any text before it leaves the server for a
 * model call. Responsible-AI §5: minimize data, strip identifiers before external
 * calls. This is a safety net, not a guarantee — the default model is on-premises
 * (api-gpt-oss-120b), which is why interview/HR notes can be processed at all.
 *
 * Returns the redacted text and a count, so the AI log can record "PII-redacted".
 */
const PATTERNS: Array<[RegExp, string]> = [
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]"],
  [/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[PHONE]"],
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]"],
  [/\b[A-Z]{1,2}\d{6,9}\b/g, "[ID]"], // employee/PID-like identifiers
];

export function redactPII(text: string): { text: string; redactions: number } {
  let redactions = 0;
  let out = text;
  for (const [re, repl] of PATTERNS) {
    out = out.replace(re, () => {
      redactions += 1;
      return repl;
    });
  }
  return { text: out, redactions };
}
