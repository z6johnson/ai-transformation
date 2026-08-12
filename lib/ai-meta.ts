/** Shared shape returned by AI routes so the client can stamp provenance + the save log. */
import type { FailureReason, ModelResult } from "./tritonai";

export type AiMeta = {
  promptId: string;
  model: string;
  modelVersion: string;
  outcome: "ok" | "timeout" | "fallback" | "error";
  latencyMs: number;
  inputSummary: string;
  outputSummary: string;
  /** Why the call failed, when it did — carried into the log so a degraded run is diagnosable. */
  failureReason?: FailureReason;
  failureStatus?: number;
  failureDetail?: string;
};

export function metaFromResult(args: {
  result: ModelResult;
  promptId: string;
  model: string;
  inputSummary: string;
  outputSummary: string;
}): AiMeta {
  const { result } = args;
  const outcome: AiMeta["outcome"] = result.ok ? "ok" : result.reason === "timeout" ? "timeout" : "fallback";
  return {
    promptId: args.promptId,
    model: args.model,
    modelVersion: result.ok ? result.modelVersion : args.model,
    outcome,
    latencyMs: result.latencyMs,
    inputSummary: args.inputSummary,
    outputSummary: args.outputSummary,
    ...(result.ok
      ? {}
      : { failureReason: result.reason, failureStatus: result.status, failureDetail: result.detail }),
  };
}

/**
 * A one-line, operator-readable cause to append to a degraded message. "AI assist is
 * unavailable" alone sends someone to the logs; naming the timeout or the provider's own
 * rejection lets them act — the by-hand path is open either way.
 */
export function failureNote(result: ModelResult): string {
  if (result.ok) return "";
  const seconds = (result.latencyMs / 1000).toFixed(1);
  switch (result.reason) {
    case "unconfigured":
      return "The model endpoint is not configured (TRITONAI_API_KEY / TRITONAI_BASE_URL).";
    case "timeout":
      return `The model did not respond within the time budget (gave up after ${seconds}s).`;
    case "rate":
      return `The model endpoint is rate limiting (HTTP 429 after ${seconds}s).`;
    case "malformed":
      return `The model returned no usable output${result.detail ? `: ${result.detail}` : ""}.`;
    default:
      return result.status
        ? `The model endpoint rejected the request (HTTP ${result.status})${result.detail ? `: ${result.detail}` : ""}.`
        : `The model endpoint could not be reached${result.detail ? `: ${result.detail}` : ""}.`;
  }
}
