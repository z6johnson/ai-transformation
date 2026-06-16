/** Shared shape returned by AI routes so the client can stamp provenance + the save log. */
import type { ModelResult } from "./tritonai";

export type AiMeta = {
  promptId: string;
  model: string;
  modelVersion: string;
  outcome: "ok" | "timeout" | "fallback" | "error";
  latencyMs: number;
  inputSummary: string;
  outputSummary: string;
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
  };
}
