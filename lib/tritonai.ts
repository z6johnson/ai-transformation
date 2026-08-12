/**
 * TritonAI Developer API client — the single chokepoint for every model call.
 * OpenAI-compatible LiteLLM endpoint. Server-only; reads the key from env and never
 * exposes it to the client.
 *
 * Responsible-AI rules enforced here, once, for all features:
 *  - explicit timeout (AbortController), bounded retries with backoff
 *  - a defined fallback: on any failure we return ok:false and callers degrade to the
 *    fully functional by-hand path (AI never blocks the human)
 *  - JSON output is parsed defensively; malformed output is treated as failure
 *  - no secrets in code; endpoint, model, key all from env
 */

export type FailureReason = "timeout" | "rate" | "malformed" | "error" | "unconfigured";

/**
 * A failed call carries WHY. Without the HTTP status and the provider's own message a
 * rejected request is indistinguishable from a timeout in the audit log, and the operator
 * is left with "AI assist is unavailable" and nothing to act on.
 */
export type ModelFailure = {
  ok: false;
  reason: FailureReason;
  latencyMs: number;
  /** HTTP status when the endpoint answered at all. Absent on timeout/network failure. */
  status?: number;
  /** Bounded, key-scrubbed provider message. Safe to log and to show an operator. */
  detail?: string;
};

export type ModelResult =
  | { ok: true; content: string; modelVersion: string; latencyMs: number }
  | ModelFailure;

export function isAiConfigured(): boolean {
  return Boolean(process.env.TRITONAI_API_KEY && process.env.TRITONAI_BASE_URL);
}

export function defaultModel(): string {
  return process.env.TRITONAI_MODEL || "api-gemma-4-31b";
}

/**
 * Resolve the model for a feature. Three tiers, chosen by what the workload can actually use:
 *
 *  - tagging   — verbatim-grounded classification into a fixed enum, run while a human waits
 *                and confirmed by that human. No capability headroom to buy; stays on the
 *                fast/default model, where a non-reasoning model also means no thinking-token
 *                latency on the one interactive path.
 *  - draft /   — drafting, clustering, brief, model-to-map. This output is auto-applied rather
 *    cluster     than approved item-by-item, so capability is the point (TRITONAI_MODEL_REASONING).
 *  - synthesis — baseline library synthesis. Grounded descriptive summarization, and the client
 *                confirms every section before it is saved, so it does NOT need a stronger model
 *                than drafting. It gets its own knob only because it is the one call with a
 *                different context and timeout profile (whole library, one shot, no retry):
 *                leave TRITONAI_MODEL_SYNTHESIS unset and it follows the reasoning tier; set it
 *                when a growing library outgrows that model's context window.
 *
 * Every tier falls back to the one below it and finally to TRITONAI_MODEL, so behavior is
 * unchanged until the env vars are set — we reach for the bigger model only when deliberately
 * configured (responsible-ai §7).
 */
export function modelForFeature(feature: "tagging" | "draft" | "cluster" | "synthesis"): string {
  if (feature === "tagging") return process.env.TRITONAI_MODEL_FAST || defaultModel();
  const reasoning = process.env.TRITONAI_MODEL_REASONING || defaultModel();
  if (feature === "synthesis") return process.env.TRITONAI_MODEL_SYNTHESIS || reasoning;
  return reasoning;
}

/** The embeddings model, if one is provisioned. "" means none → callers fall back to lexical. */
export function embeddingModel(): string {
  return process.env.TRITONAI_MODEL_EMBED || "";
}

/** Embeddings are usable only when the AI is configured AND an embeddings model is set. */
export function isEmbeddingsConfigured(): boolean {
  return isAiConfigured() && Boolean(embeddingModel());
}

type Msg = { role: "system" | "user" | "assistant"; content: string };

const DETAIL_MAX = 400;

/** Default per-attempt timeout. A single call may raise it for a long generation. */
export function defaultTimeoutMs(): number {
  return Number(process.env.AI_TIMEOUT_MS || 25000);
}

/**
 * Ceiling on total wall clock across all attempts, sized to fit inside the AI routes'
 * `maxDuration = 60` with room left to write the response and the decision log line.
 * Raise it (with maxDuration) only on a plan whose function limit is above 60s.
 */
