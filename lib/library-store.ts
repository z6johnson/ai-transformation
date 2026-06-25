/**
 * Server-side reads for the Reference Library, mirroring lib/store.ts: load with schema
 * defaults applied, return an empty default when the file is absent, and surface the SHA
 * for the optimistic-concurrency round-trip on save. Server-only.
 */
import { getJson } from "./github";
import { libraryDocsFile, libraryIndexFile, gapAnalysisFile, librarySynthesisFile } from "./paths";
import { ReferenceLibrary, LibraryIndex, GapAnalysis, LibrarySynthesis } from "./library-schemas";
import type { z } from "zod";

export type Loaded<T> = { data: T; sha: string | null };

export async function loadLibrary(id: string): Promise<Loaded<z.infer<typeof ReferenceLibrary>>> {
  const empty = () => ReferenceLibrary.parse({ engagementId: id, data: { documents: [] } });
  const raw = await getJson<unknown>(libraryDocsFile(id));
  if (!raw) return { data: empty(), sha: null };
  const parsed = ReferenceLibrary.safeParse(raw.data);
  return { data: parsed.success ? parsed.data : empty(), sha: raw.sha };
}

export async function loadIndex(id: string): Promise<Loaded<z.infer<typeof LibraryIndex>>> {
  const empty = () => LibraryIndex.parse({ engagementId: id });
  const raw = await getJson<unknown>(libraryIndexFile(id));
  if (!raw) return { data: empty(), sha: null };
  const parsed = LibraryIndex.safeParse(raw.data);
  return { data: parsed.success ? parsed.data : empty(), sha: raw.sha };
}

export async function loadGapAnalysis(id: string): Promise<Loaded<z.infer<typeof GapAnalysis>>> {
  const empty = () => GapAnalysis.parse({ engagementId: id, data: {} });
  const raw = await getJson<unknown>(gapAnalysisFile(id));
  if (!raw) return { data: empty(), sha: null };
  const parsed = GapAnalysis.safeParse(raw.data);
  return { data: parsed.success ? parsed.data : empty(), sha: raw.sha };
}

export async function loadSynthesis(id: string): Promise<Loaded<z.infer<typeof LibrarySynthesis>>> {
  const empty = () => LibrarySynthesis.parse({ engagementId: id, data: {} });
  const raw = await getJson<unknown>(librarySynthesisFile(id));
  if (!raw) return { data: empty(), sha: null };
  const parsed = LibrarySynthesis.safeParse(raw.data);
  return { data: parsed.success ? parsed.data : empty(), sha: raw.sha };
}
