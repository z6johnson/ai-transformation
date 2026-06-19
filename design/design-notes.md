# Design Notes — Intentional Deviations

Per `seed-style-guide.md`, this file records intentional deviations from the seed
principles and the reasons for them. Keep it short; a long list signals drift.

## Calibration

- **Dense-tool calibration.** This is a working tool, not a reading-first product,
  so a single sans-serif family is used throughout (style guide §1 permits this for
  "dense tools and dashboards"). Spacing runs tight on an 8px base. The type scale is
  tightened one step from the seed defaults — 14px body (`--font-size-body: 0.875rem`)
  at a 1.5 line-height, with the display/heading/subhead sizes scaled to match —
  benchmarked against dense working UIs so more capture fits on screen. This is the same
  Swiss posture at a denser calibration: still exactly five active type sizes, body
  line-height stays within the style guide's 1.5–1.7 range, all sizes remain in `rem` so
  user zoom and font-size preferences still win, and vertical chrome (page padding,
  inter-section rhythm, header and button heights) is compressed in step while button
  touch targets stay at/above the WCAG 2.2 24px floor.

- **Field-notebook density.** The template editors are field-capture surfaces a
  consultant fills in alongside live interviews, so they are calibrated denser than a
  generic form (same Swiss posture, tighter calibration — style guide §4). Entry-card
  padding and the card-grid gutter drop from 16px to 12px (`--card-pad`,
  `--card-grid-gap`); `.field` becomes a tight label-over-control grid on `--field-gap`
  (8px); and stacked fields inside entry cards carry a hairline ledger rule between them
  (`--field-rule`). Free-standing inputs are capped to a readable measure
  (`--measure-input` 22rem; `--measure-prose` 36rem for prose textareas) so they no
  longer stretch to the 1120px page width — inside grids and entry cards they fill their
  cell as before. Identifiers and short metadata (FR-/INT- ids, status) use a `.t-mono`
  register on the existing `--font-mono` token (no new family or color). All values are
  named tokens on the 8px base; touch targets stay at the WCAG 2.2 floor (the reorder
  controls are pinned to 24×24 CSS px) and the type scale is unchanged.

- **Dot-matrix page texture.** The page surface (`main`) carries a faint achromatic
  dot lattice (`--dot-bg`: a 1px `--gray-200` dot on a 24px grid) to evoke a field
  notebook. This is a deliberate, documented exception to "earn every visual element"
  (§3): it communicates the field-capture register of the tool. It is kept safe by
  construction — `--gray-200` on white is ~1.1:1, purely textural, and it sits only in
  the page gutters because cards keep a solid white fill, so dots never fall behind text
  or form fields and cannot affect contrast. The pattern is static (no motion, so
  `prefers-reduced-motion` has nothing to disable) and is dropped entirely in print so
  reports stay clean.

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