const MAX_BUDGET_MS = 55000;

/** Never let an API key reach a log line, however the provider echoed the request back. */
function scrub(text: string): string {
  return text
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{8,}/g, (m) => `${m.slice(0, 3)}***`)
    .replace(/Bearer\s+\S+/gi, "Bearer ***");
}

/**
 * Pull the provider's own explanation out of an error response. LiteLLM answers a rejected
 * request with {"error":{"message":"..."}} — that message is the difference between a
 * diagnosable failure ("model not found") and a blank "unavailable".
 */
async function errorDetail(res: Response): Promise<string> {
  try {
    const body = await res.text();
    if (!body) return "";
    try {
      const json = JSON.parse(body) as { error?: { message?: unknown }; message?: unknown; detail?: unknown };
      const message = json.error?.message ?? json.message ?? json.detail;
      if (typeof message === "string" && message) return scrub(message).slice(0, DETAIL_MAX);
    } catch {
      // Not JSON (an HTML gateway page, say) — fall through to the raw text.
    }
    return scrub(body.replace(/\s+/g, " ").trim()).slice(0, DETAIL_MAX);
  } catch {
    return "";
  }
}

/**
 * Every failure leaves a line in the server log. The AI decision log records the outcome for
 * the audit trail; this is the operator's copy, with the status and provider message attached.
 */
function logFailure(op: string, info: Record<string, unknown>): void {
  console.error(`[tritonai] ${op} failed ${JSON.stringify(info)}`);
}

export async function callModel(args: {
  messages: Msg[];
  jsonObject?: boolean;
  temperature?: number;
  model?: string;
  /** Per-attempt timeout. Defaults to AI_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Total wall clock across all attempts. Defaults to the full retry budget. */
  budgetMs?: number;
}): Promise<ModelResult> {
  const started = Date.now();
  if (!isAiConfigured()) return { ok: false, reason: "unconfigured", latencyMs: 0 };

  const base = process.env.TRITONAI_BASE_URL!.replace(/\/$/, "");
  const model = args.model || defaultModel();
  const timeoutMs = args.timeoutMs ?? defaultTimeoutMs();
  const maxAttempts = 3; // 1 try + 2 retries
  // Bound total wall clock, not just each attempt: a caller running under a platform
  // request cap needs the call to give up in time to answer rather than be killed mid-flight.
  // The clamp is what makes that true — timeoutMs * maxAttempts is 75s at the default 25s
  // timeout, which overruns the routes' 60s maxDuration and gets the request killed with no
  // answer and no line in the decision log. Retries still work; only the ceiling moves.
  const budgetMs = args.budgetMs ?? Math.min(timeoutMs * maxAttempts, MAX_BUDGET_MS);
  let lastReason: FailureReason = "error";
  let lastStatus: number | undefined;
  let lastDetail: string | undefined;

  const fail = (): ModelFailure => {
    const latencyMs = Date.now() - started;
    logFailure("chat/completions", { model, reason: lastReason, status: lastStatus, latencyMs, detail: lastDetail });
    return { ok: false, reason: lastReason, latencyMs, status: lastStatus, detail: lastDetail };
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remaining = budgetMs - (Date.now() - started);
    if (remaining <= 0) return fail();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.TRITONAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: args.messages,
          temperature: args.temperature ?? 0.2,
          ...(args.jsonObject ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        lastReason = res.status === 429 ? "rate" : "error";
        lastStatus = res.status;
        lastDetail = await errorDetail(res);
        if (attempt < maxAttempts && budgetMs - (Date.now() - started) > backoffMs(attempt)) {
          await backoff(attempt);
          continue;
        }
        return fail();
      }
      if (!res.ok) {
        // A 4xx is a rejected request — the model name, the params, or the key. Retrying
        // sends the identical body, so there is nothing to gain; report what it said.
        lastReason = "error";
        lastStatus = res.status;
        lastDetail = await errorDetail(res);
        return fail();
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
        error?: { message?: unknown };
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        // Some gateways answer 200 with an error object in the body.
        lastReason = "malformed";
        lastStatus = res.status;
        lastDetail =
          typeof json.error?.message === "string"
            ? scrub(json.error.message).slice(0, DETAIL_MAX)
            : "no choices[0].message.content in a 200 response";
        return fail();
      }
      return { ok: true, content, modelVersion: json.model || model, latencyMs: Date.now() - started };
    } catch (err: unknown) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastReason = isAbort ? "timeout" : "error";
      lastStatus = undefined;
      lastDetail = isAbort
        ? `no response within ${Math.min(timeoutMs, remaining)}ms (attempt ${attempt})`
        : scrub(err instanceof Error ? err.message : String(err)).slice(0, DETAIL_MAX);
      if (attempt < maxAttempts && isAbort && budgetMs - (Date.now() - started) > backoffMs(attempt)) {
        await backoff(attempt);
        continue;
      }
      return fail();
    }
  }
  return fail();
}

