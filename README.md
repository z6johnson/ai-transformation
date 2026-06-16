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

Copy `.env.example` to `.env.local` and fill in:

- `TRITONAI_API_KEY` — your key from https://tritonai-api.ucsd.edu/ (server-side only).
- `GITHUB_TOKEN` — fine-grained PAT scoped to this repo, Contents: read/write.
- `GITHUB_REPO` — e.g. `z6johnson/ai-transformation`.
- `GITHUB_BRANCH` — the branch that holds engagement data and receives saves (default `data`).
  Create it from a branch that contains `data/engagements/...` so the seed is visible.

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

Import the repo, set the env vars above in Project Settings (Production + Preview), deploy.
AI/storage routes run on the Node runtime (already configured).
