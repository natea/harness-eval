# Notes Service (MVP)

A single-space notes service: create, edit, view, search, and delete plain-text
notes behind a fixed password gate. No accounts, no folders/tags, no rich text,
no attachments.

> Adapted from the ViBench `notes` PRD. The original is browser-driven (password
> gate screen, list/editor views, autosave-on-navigation, per-note URLs); this
> target evaluates the **HTTP/JSON API behind that UI**. The browser-only
> concerns (masked field, editor cursor, confirmation dialog, tab-session
> re-lock, per-note URLs) are out of scope — the password gate is modeled as a
> request header and autosave as an explicit update. Full DOM/interaction
> testing is out of scope in v1 (the harness evaluator is HTTP-light, no browser
> automation).

The service is date-parameter-free; where "now" matters (timestamps) only the
**format** and **relative ordering** are graded, never absolute clock values, so
results are clock-independent.

## 0. Fixed configuration

- **Password**: exactly `my-notes-are-mine` (case-sensitive, not changeable).
- All `/api/notes` endpoints require the header `X-Notes-Password` to equal the
  password. A missing, empty, or wrong value → `401` with `{ "error": "..." }`
  and no note data in the body.
- Persistence may be in-process (no database required); it need not survive a
  process restart.

## 1. Unlock check

`POST /api/unlock` with JSON `{ "password": "..." }`:

- Correct password → `200` with `{ "ok": true }`.
- Empty/missing password → `400` with `{ "error": "..." }`.
- Wrong password → `401` with `{ "error": "..." }`.

## 2. Note model and derived fields

A note has a server-assigned string `id`, a `body` (plain text, line breaks
preserved; may be empty), and a last-edited timestamp. A note representation
returned by the API includes:

- `id` — stable, server-assigned.
- `body` — the full text (omitted from list rows; present in single-note reads).
- `title` — the first non-empty line of `body`, trimmed. If `body` is
  empty/whitespace-only, `title` is exactly `New Note`.
- `preview` — a single-line snippet from the first non-empty line **after** the
  title line, trimmed; empty string when there is no such line.
- `updatedAt` — last-edited time formatted exactly `YYYY-MM-DD hh:mm` (24-hour,
  UTC).

## 3. List notes

`GET /api/notes` → `200` with a JSON array of note rows (`id`, `title`,
`preview`, `updatedAt`), sorted by last-edited time **descending** (most recent
first). Empty store → `[]`. Wrong/absent password → `401`.

## 4. Create note

`POST /api/notes` with JSON `{ "body"?: string }`:

- → `201` with the created note (`id`, `body`, `title`, `preview`, `updatedAt`).
- An omitted/empty `body` is valid: the note is created with `title` `New Note`.
- A newly created note appears in `GET /api/notes`.

## 5. View note

`GET /api/notes/:id` → `200` with the full note (`id`, `body`, `title`,
`preview`, `updatedAt`). Unknown id → `404`.

## 6. Edit note (autosave)

`PUT /api/notes/:id` with JSON `{ "body": string }`:

- → `200` with the updated note; `body`, `title`, and `preview` reflect the new
  text and `updatedAt` advances to be `>=` the previous value (and `>=` the
  `updatedAt` of an older note edited earlier).
- Unknown id → `404`.

## 7. Search

`GET /api/notes?q=<text>`:

- Case-insensitive **substring** match against `title` OR `body`.
- Results keep the last-edited-time descending order.
- Empty/absent `q` returns all notes (same as section 3).

## 8. Delete note

`DELETE /api/notes/:id` → `204`; the note is then absent from `GET /api/notes`
and `GET /api/notes/:id` returns `404`. Deleting an unknown id → `404`.
Deletion is permanent (no trash/undo).

## 9. REQUIRED for Conformance

A conforming implementation MUST satisfy every item below. (Section 10 lists
non-goals; do not build them.)

- **R1** — `setup.sh` installs dependencies; `start.sh` launches the service on `$PORT`.
- **R2** — `POST /api/unlock` returns `200`/`400`/`401` for correct/empty/wrong password.
- **R3** — Every `/api/notes` request without the correct `X-Notes-Password` returns `401` and leaks no note data.
- **R4** — `GET /api/notes` returns rows sorted by last-edited time descending; empty store → `[]`.
- **R5** — `POST /api/notes` creates a note (empty body allowed) returning `201`; it then appears in the list.
- **R6** — `title` is the first non-empty trimmed line, or exactly `New Note` for an empty body.
- **R7** — `preview` is the first non-empty line after the title line (empty string when none).
- **R8** — `updatedAt` is formatted exactly `YYYY-MM-DD hh:mm` (UTC, 24-hour).
- **R9** — `GET /api/notes/:id` returns the full note; unknown id → `404`.
- **R10** — `PUT /api/notes/:id` updates `body`/`title`/`preview` and advances `updatedAt`; unknown id → `404`.
- **R11** — `GET /api/notes?q=` does case-insensitive substring match on title OR body, preserving sort order.
- **R12** — `DELETE /api/notes/:id` returns `204` and removes the note from all reads; unknown id → `404`.

## 10. Non-Goals

No browser UI, no masked password field or confirmation dialogs, no editor
cursor behavior, no per-note URLs or tab-session re-lock, no folders/tags/pinning,
no rich text, no attachments/export/import, no multi-user accounts or sync, no
database requirement (in-process persistence is acceptable).
