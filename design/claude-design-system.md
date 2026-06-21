# AI Transformation — Design System Reference (for Claude Design)

A complete reference to the **live global CSS** that runs on `main` / production.
Feed this file to **Claude Design** to recreate or extend the interface so new
screens match the existing system exactly.

- **Stack:** Next.js (React), vanilla CSS custom properties — **no Tailwind**, no CSS-in-JS.
- **Source of truth:** `design/tokens.css` (tokens) + `app/globals.css` (component patterns).
- **Style:** International Typographic Style (Swiss modern) at a dense **field-notebook** calibration.
- **Accessibility:** WCAG 2.1 AA minimum, 2.2 AA target. This is the floor, not a layer.

---

## 1. Design DNA (read first)

Five non-negotiable principles. Hold these in any generated screen:

1. **Typography carries the hierarchy** — size, weight, case, and tracking create structure. Not colored boxes, not icons, not containers.
2. **Achromatic by default** — an 11-step grayscale is the whole palette. Color appears *only* as semantic status, and **never alone** (always paired with text and/or weight).
3. **Earn every element** — whitespace separates first; add a border/line/fill only when spacing alone is ambiguous.
4. **Snap to an 8px grid** — all spacing and layout derive from one base. No magic numbers.
5. **Restraint** — 3px radius, two border weights, motion that confirms rather than performs. Light mode only (no dark mode yet).

Calibration note: this is a *working tool*, not a reading product — 14px body, tight padding, capped input widths. Same Swiss posture, denser numbers.

---

## 2. Color

### 2.1 Grayscale ramp (foundation — 11 steps)

| Token | Hex | Role / contrast |
|---|---|---|
| `--gray-0` | `#ffffff` | Page background / surfaces |
| `--gray-50` | `#f7f7f7` | Subtle background (footer) |
| `--gray-100` | `#ededed` | Sunken / hover fill |
| `--gray-200` | `#d9d9d9` | Hairline borders, dot texture |
| `--gray-300` | `#bdbdbd` | — |
| `--gray-400` | `#949494` | Strong borders, input borders (~3:1) |
| `--gray-500` | `#707070` | Tertiary text (~4.6:1 — smallest passing body) |
| `--gray-600` | `#595959` | Secondary text (~7:1) |
| `--gray-700` | `#404040` | Primary-button hover |
| `--gray-800` | `#262626` | — |
| `--gray-900` | `#111111` | **Primary ink** (text, focus ring, accents) |

### 2.2 Semantic aliases (use these names in components, not raw grays)

| Token | Value | Role |
|---|---|---|
| `--color-bg` | `--gray-0` `#ffffff` | Main background, card fill |
| `--color-bg-subtle` | `--gray-50` `#f7f7f7` | Footer / grouped wash |
| `--color-bg-sunken` | `--gray-100` `#ededed` | Hover / active fill |
| `--color-ink` | `--gray-900` `#111111` | Primary text |
| `--color-ink-muted` | `--gray-600` `#595959` | Secondary text |
| `--color-ink-faint` | `--gray-500` `#707070` | Tertiary text |
| `--color-border-hairline` | `--gray-200` `#d9d9d9` | Subtle structure |
| `--color-border-strong` | `--gray-400` `#949494` | Emphasized lines, input borders |
| `--color-ink-inverse` | `--gray-0` `#ffffff` | Text on dark |
| `--color-surface-inverse` | `--gray-900` `#111111` | Dark surface |

### 2.3 Status accents — the *only* color in the system

Muted, AA-contrasting, and **always paired with a text label and/or weight**.

| Token | Hex | Meaning | Paired background |
|---|---|---|---|
| `--status-attention` | `#8a5a00` (amber-brown, ~4.8:1) | Warnings / notices | `--status-attention-bg` `#fbf3e2` |
| `--status-positive` | `#1f6b3b` (green, ~5.1:1) | Success / delta-up | — |
| `--status-negative` | `#9a1f1f` (red, ~6.2:1) | Error / risk / delta-down | — |
| `--status-ai` | `#3a3a7a` (indigo, ~8:1) | **AI-provenance marker** | `--status-ai-bg` `#eeeef6` |

