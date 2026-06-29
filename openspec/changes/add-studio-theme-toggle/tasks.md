# Tasks: Add Studio Light/Dark Theme Toggle

## 1. Palettes

- [ ] 1.1 Move the current dark token values from `:root` into a `.dark { }` block
  (`src/studio/index.css`)
- [ ] 1.2 Author a light palette under `:root` — background/foreground/muted/border,
  primary, and the semantic success/warn/danger tokens — with adequate contrast
- [ ] 1.3 Set `color-scheme` per theme so native controls/scrollbars follow

## 2. Toggle + persistence

- [ ] 2.1 Three-way control (`light`/`dark`/`system`) in the studio nav
  (`frontend.tsx`), toggling the `dark` class on `document.documentElement`
- [ ] 2.2 Persist the choice to `localStorage` (`studio-theme`); default `system`
- [ ] 2.3 `system` mode follows `prefers-color-scheme` live via a `matchMedia`
  listener (no reload needed when the OS theme changes)
- [ ] 2.4 Apply the theme class before first paint (pre-React init) so there's no
  flash of the wrong theme

## 3. Verify

- [ ] 3.1 Toggle reskins every view with no component changes; choice survives a
  reload; `system` tracks the OS
- [ ] 3.2 Visually check the light palette on the busy views (leaderboard,
  inverse-scaling deltas, trial transcript) for contrast/meaning
