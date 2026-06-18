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

## Form & motion

- **Minimal corner radius.** Bounded surfaces (cards, controls, inputs, chips, banners,
  nav items) carry a 3px radius via `--radius`. Style guide §89 permits radius "minimal or
  zero"; this is the minimal end, chosen to soften the interface slightly without reading
  as a different identity. Circular markers (the stage-stepper number) keep `50%`.

- **Restrained hover micro-interactions.** Interactive surfaces (cards in grids, header
  nav, template/artifact nav, the stage stepper, buttons) ease on hover/active rather than
  snapping. Feedback is achromatic — border-color and background shifts only — and routed
  through the existing `--motion-*` / `--easing` tokens, so `prefers-reduced-motion`
  zeroes it automatically. No decorative shadows and no layout movement are introduced:
  per style guide §91, shadows remain reserved for genuine elevation (e.g. a modal), and
  motion "confirms, does not perform."
