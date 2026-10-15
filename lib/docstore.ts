/**
 * Server-only Vercel Blob client for the Reference Library document store.
 *
 * Document content — original files, extracted text, the retrieval index, and the
 * human-confirmed analyses — lives in Vercel Blob, NOT in the GitHub repo (the repo
 * keeps only a content-free manifest). Every object is encrypted with AES-256-GCM
 * before it leaves the server, so even a leaked blob URL yields only ciphertext.
 * Blob URLs are never sent to the client; all reads and writes go through API routes
 * that hold the store token.
 *
 * The Vercel Blob REST API is called directly with fetch — no SDK dependency:
 *   PUT  /?pathname=…   with x-vercel-blob-access / x-add-random-suffix / x-allow-overwrite
 *   GET  /?url=…        (head)   GET /?prefix=… (list)
 *   POST /delete        with { urls }
 * Content bytes are then fetched from the blob's URL — ciphertext in transit and at rest.
 *
 * Data handling (UC BFB IS-3): BLOB_READ_WRITE_TOKEN and LIBRARY_ENCRYPTION_KEY are P4
 * secrets — env-only, never logged. Nothing here logs object paths, names, or content.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";

const API_URL = process.env.VERCEL_BLOB_API_URL || "https://vercel.com/api/blob";
const API_VERSION = "13";
const TIMEOUT_MS = 30_000;

/** Encrypted-object layout: "ENC1" magic | iv(12) | GCM tag(16) | ciphertext. */
const ENC_PREFIX = Buffer.from("ENC1", "utf8");
const IV_LEN = 12;
const TAG_LEN = 16;

export function isDocStoreConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN && process.env.LIBRARY_ENCRYPTION_KEY);
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function token(): string {
  const value = process.env.BLOB_READ_WRITE_TOKEN;
  if (!value) throw new Error("Document store is not configured. Set BLOB_READ_WRITE_TOKEN.");
  return value;
}

function encryptionKey(): Buffer {
  const raw = process.env.LIBRARY_ENCRYPTION_KEY;
  if (!raw) throw new Error("Document store is not configured. Set LIBRARY_ENCRYPTION_KEY.");
  // Hash so any reasonable key material length works; 64-char hex keys are recommended.
  return createHash("sha256").update(raw, "utf8").digest();
}

function encrypt(plain: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ENC_PREFIX, iv, tag, body]);
}

function decrypt(stored: Buffer): Buffer {
  const header = ENC_PREFIX.length + IV_LEN + TAG_LEN;
  if (stored.length < header || !stored.subarray(0, ENC_PREFIX.length).equals(ENC_PREFIX)) {
    throw new Error("Stored object is not in the expected encrypted format.");
  }
  const iv = stored.subarray(ENC_PREFIX.length, ENC_PREFIX.length + IV_LEN);
  const tag = stored.subarray(ENC_PREFIX.length + IV_LEN, header);
  const body = stored.subarray(header);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

class DocStoreNotFoundError extends Error {
  constructor() {
    super("Object not found in the document store.");
  }
}

export function isDocStoreNotFound(err: unknown): boolean {
  return err instanceof DocStoreNotFoundError;
}

function validatePathname(pathname: string): void {
  if (pathname.length > 900 || /[^a-zA-Z0-9._/-]/.test(pathname) || pathname.includes("..")) {
    throw new Error("Invalid document-store path.");
  }
}

function validateEngagementId(id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(id)) throw new Error("Invalid engagement id.");
  return id;
}

function validateDocId(docId: string): string {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(docId)) throw new Error("Invalid document id.");
  return docId;
}

async function api(path: string, init: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {
    ...((init.headers as Record<string, string>) || {}),
    authorization: `Bearer ${token()}`,
    "x-api-version": API_VERSION,
    "x-api-blob-request-attempt": "0",
    "x-api-blob-request-id": randomUUID(),
  };
  const res = await fetch(`${API_URL}${path}`, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    let code = "";
    try {
      const json = (await res.json()) as { error?: { code?: string } };
      code = json.error?.code || "";
    } catch {
      // Non-JSON error body — the status below is all we can safely report.
    }
    if (res.status === 404 || code === "not_found") throw new DocStoreNotFoundError();
    throw new Error(`Document store request failed (HTTP ${res.status}${code ? ` ${code}` : ""}).`);
  }
  return res;
}

