# Design

## Context

Studio's `/api/runs` resolves each run's app on the server: PRD targets by matching `prdSha256`, brownfield runs from their trials' repo and task. Its Runs page already filters with a local-state dropdown (`src/studio/views/Runs.tsx`). Studio's Leaderboard view and the Dashboard have no filter, and the Dashboard's `/api/runs` returns no app. Both leaderboards aggregate over the selected runs (checkboxes), and brownfield runs contribute no scores.

## Goals / Non-Goals

**Goals:**
- One meaning of "app" across Studio and the Dashboard.
- The filter limits both the leaderboard and the runs table on leaderboard pages.

**Non-Goals:**
- A brownfield leaderboard. Brownfield runs have their own run and trial pages.
- Filtering by task within a repository, or selecting several apps at once.
- Changing run artifacts or result schemas.

## Decisions

**Shared app resolver.** Move `targetBySha` and `brownfieldTarget` from `src/studio/index.ts` to a shared server module that both `/api/runs` handlers call. Copying them would let the two UIs drift.

**App identity.** The filter value is the existing `target.name`: the target directory for a PRD, `owner/repo` for brownfield. The option label should be the app's title for a PRD and `owner/repo (brownfield)` for a repo. Today's brownfield `title` names tasks ("Brownfield: pr293-issue292"), which differs per run and would produce misleading labels, so brownfield entries need a stable repo-level `appLabel` in the payload; the existing `title` stays for the table.

**Filter composes with run checkboxes.** Leaderboard scores use runs that are both in the selected app and checked. Each page keeps its existing checkbox behaviour. Alternative considered: resetting checkboxes on app change, rejected because switching back would lose the operator's selection.

**URL state.** Use an `?app=` query parameter with `history.replaceState`, read on load. It's independent per page; a link between pages doesn't carry it. Carrying it through navigation is a possible follow-up.

**Unidentified runs.** Runs with no resolvable app (PRD re-frozen since the run, unsupported results) appear only under "All", matching the current Runs page. Labels never say "Unknown app" as an option, because there's nothing useful to compare within it.

**Controls.** Studio uses its existing `Select`; the Dashboard, which has no component library, uses a native `<select>` styled with its theme variables.

## Risks / Trade-offs

- [The Dashboard resolver reads every target's PRD to hash it] → Build the map once and cache it, as Studio does. A target added while the server runs needs a restart, the same as today.
- [Leaderboard scores change for operators used to the all-apps view] → "All" stays the default, so nothing changes until an app is selected.
