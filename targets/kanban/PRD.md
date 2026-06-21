# Team Sprint Board (MVP)

An HTTP/JSON sprint board: a single shared board with four fixed columns and
cards that can be created, edited, moved between columns, deleted, and bulk-
cleared from Done. Ordered-collection shape — column order and within-column
card order are part of the contract.

> Adapted from the ViBench `collabrative_kaban` PRD. The original is a real-time
> collaborative board (display-name identity, presence avatars, instant sync,
> live co-editing). Those are WebSocket/DOM concerns and are out of scope here;
> this target evaluates the **HTTP/JSON board+card API**. Full DOM/interaction
> and real-time testing is out of scope in v1 (the evaluator is HTTP-light, no
> browser automation, no socket clients).

Persistence may be in-process (no database required).

## 1. Board structure

Exactly four columns, fixed and ordered left-to-right: `Backlog`,
`In Progress`, `Review`, `Done`. Columns cannot be added, removed, renamed, or
reordered. A card's column is its status.

`GET /api/board` → `200` with the four columns in the fixed order, each as
`{ "name": <column>, "cards": [ { "id", "title", "storyPoints" }, ... ] }`.
Cards within a column are listed in the order they entered that column
(insertion/most-recent-move last).

## 2. Cards

A card has a server-assigned `id`, a required `title`, an optional `description`,
an optional `storyPoints` (one of `null`, `1`, `2`, `3`, `5`, `8`, `13`), and a
`status` equal to one of the four column names.

`POST /api/cards` with JSON `{ "title", "description"?, "storyPoints"?, "status"? }`:

- Empty/missing `title` → `400` with `{ "error": "..." }`.
- `storyPoints` not in the allowed set → `400`.
- `status` not one of the four columns → `400`.
- Omitted `status` defaults to `Backlog`.
- Success → `201` with the full card; it then appears at the end of its column
  in `GET /api/board`.

## 3. View and edit

`GET /api/cards/:id` → `200` with the full card, or `404`.

`PATCH /api/cards/:id` with any subset of `{ title, description, storyPoints,
status }`:

- → `200` with the updated card.
- A `title` set to empty → `400`; an invalid `storyPoints` or `status` → `400`.
- Setting `status` to a different column **moves** the card: it leaves its old
  column and appears at the end of the new column in `GET /api/board`.
- Unknown id → `404`.

## 4. Delete

`DELETE /api/cards/:id` → `204`; the card is then absent from `GET /api/board`
and `GET /api/cards/:id` → `404`. Unknown id → `404`.

## 5. Clear Done

`POST /api/board/done/clear` → `200`. All cards in `Done` are permanently
removed; cards in the other three columns are unaffected.

## 6. REQUIRED for Conformance

A conforming implementation MUST satisfy every item below. (Section 7 lists
non-goals; do not build them.)

- **R1** — `setup.sh` installs dependencies; `start.sh` launches the service on `$PORT`.
- **R2** — `GET /api/board` returns the four fixed columns in order, each with an ordered `cards` list.
- **R3** — `POST /api/cards` creates a card (default column `Backlog`) returning `201`; it appears at the end of its column.
- **R4** — `POST /api/cards` rejects an empty title, an out-of-set `storyPoints`, and an unknown `status` with `400`.
- **R5** — `GET /api/cards/:id` returns the full card; unknown id → `404`.
- **R6** — `PATCH /api/cards/:id` edits title/description/storyPoints with validation; unknown id → `404`.
- **R7** — `PATCH` changing `status` moves the card to the end of the new column and out of the old one.
- **R8** — `DELETE /api/cards/:id` returns `204` and removes it everywhere; unknown id → `404`.
- **R9** — `POST /api/board/done/clear` removes all `Done` cards and leaves the other columns unchanged.
- **R10** — Within-column ordering reflects insertion/most-recent-move order (newest last).

## 7. Non-Goals

No browser UI, no real-time sync or WebSockets, no display-name identity or
presence avatars, no live co-editing indicators, no drag-and-drop position
indices (ordering is insertion/most-recent-move only), no authentication, no
database requirement (in-process persistence is acceptable).
