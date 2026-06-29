# Add: Studio Light/Dark Theme Toggle

## Why

The eval studio is **dark-only**. `src/studio/index.css` puts the dark values
directly under `:root` ("Dark-only app: :root holds the values") with
`color-scheme: dark`, and there is no light palette, no `.dark` class, and no
theme library. That's fine at a desk, but it's a problem on a projector, in a
bright room, for a screenshot on light slides, or for anyone who simply prefers
light mode — exactly the contexts where the studio gets shown off.

The components are already theme-ready: every shadcn/ui component consumes CSS
variables (`--background`, `--foreground`, `--muted`, `--primary`,
`--success/--warn/--danger`, …). There's just only one palette to consume. This
change adds a second palette and a toggle — no component changes.

## What Changes

- **Two palettes.** Move the current dark values into a `.dark` block and author a
  **light** palette under `:root`, switching `color-scheme` with the theme so
  native controls/scrollbars follow.
- **A three-way toggle** in the studio nav — `light` / `dark` / `system` — that
  sets the `dark` class on the document root, persists the choice to
  `localStorage`, and defaults to `system` (follows `prefers-color-scheme`).
- **No flash of the wrong theme.** The chosen theme is applied before first paint
  (an init that runs before React mounts), so the page never flickers dark→light.

## Out of scope

- Adding a theme library (`next-themes`) — the studio is Bun + React, not Next.js;
  a ~15-line hand-rolled toggle is enough and avoids a dependency.
- Themes beyond light/dark, per-component overrides, or user-customizable palettes.

## Impact

- New capability: `studio-theming`.
- Touches (on implementation): `src/studio/index.css` (palettes + `color-scheme`),
  `src/studio/frontend.tsx` (the nav toggle + pre-paint init). shadcn components
  unchanged. No server, grading, or run-artifact impact.
