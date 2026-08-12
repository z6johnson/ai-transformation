/**
 * Config diagnostic: which model each tier actually resolves to right now.
 *
 * A mistyped model name is invisible until a user triggers the feature and gets a 4xx, and
 * env vars marked Sensitive in Vercel cannot be read back from the dashboard at all — so
 * without this there is no way to answer "which model is production running?" short of a
 * redeploy. Names only: never the API key, never the base URL, nothing that isn't already
 * stamped into the AI decision log alongside every generation.
 */
import { NextResponse } from "next/server";
import {
  isAiConfigured,
  isEmbeddingsConfigured,
  defaultModel,
  embeddingModel,
  modelForFeature,
  defaultTimeoutMs,
  reasoningTimeoutMs,
} from "@/lib/tritonai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    configured: isAiConfigured(),
    embeddingsConfigured: isEmbeddingsConfigured(),
    models: {
      default: defaultModel(),
      // Tagging — interactive, human-confirmed.
      fast: modelForFeature("tagging"),
      // Drafting, clustering, brief, model-to-map — auto-applied.
      reasoning: modelForFeature("draft"),
      // Baseline library synthesis; follows `reasoning` unless overridden.
      synthesis: modelForFeature("synthesis"),
      // "" when no embeddings model is set — retrieval then runs lexical, which is a
      // supported mode, not a failure.
      embed: embeddingModel(),
    },
    timeouts: {
      // Tagging: this per-attempt budget, retried, with the total clamped to fit maxDuration.
      taggingMs: defaultTimeoutMs(),
      // Everything on the reasoning tier: one attempt at this budget, no retry.
      reasoningMs: reasoningTimeoutMs(),
      // Baseline synthesis; follows `reasoningMs` unless AI_TIMEOUT_MS_SYNTHESIS is set.
      synthesisMs: Number(process.env.AI_TIMEOUT_MS_SYNTHESIS || reasoningTimeoutMs()),
    },
  });
}
