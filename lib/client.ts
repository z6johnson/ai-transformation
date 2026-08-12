"use client";
/** Client-side helpers for saving artifacts and calling AI routes. */
import type { AiMeta } from "./ai-meta";

export type SaveResult = { ok: true; sha: string } | { ok: false; error: string; conflict?: boolean };

export async function saveArtifact(args: {
  engagementId: string;
  artifactId: string;
  payload: unknown;
  baseSha: string | null;
  aiLog?: Partial<AiMeta> & { feature?: string; humanDecision?: string };
}): Promise<SaveResult> {
  try {
    const res = await fetch("/api/artifacts/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error || "Save failed", conflict: json.code === "conflict" };
    return { ok: true, sha: json.sha };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export type SaveEngagementResult =
  | { ok: true; id: string; sha: string }
  | { ok: false; error: string; conflict?: boolean };

export async function saveEngagement(args: {
  id?: string;
  name: string;
  service?: string;
  scopeStart?: string;
  scopeEnd?: string;
  lead?: string;
  lifecycleOwner?: { name?: string; role?: string };
  stage?: string;
  baseSha?: string | null;
}): Promise<SaveEngagementResult> {
  try {
    const res = await fetch("/api/engagements/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error || "Save failed", conflict: json.code === "conflict" };
    return { ok: true, id: json.id, sha: json.sha };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

/**
 * Call an AI route. Every AI route answers with the degraded shape ({degraded, message}) on
 * failure — but the route is not the only thing that can fail. A hosting-platform request
 * timeout, a crashed function, or a dropped connection returns a gateway error page, and
 * parsing that as JSON used to throw straight through the caller: the panel stayed stuck on
 * "Synthesizing…" with no message and nothing written to the AI decision log. Fail into the
 * same degraded shape instead, naming the transport so the cause is visible in the UI.
 */
export async function callAi<T>(path: string, body: unknown): Promise<T> {
  const degraded = (message: string) => ({ degraded: true, message }) as T;
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      const snippet = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
      return degraded(
        `AI assist is unavailable. The request did not complete (HTTP ${res.status})${snippet ? `: ${snippet}` : ""}. ` +
          `If this took a long time, the request likely hit the hosting request limit before the model answered.`,
      );
    }
  } catch (err) {
    const why = err instanceof Error ? err.message : "network error";
    return degraded(`AI assist is unavailable. The request never completed (${why}).`);
  }
}

/** Generic JSON save to a non-artifact store (reference library, gap analysis). */
async function saveJson(path: string, body: unknown): Promise<SaveResult> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error || "Save failed", conflict: json.code === "conflict" };
    return { ok: true, sha: json.sha };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export function saveLibrary(args: { engagementId: string; payload: unknown; baseSha: string | null }): Promise<SaveResult> {
  return saveJson("/api/library/save", args);
}

export function saveGapAnalysis(args: { engagementId: string; payload: unknown; baseSha: string | null }): Promise<SaveResult> {
  return saveJson("/api/library/gap", args);
}

export function saveSynthesis(args: { engagementId: string; payload: unknown; baseSha: string | null }): Promise<SaveResult> {
  return saveJson("/api/library/synthesis", args);
}

export type ParsedUpload = {
  filename: string;
  text: string;
  source: {
    format: string;
    bytes: number;
    parser: string;
    pages?: number;
    parseWarnings: string[];
    piiRedactions: number;
  };
  error?: string;
};

/** Upload a document file for server-side parsing (PDF/DOCX/txt/md). */
export async function parseDocumentFile(file: File): Promise<ParsedUpload> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/library/parse", { method: "POST", body: form });
  return (await res.json()) as ParsedUpload;
}
