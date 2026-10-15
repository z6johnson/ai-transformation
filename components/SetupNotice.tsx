/** Shown when required env is missing, so the app is usable/legible before configuration. */
export function SetupNotice({ what }: { what: "storage" | "docstore" | "ai" }) {
  if (what === "ai") {
    return (
      <div className="notice stack">
        <strong>AI assist is not configured.</strong>
        <p>
          Set <code>TRITONAI_API_KEY</code> (and optionally <code>TRITONAI_MODEL</code>, default{" "}
          <code>api-gemma-4-31b</code>) to enable tagging and drafting. The by-hand path works without it.{" "}
          <code>TRITONAI_MODEL_EMBED</code> is optional — without it, Reference Library retrieval falls back to keyword
          matching.
        </p>
      </div>
    );
  }
  if (what === "docstore") {
    return (
      <div className="notice stack">
        <strong>Document storage is not configured.</strong>
        <p>
          Set <code>BLOB_READ_WRITE_TOKEN</code> and <code>LIBRARY_ENCRYPTION_KEY</code> to upload and store reference
          documents. Generate the encryption key with <code>openssl rand -hex 32</code> and back it up securely: losing
          it makes existing document content unrecoverable.
        </p>
      </div>
    );
  }
  return (
    <div className="notice stack">
      <strong>Storage is not configured.</strong>
      <p>
        This workspace stores engagements as files in the repo via the GitHub Contents API. Set{" "}
        <code>GITHUB_TOKEN</code> (fine-grained PAT, Contents read/write), <code>GITHUB_REPO</code>, and{" "}
        <code>GITHUB_BRANCH</code> (default <code>data</code>). See <code>.env.example</code>.
      </p>
    </div>
  );
}
