---
name: CodingHarness Eval Studio
description: Evidence-first eval dashboard for agentic coding frameworks; sidebar, page header, chart above table, run detail as a trace waterfall.
colors:
  background: "#ffffff"
  foreground: "#111318"
  sidebar: "#f8f9fa"
  card: "#ffffff"
  popover: "#ffffff"
  primary: "#2f6fed"
  primary-soft: "#e8effd"
  secondary: "#f2f3f5"
  muted: "#f6f7f9"
  muted-foreground: "#5f6672"
  border: "#e7e9ed"
  input: "#d9dce2"
  success: "#15803d"
  success-bg: "#e8f6ed"
  success-mark: "#22a55b"
  warn: "#a15c07"
  warn-bg: "#fdf5e6"
  warn-mark: "#e0a00f"
  danger: "#c4291f"
  danger-bg: "#fdecec"
  danger-mark: "#e5484d"
  span-setup: "#b7bdc7"
  background-dark: "#0b0c0e"
  foreground-dark: "#ececee"
  sidebar-dark: "#0f1013"
  card-dark: "#111317"
  popover-dark: "#17191e"
  primary-dark: "#5b8def"
  primary-soft-dark: "#18233a"
  secondary-dark: "#1a1c21"
  muted-dark: "#15171b"
  muted-foreground-dark: "#8e949e"
  border-dark: "#23262c"
  input-dark: "#2e3138"
  success-dark: "#6fdc97"
  success-bg-dark: "#13281b"
  success-mark-dark: "#3fbf6e"
  warn-dark: "#f3c164"
  warn-bg-dark: "#2d2210"
  warn-mark-dark: "#e0a00f"
  danger-dark: "#ff9b94"
  danger-bg-dark: "#3a1717"
  danger-mark-dark: "#ef5b55"
  span-setup-dark: "#4a4f58"
typography:
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12.5px"
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  control-x: "12px"
  stack: "16px"
  card: "20px"
  section: "24px"
  page-x: "40px"
components:
  button-primary:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary}"
  button-ghost:
    textColor: "{colors.muted-foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
  meta-chip:
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  preset-pill:
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.full}"
    padding: "0 10px"
    height: "28px"
  preset-pill-on:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
  badge-ok:
    backgroundColor: "{colors.success-bg}"
    textColor: "{colors.success}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  badge-warn:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  badge-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "20px"
  callout-warn:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  select-trigger:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "32px"
  nav-item:
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  nav-item-active:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
---

<!-- Replaces the earlier dark-only GitHub-dark token spec. Tokens are mapped once into
     the :root (light) and .dark CSS-variable blocks in index.css (studio-theming);
     shadcn/ui primitives in components/ui consume them. Re-theming is an edit there
     plus this file, never per-component colour. Unsuffixed colour keys are the light
     theme; `-dark` keys are the same role under .dark. -->

# Design System: CodingHarness Eval Studio

## Overview

**Creative North Star: "The Audited Ledger"**

The Studio is a category-standard eval dashboard built to the craft level of Braintrust, Linear and Vercel: one sidebar, one page header, a chart above a table. Nothing on a page is decorative; every mark is a number, a state, or the way to its evidence. Density is desk-grade (14px body, 32px controls, 13px table text), tuned for long operator sessions on a laptop or large monitor and for screenshots in demos.

Neutrals are cool greys that differ only by lightness. A single blue carries data marks, the primary action's surrounding affordances and focus; green, amber and red speak only for outcomes and run state. Geist sets the interface and Geist Mono sets every machine value. Depth comes from 1px borders and tonal steps between sidebar, canvas and card, not from shadows.

The one exception to the canon is run detail, which is a trace waterfall: trials as traces, setup and build sessions as timed spans drawn from real telemetry, grading as untimed outcome marks. Light and dark are both first-class and chosen by a light / dark / system switch.

