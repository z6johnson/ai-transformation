/**
 * GitHub Contents API storage layer. The repo IS the database.
 *
 * Data path: engagement artifacts live as JSON files in the repo and are read /
 * written here via Octokit. This is what makes the app safe on Vercel's read-only
 * serverless filesystem — nothing is written locally at request time. Git history
 * is the audit trail the Responsible-AI rules require.
 *
 * Server-only. Never import from a client component.
 */
import { Octokit } from "@octokit/rest";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function repo() {
  const [owner, name] = env("GITHUB_REPO").split("/");
  if (!owner || !name) throw new Error("GITHUB_REPO must be 'owner/name'");
  return { owner, repo: name, branch: process.env.GITHUB_BRANCH || "data" };
}

let _octokit: Octokit | null = null;
function octokit(): Octokit {
  if (!_octokit) _octokit = new Octokit({ auth: env("GITHUB_TOKEN") });
  return _octokit;
}

export type FileRead = { content: string; sha: string };

/** Read a file's text content + blob sha. Returns null if the file does not exist. */
export async function getFile(path: string): Promise<FileRead | null> {
  const { owner, repo: name, branch } = repo();
  try {
    const res = await octokit().repos.getContent({ owner, repo: name, path, ref: branch });
    const data = res.data as { content?: string; sha: string; encoding?: string };
    if (!data.content) return null;
    const content = Buffer.from(data.content, (data.encoding as BufferEncoding) || "base64").toString("utf8");
    return { content, sha: data.sha };
  } catch (err: unknown) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Read and JSON-parse a file. Returns null if absent. Throws on malformed JSON. */
export async function getJson<T>(path: string): Promise<{ data: T; sha: string } | null> {
  const file = await getFile(path);
  if (!file) return null;
  return { data: JSON.parse(file.content) as T, sha: file.sha };
}

/**
 * Create or update a file. If `expectedSha` is provided and the current file's sha
 * differs, throws ConcurrencyError (optimistic concurrency — caller returns 409).
 */
export async function putFile(args: {
  path: string;
  content: string;
  message: string;
  expectedSha?: string | null;
}): Promise<{ sha: string }> {
  const { owner, repo: name, branch } = repo();
  const existing = await getFile(args.path);
  if (existing && args.expectedSha !== undefined && args.expectedSha !== existing.sha) {
    throw new ConcurrencyError(args.path);
  }
  const res = await octokit().repos.createOrUpdateFileContents({
    owner,
    repo: name,
    path: args.path,
    branch,
    message: args.message,
    content: Buffer.from(args.content, "utf8").toString("base64"),
    sha: existing?.sha,
  });
  return { sha: res.data.content?.sha || "" };
}

/** Append a line to a JSONL file (read-modify-write; fine at v1 scale). */
export async function appendLine(path: string, line: string, message: string): Promise<void> {
  const existing = await getFile(path);
  const next = (existing?.content ? existing.content.replace(/\n*$/, "\n") : "") + line + "\n";
  await putFile({ path, content: next, message });
}

/** List immediate subdirectory names under a repo directory. */
export async function listDir(path: string): Promise<string[]> {
  const { owner, repo: name, branch } = repo();
  try {
    const res = await octokit().repos.getContent({ owner, repo: name, path, ref: branch });
    if (!Array.isArray(res.data)) return [];
    return res.data.map((e) => e.name);
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
}

export class ConcurrencyError extends Error {
  constructor(path: string) {
    super(`Stale write for ${path}`);
    this.name = "ConcurrencyError";
  }
}

function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: number }).status === 404;
}

export function isStorageConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
}
