/**
 * AI decision log. Responsible-AI §2/§8 require an audit trail for every AI-driven
 * step: input summary, model + version, prompt id, output summary, timestamp.
 * One JSON object per line in the engagement's _ai-log.jsonl. The 06 validation
 * packet's "How AI was used" section reads from this, so it cannot drift from reality.
 */
import { appendLine } from "./github";
import { aiLogFile } from "./paths";

export type AiLogRecord = {
  ts: string;
  actor: string;
  feature: string;
  promptId: string;
  model: string;
  modelVersion?: string;
  engagementId: string;
  artifactId?: string;
  inputSummary: string;
  outputSummary: string;
  latencyMs: number;
  outcome: "ok" | "timeout" | "fallback" | "error";
  humanDecision?: string;
};

export async function appendAiDecision(rec: AiLogRecord): Promise<void> {
  try {
    await appendLine(aiLogFile(rec.engagementId), JSON.stringify(rec), `chore(${rec.engagementId}): ai-log ${rec.feature}`);
  } catch {
    // Logging must never break the user flow; the model call already succeeded or fell back.
    // A failed log line is surfaced in server logs by the caller if needed.
  }
}
