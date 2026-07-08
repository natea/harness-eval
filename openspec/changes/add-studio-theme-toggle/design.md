# Design: Studio Light/Dark Theme Toggle

## Context

`src/studio/index.css` defines the theme tokens once, under `:root`, with the dark
values inline and `color-scheme: dark`. shadcn/ui components reference those tokens
via Tailwind's semantic classes (`bg-background`, `text-foreground`, `text-muted-
foreground`, `border-border`, `text-success/warn/danger`, …), so swapping the token
values reskins the whole app with zero component edits. The frontend is plain
Bun + React (`frontend.tsx` owns the `Nav`); there is no `next-themes`.

## Decisions

### 1. Two palettes via a class, not a rebuild

Move the existing dark values into a `.dark { … }` block and author a **light**
palette under `:root`. The active theme is selected by toggling the `dark` class on
`document.documentElement`. `color-scheme` is set per-theme (`light`/`dark`) so
native form controls, scrollbars, and `prefers-color-scheme`-aware bits follow.
This is the canonical shadcn variable-swap approach.

### 2. Three modes, persisted, system-default

The toggle cycles `light → dark → system`. The choice is stored in `localStorage`
(`studio-theme`). `system` follows `prefers-color-scheme` live (via a
`matchMedia('(prefers-color-scheme: dark)')` listener) so the app tracks OS changes
without a reload. Default (no stored value) is `system`, which preserves today's
dark look for anyone whose OS is dark.

### 3. No flash of the wrong theme (FOUC)

The theme class is applied **before first paint** — an init that reads
`localStorage`/`matchMedia` and sets the `dark` class on the root element before
React renders (top of `frontend.tsx`, or an inline head script in `index.html`).
Without this, the page paints the default theme then snaps to the stored one.

### 4. The hard part is the light palette, not the toggle

The toggle is ~15 lines. The real work is choosing **good light values** for every
token — not inverting dark. Semantic tokens (`success`/`warn`/`danger`) and the
green/red marginal-gain deltas on the inverse-scaling view must keep adequate
contrast and meaning on a light background; the muted/border tones must stay subtle
without disappearing. The light palette is authored and visually checked against
the busiest views (leaderboard, inverse-scaling, trial transcript).

## Risks / trade-offs

- **Light-palette contrast** — the inverse-scaling deltas and warn/danger badges are
  tuned for dark; they get re-tuned for light, verified on the actual views.
- **FOUC if init is missed** — mitigated by applying the class pre-paint; the spec
  requires it.
- **System-mode liveness** — handled by the `matchMedia` listener so OS theme
  changes apply without reload.
