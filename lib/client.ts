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

export async function callAi<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}