function backoffMs(attempt: number): number {
  return attempt === 1 ? 250 : 1000;
}

function backoff(attempt: number): Promise<void> {
  return new Promise((r) => setTimeout(r, backoffMs(attempt)));
}

export type EmbeddingsResult =
  | { ok: true; vectors: number[][]; modelVersion: string; latencyMs: number }
  | ModelFailure;

/**
 * Embeddings sibling of callModel — same OpenAI-compatible endpoint, same timeout/retry/
 * fallback discipline. Hits `/embeddings` with TRITONAI_MODEL_EMBED. Returns ok:false when
 * no embeddings model is configured (or on failure) so the index build degrades to lexical
 * retrieval rather than blocking: embeddings never block retrieval.
 */
export async function callEmbeddings(args: { input: string[]; model?: string }): Promise<EmbeddingsResult> {
  const started = Date.now();
  const model = args.model || embeddingModel();
  if (!isAiConfigured() || !model) return { ok: false, reason: "unconfigured", latencyMs: 0 };
  if (!args.input.length) return { ok: true, vectors: [], modelVersion: model, latencyMs: 0 };

  const base = process.env.TRITONAI_BASE_URL!.replace(/\/$/, "");
  const timeoutMs = defaultTimeoutMs();
  const maxAttempts = 3;
  let lastReason: FailureReason = "error";
  let lastStatus: number | undefined;
  let lastDetail: string | undefined;

  const fail = (): ModelFailure => {
    const latencyMs = Date.now() - started;
    logFailure("embeddings", { model, reason: lastReason, status: lastStatus, latencyMs, detail: lastDetail });
    return { ok: false, reason: lastReason, latencyMs, status: lastStatus, detail: lastDetail };
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.TRITONAI_API_KEY}`,
        },
        body: JSON.stringify({ model, input: args.input }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        lastReason = res.status === 429 ? "rate" : "error";
        lastStatus = res.status;
        lastDetail = await errorDetail(res);
        if (attempt < maxAttempts) {
          await backoff(attempt);
          continue;
        }
        return fail();
      }
      if (!res.ok) {
        lastReason = "error";
        lastStatus = res.status;
        lastDetail = await errorDetail(res);
        return fail();
      }

      const json = (await res.json()) as { data?: Array<{ embedding?: number[]; index?: number }>; model?: string };
      const rows = json.data;
      if (!rows || rows.length !== args.input.length) {
        lastReason = "malformed";
        lastStatus = res.status;
        lastDetail = `expected ${args.input.length} embedding(s), got ${rows?.length ?? 0}`;
        return fail();
      }
      const sorted = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      const vectors = sorted.map((r) => r.embedding || []);
      if (vectors.some((v) => !v.length)) {
        lastReason = "malformed";
        lastStatus = res.status;
        lastDetail = "at least one embedding came back empty";
        return fail();
      }
      return { ok: true, vectors, modelVersion: json.model || model, latencyMs: Date.now() - started };
    } catch (err: unknown) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastReason = isAbort ? "timeout" : "error";
      lastStatus = undefined;
      lastDetail = isAbort
        ? `no response within ${timeoutMs}ms (attempt ${attempt})`
        : scrub(err instanceof Error ? err.message : String(err)).slice(0, DETAIL_MAX);
      if (attempt < maxAttempts && isAbort) {
        await backoff(attempt);
        continue;
      }
      return fail();
    }
  }
  return fail();
}

/** Extract a JSON object from model content, tolerating code fences. Null on failure. */
export function parseJsonLoose<T>(content: string): T | null {
  const trimmed = content.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}
