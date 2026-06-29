# FleetCare Maintenance Tracker API (MVP)

A JSON/HTTP service that tracks vehicles and their distance-based maintenance
tasks. Each vehicle has an odometer (kilometres); each task recurs every fixed
interval of distance. The service derives a maintenance **status** for every
task and an **aggregated status** for every vehicle from the odometer and the
last-completed reading.

There is **no browser UI**. The contract is graded entirely over HTTP/JSON —
status codes and JSON bodies. In-process persistence is acceptable (no database
is required); state must be consistent within a single running process.

All money/number values are JSON numbers. Validation failures return the HTTP
status named below with a body of the shape `{ "error": "<message>" }`.

---

## 1. Cold-start contract

- `setup.sh` installs every dependency the implementation needs (exit 0 on a
  clean checkout).
- `start.sh` launches the JSON API listening on the port given by the `$PORT`
  environment variable (default `3000`).
- The service answers requests immediately after start; no manual seeding step.

---

## 2. Vehicles

A vehicle has: a server-assigned `id`, a `name`, an integer `odometer` (km), and
a derived `status` (see §5). Vehicles are returned in **creation order** (oldest
first).

### 2.1 Create — `POST /api/vehicles`

Body: `{ "name": <string>, "odometer": <integer> }`.

- `name` is **required and non-empty** (after trimming). Missing/blank → `400`.
- `odometer` is an **integer ≥ 0**. Missing, non-integer, or negative → `400`.
- On success → `201` with the created vehicle:
  `{ "id", "name", "odometer", "status": "OK", "tasks": [] }`.
- A new vehicle has no tasks, so its status is `"OK"` (see §5.2).
- `name` **cannot be changed** after creation — there is no endpoint to rename a
  vehicle.

### 2.2 List — `GET /api/vehicles`

→ `200` with a JSON array of all vehicles in creation order, each as
`{ "id", "name", "odometer", "status" }` where `status` is the **aggregated**
status (§5.2).

### 2.3 Detail — `GET /api/vehicles/:id`

→ `200` with `{ "id", "name", "odometer", "status", "tasks": [ ... ] }`, where
`tasks` is ordered per §4.3. Unknown `id` → `404`.

### 2.4 Update odometer — `PATCH /api/vehicles/:id/odometer`

Body: `{ "odometer": <integer> }`.

- The new odometer **must be ≥ the current odometer** — an odometer never
  decreases. A lower value → `400` and the stored value is unchanged.
- Non-integer or missing `odometer` → `400`.
- Unknown vehicle `id` → `404`.
- On success → `200` with the updated vehicle (tasks ordered per §4.3). All task
  and aggregate statuses reflect the new odometer immediately.

### 2.5 Delete — `DELETE /api/vehicles/:id`

→ `204` and the vehicle plus **all of its tasks** are removed. Unknown `id` →
`404`. (No confirmation step — deletion is immediate over the API.)

---

## 3. Tasks

A task has: a server-assigned `id`, the owning `vehicleId`, a `name`, an integer
`interval` (km, `> 0`), a `lastCompletedOdometer` (the vehicle odometer recorded
at the most recent completion, or `null` if never completed), and a derived
`status` (§5.1).

### 3.1 Create — `POST /api/vehicles/:id/tasks`

Body: `{ "name": <string>, "interval": <integer> }`.

- `name` is **required and non-empty** (after trimming) → else `400`.
- `interval` is an **integer > 0**. Missing, non-integer, zero, or negative →
  `400`.
- Unknown vehicle `id` → `404`.
- On success → `201` with the created task:
  `{ "id", "vehicleId", "name", "interval", "lastCompletedOdometer": null, "status": "Overdue" }`.
- A brand-new task has never been completed, so its status is `"Overdue"` (§5.1).
- `name` and `interval` **cannot be changed** after creation — there is no edit
  endpoint.

### 3.2 Complete — `POST /api/tasks/:id/complete`

- Records completion by setting `lastCompletedOdometer` to the **owning
  vehicle's current odometer**.
- Allowed **even if the odometer has not changed** since the last completion.
- Unknown task `id` → `404`.
- On success → `200` with the updated task (recomputed `status`).