> **Rule for generated UI:** if you introduce a colored state, also specify its
> non-color signal (label / weight / icon). The indigo `--status-ai` tags
> AI-generated content and is **always** accompanied by a visible "AI" label.

### 2.4 Focus

High-contrast keyboard ring on `:focus-visible` for every interactive element:
`--focus-ring: #111111`, `--focus-ring-width: 2px`, `--focus-ring-offset: 2px`
(solid outline). Never remove it.

---

## 3. Typography

**One family, system stack** (no webfonts — neutral posture):

```css
--font-sans: "Helvetica Neue", Helvetica, Arial, "Liberation Sans", system-ui, sans-serif;
--font-mono: ui-monospace, "SF Mono", "Liberation Mono", Menlo, monospace; /* ids/metadata, tabular numerals */
```

**Exactly 5 sizes** (all `rem` so user zoom wins — never add a 6th):

| Token | Size | Use |
|---|---|---|
| `--font-size-display` | 1.75rem / 28px | Page titles |
| `--font-size-heading` | 1.125rem / 18px | Section heads |
| `--font-size-subhead` | 0.9375rem / 15px | Subsection labels |
| `--font-size-body` | 0.875rem / 14px | Body prose (dense calibration) |
| `--font-size-system` | 0.75rem / 12px | Labels, metadata (UPPERCASE, tracked) |

**Line height:** `--line-height-tight: 1.2` (display/heading), `--line-height-body: 1.5`.
**Tracking:** `--tracking-system: 0.08em`, `--tracking-display: -0.01em`.
**Weights:** `--weight-regular: 400`, `--weight-medium: 500`, `--weight-bold: 700`.

**Three named registers** (your text styles):

