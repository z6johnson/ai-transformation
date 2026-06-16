/**
 * Server-side engagement/artifact reads with schema defaults applied. Used directly by
 * Server Components (no HTTP hop) and by API routes. Server-only.
 */
import { getFile, getJson, listDir } from "./github";
import { ENGAGEMENTS_ROOT, engagementFile, artifactFile, aiLogFile } from "./paths";
import type { AiLogRecord } from "./ai-log";
import { Engagement, ARTIFACT_SCHEMAS, type ArtifactId } from "./schemas";
import { z } from "zod";

export async function listEngagements(): Promise<Engagement[]> {
  const ids = await listDir(ENGAGEMENTS_ROOT);
  const out: Engagement[] = [];
  for (const id of ids) {
    const eng = await loadEngagement(id);
    if (eng) out.push(eng);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadEngagement(id: string): Promise<Engagement | null> {
  const raw = await getJson<unknown>(engagementFile(id));
  if (!raw) return null;
  const parsed = Engagement.safeParse(raw.data);
  return parsed.success ? parsed.data : null;
}

export type LoadedArtifact<A extends ArtifactId> = {
  data: z.infer<(typeof ARTIFACT_SCHEMAS)[A]>;
  sha: string | null;
};

/** Load an artifact, applying schema defaults. Returns an empty default if absent. */
export async function loadArtifact<A extends ArtifactId>(
  engagementId: string,
  artifact: A,
): Promise<LoadedArtifact<A>> {
  const schema = ARTIFACT_SCHEMAS[artifact];
  const raw = await getJson<unknown>(artifactFile(engagementId, artifact));
  if (!raw) {
    const empty = schema.parse({ artifactId: artifact, engagementId, data: {} });
    return { data: empty as z.infer<(typeof ARTIFACT_SCHEMAS)[A]>, sha: null };
  }
  const parsed = schema.safeParse(raw.data);
  const data = parsed.success
    ? parsed.data
    : schema.parse({ artifactId: artifact, engagementId, data: {} });
  return { data: data as z.infer<(typeof ARTIFACT_SCHEMAS)[A]>, sha: raw.sha };
}

/** Read the append-only AI decision log for an engagement (newest first). */
export async function readAiLog(engagementId: string): Promise<AiLogRecord[]> {
  const file = await getFile(aiLogFile(engagementId));
  if (!file) return [];
  return file.content
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l) as AiLogRecord;
      } catch {
        return null;
      }
    })
    .filter((r): r is AiLogRecord => r !== null)
    .reverse();
}
