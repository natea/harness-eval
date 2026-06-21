# Pilot's Logbook (MVP)

A single-user pilot logbook HTTP/JSON service: manage aircraft, log flights
under a strict cross-field validation matrix, filter the logbook, and compute
analytics totals over an explicit date range. All dates are Zulu (UTC).

> Adapted from the ViBench `pilot_logbook` PRD. The original is browser-driven
> with recency-based "currency" tiles and CSV export; this target evaluates the
> **HTTP/JSON API** for aircraft management, the flight validation matrix, and
> range-scoped analytics. The clock-relative features (Day/Night and Instrument
> *currency* windows, the "no future dates" boundary) and CSV export are out of
> scope in v1 — they depend on "today" or on presentation, and the harness
> evaluator is HTTP-light and clock-independent. Analytics totals are computed
> over an **explicit** `from`/`to` range so grading never depends on the date.

Persistence may be in-process (no database required).

## 1. Aircraft

`POST /api/aircraft` with JSON. Required: `registration`, `makeModel`,
`category`, `class`. Optional: `typeDesignator`, and boolean flags
`typeRatingRequired`, `complex`, `highPerformance`, `tailwheel`, `turbine`.

- Valid category/class pairs: Airplane → `SEL|SES|MEL|MES`; Rotorcraft →
  `Helicopter|Gyroplane`; Glider → `Glider`. Any other pair → `400`.
- If `typeRatingRequired` is true, `typeDesignator` is required → else `400`.
- **Canonical uniqueness**: two registrations collide when equal after
  uppercasing and removing spaces and hyphens (e.g. `N-123 AB` ≡ `n123ab`). A
  colliding create → `409`. The stored/returned `registration` preserves the
  user's original formatting.
- Success → `201` with a server-assigned `id`, the echoed fields, and
  `status: "Active"`.

`GET /api/aircraft` → `200` with all aircraft.

`POST /api/aircraft/:id/archive` → `200` with `status: "Inactive"`;
`POST /api/aircraft/:id/unarchive` → `200` with `status: "Active"`. Unknown id →
`404`.

## 2. Flight logging and the validation matrix

`POST /api/flights` with JSON. Required: `date` (ISO `YYYY-MM-DD`, UTC),
`aircraftId` (must reference an **Active** aircraft), `departure`, `arrival`,
and `totalTime`. Optional route `via`; optional time fields (decimal hours):
`dayTime`, `nightTime`, `pic`, `sic`, `dualGiven`, `dualReceived`,
`crossCountry`, `actualInstrument`, `simulatedInstrument`; optional integer
counts: `dayTakeoffs`, `dayLandings`, `nightTakeoffs`, `nightLandings`,
`instrumentApproaches`; optional booleans `holds`, `interceptTrack`; optional
`notes`.

A create is rejected with `400` (and an `error` field) unless **all** hold:

- Every time field is `>= 0` and an exact multiple of `0.1`; `totalTime > 0`.
- `dayTime + nightTime == totalTime` exactly (when either is provided).
- `actualInstrument + simulatedInstrument <= totalTime`.
- `pic` and `sic` are not both `> 0`; `pic + sic <= totalTime`.
- `dualGiven` and `dualReceived` are not both `> 0`; each `<= totalTime`.
- `crossCountry <= totalTime`.
- Every count is a non-negative integer.
- `aircraftId` references an existing Active aircraft (unknown → `400`;
  Inactive → `400`).

Success → `201` with a server-assigned `id` and the stored flight.

`GET /api/flights/:id` → `200` or `404`. `DELETE /api/flights/:id` → `204`
(then `404` on re-read); unknown id → `404`.

`PUT /api/flights/:id` re-validates the full matrix and → `200`/`400`/`404`. An
existing flight may keep an aircraft that has since been archived; changing
`aircraftId` requires an Active aircraft (else `400`).

## 3. Logbook view and filters

`GET /api/flights` → `200` with flights, most recent `date` first. Filters
combine with **AND**:

- `from` / `to` — inclusive ISO date range.
- `aircraftId` — repeatable; matches any listed aircraft.
- `category` / `class`.
- `q` — case-insensitive substring across `departure`, `arrival`, `via`, `notes`.

## 4. Analytics totals

`GET /api/analytics?from=<ISO>&to=<ISO>&groupBy=<overall|categoryClass|makeModel>`
→ `200`. Over the inclusive `[from,to]` range, sum the time metrics
(`totalTime`, `pic`, `sic`, `nightTime`, `actualInstrument`,
`simulatedInstrument`, `crossCountry`) and the counts (`instrumentApproaches`,
`dayTakeoffs`, `dayLandings`, `nightTakeoffs`, `nightLandings`). `groupBy`
returns one bucket per group (a single `overall` bucket by default). Missing
`from`/`to` → `400`.

## 5. REQUIRED for Conformance

A conforming implementation MUST satisfy every item below. (Section 6 lists
non-goals; do not build them.)

- **R1** — `setup.sh` installs dependencies; `start.sh` launches the service on `$PORT`.
- **R2** — `POST /api/aircraft` validates required fields and category/class pairs; valid → `201` `Active`.
- **R3** — `typeRatingRequired` makes `typeDesignator` required (`400` otherwise).
- **R4** — Canonical registration uniqueness rejects collisions with `409`; stored value keeps original formatting.
- **R5** — Archive/unarchive flip `status`; unknown id → `404`.
- **R6** — `POST /api/flights` enforces the full time/count validation matrix, rejecting violations with `400`.
- **R7** — A flight may only reference an existing **Active** aircraft (unknown/Inactive → `400`).
- **R8** — A valid flight is created (`201`) and retrievable by id; unknown id → `404`.
- **R9** — `GET /api/flights` returns flights most-recent-first and applies date/aircraft/category/class/text filters with AND logic.
- **R10** — `DELETE /api/flights/:id` returns `204` and removes it; unknown id → `404`.
- **R11** — `PUT /api/flights/:id` re-validates the matrix and rejects switching to a non-Active aircraft (`400`); unknown id → `404`.
- **R12** — `GET /api/analytics` sums the metrics over the inclusive range and honors `groupBy`; missing range → `400`.

## 6. Non-Goals

No browser UI; no Day/Night or Instrument **currency** computation (clock-relative
windows); no "future date" rejection (clock-relative); no CSV export; no
multi-user accounts; no database requirement (in-process persistence is
acceptable).
