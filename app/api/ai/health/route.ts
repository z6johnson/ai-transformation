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
  availableModelIds,
} from "@/lib/tritonai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const models = {
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
  };
  // A tier can be set to a model this key is not entitled to, and Vercel will not show a
  // Sensitive value back, so "configured" is not the same as "usable". Asking the hub turns
  // that difference into something visible here rather than a 403 on the user's first click.
  const available = await availableModelIds();
  return NextResponse.json({
    configured: isAiConfigured(),
    embeddingsConfigured: isEmbeddingsConfigured(),
    models,
    // null when the hub could not be asked; an empty embed value is unset, not unavailable.
    usable: available
      ? Object.fromEntries(
          Object.entries(models).map(([tier, id]) => [tier, id === "" ? null : available.includes(id)]),
        )
      : null,
    timeouts: {
      perAttemptMs: defaultTimeoutMs(),
      synthesisMs: Number(process.env.AI_TIMEOUT_MS_SYNTHESIS || 50000),
    },
  });
}