/** Write (or replace) one encrypted object at a fixed pathname. */
export async function putObject(pathname: string, data: Buffer): Promise<void> {
  validatePathname(pathname);
  const params = new URLSearchParams({ pathname });
  const encrypted = encrypt(data);
  const response = await api(`/?${params.toString()}`, {
    method: "PUT",
    body: new Uint8Array(encrypted),
    headers: {
      "x-vercel-blob-access": "public",
      "x-add-random-suffix": "0",
      "x-allow-overwrite": "1",
      "x-content-type": "application/octet-stream",
    },
  });
  const result = (await response.json().catch(() => null)) as { url?: string } | null;
  if (result?.url) urlCache.set(pathname, result.url);
}

export async function putJson(pathname: string, value: unknown): Promise<void> {
  await putObject(pathname, Buffer.from(JSON.stringify(value, null, 2) + "\n", "utf8"));
}

const urlCache = new Map<string, string>();

async function headUrl(pathname: string): Promise<string | null> {
  const params = new URLSearchParams({ url: pathname });
  try {
    const res = await api(`/?${params.toString()}`, { method: "GET" });
    const json = (await res.json()) as { url?: string };
    if (!json.url) throw new Error("Document store returned an object without a URL.");
    return json.url;
  } catch (err) {
    if (isDocStoreNotFound(err)) return null;
    throw err;
  }
}

/** Read and decrypt one object. Returns null when the object does not exist. */
export async function getObject(pathname: string): Promise<Buffer | null> {
  validatePathname(pathname);
  let url = urlCache.get(pathname);
  if (!url) {
    const resolved = await headUrl(pathname);
    if (!resolved) return null;
    urlCache.set(pathname, resolved);
    url = resolved;
  }
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok && res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not read a document-store object (HTTP ${res.status}).`);
  return decrypt(Buffer.from(await res.arrayBuffer()));
}

export async function getJson<T>(pathname: string): Promise<T | null> {
  const buf = await getObject(pathname);
  return buf ? (JSON.parse(buf.toString("utf8")) as T) : null;
}

export type StoreObject = { pathname: string; url: string; size: number };

/** List all objects under a prefix, following pagination. */
export async function listObjects(prefix: string): Promise<StoreObject[]> {
  validatePathname(prefix);
  const out: StoreObject[] = [];
  let cursor: string | undefined;
  for (;;) {
    const params = new URLSearchParams({ prefix });
    if (cursor) params.set("cursor", cursor);
    const res = await api(`/?${params.toString()}`, { method: "GET" });
    const json = (await res.json()) as { blobs: StoreObject[]; cursor?: string; hasMore?: boolean };
    out.push(...json.blobs);
    if (!json.hasMore || !json.cursor) break;
    cursor = json.cursor;
  }
  return out;
}

/** Delete objects by pathname. Missing objects are ignored by the API. */
export async function deleteObjects(pathnames: string[]): Promise<void> {
  if (!pathnames.length) return;
  for (const pathname of pathnames) validatePathname(pathname);
  await api("/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ urls: pathnames }),
  });
  for (const pathname of pathnames) urlCache.delete(pathname);
}

// ---- Path layout ------------------------------------------------------------
// engagements/<id>/library/
//   documents/<DOC-01>/original.bin   the uploaded file, encrypted
//   documents/<DOC-01>/text.txt       the extracted/edited text, encrypted
//   index.json | synthesis.json | gap-analysis.json   derived artifacts, encrypted

function libraryRoot(engagementId: string): string {
  return `engagements/${validateEngagementId(engagementId)}/library`;
}

export function docOriginalPath(engagementId: string, docId: string): string {
  return `${libraryRoot(engagementId)}/documents/${validateDocId(docId)}/original.bin`;
}

export function docTextPath(engagementId: string, docId: string): string {
  return `${libraryRoot(engagementId)}/documents/${validateDocId(docId)}/text.txt`;
}

export function documentsPrefix(engagementId: string): string {
  return `${libraryRoot(engagementId)}/documents/`;
}

export function indexPath(engagementId: string): string {
  return `${libraryRoot(engagementId)}/index.json`;
}

export function synthesisPath(engagementId: string): string {
  return `${libraryRoot(engagementId)}/synthesis.json`;
}

export function gapAnalysisPath(engagementId: string): string {
  return `${libraryRoot(engagementId)}/gap-analysis.json`;
}
