# Tasks

## 1. Shared app identity

- [x] 1.1 Move PRD and brownfield app resolution from `src/studio/index.ts` to a shared server module, adding a stable repo-level `appLabel` for brownfield apps, with unit tests for PRD, brownfield, and unidentified runs
- [x] 1.2 Return the app (`target`, `appLabel`) from Studio's and the Dashboard's `/api/runs`

## 2. Dashboard

- [x] 2.1 Add an App column to the Dashboard runs table
- [x] 2.2 Add the app dropdown ("All" plus apps) with `?app=` URL state and fallback to "All" for an unknown value
- [x] 2.3 Limit the runs table and leaderboard aggregation to the selected app, composing with the run checkboxes
- [x] 2.4 Show a "no scores for this app" message on the leaderboard when the selected app has only brownfield runs

## 3. Studio

- [x] 3.1 Add the app dropdown with `?app=` URL state to `src/studio/views/Leaderboard.tsx`, and limit its runs table and leaderboard aggregation, composing with the run checkboxes
- [x] 3.2 Show the same "no scores for this app" message on the Studio leaderboard
- [x] 3.3 Switch the Runs page dropdown (`src/studio/views/Runs.tsx`) to the shared labels and `?app=` URL state

## 4. Verification

- [x] 4.1 Add tests for the filter logic: selected app, "All", unidentified runs, unknown URL value, and composition with checkboxes
- [x] 4.2 Check both pages in a browser with PRD and brownfield runs present: select an app, select "All", reload, and open a shared link
- [x] 4.3 Run `bun run test` and `openspec validate add-app-filter-dropdown --strict`
