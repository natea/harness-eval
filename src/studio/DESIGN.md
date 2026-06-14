---
version: "1.0"
name: Eval-Studio
description: >
  Dark, technical, evidence-forward dashboard theme for harness-eval's Eval
  Studio — matched to codingharness.xyz and the existing results dashboard
  (GitHub-dark lineage). Near-black canvas (#0d1117), charcoal surfaces with
  hairline borders, light gray ink, and a single blue accent (#2f81f7) used for
  primary actions, focus rings, and data bars — never decoratively. Semantic
  status colors (success/warn/danger) appear only as small badges. Type is the
  system sans for UI and a monospace for ids, hashes, costs, and code. The feel
  is dense software-craft documentation: quiet, precise, low-chroma.
---

# Eval Studio — Design Tokens

This file is the **source of truth** for the studio's theme. Task 1.3 maps these
tokens once into `tailwind.config` + the `:root`/`.dark` CSS-variable block that
shadcn/ui components consume. It is **pure specification** — it introduces no
component implementation; shadcn/ui remains the only component source. Re-theming
is an edit here + a re-map, never per-component CSS.

## colors

Semantic tokens (hex). The studio is dark-only; the same values fill `:root` and
`.dark`.

```yaml
# surfaces (back-to-front)
canvas:        "#0d1117"   # app background
surface-1:     "#161b22"   # cards, panels, table row hover
surface-2:     "#1c2128"   # popovers, tooltips, dialogs, elevated overlays
surface-3:     "#21262d"   # subtle fills, secondary buttons

# borders
border:        "#21262d"   # hairline (table rows, card edges)
border-strong: "#30363d"   # inputs, focused dividers

# ink (text)
ink:           "#e6edf3"   # primary text
ink-muted:     "#8b949e"   # secondary text, column headers, captions
ink-on-accent: "#ffffff"   # text on the blue accent

# accent (the single chromatic color)
primary:       "#2f81f7"   # primary buttons, data bars, focus ring
primary-hover: "#58a6ff"   # links, hover state of the accent

# semantic status (badges only — bg + text pairs)
success:       "#9bffb0"
success-bg:    "#1d4a2a"
warn:          "#f0c674"
warn-bg:       "#5a3e00"
danger:        "#ff9b9b"
danger-bg:     "#4a1d1d"
```

## typography

```yaml
fontFamily:
  sans: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace"   # ids, hashes, $cost
baseSize: 14px
lineHeight: 1.5
scale:
  display: { size: 20px, weight: 700, tracking: -0.01em }   # h1 / page title
  heading: { size: 16px, weight: 600 }                      # h2 / section
  subhead: { size: 14px, weight: 600 }                      # h3 / card title
  body:    { size: 14px, weight: 400 }
  small:   { size: 12px, weight: 400 }                       # captions, badges
  label:   { size: 12px, weight: 600, transform: uppercase, tracking: 0.02em }   # table column headers
  mono:    { size: 12px, weight: 400, family: mono }
```

## spacing

```yaml
unit: 4px        # 1 = 4px; scale: 1,2,3,4,6,8,12 → 4,8,12,16,24,32,48px
container: 1100px # max content width (matches the current dashboard/main)
gutter: 24px      # page padding
```

## radius

```yaml
base: 8px      # cards, panels, buttons (shadcn --radius)
sm: 6px        # inputs, code blocks
pill: 10px     # badges
lg: 12px       # large cards / dialogs
```

## shadows

```yaml
overlay: "0 4px 14px rgba(0,0,0,0.5)"   # tooltips, popovers, dialogs
```

## shadcn variable mapping

The single mapping task 1.3 applies (light/dark identical — dark-only app). Left
= shadcn CSS variable, right = token above.

```yaml
--background:            canvas
--foreground:            ink
--card:                  surface-1
--card-foreground:       ink
--popover:               surface-2
--popover-foreground:    ink
--primary:               primary
--primary-foreground:    ink-on-accent
--secondary:             surface-3
--secondary-foreground:  ink
--muted:                 surface-1
--muted-foreground:      ink-muted
--accent:                surface-2
--accent-foreground:     ink
--destructive:           danger-bg
--destructive-foreground: danger
--border:                border
--input:                 border-strong
--ring:                  primary
--radius:                radius.base   # 0.5rem
```

## usage rules

- The blue accent (`primary`) is for **one** thing per view: the primary action,
  the focus ring, or the data bar — not for decoration.
- Status colors are **badges only** (capped/infra-failed/ok, cross-vendor judge,
  cost-basis caveats). Never color whole rows.
- Monospace for every machine value: run/trial ids, SHA-256 hashes, `$` costs,
  token counts, model ids.
- Keep chroma low; surfaces differ by lightness, not hue. Borders are hairlines.
