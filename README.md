# AI Transformation Practice — Workspace & Dashboard

A free, serverless beta for UC San Diego's AI Transformation Practice (OSI). Two surfaces:

1. **AI-assisted Layer 1 mapping** — work the six lifecycle-mapping templates with help from
   the TritonAI Developer API (on-prem `api-gemma-4-31b` by default): tag interview notes,
   draft journey maps and friction entries, cluster friction. AI acts as a trusted assistant:
   it applies confident output by default (marked `AI-applied`), flags only the low-confidence
   cases for a human call, and every item stays editable and removable. AI involvement is always
   visibly marked and logged; humans review and override rather than approving item-by-item.
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
| `TRITONAI_MODEL` | No | Defaults to `api-gemma-4-31b`. The fallback for the tier vars below. |
| `TRITONAI_MODEL_FAST` | No | Tagging. Falls back to `TRITONAI_MODEL`. |
| `TRITONAI_MODEL_REASONING` | No | Drafting (journey/blueprint/process/friction), friction clustering, the briefing, and model-to-map. Falls back to `TRITONAI_MODEL`. |
| `TRITONAI_MODEL_SYNTHESIS` | No | Baseline library synthesis only. Falls back to `TRITONAI_MODEL_REASONING`. Leave unset unless the library outgrows that model's context window. |
| `AI_TIMEOUT_MS` | No | Per-attempt timeout for the **tagging** call (default `25000`). Up to 3 attempts, with the total clamped to 55s so the retries can't outlive the request. |
| `AI_TIMEOUT_MS_REASONING` | No | Per-attempt timeout for every **reasoning-tier** call — drafting, friction clustering, gap analysis, the briefing, model-to-map, and baseline synthesis (default `50000`, one attempt, sized to fit the routes' 60s `maxDuration`). These send whole transcripts or the whole library and run for tens of seconds; at the tagging-sized `AI_TIMEOUT_MS` every attempt times out. Raise this, not `AI_TIMEOUT_MS`, if drafts time out. |
| `AI_TIMEOUT_MS_SYNTHESIS` | No | Overrides `AI_TIMEOUT_MS_REASONING` for baseline synthesis alone, the one call that reads the whole library in a single shot. |
| `GITHUB_TOKEN` | **Yes** | Fine-grained PAT scoped to this repo, Contents: read/write. |
| `GITHUB_REPO` | No | e.g. `z6johnson/ai-transformation`. |
| `GITHUB_BRANCH` | No | Branch that holds engagement data and receives saves (default `data`). Create it from a branch containing `data/engagements/...` so the seed is visible. |
| `PRACTICE_ACTOR` | No | Identity stamped on saved artifacts and the AI decision log. |

### Choosing models

Pick each tier by what the workload can use, not by what is best overall. Models come from the
[TritonAI model hub](https://tritonai-api.ucsd.edu/ui/model_hub_table/); `api-*` models are
campus-hosted and roughly an order of magnitude cheaper than the cloud models.

- **Fast (tagging)** — `api-gemma-4-31b`. Tagging classifies verbatim spans into a fixed
  seven-value enum, runs while a human waits, and every suggestion is confirmed by that human.
  A frontier model returns the same enum more slowly. Non-reasoning matters here: no thinking
  tokens on the app's only interactive model call.
- **Reasoning (drafting, clustering, briefing, model-to-map)** — `claude-sonnet-5`. This is the
  tier the app **auto-applies** (marked `AI-applied`) instead of having a human approve each
  item, so it is the one place where capability converts directly into trust. Sonnet over Opus:
  same 128K output, $3/$15 against $5/$25, and the gap on structured JSON drafting does not
  justify the difference. Note `claude-sonnet-5` supersedes `claude-sonnet-4-6` at identical
  pricing with double the max output.
- **Synthesis** — unset, so it follows the reasoning tier. Baseline synthesis is grounded
  descriptive summarization and the client confirms every section before saving, so it needs no
  more model than drafting. It has its own knob only because it is the single call that reads
  the whole library in one shot; set it if that stops fitting.
- **Embeddings** — `api-tgpt-embeddings`, the only embedding model in the hub. Unset is a
  supported mode, not a failure: retrieval falls back to lexical.

`GET /api/ai/health` reports which model each tier currently resolves to, plus the timeouts. Use
it after changing any of these — Vercel cannot show you the value of a variable marked
**Sensitive**, so this is the only way to confirm what production is actually running.

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

Two seeded DEMO engagements are included, sitting at different stages so the stepper and
dashboard show more than one state:

- **HR Performance Appraisal (SPA)** — `hr-performance-appraisal`, a finished single-unit map
  at the `implementation` stage, validation packet signed off.
- **Athletics Fan & Revenue Lifecycle** — `athletics-fan-revenue-lifecycle`, a cross-unit map
  at the `mapping` stage; artifacts 01–05 confirmed, validation packet in review with one
  decision still contested, so nothing is signed off.

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