**Key Characteristics:**
- Sidebar + page header + chart over table, at 1280px max content width.
- One accent (primary blue) for data marks, focus and selection; semantic colour only for outcomes and run state.
- Geist for UI, Geist Mono with tabular figures for every id, hash, score, $ and duration.
- Flat surfaces: 1px borders, 8px controls, 12px cards, shadows only on floating layers.
- The numbers tell the truth: not-separable callouts, "—" for undefined statistics, "*" on within-run-normalized dimensions.

## Colors

A quiet cool-grey field with one working blue and a reserved traffic-light trio for outcomes.

### Primary
- **Working Blue** (`primary`, dark `primary-dark`): the composite chart dot and its min-max band (band at 25% opacity), the build-session spans in the trace waterfall, slider ranges, the live-run pulse and budget bar, focus rings (`--ring` equals primary) and native checkbox accents. `primary-soft` tints the selected trace row and text selection.

### Neutral
- **Ink** (`foreground`): body text, headings, and the fill of the primary button.
- **Canvas** (`background`) and **Card White / Card Graphite** (`card`): page and container surfaces; in dark the card sits one step lighter than the canvas.
- **Sidebar Grey** (`sidebar`): the sidebar surface, one step off the canvas.
- **Popover** (`popover`): tooltips, select menus; one step above card in dark.
- **Quiet Fill** (`secondary`, `muted`): hover fills, segmented-control selection, evidence `<pre>` blocks, the weights strip (muted at 40%), progress tracks.
- **Muted Ink** (`muted-foreground`): descriptions, table headers, labels, secondary values.
- **Hairline** (`border`) and **Input Edge** (`input`): every 1px border; `input` is the slightly stronger edge for hovered cards, slider thumbs and scrollbars.
- **Setup Grey** (`span-setup`): setup and archive / teardown spans in the trace waterfall, so build sessions (blue) read as the work.

### Semantic (outcome and run state only)
- **Pass Green / Partial Amber / Fail Red** (`success`, `warn`, `danger`): text colour for badges, outcome icons and callout icons; each paired with a tinted `*-bg` surface for badges and callouts.
- **Mark variants** (`success-mark`, `warn-mark`, `danger-mark`): the brighter fills for small graphic marks: per-step outcome ticks in the waterfall, the failed-trial marker, legend swatches.

### Named Rules
**The One Accent Rule.** Primary blue is for data marks, focus and selection. It is never a page decoration, a heading colour or a button fill.

**The Reserved Semantics Rule.** Green, amber and red mean pass, partial and fail, or run state (graded, capped, inconclusive, infra-failed). They never decorate, and they never appear without a shape or a word beside them.

## Typography

**Body Font:** Geist (with ui-sans-serif, system-ui, -apple-system, Segoe UI)
**Label/Mono Font:** Geist Mono (with ui-monospace, SFMono-Regular, Menlo)

**Character:** A single neutral grotesk carries the interface at small sizes with tight negative tracking on headings; the mono is the voice of the machine, so a value is recognisable as data before it is read.

### Hierarchy
- **Headline** (600, 24px, 1.25, -0.02em): the one page title in the page header.
- **Title** (600, 15px, -0.01em): section titles inside a page, with an optional muted aside at 12.5px. Detail-panel headings step to 16px.
- **Body** (400, 14px, 1.5): base text and page descriptions, capped at 72ch.
- **Body small** (500, 13px): buttons, chips, selects, table cells.
- **Label** (500, 12-12.5px, muted): table headers, field labels, legends, sidebar group headers. Sentence case, no tracking, no uppercase.
- **Mono** (Geist Mono, 11-13.5px, tabular figures): run and trial ids, step ids, hashes, scores, percentages, $ amounts, durations, axis ticks. Composite scores take 600 weight; dimension scores sit in muted ink.

### Named Rules
**The Machine Value Rule.** Every id, hash, score, cost, token count, model id and duration is set in Geist Mono with tabular figures. Prose is never mono.

