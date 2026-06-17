# AI Transformation Practice — Workspace & Dashboard

A free, serverless beta for UC San Diego's AI Transformation Practice (OSI). Two surfaces:

1. **AI-assisted Layer 1 mapping** — work the six lifecycle-mapping templates with help from
   the TritonAI Developer API (on-prem `api-gpt-oss-120b` by default): tag interview notes,
   draft journey maps and friction entries, cluster friction. Every AI output is visibly
   marked and human-confirmed before it counts. AI drafts, flags, synthesizes — humans decide.
2. **Executive measurement dashboard** — a working definition of AI ROI, the four-dimension
   impact framework, and destination vs. adaptive-capacity measures, re-baselined quarterly.

Built to the binding `seed-style-guide.md` (International Typographic Style, WCAG 2.1 AA floor)
and `responsible-ai-seed-principles.md`.

## Architecture

- **Next.js 15 (App Router) + TypeScript**, deployable on Vercel's free tier. No database.
- **Storage is the repo itself** via the GitHub Contents API (Octokit). Engagement artifacts
  live as JSON under `data/engagements/<id>/`. Saving commits to the repo; git history is the
  audit trail. This is what keeps the app correct on Vercel's read-only serverless filesystem.
- **AI calls go through one server-side chokepoint** (`lib/tritonai.ts`) with timeout, retry,
  fallback, PII redaction, and decision logging. The API key never reaches the client.

## Configure

These are the app's environment variables. For **local dev**, copy `.env.example` to
`.env.local` and fill them in — `.env*.local` is gitignored, so secrets never get committed.
For **Vercel**, set them as Project environment variables (see Deploy); do not ship a
`.env.local`. The app reads everything from `process.env`, so the same names work in both places.

| Variable | Sensitive? | Notes |
|---|---|---|
| `TRITONAI_API_KEY` | **Yes** | Key from https://tritonai-api.ucsd.edu/ . Server-side only; never reaches the client. |
| `TRITONAI_BASE_URL` | No | Defaults to `https://tritonai-api.ucsd.edu/v1`. |
| `TRITONAI_MODEL` | No | Defaults to `api-gpt-oss-120b`. |
| `AI_TIMEOUT_MS` | No | AI call timeout (default `25000`). |
| `GITHUB_TOKEN` | **Yes** | Fine-grained PAT scoped to this repo, Contents: read/write. |
| `GITHUB_REPO` | No | e.g. `z6johnson/ai-transformation`. |
| `GITHUB_BRANCH` | No | Branch that holds engagement data and receives saves (default `data`). Create it from a branch containing `data/engagements/...` so the seed is visible. |
| `PRACTICE_ACTOR` | No | Identity stamped on saved artifacts and the AI decision log. |

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run typecheck
npm run build
```

## Data layout

```
data/
  _templates/                      the six canonical Layer 1 markdown templates
  engagements/<id>/
    engagement.json                engagement metadata
    01..06 + measures.json         artifact payloads (created as you save)
    _ai-log.jsonl                  append-only AI decision log
  framework/
    roi-definition.json            ROI definition shown on the dashboard
    impact-dimensions.json         the four-dimension scaffold
```

A seeded **HR Performance Appraisal Pilot** engagement is included.

## Deploy (Vercel)

Import the repo, then add the env vars above as **Vercel environment variables** — not a
committed `.env.local`. Mark `TRITONAI_API_KEY` and `GITHUB_TOKEN` as **Sensitive** so they're
encrypted and write-only in the dashboard. AI/storage routes run on the Node runtime (already
configured).

Via the dashboard: Project → Settings → Environment Variables, add each for Production +
Preview (and Development if you use `vercel dev`).

Via the CLI:

```bash
vercel env add TRITONAI_API_KEY production   # paste the secret when prompted; repeat for preview
vercel env add GITHUB_TOKEN production
vercel env add GITHUB_REPO production
vercel env add GITHUB_BRANCH production
vercel env add PRACTICE_ACTOR production
# TRITONAI_BASE_URL / TRITONAI_MODEL / AI_TIMEOUT_MS only if overriding defaults
vercel deploy --prod
```
