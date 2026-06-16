# Design Notes — Intentional Deviations

Per `seed-style-guide.md`, this file records intentional deviations from the seed
principles and the reasons for them. Keep it short; a long list signals drift.

## Calibration

- **Dense-tool calibration.** This is a working tool, not a reading-first product,
  so a single sans-serif family is used throughout (style guide §1 permits this for
  "dense tools and dashboards"). Spacing runs tight on an 8px base.

## Accepted architectural trade-offs

- **Storage is the GitHub Contents API, not a database.** The repo is the system of
  record for engagement artifacts. Reads and writes go through Octokit from server
  routes. Known ceiling: the Contents API is rate-limited (~5k req/hr authenticated)
  and not transactional across multiple files. This is comfortably fine at v1 scale
  (a handful of engagements, single-digit concurrent editors). Git history is the
  audit trail the Responsible-AI rules require.

- **Metrics are authored, not telemetric.** The executive dashboard reads curated
  values from `measures.json`, re-baselined quarterly. This is deliberate and honest:
  the practice measures on a quarterly cadence, not in real time. No live telemetry is
  implied or shown.

## Color

- The palette is achromatic. Four muted status accents (attention, positive, negative,
  AI-provenance) are the only color. Each is paired with text and/or weight so color is
  never the sole carrier of meaning (style guide §0, §2). The AI-provenance accent
  (`--status-ai`) marks AI-originated content and is always accompanied by a text label.
