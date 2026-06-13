# Apex Logistics Quote & ROI API (MVP)

An HTTP/JSON API service for a third-party-logistics (3PL) marketing site:
warehouse ROI computation, lead capture (contact + quote), and an
authenticated quotes admin view. No browser UI is required — this target
evaluates the **API contract** only. No user accounts, no payments.

> Adapted from the ViBench `logistics` PRD (a full marketing website) into an
> API-only service: the deterministic calculation engine and the
> capture→persist→list flows are reframed as JSON endpoints. UI/DOM concerns
> from the original spec are out of scope here.

The service is launched by `start.sh` and listens on the port given by the
`PORT` environment variable (default 3000). All request and response bodies are
JSON (`Content-Type: application/json`). All money/ROI numbers are returned as
JSON numbers (not strings).

---

## 1. Insights

Three fixed blog posts, ordered newest-to-oldest by `publishedAt`:

| slug | title | publishedAt |
|------|-------|-------------|
| `ftz-vs-bonded-warehouse` | FTZ vs. Bonded Warehouse | 2026-03-01 |
| `cross-dock-near-port` | Cross-Docking Near the Port | 2026-02-15 |
| `how-to-choose-a-3pl` | How to Choose a 3PL | 2026-01-20 |

- `GET /api/insights` → `200` with a JSON array of `{slug, title, excerpt, publishedAt}`,
  newest first. `excerpt` = the first 50 characters of the post body; if the
  50th character falls mid-word, include the partial word and append `…`.
- `GET /api/insights/:slug` → `200` with `{slug, title, body, publishedAt}`;
  unknown slug → `404`.

Post bodies are provided in `seed/insights.json` (the implementation supplies
the body text; excerpt logic is what is graded).

---

## 2. Warehouse ROI Calculator

`POST /api/roi` computes three sourcing scenarios. Request body:

```json
{
  "annualPallets": 100,            // > 0
  "portSplitEastPct": 100,         // 0–100
  "palletsPerContainer": 20,       // > 0 (default 20)
  "storageMonths": 1.5,            // >= 0 (default 1.5)
  "drayCostSE": 420, "drayCostNE": 380,        // >= 0
  "storageRateSE": 9, "storageRateNE": 11,     // >= 0, $/pallet/month
  "handling": 6,                   // >= 0, $/pallet (default 6)
  "riskBufferPct": 8,              // 0–100 (default 8)
  "ftzSavingsPct": 5,              // 0–100 (default 5)
  "destinations": [                // 1–10 rows
    { "name": "DC1 - Nashville Hub", "region": "SE", "costPerPallet": 22 }
  ]
}
```

Validation: any field out of range, an empty destination name, a region other
than `SE`/`NE`, or 0 or >10 destinations → `400` with `{ "error": "<message>" }`.

Let `pallets = annualPallets`, `containers = pallets / palletsPerContainer`,
`fracEast = portSplitEastPct/100`, `fracGulf = 1 - fracEast`,
`destSE = count(region==SE)`, `destNE = count(region==NE)`,
`destTotal = destSE + destNE`, `fracDestSE = destSE/destTotal`,
`fracDestNE = destNE/destTotal`, `share = pallets/destTotal`.

**Scenario A (SE-only):**
- inbound = containers × (fracEast × drayCostSE + fracGulf × drayCostSE × 1.3)
- storage = pallets × storageMonths × storageRateSE
- handling = pallets × handling
- outbound = Σ destinations: (region==NE ? costPerPallet × 1.5 : costPerPallet) × share
- totalA = (inbound + storage + handling + outbound) × (1 + riskBufferPct/100) × (1 − ftzSavingsPct/100)

**Scenario B (NE-only):**
- inbound = containers × (fracEast × drayCostNE × 1.3 + fracGulf × drayCostNE)
- storage = pallets × storageMonths × storageRateNE
- handling = pallets × handling
- outbound = Σ destinations: (region==SE ? costPerPallet × 1.5 : costPerPallet) × share
- totalB = (inbound + storage + handling + outbound) × (1 + riskBufferPct/100) × (1 − ftzSavingsPct/100)