- `.t-display` — 28px, bold, tight, negative tracking → primary signal.
- `.t-heading` — 18px bold · `.t-subhead` — 15px medium.
- `.t-system` — **12px, bold, UPPERCASE, 0.08em tracking, muted** → the "system voice" for all labels, metadata, and table headers. The workhorse register.
- Modifiers: `.t-muted` (#595959), `.t-faint` (#707070), `.t-mono` (tabular figures for IDs like FR-/INT-).

---

## 4. Spacing & layout (8px base)

**Spacing scale** `--space-1 … 8`: **4, 8, 12, 16, 24, 32, 48, 64 px**. Every margin/gap/padding references these.

**Layout tokens:**

| Token | Value |
|---|---|
| `--layout-max-width` | 1120px |
| `--layout-page-padding` | 24px (`--space-5`) |
| `--header-height` | 48px |
| `--footer-height` | 36px |
| `--radius` | 3px (minimal; circular markers stay 50%) |
| `--border-hairline` / `--border-strong` | 1px / 2px |

**Field-tool density tokens** (what makes it feel like a notebook, not a marketing site):

| Token | Value | Use |
|---|---|---|
| `--card-pad` | 12px | Card padding (tighter than 16px) |
| `--card-grid-gap` | 12px | Gap between entry cards |
| `--field-gap` | 8px | Label → control gap |
| `--measure-input` | 22rem | Cap for free-standing inputs |
| `--measure-prose` | 36rem | Cap for prose textareas |
| `--field-rule` | hairline | Ledger line between stacked fields in cards |

Free-standing inputs are **capped** so they don't stretch to 1120px; inside grids/cards they fill their cell.

**Breakpoint: 720px.** Above it, `.grid--2/3/4` form columns; below it, card grids collapse to a single column.

**Page texture:** `main` carries a faint dot lattice (`--dot-bg`: 1px `#d9d9d9` dot on a 24px grid) — purely textural (~1.1:1), only in gutters behind solid-white cards, dropped in print.

---

## 5. Motion

| Token | Value |
|---|---|
| `--motion-fast` | 120ms (hover/micro) |
| `--motion-base` | 200ms (standard) |
| `--motion-layout` | 300ms (layout shifts) |
| `--easing` | `cubic-bezier(0.2, 0, 0, 1)` (ease-out) |

Hover feedback is **achromatic only** — border-color/background shifts, no scale/shadow/movement.
`@media (prefers-reduced-motion: reduce)` zeros all three durations automatically.

---

## 6. Component catalog

Build these as reusable components; all are composed from the tokens above.

- **Shell** — flex column, full height. **Header** 48px with a **2px solid black bottom border** (the one heavy structural line); brand left, nav right (muted links → ink on hover). **Footer** subtle-gray, 12px system text.
- **Card** `.card` — 1px hairline border, 3px radius, 12px padding, white fill. Variant `.card--accent` / `.entry-card`: **2px black left edge** signals priority/category.
- **Layout helpers** — `.stack` / `.stack-lg` (vertical rhythm 12/24px), `.row` (+`--between` / `--baseline` / `--end` / `--wrap`), `.grid` (+`--2` / `--3` / `--4`).
- **Buttons** `.btn` — 32px min-height, 1px ink border, 3px radius. `--primary` = filled `#111` / white text (hover → `#404040`). `--text` = borderless underlined. Disabled = 50% opacity. Reorder micro-controls pinned to 24×24px (WCAG floor).
- **Forms** `.field` — label-over-control grid (8px gap). Inputs full-width, 1px `#949494` border, 8px padding. Field labels soften to 13px medium sentence-case (not the uppercase system register). Textareas vertical-resize, 36rem cap; tight inside cards (max 9rem, no resize).
- **Tables** — full-width, collapsed borders, hairline row rules, **system-register uppercase `th`**.
- **Status components** — `.ai-mark` / `.ai-banner` (indigo on lavender, bordered — AI provenance), `.notice` (amber), `.tag-chip` (bordered uppercase chip), `.delta-up` / `.delta-down` (green/red).
- **Navigation** — `.breadcrumb` (system register), `.artifact-nav` & `.template-nav` (bordered hover rows, `.is-active` state), and `.stage-steps` **stepper** with done/current/todo/viewing states (filled circle = done, bold = current, 50% opacity = todo).
- **Card grid** `.card-grid` (sortable, `--cols` variable) — drag states `.is-dragging` (50% opacity) / `.is-over` (ink border), grab handle, column toggle.
- **A11y / print** — `.visually-hidden` for screen-reader text; print styles hide nav/breadcrumbs/steppers, drop the dot texture, force clean black-bordered cards.

---

## 7. Using this with Claude Design

When prompting **Claude Design** to generate or extend a screen, paste the brief
below verbatim, then describe the specific screen you want. It encodes the rules
that keep output on-system.

### 7.1 Paste-ready system brief

> Design in the **International Typographic Style** (Swiss modern) at a dense
> "field-notebook" calibration. Light mode only. Rules:
> - **Typography carries all hierarchy** — one sans-serif family (Helvetica Neue / system sans). Exactly five sizes: 28 / 18 / 15 / 14 / 12px. Body is 14px at 1.5 line-height. The 12px size is bold, UPPERCASE, 0.08em letter-spacing, gray `#595959` — use it for all labels, metadata, and table headers.
> - **Achromatic palette.** Background `#ffffff`; text `#111111` (primary), `#595959` (secondary), `#707070` (tertiary). Borders: hairline `#d9d9d9`, strong `#949494`. Use the 11-step grayscale `#ffffff #f7f7f7 #ededed #d9d9d9 #bdbdbd #949494 #707070 #595959 #404040 #262626 #111111`.
> - **Color is semantic only and never alone** (always with a text label/weight): attention `#8a5a00` on `#fbf3e2`; positive `#1f6b3b`; negative `#9a1f1f`; AI-provenance `#3a3a7a` on `#eeeef6` (always with an "AI" label).
> - **8px spacing grid:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px. Max content width 1120px, page padding 24px.
> - **Restraint:** 3px corner radius, only 1px and 2px border weights, no decorative shadows/gradients/icons. A 2px black left-edge on a card signals priority. Header has a single 2px black bottom border.
> - **Controls are typography:** primary button = filled `#111` with white text; secondary = 1px outline; tertiary = underlined text. 2px solid `#111` focus ring with 2px offset on every interactive element. Touch targets ≥ 24×24px.
> - **Motion confirms, never performs:** 120–300ms ease-out, achromatic hover (border/background only), honor reduced-motion.
> - **Accessibility is the floor:** WCAG 2.1 AA minimum. Semantic HTML, visible focus, labelled forms, DOM order = visual order.

### 7.2 Token block (drop into a generated stylesheet)

```css
:root {
  /* grayscale */
  --gray-0:#fff; --gray-50:#f7f7f7; --gray-100:#ededed; --gray-200:#d9d9d9;
  --gray-300:#bdbdbd; --gray-400:#949494; --gray-500:#707070; --gray-600:#595959;
  --gray-700:#404040; --gray-800:#262626; --gray-900:#111;
  /* semantic */
  --color-bg:var(--gray-0); --color-bg-subtle:var(--gray-50); --color-bg-sunken:var(--gray-100);
  --color-ink:var(--gray-900); --color-ink-muted:var(--gray-600); --color-ink-faint:var(--gray-500);
  --color-border-hairline:var(--gray-200); --color-border-strong:var(--gray-400);
  --color-ink-inverse:var(--gray-0); --color-surface-inverse:var(--gray-900);
  /* status */
  --status-attention:#8a5a00; --status-attention-bg:#fbf3e2;
  --status-positive:#1f6b3b; --status-negative:#9a1f1f;
  --status-ai:#3a3a7a; --status-ai-bg:#eeeef6;
  /* focus */
  --focus-ring:var(--gray-900); --focus-ring-width:2px; --focus-ring-offset:2px;
  /* type */
  --font-sans:"Helvetica Neue",Helvetica,Arial,"Liberation Sans",system-ui,sans-serif;
  --font-mono:ui-monospace,"SF Mono","Liberation Mono",Menlo,monospace;
  --font-size-display:1.75rem; --font-size-heading:1.125rem; --font-size-subhead:.9375rem;
  --font-size-body:.875rem; --font-size-system:.75rem;
  --line-height-tight:1.2; --line-height-body:1.5;
  --tracking-system:.08em; --tracking-display:-.01em;
  --weight-regular:400; --weight-medium:500; --weight-bold:700;
  /* spacing */
  --space-1:.25rem; --space-2:.5rem; --space-3:.75rem; --space-4:1rem;
  --space-5:1.5rem; --space-6:2rem; --space-7:3rem; --space-8:4rem;
  /* layout */
  --layout-max-width:1120px; --layout-page-padding:var(--space-5);
  --header-height:3rem; --footer-height:2.25rem;
  --border-hairline:1px; --border-strong:2px; --radius:3px;
  /* density */
  --measure-input:22rem; --measure-prose:36rem; --field-gap:var(--space-2);
  --card-pad:var(--space-3); --card-grid-gap:var(--space-3); --field-rule:var(--color-border-hairline);
  /* motion */
  --motion-fast:120ms; --motion-base:200ms; --motion-layout:300ms;
  --easing:cubic-bezier(.2,0,0,1);
}
@media (prefers-reduced-motion: reduce){
  :root{ --motion-fast:0ms; --motion-base:0ms; --motion-layout:0ms; }
}
```

### 7.3 When importing a Claude-generated design back into the app

- Map generated styles onto the **existing token names** above — do not introduce
  new raw hex values or a sixth type size. If a design seems to need one, the
  hierarchy is wrong, not the scale.
- Any AI-generated content surfaced in the UI must carry the `--status-ai` mark
  **with a visible "AI" label** (provenance is a hard rule here).
- Strip default ornamentation (shadows, gradients, large radii) from imported
  components before integrating — keep 3px radius and the two border weights.

---

*This reference reflects the current `design/tokens.css` and `app/globals.css`
on `main`. If those files change, regenerate this document so the two stay in sync.*