**The One Precision Rule.** Each scoring dimension has one display precision everywhere, via `fmtDim`: code quality whole, the others one decimal. Durations format through `fmtMin`, money through `fmtUsd` (two decimals), run dates through `fmtRunDate`; a missing value prints "—".

## Layout

A fixed 232px sidebar (sticky, full height) on large screens; below `lg` it collapses to a top bar with a horizontally scrolling nav. Main content sits in a centred column with a 1280px maximum, padded 16px / 32px / 40px across breakpoints and 32px top at `lg`.

Each page opens with the page header (title, one-line description, actions right, 24px below), then stacks sections at a 24px gap. Cards pad 20px; card-internal stacks use 16px. The Leaderboard leads with any truth callout, then the composite dot-range chart with its n, then the dimensions table. Run detail places the standings table, then the trace waterfall beside a 340px detail panel at `xl`.

**The Weights at the Foot Rule.** Re-weighting lives as an inline strip at the foot of the standings table card (muted fill, top hairline, presets left and four sliders right), on both the Leaderboard and run detail. It is part of the table it re-ranks, not a side card.

## Elevation & Depth

The system is flat. Depth is conveyed by tonal steps (sidebar, canvas, card, popover) and 1px hairlines. Shadows appear only on layers that float above the page or under a draggable handle.

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 8px 24px rgba(0,0,0,0.12)`): tooltips and select menus.
- **Dialog** (`box-shadow: 0 16px 48px rgba(0,0,0,0.25)`): the run-confirmation dialog, over a 50% black scrim with a 2px backdrop blur.
- **Handle** (`box-shadow: 0 1px 3px rgba(0,0,0,0.15)`): slider thumbs.

### Named Rules
**The Flat-At-Rest Rule.** Cards, tables, callouts and chips carry a border and no shadow. A shadow means "this floats over the page".

## Shapes

Gently rounded and consistent: controls (buttons, chips, selects, badges, nav items, tooltips) at 8px; cards and callouts at 12px; segmented-control inner buttons at 5px inside a 2px-padded 8px frame; pills, dots, bars and progress tracks fully round. Waterfall spans are squared bars with 3px outer ends and a 1px card-coloured seam between adjacent spans; outcome ticks are 3px-wide bars with 1px corners.

## Components

### Buttons
Quiet and decisive; the primary action is ink, not colour.
- **Shape:** 8px radius, 32px tall, 13px medium label, optional 14px lucide icon at a 6px gap.
- **Primary:** foreground fill with background-coloured text (near-black on white in light, near-white on black in dark), 12px horizontal padding. Hover drops to 90% opacity.
- **Secondary:** canvas fill, 1px hairline, ink text; hover fills with `secondary`.
- **Ghost:** muted text, no border; hover fills `secondary` and inks the text.
- **Disabled:** 40% opacity, not-allowed cursor. Focus everywhere is the global 2px primary outline at 2px offset.

### Segmented controls
- Theme (light / dark / system) and the waterfall time axis (Aligned / Wall clock) share one form: an 8px-radius bordered fieldset with 2px padding; the pressed option fills `secondary` with ink text, others are muted. `aria-pressed` carries state.

### Chips and badges
- **Meta chip:** read-only context ("Label value"), 32px tall to sit level with buttons, hairline border, muted label then medium value.
- **Preset pill:** 28px, fully round, hairline; the active preset inverts to ink fill.
- **Badge:** 11.5px medium on a tinted semantic surface (`ok`, `warn`, `danger`), plus `default` (quiet fill) and `outline`. Badges always carry a word.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** `card`.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px hairline.
- **Internal Padding:** 20px; table cards pad the title row 20px and let the table run edge to edge.

### Tables
- 40px header row in 12.5px muted medium; cells 12px horizontal, 10px vertical; 1px row dividers; hover tints `muted` at 70%. Numeric columns right-align in mono. Scoring headers carry an info tooltip.

### Inputs / Fields
- **Select:** 32px, canvas fill, 1px hairline, 8px radius, muted chevron; hover fills `secondary`; focus shows a 2px ring in primary. Menus are popovers with the overlay shadow.
- **Slider:** 4px fully round track in `secondary`, primary range, 16px canvas thumb with an `input` edge that turns primary on hover.
- **Checkbox:** native, 16px, accent-coloured with primary.

### Navigation
- Sidebar items: 13.5px medium muted text with a 16px icon, 8px radius, 6px / 10px padding; hover fills `secondary`. The current page lifts to `card` fill with a 1px hairline ring and ink text, and carries `aria-current="page"`. Groups ("Analysis") take a muted 11.5px sentence-case header.
- The foot of the sidebar holds the live-run card (pulsing primary dot, stage, mono cost so far, done/total trials, 4px primary budget bar) and the theme switch.

### Callout
- The truth surface: `warn-bg` (or `danger-bg`) fill, a 25% semantic border, 12px radius, a 16px triangle-alert icon in the semantic colour, a bold title sentence followed by the explanation. Used for "Top two not separable", "One trial per framework", "Ordering inconclusive" and comparability caveats.

### Composite chart
- One row per entrant: label column, a 36px track with a hairline grid at quarters, a 6px primary band (25%) over the min-max range and a 12px primary dot ringed in card colour at the score, mono value right. A mono 0-25-50-75-100 axis sits below.

### Trace waterfall (signature)
- Run detail draws trials as traces on a shared time axis. Timed spans come from telemetry: setup (`span-setup`), each build session (primary), archive & teardown (`span-setup`). Grading is untimed and shows as per-step outcome marks (3px semantic `*-mark` ticks) in a "Graded" column with the mono score. A failed trial with no spans shows a single `danger-mark` tick.
- A legend and an Aligned / Wall clock segmented control head the card. Aligned starts every trace at zero; Wall clock offsets each by its real start. Ticks are mono at nice minute steps.
- Rows expand with a chevron; selecting a trial, span or step tints the row `primary-soft` or rings the span in primary, and fills the detail panel: trial summary, span telemetry and prompt, or step evidence with "Same step in other trials".

### Evidence
- A native disclosure: muted chevron and a 90-character preview that inks on hover; opens to a mono 12px `<pre>` on `muted` fill at 8px radius.

### Outcome icon
- Pass is a check in `success`, fail an X in `danger`, partial a half-filled circle in `warn`; each carries an aria-label, so outcome is never colour alone.

## Do's and Don'ts

### Do:
- **Do** make the primary button foreground-on-background (ink fill, canvas text), 32px tall, 8px radius.
- **Do** reserve primary blue for data marks, selection and the 2px focus outline.
- **Do** set every machine value in Geist Mono with tabular figures, formatted through `fmtDim`, `fmtMin`, `fmtUsd` or `fmtRunDate`.
- **Do** show the not-separable / single-trial callout above any ranking that overlaps or rests on n=1, and print the chart's n.
- **Do** print "—" for σ when fewer than two trials are counted, and for any missing value.
- **Do** mark within-run-normalized dimensions with "*" (Speed*, Token spend*) and say they do not compare across runs.
- **Do** pair every semantic colour with a shape or a word (outcome icon, badge text, callout title).
- **Do** keep re-weighting as the inline strip at the foot of the standings table.
- **Do** define colour once in the `:root` / `.dark` blocks of index.css and reach it through tokens.

### Don't:
- **Don't** fill buttons, headings or backgrounds with the accent.
- **Don't** use green, amber or red for anything but outcomes and run state.
- **Don't** put shadows on cards, tables, chips or callouts; shadows are for overlays, the dialog and slider thumbs.
- **Don't** set prose, labels or headings in mono, or machine values in Geist.
- **Don't** add uppercase tracked kickers or eyebrows above titles; labels are sentence case.
- **Don't** present an inconclusive or single-trial order as a win.
- **Don't** hard-code hex colours in components.