**Scenario C (Hybrid):**
- inbound = containers × (fracEast × drayCostSE + fracGulf × drayCostNE)
- storage = pallets × storageMonths × (fracDestSE × storageRateSE + fracDestNE × storageRateNE)
- handling = pallets × handling
- outbound = Σ destinations: costPerPallet × share
- totalC = (inbound + storage + handling + outbound) × (1 + riskBufferPct/100) × (1 − ftzSavingsPct/100)

Derived: `roiB = (totalA − totalB)/totalA × 100`, `roiC = (totalA − totalC)/totalA × 100`,
`costPerPalletX = totalX / pallets`.

Response `200`:

```json
{
  "scenarioA": { "total": 0, "costPerPallet": 0 },
  "scenarioB": { "total": 0, "costPerPallet": 0, "roi": 0 },
  "scenarioC": { "total": 0, "costPerPallet": 0, "roi": 0 }
}
```

---

## 3. Contact

`POST /api/contact`. Fields: `name` (required, non-empty), `email` (required,
valid email), `phone` (optional; if present must be a valid 10-digit US number,
accepting `9015550123`, `901-555-0123`, or `(901) 555-0123`), `company`
(optional), `inquiryType` (required; one of `General Inquiry`,
`Service Question`, `Partnership Opportunity`, `Media/Press`, `Other`),
`subject` (optional), `message` (required, ≥ 10 characters).

- Valid → `201` with `{ "message": "Message sent successfully! We'll respond within 24 hours." }`.
- Invalid → `400` with `{ "error": "<message>" }`.

---

## 4. Quote (capture → persist → list)

`POST /api/quote`. Fields: `name` (required, non-empty), `email` (required,
valid), `phone` (required only if `contactMethod` == `Phone`, then valid),
`company` (required, non-empty), `serviceInterests` (required, ≥ 1 of
`Warehousing`, `Cross-Docking & Transloading`, `Transportation & Drayage`,
`Foreign Trade Zone (FTZ)`, `Value-Added Services`), `industry` (required; one
of `Food & Beverage`, `Wine & Spirits`, `Retail/CPG`, `Agriculture/Floral`,
`Other`), `estimatedVolume` (required, number ≥ 0), `timeline` (required; one of
`ASAP (0-30 days)`, `1-3 months`, `3-6 months`, `6+ months`), `contactMethod`
(required; `Email` or `Phone`), `message` (optional).

- Valid → `201` with `{ "id": "<string>", "message": "Request sent successfully! We'll respond within 4 business hours." }`
  and the quote is persisted (survives across requests for the running process).
- Invalid → `400` with `{ "error": "<message>" }`.

---

## 5. Quotes Admin

`GET /api/admin/quotes` requires the header `X-Admin-Password: apex-logistics-3421`
(case-sensitive).

- Missing/incorrect password → `401`.
- Authorized → `200` with a JSON array of persisted quotes, **newest first**,
  each including a server-assigned `id`, a `createdAt` timestamp, and all
  submitted fields. Empty store → `[]`.

---

## 6. REQUIRED for Conformance

A conforming implementation MUST satisfy every item below. (Section 7 lists
non-goals; do not build them.)

- **R1** — `setup.sh` installs dependencies; `start.sh` launches the service on `$PORT`.
- **R2** — `GET /api/insights` returns the three posts newest-first with correct 50-char `…` excerpts.
- **R3** — `GET /api/insights/:slug` returns the post; unknown slug → `404`.
- **R4** — `POST /api/roi` computes `scenarioA/B/C` totals exactly per the formulas.
- **R5** — `POST /api/roi` returns correct `roi` and `costPerPallet` derived values.
- **R6** — `POST /api/roi` rejects out-of-range / malformed input with `400`.
- **R7** — `POST /api/contact` enforces all field validation and returns the exact success message on `201`.
- **R8** — `POST /api/quote` enforces all field validation (incl. conditional phone) and returns the exact success message on `201`.
- **R9** — A submitted quote persists and appears in `GET /api/admin/quotes`, newest first.
- **R10** — `GET /api/admin/quotes` returns `401` without the correct `X-Admin-Password`.

## 7. Non-Goals

No browser UI, no multi-step wizard state, no user accounts, no payments, no
email delivery, no database requirement (in-process persistence is acceptable).
