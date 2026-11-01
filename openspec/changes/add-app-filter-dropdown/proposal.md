# Proposal

## Why

Studio's and the Dashboard's leaderboards mix runs of unrelated apps, so scores for different PRDs and brownfield repos get averaged together and the runs lists are hard to scan. Studio's Runs page already has an app dropdown, but its leaderboard page doesn't, and the Dashboard has none.

## What Changes

- Add an app dropdown with an "All" option to the Studio leaderboard page and to the Dashboard's leaderboard page; it filters both the leaderboard and the runs table on that page.
- Treat greenfield PRD targets and brownfield repositories as apps, listed by their display names.
- Keep the selected app in the page URL, so it survives a reload and can be shared.
- Give the Dashboard the same app identity Studio already resolves, and show it in the Dashboard's runs table.
- Align Studio's existing Runs page dropdown with the same options and URL behaviour.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `eval-studio`: adds an app filter across its leaderboard and runs pages.
- `results-dashboard`: adds an app column and an app filter on the leaderboard page.

## Impact

- `src/dashboard/` and `src/studio/` run-list API payloads and views. Studio's app-resolution code moves to a shared module.
- Read-only: no run artifacts or result schemas change.
- This depends on brownfield run labelling from `add-brownfield-track` (`d4ceb92`, on that branch), so implement it on top of that branch or after it merges.
