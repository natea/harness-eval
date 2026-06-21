# Marketplace Service (MVP)

An HTTP/JSON marketplace: sellers list items, buyers place orders, and access is
controlled by unguessable capability links instead of accounts. Multi-actor
state-machine shape — a product moves Available → Pending → Sold, or back to
Available on cancel, and exactly one buyer can claim an available product.

> Adapted from the ViBench `market_place` PRD. The original is browser-driven
> with image upload and rendered seller/buyer pages; this target evaluates the
> **HTTP/JSON API** behind it. The product image is modeled as an `imageUrl`
> string (file upload is out of scope) and all pages become JSON reads. Full
> DOM testing is out of scope in v1 (the evaluator is HTTP-light, no browser
> automation). Prices are USD numbers; persistence may be in-process.

## 0. Capability links

A product has two secret tokens: a **seller token** and (once ordered) a
**buyer token**. They are returned only to the actor that created them, must be
distinct from each other and from the public product `id`, and must be
unguessable. Public endpoints never expose either token or any buyer/seller
contact beyond what each section permits. An unknown token → `404`.

## 1. Create a listing

`POST /api/products` with JSON: required `title`, `description`, `price`
(number, min `0.01`), `category`, `condition`, `location`, `imageUrl`
(non-empty), `sellerName`, `sellerEmail` (valid email format).

- `category` ∈ `Electronics, Fashion, Home & Garden, Vehicles, Collectibles,
  Sports, Books, Other`; otherwise `400`.
- `condition` ∈ `new, like-new, good, fair`; otherwise `400`.
- Any missing/invalid required field (incl. `price < 0.01`, malformed email) →
  `400` with `{ "error": "..." }`.
- Success → `201` with the public `id`, the `sellerToken`, and `status:
  "available"`. The product is immediately purchasable.

## 2. Browse

`GET /api/products` → `200` with **available** products only, most recent first.
`?category=<one of the 8>` filters to that category. A non-empty result lists
public fields (`id`, `title`, `price`, `category`, `condition`, `location`,
`imageUrl`, `sellerName`) — never tokens or buyer contact.

## 3. Product detail

`GET /api/products/:id` → `200` with full public product info **and** the current
`status`, regardless of status. It MUST NOT include the seller token, the buyer
token, or buyer contact info. Unknown id → `404`.

## 4. Checkout

`POST /api/products/:id/checkout` with JSON `{ "buyerName" (min 2 chars),
"buyerEmail" (valid), "buyerPhone" }`:

- If the product is `available` → `201` with an `orderId` and a `buyerToken`;
  the product becomes `pending` (unavailable to others).
- If the product is `pending` or `sold` → `409` (only one buyer can claim it; a
  second checkout attempt on a now-pending product fails).
- Missing/invalid buyer fields → `400`. Unknown id → `404`.

## 5. Seller status (via seller token)

`GET /api/seller/:sellerToken` → `200` with the product, its `status`, and:

- `available` → no buyer info.
- `pending` or `sold` → the buyer contact (`buyerName`, `buyerEmail`,
  `buyerPhone`).
- Unknown token → `404`.

`POST /api/seller/:sellerToken/confirm`: from `pending` → `200`, product becomes
`sold` (permanent). From any other status → `409`.

`POST /api/seller/:sellerToken/cancel`: from `pending` → `200`, product returns
to `available` and is purchasable again. From any other status → `409`.

## 6. Buyer order (via buyer token)

`GET /api/buyer/:buyerToken` → `200` with the product, the seller contact
(`sellerName`, `sellerEmail`, `location`), and the order `status` (`pending`,
`confirmed`, or `cancelled`). Unknown token → `404`.

## 7. REQUIRED for Conformance

A conforming implementation MUST satisfy every item below. (Section 8 lists
non-goals; do not build them.)

- **R1** — `setup.sh` installs dependencies; `start.sh` launches the service on `$PORT`.
- **R2** — `POST /api/products` validates all required fields, price, category, condition, and email; valid → `201` with `sellerToken` and `status: available`.
- **R3** — `GET /api/products` returns only available products, most recent first, with a working single `category` filter, and never leaks tokens/contact.
- **R4** — `GET /api/products/:id` returns detail with `status` for any status and omits tokens and buyer contact; unknown id → `404`.
- **R5** — `POST /checkout` on an available product returns `201` with a `buyerToken` and flips it to `pending`; invalid buyer fields → `400`.
- **R6** — A second checkout on a `pending` (or `sold`) product → `409` (single-winner).
- **R7** — `GET /api/seller/:sellerToken` shows status and reveals buyer contact only when pending/sold; unknown token → `404`.
- **R8** — Seller `confirm` moves `pending` → `sold` (else `409`); a sold product is no longer browsable or purchasable.
- **R9** — Seller `cancel` moves `pending` → `available` (else `409`); the product becomes purchasable again.
- **R10** — `GET /api/buyer/:buyerToken` shows seller contact and order status; unknown token → `404`.
- **R11** — `sellerToken`, `buyerToken`, and public `id` are pairwise distinct, and no public endpoint exposes a token or buyer contact.

## 8. Non-Goals

No browser UI, no image file upload (image is a URL string), no accounts or
login, no payment processing, no email notifications, no database requirement
(in-process persistence is acceptable). True concurrency is not tested; the
single-winner rule is checked sequentially.
