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

export type ModelResult =
  | { ok: true; content: string; modelVersion: string; latencyMs: number }
  | { ok: false; reason: "timeout" | "rate" | "malformed" | "error" | "unconfigured"; latencyMs: number };

export function isAiConfigured(): boolean {
  return Boolean(process.env.TRITONAI_API_KEY && process.env.TRITONAI_BASE_URL);
}

export function defaultModel(): string {
  return process.env.TRITONAI_MODEL || "api-gpt-oss-120b";
}

type Msg = { role: "system" | "user" | "assistant"; content: string };

export async function callModel(args: {
  messages: Msg[];
  jsonObject?: boolean;
  temperature?: number;
}): Promise<ModelResult> {
  const started = Date.now();
  if (!isAiConfigured()) return { ok: false, reason: "unconfigured", latencyMs: 0 };

  const base = process.env.TRITONAI_BASE_URL!.replace(/\/$/, "");
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 25000);
  const maxAttempts = 3; // 1 try + 2 retries
  let lastReason: ModelResult extends { ok: false } ? never : "error" | "rate" | "timeout" = "error";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.TRITONAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: defaultModel(),
          messages: args.messages,
          temperature: args.temperature ?? 0.2,
          ...(args.jsonObject ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        lastReason = res.status === 429 ? "rate" : "error";
        if (attempt < maxAttempts) {
          await backoff(attempt);
          continue;
        }
        return { ok: false, reason: lastReason, latencyMs: Date.now() - started };
      }
      if (!res.ok) {
        return { ok: false, reason: "error", latencyMs: Date.now() - started };
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) return { ok: false, reason: "malformed", latencyMs: Date.now() - started };
      return { ok: true, content, modelVersion: json.model || defaultModel(), latencyMs: Date.now() - started };
    } catch (err: unknown) {
      clearTimeout(timer);
      const isAbort = err instanceof Error && err.name === "AbortError";
      lastReason = isAbort ? "timeout" : "error";
      if (attempt < maxAttempts && isAbort) {
        await backoff(attempt);
        continue;
      }
      return { ok: false, reason: lastReason, latencyMs: Date.now() - started };
    }
  }
  return { ok: false, reason: lastReason, latencyMs: Date.now() - started };
}

function backoff(attempt: number): Promise<void> {
  const ms = attempt === 1 ? 250 : 1000;
  return new Promise((r) => setTimeout(r, ms));
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
