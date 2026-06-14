# Barber Shop Scheduling (MVP)

A browser-based scheduling tool for a single barber shop: staff view a daily
schedule and manage appointments without double-booking. No authentication, no
payments, no customer-facing features.

> Adapted from the ViBench `barber` PRD. The original is browser-driven; this
> target evaluates the **HTTP/JSON API behind the schedule UI** plus that the
> root page is served. Full DOM/interaction testing is out of scope in v1
> (the harness's web-app evaluator is HTTP-light, no browser automation).

The service is launched by `start.sh` and listens on `$PORT` (default 3000).
API request/response bodies are JSON. Appointments persist for the running
process (an in-memory store is acceptable).

**Shop configuration (fixed):**
- Timezone: UTC.
- Hours: 09:00–18:00. Slot duration: 30 minutes → valid `startTime` values are
  `09:00, 09:30, … , 17:30` (last bookable slot ends at 18:00).
- Barbers: `Alex`, `Lucy`, `George`.
- **Constraint:** a barber has at most one appointment per (date, startTime).

An appointment is `{ id, date, startTime, barber, customerName, notes }` where
`date` is `YYYY-MM-DD` and `notes` may be an empty string.

---

## 1. Root page

`GET /` → `200` with `Content-Type: text/html` serving the schedule UI shell.
(The page content is not graded beyond being served as HTML.)

## 2. Daily schedule

`GET /api/appointments?date=YYYY-MM-DD` → `200` with a JSON array of the
appointments for that UTC date (any order). A date with no bookings → `[]`. A
missing or malformed `date` query → `400`.

## 3. Create appointment

`POST /api/appointments` with `{ date, startTime, barber, customerName, notes? }`.

- `201` with the created appointment (including server-assigned `id`) when valid.
- `400` if `customerName` is empty/whitespace, `barber` is not one of the three,
  `startTime` is not a valid 30-minute slot in 09:00–17:30, or `date` is malformed.
- `409` if that `barber` already has an appointment at that `date` + `startTime`
  (the slot is taken). Body: `{ "error": "<message>" }`.

## 4. View appointment

`GET /api/appointments/:id` → `200` with the full appointment; unknown id → `404`.

## 5. Edit appointment

`PATCH /api/appointments/:id` with any of `{ customerName, notes }`.

- Only `customerName` and `notes` are editable. `date`, `startTime`, and
  `barber` are immutable: a request that includes any of them with a value
  different from the stored appointment → `400` (to reschedule, cancel and
  re-create).
- `customerName` may not be saved empty → `400`.
- Valid edit → `200` with the updated appointment.

## 6. Cancel appointment

`DELETE /api/appointments/:id` → `204` and the appointment no longer appears in
the daily schedule or by id. Unknown id → `404`. (Confirmation is a UI concern
and is not part of the API contract.)

---

## 7. REQUIRED for Conformance

A conforming implementation MUST satisfy every item below. (Section 8 lists
non-goals; do not build them.)

- **R1** — `setup.sh` installs dependencies; `start.sh` launches the service on `$PORT`.
- **R2** — `GET /` returns HTML.
- **R3** — `GET /api/appointments?date=` returns that date's appointments; `[]` when none; `400` on bad/missing date.
- **R4** — `POST /api/appointments` creates a valid appointment (`201`) with a server id.
- **R5** — Create rejects empty name, unknown barber, and invalid slot time with `400`.
- **R6** — Create returns `409` when the same barber+date+startTime is already booked.
- **R7** — `GET /api/appointments/:id` returns the appointment; unknown id → `404`.
- **R8** — `PATCH` updates name/notes (`200`) and rejects an empty name with `400`.
- **R9** — `PATCH` rejects attempts to change `date`/`startTime`/`barber` with `400`.
- **R10** — `DELETE` removes the appointment (`204`); it no longer appears in the schedule.

## 8. Non-Goals

No authentication, no payments, no customer-facing booking, no recurring
appointments, no rescheduling endpoint, no database requirement (in-process
persistence is acceptable), no email/SMS.
