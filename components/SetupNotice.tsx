/** Shown when required env is missing, so the app is usable/legible before configuration. */
export function SetupNotice({ what }: { what: "storage" | "ai" }) {
  if (what === "ai") {
    return (
      <div className="notice stack">
        <strong>AI assist is not configured.</strong>
        <p>
          Set <code>TRITONAI_API_KEY</code> (and optionally <code>TRITONAI_MODEL</code>, default{" "}
          <code>api-gpt-oss-120b</code>) to enable tagging and drafting. The by-hand path works without it.
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
