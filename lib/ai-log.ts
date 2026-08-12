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
  /** On a degraded run: why. An outcome with no cause is not an audit trail. */
  failureReason?: string;
  failureStatus?: number;
  failureDetail?: string;
};

export async function appendAiDecision(rec: AiLogRecord): Promise<void> {
  try {
    await appendLine(aiLogFile(rec.engagementId), JSON.stringify(rec), `chore(${rec.engagementId}): ai-log ${rec.feature}`);
  } catch (err) {
    // Logging must never break the user flow; the model call already succeeded or fell back.
    // But it must not vanish either — a swallowed append looks exactly like a call that
    // never happened, so write the line and the reason to the server log instead.
    const why = err instanceof Error ? err.message : String(err);
    console.error(`[ai-log] append failed (${why}) — unwritten record: ${JSON.stringify(rec)}`);
  }
}