### 3.3 Delete — `DELETE /api/tasks/:id`

→ `204`. Unknown `id` → `404`.

---

## 4. Status, ordering, and aggregation

### 4.1 Per-task status

For a task on a vehicle whose current odometer is `current`:

```
distance_elapsed   = current − lastCompletedOdometer
distance_until_due = interval − distance_elapsed
```

- **Overdue** — the task has **never been completed** (`lastCompletedOdometer`
  is `null`), OR `distance_elapsed ≥ interval`.
- **Due Soon** — `1 ≤ distance_until_due ≤ 1000`.
- **OK** — `distance_until_due > 1000`.

(When never completed, Overdue takes precedence regardless of the arithmetic.)

### 4.2 Aggregated vehicle status

The vehicle's status reflects its **most urgent** task:

- **Overdue** if any task is Overdue.
- else **Due Soon** if any task is Due Soon.
- else **OK** (including when the vehicle has **no tasks**).

### 4.3 Task display order

In the vehicle detail (`GET /api/vehicles/:id`), tasks are **grouped by status**
in the order **Overdue, then Due Soon, then OK**, and **within each group** in
**creation order (oldest first)**.

Statuses and aggregation update **immediately** on any relevant change (odometer
update, task completion, task create/delete).

---

## 5. Worked status examples (normative)

Vehicle `V` created with odometer `10000`. Task `A` created with interval
`5000`.

1. Immediately after creation, `A` has never been completed → **Overdue**; `V`
   aggregate → **Overdue**.
2. Complete `A` (vehicle odometer `10000`) → `lastCompletedOdometer = 10000`,
   `distance_elapsed = 0`, `distance_until_due = 5000` → **OK**; `V` → **OK**.
3. PATCH `V` odometer to `14000` → `distance_until_due = 1000` → **Due Soon**.
4. PATCH `V` odometer to `13999` would give `distance_until_due = 1001` → **OK**
   (boundary: 1000 is Due Soon, 1001 is OK). *(Odometer cannot decrease, so this
   is illustrative of the boundary, not a sequential step.)*
5. From step 3, PATCH `V` odometer to `15000` → `distance_elapsed = 5000 ≥ 5000`
   → **Overdue**.

---

## 6. REQUIRED for Conformance

A conforming implementation MUST satisfy every item below. (Section 7 lists
non-goals; do not build them.)

- **R1** — `setup.sh` installs dependencies; `start.sh` launches the service on `$PORT`.
- **R2** — `POST /api/vehicles` creates a vehicle, validating `name` (non-empty) and `odometer` (integer ≥ 0); invalid input → `400`.
- **R3** — `GET /api/vehicles` lists all vehicles in creation order, each with its aggregated status.
- **R4** — `GET /api/vehicles/:id` returns the vehicle with its tasks (ordered per §4.3); unknown id → `404`.
- **R5** — `PATCH /api/vehicles/:id/odometer` rejects any value below the current odometer (and non-integers) with `400`, leaving state unchanged; valid updates → `200`.
- **R6** — `DELETE /api/vehicles/:id` removes the vehicle and all its tasks (`204`); unknown id → `404`.
- **R7** — `POST /api/vehicles/:id/tasks` creates a task, validating `name` (non-empty) and `interval` (integer > 0); invalid → `400`, unknown vehicle → `404`.
- **R8** — A brand-new task is `Overdue`; `POST /api/tasks/:id/complete` records completion at the vehicle's current odometer (allowed even with unchanged odometer) and recomputes status.
- **R9** — Per-task status (Overdue / Due Soon / OK) is computed exactly per §4.1, including the never-completed rule and the 1000-km Due-Soon boundary, matching the §5 worked examples.
- **R10** — Aggregated vehicle status is the most-urgent task per §4.2 (Overdue > Due Soon > OK; no tasks → OK), and updates immediately after any change.

## 7. Non-Goals

No browser UI, no user accounts or authentication, no offline/localStorage or
client persistence, no rename/edit of vehicle name or task name/interval, no
delete-confirmation handshake, no database requirement (in-process persistence
is acceptable), no multi-user or team features, no pagination.
