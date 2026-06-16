# Accessibility Statement

## Conformance target

This workspace targets **WCAG 2.1 Level AA** as a binding minimum, working toward
**WCAG 2.2 AA**. This is the operative legal standard under the ADA (DOJ Title II rule,
2024) and the institutional baseline for UC work. Accessibility is the floor that
constrains every visual and interaction decision (see `seed-style-guide.md` §0).

## What is in place

- Semantic HTML first; interactive elements are `<button>`/`<a>` with visible focus
  rings (≥2px, ≥3:1 contrast) and accessible names.
- Color is never the sole carrier of meaning. Status and AI-provenance always pair an
  accent with a text label and/or weight. All grayscale text/UI pairings meet 4.5:1
  (normal text) or 3:1 (large text / UI components).
- `<html lang="en">` is set so assistive tech pronounces content correctly.
- `prefers-reduced-motion` is honored (motion tokens collapse to 0ms); no content
  flashes more than three times per second; no auto-updating content without control.
- Programmatic status (e.g. "9 of 12 suggestions confirmed") is announced via
  `aria-live` regions.
- AI suggestions present the exact source words and require explicit human confirmation;
  nothing is committed on color or hover alone.

## Known limitations

- Automated tooling (axe/Pa11y/Lighthouse) catches roughly a third of real issues; the
  remainder requires manual review. Manual keyboard and screen-reader passes are tracked
  per substantive UI change and noted in PRs.
- This is a beta; not every view has had a full manual audit. Gaps are logged as issues.

## Audit

- Last reviewed: see the most recent commit touching this file.
- Standard in force: WCAG 2.1 AA (target 2.2 AA).

## Contact

Report accessibility issues to the practice owner: z6johnson@ucsd.edu.
