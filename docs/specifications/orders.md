# Orders Specification

## 1. Purpose

Define the complete Order domain for the Pakistan + UAE B2C baby-clothing
platform: order creation, identity, ownership, snapshots, lifecycle (as an
independent concern), payment/fulfillment/shipment/return/refund interaction,
cancellation, modification, totals, currency, addresses, events, idempotency,
concurrency, admin operations, customer experience, notifications, audit,
querying, security, failure recovery, and reconciliation — implementation-
ready, evidence-based, with **no invented business rules** and **no invented
Medusa APIs**.

This document is **specification-only**. It changes no source code,
configuration, dependencies, database schema, storefront, or Admin
implementation.

## 2. Scope

**In scope:** order creation and identity; order snapshot/price immutability;
order ownership and authorization (customer, guest, admin); guest orders;
the order lifecycle as an independent concern (distinct from payment,
fulfillment, shipment, return, refund lifecycles); payment, fulfillment,
inventory, and returns interaction boundaries; cancellation; order
modification (native order changes/edits); partial/split order representation;
order totals and currency; addresses; order events; idempotency and
concurrency; admin operations; customer-visible order experience;
notifications; audit logging; search/filtering; security; failure recovery;
reconciliation; business and technical decision registers; requirements;
testing requirements; traceability.

**Non-goals:** payment-provider behavior (Payments spec); shipping/fulfillment
provider behavior (Shipping & Fulfillment spec); final return/refund business
policy (Returns & Refunds spec, later — only the order-side integration
contract is defined here); inventory mechanics (Inventory & Warehouses spec);
catalog/taxonomy; customer auth implementation (Authentication &
Authorization doc); promotions business policy (Markets & Pricing spec); any
code/config/dependency/migration/Admin change.

## 3. Authority and Dependencies

Authority order (AGENTS.md §2): explicit user instruction > approved project
specifications > architecture documents > ADRs > AGENTS.md > official Medusa
docs for the installed version > existing implementation > third-party docs >
agent inference.

- **AGENTS.md** — §5 (no business-rule invention), §11 (independent commerce
  concerns; orders as high-risk domain), §12 (order invariants), §13
  (backend-authoritative pricing), §14 (security), §15
  (transactions/idempotency/webhooks), §16 (tests), §17 (definition of done),
  §18 (notifications/consent, SEO), §19 (audit logging), §26 (auth
  architecture), §27 (verification hierarchy + record).
- **`docs/specifications/markets-and-pricing.md`** — authoritative: market =
  region, PKR/AED, order monetary snapshot (REQ-MP-005/029/030), refund
  currency rules (REQ-MP-031/032), no silent conversion, cross-currency refund
  policy APPROVED — refuse (BD-M-08).
- **`docs/specifications/cart-and-checkout.md`** — authoritative: cart
  lifecycle, completion (`completeCartWorkflow`), order creation from cart
  snapshot, address model, ownership gaps (T-CC-01), idempotency.
- **`docs/specifications/payments.md`** — authoritative: payment collections/
  sessions, authorize-at-completion, capture/refund, webhook pipeline,
  `getLastPaymentStatus`, `PaymentCollectionStatus`, invariants, COD
  APPROVED — no COD in V1 (BD-P-03).
- **`docs/specifications/shipping-and-fulfillment.md`** — authoritative:
  fulfillment/shipment lifecycles, `createOrderFulfillmentWorkflow`,
  `createOrderShipmentWorkflow`, `cancelOrderFulfillmentWorkflow`,
  `markOrderFulfillmentAsDeliveredWorkflow`, tracking, provider boundaries.
- **`docs/specifications/inventory-and-warehouses.md`** — authoritative:
  reservations, fulfillment consumption, cancellation restoration.
- **`docs/architecture/authentication-authorization.md`** — Medusa-native
  customer auth; admin vs customer separation; Better Auth NOT used.
- **`docs/architecture/medusa-capability-matrix.md`**,
  **`docs/architecture/gap-analysis.md`** — capability classification, gaps.
- Installed Medusa **2.19.0** source/types/database (verified throughout;
  §37 records exact artifacts).

### 3.1 Contradictions identified and resolutions

| # | Contradiction / open item | Resolution |
| --- | --- | --- |
| 1 | Cart & Checkout REQ-CC-017 notes "payment fail → no order? per payments spec: compensation". | Verified: `completeCartWorkflow` creates the order **before** payment authorization; on payment failure `compensatePaymentIfNeededStep` compensates. An order can legitimately exist with payment `awaiting`/`requires_action`/failed — order lifecycle and payment lifecycle are independent (§10/§11). No contradiction; this spec pins the exact semantics. |
| 2 | Store `GET /store/orders/:id` is **unauthenticated and ID-addressed** (verified route; source contains a `TODO: Do we want to apply some sort of authentication here?`). | This is the order-domain analog of the cart ownership gap (cart spec T-CC-01). Registered as B-ORD-01/T-ORD-09 — a decision is required before launch; until resolved, order detail access is ID-addressed (guests and customers can read an order whose ID they possess). |
| 3 | Inventory & Warehouses §16 (fulfillment-failure restoration) open item. | Resolved by Shipping & Fulfillment §11 (verified `cancelOrderFulfillmentWorkflow` re-creates/updates reservations); Orders references it rather than redefining it (§13). |
| 4 | Payments spec §12: order cancellation cancels uncaptured payments via `cancelOrderWorkflow`. | Verified here (§14): `cancelOrderWorkflow` also **refunds captured payments** (`refundCapturedPaymentsWorkflow`) and restores reservations — the full native cancellation contract. |
| 5 | No genuine contradiction with AGENTS.md or the other specifications found. **AGENTS.md is not modified.** |

## 4. Domain Definitions

All state vocabulary below is verified against installed Medusa 2.19.0
(`@medusajs/order`, `@medusajs/types`, `@medusajs/utils`, `@medusajs/core-flows`,
`@medusajs/medusa`). No state names are invented.

| Term | Meaning (Medusa 2.19.0) |
| --- | --- |
| Order | `order` — the authoritative commerce record created from a cart at completion. Fields (verified model): `id`, `display_id` (auto-increment), `custom_display_id?`, `region_id?`, `customer_id?`, `version`, `sales_channel_id?`, `status` (`OrderStatus`), `is_draft_order`, `email?`, `currency_code` (required), `locale?`, `no_notification?`, `metadata?`, `canceled_at?`, `shipping_address?`, `billing_address?`, `summary` (per-version `order_summary`), `items`, `shipping_methods`, `transactions`, `credit_lines`, `returns`. **No `payment_status`/`fulfillment_status` fields** — those are computed. |
| Order status | `OrderStatus` enum (verified): `pending` \| `completed` \| `draft` \| `archived` \| `canceled` \| `requires_action` — the **order lifecycle** status only. |
| Payment status | Computed (`getLastPaymentStatus`, order aggregate — verified): `not_paid` \| `awaiting` \| `authorized` \| `partially_authorized` \| `captured` \| `partially_captured` \| `refunded` \| `partially_refunded` \| `canceled` \| `requires_action`. Independent concern. |
| Fulfillment status | Computed (`getLastFulfillmentStatus`, order aggregate — verified): `not_fulfilled` \| `partially_fulfilled` \| `fulfilled` \| `partially_shipped` \| `shipped` \| `delivered` \| `partially_delivered` \| `canceled`. Independent concern. |
| Order line item | `order_line_item` (snapshot) + `order_item` (detail per version): detail carries `version`, `unit_price`, `compare_at_unit_price?`, `quantity`, `fulfilled_quantity`, `delivered_quantity`, `shipped_quantity`, `return_requested_quantity`, `return_received_quantity`, `return_dismissed_quantity`, `written_off_quantity` (all verified). |
| Order transaction | `order_transaction` — financial ledger entry: `amount`, `currency_code`, `reference?` (e.g. `capture`, `refund`), `reference_id?`, `version`, `actions` (verified model). |
| Order summary | `order_summary` — per-version computed totals (JSON) (verified model). |
| Order change | `order_change` — the versioned modification mechanism: `status`, `change_type?`, `order_id`, `version`, `actions`, `requested_at?`, `confirmed_at?`, `canceled_at?` (verified model). Actions typed by `ChangeActionType` (24 values verified, incl. `ITEM_ADD/REMOVE/UPDATE`, `SHIPPING_ADD/REMOVE/UPDATE`, `RETURN_ITEM`, `FULFILL_ITEM`, `SHIP_ITEM`, `TRANSFER_CUSTOMER`, `UPDATE_ORDER_PROPERTIES`, `CREDIT_LINE_ADD`, `PROMOTION_ADD/REMOVE`, `ITEM_ADJUSTMENTS_REPLACE`, `SHIPPING_ADJUSTMENTS_REPLACE`). |
| Return | `return` + `return_item`; `ReturnStatus` (verified): `open` \| `requested` \| `received` \| `partially_received` \| `canceled`. Independent of refund state. |
| Claim | `claim` (claim_item, claim_item_image); `ClaimType` (verified): `refund` \| `replace`; `ClaimReason`: `missing_item` \| `wrong_item` \| `production_failure` \| `other`. |
| Exchange | `exchange` (+ exchange_item) — native order-change subtype. |
| Draft order | An order with `is_draft_order = true` (admin-internal; excluded from store). |
| Order events | Native `OrderWorkflowEvents` (verified): `order.updated`, `order.placed`, `order.canceled`, `order.completed`, `order.archived`. |

**Explicitly distinct and never collapsed (REQ-ORD-009):** order lifecycle ≠
payment lifecycle ≠ fulfillment lifecycle ≠ shipment lifecycle ≠ return
lifecycle ≠ refund lifecycle. Example states that must remain representable:
`payment=captured, fulfillment=partially_fulfilled, shipment=partially_shipped,
return=none, refund=partial`; or `payment=captured, fulfillment=fulfilled,
shipment=delivered, return=partially_returned, refund=partially_refunded`.

## 5. Medusa Order Capability Mapping (verified)

### 5.1 Native vs custom vs external vs unsupported

| Capability | Class | Evidence (verified) |
| --- | --- | --- |
| Order model + snapshot (line items, addresses, shipping methods, totals per version) | Native | `@medusajs/order` models (§4) |
| Order creation from cart | Native | `completeCartWorkflow` → `createOrdersStep(cartToOrder)` (cart spec §18) |
| Standalone/admin order creation | Native | `createOrderWorkflow` / `createOrdersWorkflow` (id `create-orders`; `setPricingContext` hook) |
| Order lifecycle status | Native | `OrderStatus` enum + `completeOrderWorkflow` (`complete-order-workflow`), `archiveOrdersWorkflow`, `cancelOrderWorkflow` |
| Payment/fulfillment status derivation | Native (computed) | `getLastPaymentStatus`, `getLastFulfillmentStatus` (order aggregate) |
| Order modification (versioned) | Native | `order_change` + `order_change_action` (`ChangeActionType`) + order-edit/claim/exchange/return workflows |
| Order-edit workflows | Native | `order/workflows/order-edit/*` |
| Claim workflows | Native | `order/workflows/claim/*` (begin-order-claim, cancel-claim, …) |
| Exchange workflows | Native | `order/workflows/exchange` (per admin routes `/admin/exchanges/*`) |
| Return workflows | Native | `order/workflows/return/*` (begin-return, request-item-return, confirm-return-request, receive-*, cancel-return, create-return-shipping-method, …) |
| Transfer (guest→customer) | Native | store routes `/store/orders/:id/transfer/{request,cancel,accept,decline}` + `order/workflows/transfer/*` |
| Order transactions (financial ledger) | Native | `order_transaction` (reference capture/refund/…; verified in payments spec) |
| Credit lines | Native | `credit_line` model + admin `/admin/orders/:id/credit-lines` (RBAC create) |
| Draft orders | Native | `is_draft_order` + admin `/admin/draft-orders/*` |
| Store order listing (own orders) | Native + auth | `GET /store/orders` requires customer auth; filters `customer_id = actor_id`, `is_draft_order: false` |
| Store single-order retrieval | Native (gap) | `GET /store/orders/:id` — **no auth middleware**; ID-addressed (B-ORD-01/T-ORD-09) |
| Admin order APIs | Native + RBAC | `/admin/orders/*` (verified RBAC: read, update, cancel, archive, complete, authorize; create credit-lines/fulfillments) |
| Customer order transfer | Native | transfer routes/workflows (§5.3) |
| Order events | Native | `OrderWorkflowEvents` (§4/§21) |
| Order search/export | Native | `getOrdersListWorkflow`, `/admin/orders/export` (RBAC read) — no search cluster required |
| Cancellation policy (customer window, partial) | **Business decision** | store has no native cancel route (B-ORD) |
| Order editing by customers | **Business decision** | native mechanism exists (order changes); policy APPROVED — none by customer, admin-only (BD-O-06) |
| Invoice documents | **Business decision** | no native invoicing verified (B-ORD-10) |
| Data retention / anonymization | **Business decision** | no native retention verified (B-ORD-17/18) |

### 5.2 Key workflows (verified in `@medusajs/core-flows@2.19.0`)

- Creation: `createOrdersWorkflow`/`createOrderWorkflow`; `completeCartWorkflow`
  (cart spec §18 — order first, payment authorization last, compensation on
  failure, `order_cart` idempotency).
- Lifecycle: `cancelOrderWorkflow`, `completeOrderWorkflow`,
  `archiveOrdersWorkflow`, `updateOrderWorkflow`.
- Payment: `authorizePaymentSessionForOrderWorkflow`, `capturePaymentWorkflow`,
  `refundPaymentWorkflow`, `cancelPaymentCollectionWorkflow` (payments spec).
- Fulfillment/shipment: `createOrderFulfillmentWorkflow`,
  `createOrderShipmentWorkflow`, `cancelOrderFulfillmentWorkflow`,
  `markOrderFulfillmentAsDeliveredWorkflow` (shipping spec).
- Modification: order-edit/*, claim/*, exchange/*, return/*,
  `createOrderChangeWorkflow`, `createOrderChangeActionsWorkflow`,
  `confirmOrderChangeWorkflow` (order changes), `addLineItemsWorkflow`,
  `updateTaxLinesWorkflow` (order).
- Transfer: order transfer request/cancel/accept/decline workflows.

### 5.3 Routes (verified)

- Store: `GET /store/orders` (**customer auth required**; server-side
  `customer_id` filter), `GET /store/orders/:id` (**no auth**; ID-addressed),
  `POST /store/orders/:id/transfer/request`, `…/transfer/cancel` (customer
  auth), `…/transfer/accept`, `…/transfer/decline` (token-based; no auth
  middleware on accept/decline — verified).
- Admin: `/admin/orders` (list + `export`), `/admin/orders/:id` (get/update),
  `/:id/cancel`, `/:id/archive`, `/:id/complete`,
  `/:id/payment-sessions/authorize`, `/:id/credit-lines`, `/:id/line-items`,
  `/:id/shipping-options`, `/:id/changes`, `/:id/preview`,
  `/:id/fulfillments` (+ `/:fulfillment_id/cancel`,
  `/:fulfillment_id/mark-as-delivered`, `/:fulfillment_id/shipments`),
  `/:id/transfer` (+ `/cancel`, `/guest`), `/admin/draft-orders/*`,
  `/admin/order-changes`, `/admin/order-edits/*`, `/admin/claims/*`,
  `/admin/exchanges/*`, `/admin/returns/*`.
- **RBAC policies verified** on admin order routes: read on `/admin/orders`,
  `/admin/orders/*`, `/admin/orders/export`; **update** on `/:id`,
  `/:id/cancel`, `/:id/archive`, `/:id/complete`,
  `/:id/payment-sessions/authorize`; create on `/:id/credit-lines`
  (credit_line) and `/:id/fulfillments` (fulfillment); update on
  fulfillment cancel/shipments. Sensitive operations carry Medusa's native
  admin authorization model (AGENTS.md §14/§26.5).
- Storefront boundary: `apps/storefront/src/lib/data/orders.ts` consumes
  `GET /store/orders` and `GET /store/orders/:id` (verified).

### 5.4 Order summary / totals

- Totals are **computed** (cart/order aggregate fields and per-version
  `order_summary` JSON), never client-supplied (REQ-ORD-020).
- The order preserves: currency, line-item unit prices, discounts (item
  adjustments), tax lines, shipping method + shipping adjustments + tax,
  totals, addresses — captured at placement (REQ-ORD-004).

## 6. Order Creation

**Cart → Checkout → Payment → Order** (cross-references: cart-and-checkout.md
§18, payments.md §9/§10).

- **When a cart becomes an order:** inside `completeCartWorkflow`
  (`POST /store/carts/:id/complete`), via `createOrdersStep(cartToOrder)`
  (verified). The cart gets `completed_at` and the `order_cart` link records
  the order; re-completion returns the same order (idempotent).
- **Order creation authority (REQ-ORD-001):** the backend. The storefront
  never creates orders or supplies totals/amounts; it only triggers the
  completion workflow. The order is built from the **cart snapshot** —
  resolved prices, tax, discounts, shipping — not from client data.
- **Order identity (REQ-ORD-002/003):** `order.id` is the system identity;
  `display_id` is an auto-incremented customer/ops-facing reference (verified
  model). Order-number format policy: IMPLEMENTATION_DEFINED — native
  `display_id` (BD-O-08).
- **Association:** `customer_id` (if the cart had a customer) or guest with
  `email`; `region_id`, `sales_channel_id`, `currency_code` copied from the
  cart (verified model fields). Draft orders excluded from store
  (REQ-ORD-033).
- **Line items:** copied as snapshots (`order_line_item`) with detail
  (`order_item`: `unit_price`, `compare_at_unit_price`, `quantity`, per-
  concern quantity fields — §4).
- **Sequence (verified, cart spec §18):** validate cart → create order →
  (parallel) link + complete cart + reserve inventory + register promotion
  usage → authorize payment LAST → add order transaction → hooks.
  Consequence: an order exists even while payment is pending/failed —
  expected and representable (REQ-ORD-009/011).

## 7. Order Snapshot / Price Immutability

**Catalog state ≠ historical order state (REQ-ORD-004).** Once created, the
order preserves its values; later changes never rewrite it:

- Catalog price changes → do not alter order line-item unit prices.
- Product/variant title, thumbnail, or attribute changes → do not corrupt the
  order's snapshot representation.
- Discount/promotion configuration changes → never recalculate old orders
  (promotion usage is committed at completion; payments spec/markets spec
  REQ-MP-005/029/030).
- Tax configuration changes → never silently rewrite old orders (tax lines
  snapshotted; markets spec §17).
- Shipping option/rate changes → never rewrite the order's shipping method
  amount (shipping spec REQ-SHIP-030).

**What can legitimately change after creation (via native, versioned
mechanisms only):** order status (complete/archive/cancel); order changes /
order edits (when authorized — §15) produce a new `order.version` with a new
`order_summary`, not a rewrite of history; payment/fulfillment/return/refund
state advances independently without altering the monetary snapshot.

## 8. Order Ownership and Authorization

**Invariant (REQ-ORD-006, AGENTS.md §14):** Customer A must never access
Customer B's orders, items, addresses, payment information, fulfillment or
shipment information, returns, refunds, or personal information. Enforcement
is **server-side**; never trust customer ID from the browser, order ID alone,
hidden UI, frontend state, or route visibility.

- **Customer order listing (REQ-ORD-007, verified):** `GET /store/orders`
  requires customer auth and filters `customer_id = req.auth_context.actor_id`
  (server-side scoping in the route handler).
- **Single-order retrieval (REQ-ORD-008):** `GET /store/orders/:id` is
  **una authenticated and ID-addressed** (verified; source TODO). This is an
  approved-gap item: B-ORD-01 (lookup policy) + T-ORD-09 (enforcement layer)
  must be resolved before launch. Options: authenticated-customer-only +
  ownership check; guest lookup by order id + email/token; keep ID-addressed
  (current native behavior). Nothing is decided here.
- **Guest orders (§9):** guest identity = email + order reference; lookup
  policy per B-ORD-01.
- **Admin access (REQ-ORD-024):** native admin routes + native admin
  authorization (RBAC policies verified §5.3); customer session never grants
  admin; sensitive operations (cancel, refund, payment authorize, order
  edits, manual fulfillment/shipment) enforced server-side — frontend
  visibility is never authorization.
- **Order transfer (REQ-ORD-034):** native transfer workflows; `request`/
  `cancel` require customer auth; `accept`/`decline` are token-based
  (verified routes). Used for guest→customer association (§9).

## 9. Guest Orders

- A guest order is created from a guest cart at completion; it carries
  `email` (when provided) and no `customer_id` (verified model — `customer_id`
  nullable; cart spec §10/§18).
- **Order lookup for guests:** the native single-order route is ID-addressed
  (B-ORD-01). Guest lookup by `email + order id/display_id` is NOT native —
  it requires an approved policy and a decision on the enforcement layer
  (B-ORD-01, T-ORD-09). Do not invent a lookup endpoint here.
- **Account creation after guest purchase / association (B-ORD-19/20,
  RESOLVED — DERIVED from BD-G-01, BD-O-15):** native mechanisms available:
  order transfer (`/store/orders/:id/transfer/*`) and cart transfer
  (`transferCartCustomerWorkflow`, cart spec). Approved: guest orders are
  associated to the account on signup (transfer on signup), enabling returns.
  Whether a
  guest order auto-associates to a newly created account is a business
  decision.
- **Security (REQ-ORD-008):** any guest lookup must be credential-gated
  (email + order reference/token), never order-ID alone, once the decision is
  made (B-ORD-01).
- **Draft orders (REQ-ORD-033):** `is_draft_order = true` orders are excluded
  from store routes (verified store filters).

## 10. Order Lifecycle

**The order lifecycle is independent from payment/fulfillment/shipment/
return/refund lifecycles (REQ-ORD-009).** Medusa's native `OrderStatus`
enum + the computed payment/fulfillment statuses are the vocabulary; no
custom single order-status enum is created.

- **Native order lifecycle status (`OrderStatus`, verified):**
  `pending` → `completed` (admin `completeOrderWorkflow` / cart completion
  sets status per completion semantics) · `pending` → `canceled`
  (`cancelOrderWorkflow`) · `pending`/`completed` → `archived`
  (`archiveOrdersWorkflow`) · `draft` (admin draft orders) ·
  `requires_action` (reserved; requires intervention).
- **Valid/invalid transitions (verified):**
  - Cancel: order not already canceled; order not `completed` (native error:
    "Cannot cancel a completed order. Please use the return process to handle
    refunds or exchanges."); **all fulfillments must be canceled first**
    (native validation in `cancelValidateOrder`).
  - Complete: `completeOrderWorkflow` (admin complete route).
  - Archive: `archiveOrdersWorkflow`.
- **Representable combinations (examples, not a linear enum):**
  `payment=captured + fulfillment=not_fulfilled`; `payment=captured +
  fulfillment=partially_fulfilled + shipment=partially_shipped`;
  `payment=partially_refunded + fulfillment=delivered + return=partially_received`;
  `payment=refunded + return=received`; `payment=captured + order=canceled`
  (only when fulfillments canceled; captured payments refunded natively).
- **When is an order "completed" (B-ORD-20, RESOLVED — MEDUSA_DEFINED,
  BD-O-16):** cart completion creates the order; the `completed` status is
  set via the admin complete route (native). Whether completion should be
  automatic (subscriber) or admin-driven
  is a business decision.

## 11. Payment Interaction

Cross-reference: payments.md §9–§16.

- **Authorization/capture (REQ-ORD-011):** `authorizePaymentSessionStep` runs
  last inside `completeCartWorkflow` (after order creation); capture is a
  separate operation (`capturePaymentWorkflow`, admin route). The browser is
  never authoritative for payment success (payments REQ-PAY-008).
- **Order↔payment links (verified):** `order_payment_collection` link; order
  payment status derived by `getLastPaymentStatus` from collections
  (payments §9.2).
- **Failed/expired payment:** order may exist with payment `awaiting` /
  `requires_action` / failed; compensation handles rollback where defined
  (cart spec §18; payments §9.3/§14.1). Failed-payment order retention is
  B-ORD-13/14 (DEFERRED — BD-O-12).
- **Duplicate payment callback:** idempotent via native webhook pipeline
  (payments §15); never double-captures (§22).
- **Partial capture/refund:** native (payments §11/§13); reflected in order
  payment status (captured/partially_captured/refunded/partially_refunded).
- **Consistency (REQ-ORD-012):** `payment captured` can never display as
  unpaid in the order domain — status is derived from the same collection
  aggregates; reconciliation (§31) covers provider-side divergence.
- **Never mutate payment state from storefront code (REQ-ORD-011):** all
  payment transitions go through Medusa payment workflows (payments spec).

## 12. Fulfillment Interaction

Cross-reference: shipping-and-fulfillment.md §11–§15. Orders **coordinate
with**, never duplicate, the fulfillment domain.

- **Fulfillment creation (REQ-ORD-013):** `createOrderFulfillmentWorkflow`
  (admin); consumes reservations; records per-item fulfillment quantities on
  `order_item` (verified fields).
- **Per-item quantity tracking (REQ-ORD-014, verified model):**
  `fulfilled_quantity`, `shipped_quantity`, `delivered_quantity` — partial and
  split fulfillment are representable natively on the order.
- **Order fulfillment status:** computed `getLastFulfillmentStatus` from
  fulfillments + unfulfilled-items check (verified §5.1) — never stored.
- **Shipment/tracking:** via `createOrderShipmentWorkflow` (labels +
  `shipped_at`); delivery via `markOrderFulfillmentAsDeliveredWorkflow`
  (shipping spec). Order exposes these to the customer through the store
  order response (REQ-ORD-028).
- **Multiple warehouses / split shipments:** one order, multiple fulfillments
  each location-bound (shipping spec §14; REQ-ORD-016). **No separate orders
  are created per warehouse** (REQ-ORD-016).

## 13. Inventory Interaction

Cross-reference: inventory-and-warehouses.md §11–§16. No second inventory
system; no read→subtract→write patterns.

- **Reservation:** created at cart completion (inventory REQ-INV-015).
- **Fulfillment deduction:** at fulfillment creation, via reservation
  consumption + inventory adjustment (inventory REQ-INV-007; shipping spec
  §6.3) — never duplicated in the order domain.
- **Cancellation restoration:** `cancelOrderWorkflow` →
  `deleteReservationsByLineItemsStep` (inventory REQ-INV-006).
- **Fulfillment cancellation:** re-creates/updates reservations for
  unfulfilled quantities (shipping spec §11) — restoration once, idempotent.
- **Return restoration:** boundary only — Returns & Refunds spec owns the
  disposition (inventory REQ-INV-008); the order exposes return quantities
  natively (REQ-ORD-019).
- **Duplicate restoration prevention (REQ-ORD-022):** idempotency at the
  workflow/reservation layer (inventory invariants 3–7).

## 14. Cancellation

Cross-reference: payments §12, shipping §13, inventory §15.

- **Native contract (REQ-ORD-015, verified `cancelOrderWorkflow`):**
  1. Validate: not already canceled; not `completed`; all fulfillments
     canceled (else `NOT_ALLOWED`).
  2. Parallel: refund captured payments (`refundCapturedPaymentsWorkflow`),
     delete reservations (inventory restore), cancel uncaptured payments
     (`cancelPaymentStep`), emit `order.canceled`.
  3. Hook `orderCanceled`.
- **Who can cancel (B-ORD-02..05, RESOLVED — BD-O-02/03/04/05):**
  cancellation is exposed through the **admin** route only
  (`POST /admin/orders/:id/cancel`); the store has no native cancel route.
  Approved policy: customers may cancel **before fulfillment only**, any
  payment state; captured payments fully refunded (auto-refund via native
  workflow); no cancellation after fulfillment; no partial cancellation in
  V1. A customer cancel route (custom store route behind the same workflow)
  is the implementation of this policy.
- **Payment-state restrictions:** native (cannot cancel completed orders;
  captured payments refunded; uncaptured payments canceled) — REQ-ORD-015.
- **Fulfillment-state restrictions:** native (all fulfillments must be
  canceled first) — REQ-ORD-015.
- **Partial cancellation (B-ORD-05, RESOLVED — DERIVED from BD-O-02):**
  native primitives exist (order changes/order edits, per-line-item
  reservation deletion — inventory §15); approved: **not offered in V1**.
  Whether partial customer cancellation is offered is a business
  decision.
- **Race conditions (§23):** admin cancel vs payment callback vs fulfillment
  creation must yield one authoritative outcome; protection is native
  (payment row locks, reservation locking, workflow guards).
- **Auditability (REQ-ORD-025):** cancellation is audit-worthy
  (`canceled_by` actor context per workflow input; AGENTS.md §19).

## 15. Order Modification

- **Native mechanism (verified):** order changes (`order_change` +
  `order_change_action` with `ChangeActionType`) and their workflow forms:
  order edits (`order/workflows/order-edit/*`), claims, exchanges, returns,
  line-item add/update/remove, shipping add/remove/update, address property
  updates (`UPDATE_ORDER_PROPERTIES`), credit lines, promotion add/remove.
  Modifications are **versioned** (`order.version` + per-version
  `order_summary`); history is preserved, never rewritten (REQ-ORD-017).
- **Not freely editable:** orders are not arbitrary CRUD; every change is a
  typed, workflow-driven order change with validation and (for edits)
  request/confirm flow. No custom order-edit engine is created.
- **Policy (B-ORD-06/07, RESOLVED — BD-O-06/07):** approved: **no customer
  order modification** (admin-only via native edits) and **order addresses
  immutable** (admin-only changes). Whether customers can edit quantity/
  address/shipping after placement, and the payment/fulfillment implications,
  are business decisions. Address-change policy in particular is B-ORD-07
  (customer profile changes never mutate historical order addresses —
  REQ-ORD-004/§20).

## 16. Partial Orders / Split Orders

- **Representation (REQ-ORD-014/016):** one order with multiple fulfillments —
  e.g. Item A fulfilled from warehouse 1, Item B from warehouse 2 — each
  fulfillment location-bound with its own shipment, tracking, and delivery
  (shipping spec §14). **No separate unrelated orders are created.**
- **Per-item quantities (verified model):** `fulfilled_quantity`,
  `shipped_quantity`, `delivered_quantity`, `return_requested_quantity`,
  `return_received_quantity`, `return_dismissed_quantity`,
  `written_off_quantity` — partial delivery, remaining quantities, partial
  returns and partial refunds are all representable per line item.
- **Split shipment tracking:** per fulfillment (shipping spec §14/§15);
  customer-visible per-shipment state (B-SHIP-11/B-ORD-11).
- **Partial cancellation / partial refund / partial return:** native
  per-item mechanics (order changes, return workflows, refund workflows);
  policies are business decisions (B-ORD-06, B-ORD register; Returns &
  Refunds spec).

## 17. Returns and Refunds (integration contract)

Returns & Refunds business policy is **not defined here** (later
specification). The order-side integration contract:

- **Independent concerns (REQ-ORD-018):** "returned" ≠ "refunded" and
  "refunded" ≠ "returned". `ReturnStatus` (open/requested/received/
  partially_received/canceled) and refund state (payment module refunds,
  order payment status) progress independently.
- **Order-side data (REQ-ORD-019, verified):** per-item return quantities on
  `order_item` (`return_requested_quantity`, `return_received_quantity`,
  `return_dismissed_quantity`, `written_off_quantity`); `return` +
  `return_item` records; return shipping via `createReturnFulfillmentWorkflow`
  / `create-return-shipping-method` (shipping spec returns boundary).
- **Native return workflows exist (verified §5.2):** begin-return,
  request-item-return, confirm/cancel request, receive (partial/complete),
  dismiss damaged, etc. The Returns & Refunds spec will map business policy
  (eligibility, windows, shipping responsibility) onto these primitives.
- **Refund mechanics:** native `refundPaymentWorkflow` with
  refunded ≤ captured (payments §13); shipping-fee refund treatment is
  B-SHIP-23 (Returns & Refunds spec).
- **Claim/exchange:** native claim (`refund`/`replace`) and exchange
  primitives exist; whether the platform offers them is a business decision
  (B-ORD register; Returns & Refunds spec).

## 18. Order Totals

- **Computation (REQ-ORD-020):** totals are backend-computed (cart/order
  aggregate fields + per-version `order_summary`), never client-supplied.
  Components (native): subtotal, item discounts (line-item adjustments), order
  discounts (promotion adjustments incl. shipping adjustments), tax
  (`tax_total` incl. shipping tax), shipping (`shipping_total`), refunds
  (`refunded_amount`), captured (`captured_amount`), outstanding, final
  historical total.
- **Arithmetic invariants (REQ-ORD-020, AGENTS.md §12):**
  - `refunded_amount ≤ refundable amount` (captured − refunded; enforced
    natively in payment workflows with currency epsilon — payments §13).
  - Discounts never produce invalid (negative) totals (native adjustment
    validation; markets REQ-MP-021).
  - `captured ≤ authorized` where applicable (native capture validation,
    payments §11).
  - Total ≥ 0; one authoritative currency per order.
- **Historical immutability:** `order_summary` per version preserves totals;
  later config changes never rewrite them (REQ-ORD-004).

## 19. Currency

Cross-reference: markets-and-pricing.md §6/§18; payments §7.

- **Order currency (REQ-ORD-021):** `order.currency_code` is captured at
  placement (required, verified model) and immutable for the order's life.
  PKR for Pakistan, AED for UAE; no silent conversion (REQ-MP-002/011).
- **Payment currency:** equals the order currency (payments REQ-PAY-002);
  payment collections mirror the cart/order currency.
- **Refund currency:** refunds are in the order currency (REQ-MP-031);
  cross-currency refund behavior **APPROVED — refuse** (BD-M-08, no silent
  conversion); referenced, not invented here.
- **Display:** storefront formatting is display-only (`Intl.NumberFormat`,
  project-context); authoritative values are backend-computed.

## 20. Addresses

- **Order addresses (verified model):** `shipping_address` / `billing_address`
  (hasOne, nullable) copied from the cart at completion — **historical
  snapshots** (REQ-ORD-004).
- **Customer profile changes** to saved addresses never mutate historical
  order addresses (REQ-ORD-004; B-ORD-08 for any post-placement address
  change policy).
- **Post-placement changes:** only via order changes if authorized
  (B-ORD-07/08; `UPDATE_ORDER_PROPERTIES` is a verified native action type).
- **Provider normalization:** address formatting for TCS/Aramex stays inside
  the shipping provider boundary (shipping spec §10); fulfillment copies the
  order shipping address into `fulfillment_address` (shipping spec §10).
- **Privacy:** addresses are personal data — never logged in full, never
  exposed cross-customer (REQ-ORD-006/029; AGENTS.md §15).

## 21. Order Events

- **Native events (verified `OrderWorkflowEvents`):** `order.updated`,
  `order.placed`, `order.canceled`, `order.completed`, `order.archived`.
  Payment/fulfillment/shipment events are native too (`payment.captured`,
  `payment.refunded`, `fulfillment.shipment_created` — payments/shipping
  specs).
- **No duplicate event infrastructure (REQ-ORD-026):** consumers subscribe to
  native events (subscribers on the event-bus). Custom domain events are
  created only where a verified gap exists (none identified for V1 order
  flows).
- **Distinguish (REQ-ORD-026):** Medusa-native event (above) vs custom domain
  event (none planned) vs external provider event (payment/shipping webhooks
  — handled at provider boundaries; payments §14, shipping §18).

## 22. Idempotency

| Operation | Invariant | Mechanism (verified) |
| --- | --- | --- |
| Order creation / completion | One order per cart; duplicate/concurrent completion returns the same order | `completeCartWorkflow`: cart lock (`acquireLockStep`) + `order_cart` lookup (cart spec §21; REQ-ORD-002) |
| Payment callbacks | Duplicate/replay → one financial effect | native webhook pipeline + payment workflow idempotency (payments §15) |
| Cancellation | One cancellation effect; reservations restored once; payments canceled/refunded once | `cancelOrderWorkflow` state guards + payment/reservation idempotency (REQ-ORD-015/022) |
| Fulfillment/shipment creation | No duplicate deduction/labels/shipments | reservation consumption + shipment idempotency (shipping §19; inventory REQ-INV-007) |
| Refunds | Duplicate refund request → at most one financial effect | `refundPaymentWorkflow` guards + provider `idempotency_key: refund.id` (payments §13/§15) |
| Returns | Duplicate return processing → one state effect | return workflows + order-change actions (Returns spec owns policy; REQ-ORD-022) |
| Admin overrides | Retried override → one effect | workflow guards + actor attribution |
| Notification triggering | Duplicate event → at most one notification | subscriber idempotency (notifications boundary) |

**At most one authoritative financial/commerce effect per logical operation
(REQ-ORD-022).** No custom idempotency store: native workflow engine +
PostgreSQL (+ Redis for coordination only).

## 23. Concurrency

Ownership of concurrency protection (REQ-ORD-023) — **the Medusa workflow/
module layer owns it**; no application-level read-modify-write:

| Race | Authoritative protection (verified) |
| --- | --- |
| Two checkout requests, same cart | cart lock + `order_cart` idempotency (cart spec §20) |
| Payment callback arrives twice | payment workflow idempotency + event guards (payments §15/§18) |
| Payment callback while cancellation runs | payment row locks + cancel workflow guards (payments §18; §14 here) |
| Fulfillment creation while cancellation runs | cancel validation (all fulfillments canceled) + reservation locking |
| Shipment creation times out but succeeds externally | idempotent retry; provider status lookup before new attempt (shipping §19; REQ-ORD-030) |
| Admin cancels while provider callback arrives | workflow guards + payment/reservation locking → single outcome |
| Return begins while refund processing | order-change/return workflow state + refund row locks (payments §18) |
| Two admins perform the same sensitive action | workflow guards + idempotency + RBAC; audit records both attempts |
| Inventory changes while fulfillment is created | reservation consumption under inventory-item locking (inventory §14/§16) |

## 24. Admin Operations

- **Native coverage (verified routes + RBAC §5.3):** view/search/filter/
  export orders; order detail incl. payment collections, fulfillments,
  shipments, transactions, changes, preview; cancel; archive; complete;
  authorize payment; credit lines; line items; shipping options; fulfillments
  (create/cancel/ship/mark-delivered); order changes/edits; claims;
  exchanges; returns; draft orders.
- **Authorization (REQ-ORD-024):** every sensitive operation is server-side
  authorized via Medusa's native admin authorization (RBAC policies verified
  — read vs update vs create on the order resource and related resources).
  Frontend button visibility is never authorization (AGENTS.md §14).
- **Overrides:** refunds, manual payment operations (mark-as-paid — payments
  §20), manual fulfillment/shipment, cancellation, order edits — all through
  native workflows; overrides are audit-worthy (REQ-ORD-025; AGENTS.md §19).
- **No custom Admin UI** in V1; standard Medusa Admin is authoritative
  (capability matrix; T-ORD-11 for audit views if a verified gap appears).

## 25. Customer Order Experience

- **Capabilities (REQ-ORD-028):** authenticated customers see their order
  history and order detail with: lifecycle status, payment status,
  fulfillment/shipment status, tracking (normalized, per shipment),
  quantities, pricing (unit prices, discounts, tax, shipping, totals),
  delivery address, return/refund state. Guest access per B-ORD-01.
- **Never exposed (REQ-ORD-028):** raw provider payloads (payments/shipping
  specs), provider credentials, internal IDs beyond what the store API
  returns, another customer's data (REQ-ORD-006).
- **Storefront boundary:** `apps/storefront/src/lib/data/orders.ts` (verified)
  — server-side SDK calls with auth headers; order pages under the account
  area.
- **Customer-visible status vocabulary (B-ORD-10, RESOLVED — DERIVED,
  BD-O-10):** normalized labels over the native state model. Which
  normalized statuses/translations are shown (e.g. "processing", "in
  transit", "delivered") is a business/UX decision layered on the native
  statuses — never a replacement of the underlying state model.

## 26. Notifications

- **Triggers (REQ-ORD-027):** order confirmation (`order.placed`), payment
  confirmation (`payment.captured`), payment failure, order cancellation
  (`order.canceled`), fulfillment created, shipment dispatched
  (`shipment.created`), delivery, return, refund (`payment.refunded`).
  **No templates defined.**
- **Boundary:** notifications are side effects behind the notifications
  boundary (AGENTS.md §18); failure never corrupts order/payment/fulfillment
  state (REQ-ORD-027).
- **Consent:** transactional vs marketing/consent policy per the
  notifications/consent requirements; nothing invented (shipping spec §21;
  B-ORD-19).
- **Native event sources (§21)** feed subscribers; no duplicate event
  infrastructure.

## 27. Audit Logging

- **Actions requiring audit (REQ-ORD-025, AGENTS.md §19):** cancellation;
  refunds; manual payment changes (mark-as-paid); manual fulfillment/shipment
  changes (incl. manual tracking entry); order edits; address/property
  changes via order changes; administrative overrides; sensitive
  customer-data access where appropriate.
- **Native attribution (verified):** payment `captured_by`/`created_by`
  (payments §5.4/§20); fulfillment `created_by`/`marked_shipped_by` (shipping
  §22); order workflows accept actor context (`canceled_by`, `created_by`).
- **Mechanism (T-ORD-11):** use Medusa-native attribution + event log where
  sufficient; no custom audit subsystem is prescribed (AGENTS.md §19). If a
  verified gap appears (e.g. consolidated admin audit view), extend the
  standard Admin, not a parallel system.

## 28. Search / Filtering / Admin Querying

- **Customer (REQ-ORD-007):** own orders only — server-side scoped
  (`customer_id = actor_id`).
- **Admin (REQ-ORD-029):** native list/query via `getOrdersListWorkflow`
  (filterable: order number/display_id, customer, dates, `status`, payment
  state, fulfillment state, market/region, currency, amount) and
  `/admin/orders/export`. **No Elasticsearch/OpenSearch** — no demonstrated
  requirement (AGENTS.md §3/§11; REQ-ORD-029). Tracking-number search: via
  fulfillment query if required (verify at implementation; T-ORD-13).
- **Pagination/limits:** native list pagination (offset/limit, verified store
  response shape); unbounded queries avoided (AGENTS.md §20).

## 29. Security

- **IDOR / unauthorized access (REQ-ORD-006/008):** store listing is
  server-side scoped; single-order retrieval gap registered (B-ORD-01/
  T-ORD-09).
- **Order enumeration:** list route requires auth; detail route is
  ID-addressed — enumeration surface covered by the T-ORD-09 decision.
- **Price/quantity manipulation (REQ-ORD-001):** backend resolves and
  snapshots all amounts; client never submits totals/prices/quantities at
  order creation.
- **Payment-status manipulation (REQ-ORD-011):** browser never establishes
  payment success; server-verified provider confirmation only (payments
  REQ-PAY-008).
- **Refund/fulfillment manipulation (REQ-ORD-024):** no store mutation routes
  for refunds/fulfillment; admin-only with RBAC; workflows validate state.
- **Address tampering (REQ-ORD-004):** order addresses are snapshots; changes
  only via authorized order changes.
- **Customer impersonation (REQ-ORD-006):** Medusa-native auth; actor id from
  `req.auth_context`, never from the client (cart/order routes verified).
- **Admin privilege abuse (REQ-ORD-024):** native RBAC roles/policies; least
  privilege by policy; sensitive ops audited (REQ-ORD-025).
- **Sensitive-data leakage (REQ-ORD-028):** no raw provider payloads, no
  credentials, no full PII in logs (AGENTS.md §15; shipping §22).

## 30. Failure Recovery

**Known failure vs unknown external outcome (REQ-ORD-030).**

| Scenario | Behavior |
| --- | --- |
| Payment provider times out | classify retryable; determine provider state before re-attempt (payments §17); never auto-success |
| Payment succeeds externally but callback delayed | order exists (`awaiting`/`requires_action`); native webhook reconcile (payments §14/§16) |
| Order creation fails | completion workflow compensation (cart spec §18); no partial order/payment inconsistency |
| Fulfillment provider times out | fulfillment not marked shipped; retryable with idempotency (shipping §18/§19) |
| Shipment succeeds externally but response lost | idempotent retry + provider status lookup before new side-effecting attempt (shipping §19; REQ-ORD-030) |
| Cancellation succeeds internally but provider cancellation fails | internal state authoritative; provider divergence surfaced to reconciliation/manual review (payments §16; §31 here) |
| Notification delivery fails | logged/retried by notifications boundary; never corrupts order state (REQ-ORD-027) |
| Database transaction fails | workflow transaction rollback + compensation (native) |
| Worker retries | idempotent per §22; no duplicate financial/fulfillment effects |

**Never blindly retry an external operation where duplicate execution could
create financial or fulfillment side effects (REQ-ORD-030).**

## 31. Reconciliation

- **Purpose (REQ-ORD-031):** detect divergence between order, payment,
  fulfillment, shipment, inventory, return, and refund state.
- **Native anchors (verified):** `order_summary` (per version),
  `order_transaction` ledger (reference capture/refund), payment collection
  aggregates (`authorized_amount`/`captured_amount`/`refunded_amount`),
  computed payment/fulfillment statuses, per-item fulfillment quantities,
  reservation state (inventory).
- **Mismatch classes (REQ-ORD-031):** payment captured but order displays
  unpaid; order exists but fulfillment missing; fulfillment exists but no
  shipment/tracking; delivered but tracking stale; internal refund vs
  provider disagreement; inventory deduction ≠ fulfillment quantity.
- **Mechanism (T-ORD-12):** scheduled reconciliation job comparing native
  aggregates vs provider state (payments §16; shipping §22); discrepancies
  surfaced to Admin. **Never auto-mutate to a success state without verified
  evidence** (payments REQ-PAY-029; REQ-ORD-031).
- **Policy:** reconciliation cadence is a business decision (payments
  B-PAY-16); no automated business behavior is invented here.

## 32. Business Decision Register

**Resolution status (2026-08-16): all decisions resolved via the Business
Decision Phase. Canonical mapping per
`docs/architecture/consolidated-decision-register.md`.**

| ID | Business decision | Why required | Options | Recommendation | Status | Canonical |
| --- | --- | --- | --- | --- | --- | --- |
| B-ORD-01 | Guest/order lookup policy (incl. single-order retrieval access) | Native `GET /store/orders/:id` is unauthenticated + ID-addressed (verified) | ID-addressed only (native) · authenticated-customer-only + ownership check · guest by email+order reference/token | **Authenticated-customer ownership check; guest lookup by email + reference** | **APPROVED** | BD-O-01 |
| B-ORD-02 | Order cancellation window (customer) | No native customer cancel route | none / within X hours / until fulfillment | **until fulfillment (cancel before fulfillment only)** | **APPROVED** | BD-O-02 |
| B-ORD-03 | Cancellation after payment (refund behavior) | Payment + policy | auto-refund (native) / manual | **Auto-refund via native workflow** | **DERIVED** (BD-O-02) | BD-O-03 |
| B-ORD-04 | Cancellation after fulfillment/shipment | Fulfillment state | not allowed / return process only | **Not allowed; use returns** | **DERIVED** (BD-O-02) | BD-O-04 |
| B-ORD-05 | Partial cancellation | Native primitives exist | not offered / per line item | **not offered in V1** | **DERIVED** (BD-O-02) | BD-O-05 |
| B-ORD-06 | Order modification policy (items/quantity/shipping after placement) | Native order changes exist; policy | none / admin-only / customer window | **none by customer; admin-only via native edits** | **APPROVED** | BD-O-06 |
| B-ORD-07 | Address-change policy after placement | Snapshot vs edits | none / pre-shipment only / admin-only | **immutable; admin-only changes** | **APPROVED** | BD-O-07 |
| B-ORD-08 | Order number format | `display_id` native; branding | native `display_id` / custom `custom_display_id` | native `display_id` | **IMPLEMENTATION_DEFINED** | BD-O-08 |
| B-ORD-09 | Invoice requirements | No native invoicing verified | none / PDF invoice / order-page only | — | DEFERRED (P3) | BD-O-09 |
| B-ORD-10 | Customer-visible status vocabulary | UX on native statuses | native vocabulary / normalized labels | normalized labels over native state | **DERIVED** (state model) | BD-O-10 |
| B-ORD-11 | Admin override policy (who may cancel/refund/edit) | RBAC + audit | least-privilege roles per RBAC | **native admin + RBAC + audit** | **APPROVED** | BD-O-11 |
| B-ORD-12 | COD order behavior | Payments COD (B-PAY-03) | — | — | **APPROVED — no COD in V1** (alias of B-PAY-03) | BD-P-03 |
| B-ORD-13 | Failed-payment order retention | Orders can exist unpaid | auto-cancel / retain / re-try window | — | DEFERRED (P2) | BD-O-12 |
| B-ORD-14 | Expired/abandoned order cleanup | No native retention | none / X days | — | DEFERRED (P2) | BD-O-12 |
| B-ORD-15 | Order archival policy | Native archive exists | manual / automatic | **retain per legal minimum; anonymize on request; no auto-delete V1** | **APPROVED** | BD-O-13 |
| B-ORD-16 | Data-retention requirements | Legal/ops | per local law | (see BD-O-13) | **APPROVED** | BD-O-13 |
| B-ORD-17 | Order deletion/anonymization | Privacy | none / anonymize on request | (see BD-O-13) | **APPROVED** | BD-O-13 |
| B-ORD-18 | Notification policy per order event | Consent + UX | per event matrix | transactional auto; marketing per consent | DEFERRED (P2 — notifications spec) | BD-O-14 |
| B-ORD-19 | Account creation after guest purchase / guest-order association | Transfer mechanism native | transfer on signup / manual / none | **transfer on signup** | **DERIVED** (BD-G-01) | BD-O-15 |
| B-ORD-20 | Order completion semantics (auto vs admin) | `completed` status set via admin route | auto on full payment+fulfillment / admin | — | **MEDUSA_DEFINED** (native completion) | BD-O-16 |
| B-ORD-21 | Draft orders usage (internal) | `is_draft_order` native | unused / internal ops | unused in V1 | DEFERRED (P3) | BD-O-17 |
| B-ORD-22 | Claims/exchanges offered? | Native claim/exchange exist | none / claims / exchanges | **none in V1** | **APPROVED** | BD-O-18 |

## 33. Technical Decision Register

| ID | Question | Evidence (verified) | Recommendation |
| --- | --- | --- | --- |
| T-ORD-01 | Order workflow mapping | `completeCartWorkflow`, `createOrderWorkflow`, lifecycle/order-change/claim/exchange/return workflows | Use native workflows exclusively; no custom order engine |
| T-ORD-02 | Order creation transaction boundary | `createOrdersStep` inside locked completion with compensation | Native workflow is the boundary; never direct DB writes to order tables |
| T-ORD-03 | Snapshot behavior | `cartToOrder` + `order_summary` per version | Native snapshot; version bumps for authorized changes |
| T-ORD-04 | Event architecture | `OrderWorkflowEvents` + payment/fulfillment events | Subscribers on native events; no duplicate event bus |
| T-ORD-05 | Idempotency persistence | `order_cart` link + workflow engine + PostgreSQL | Native; no custom idempotency store |
| T-ORD-06 | Concurrency ownership | cart lock, payment row locks, reservation locking (all verified) | Medusa workflow/module layer owns it; no app-level locking |
| T-ORD-07 | Order-number generation | `display_id` auto-increment (verified model) | Native `display_id` unless B-ORD-08 decides custom |
| T-ORD-08 | Guest/customer association | transfer workflows + routes (verified) | Native transfer on signup (per B-ORD-19) |
| T-ORD-09 | Single-order access enforcement | `GET /store/orders/:id` unauthenticated (verified; source TODO) | Custom store middleware or route override enforcing the B-ORD-01 decision (ownership check / lookup policy) — mirrors cart T-CC-01 |
| T-ORD-10 | Admin authorization | RBAC policies verified on all sensitive order routes | Native RBAC roles/policies; least privilege per B-ORD-11 |
| T-ORD-11 | Audit mechanism | Native `captured_by`/`created_by`/`marked_shipped_by` + events | Native attribution + Admin views; no custom audit subsystem unless a verified gap |
| T-ORD-12 | Reconciliation mechanism | Native aggregates + transactions ledger | Scheduled job comparing native aggregates vs provider state; Admin surfacing; never auto-mutates to success |
| T-ORD-13 | Order search strategy | `getOrdersListWorkflow`, `/admin/orders/export` | Native query + export; no Elasticsearch; tracking-number search via fulfillment query if required |
| T-ORD-14 | Historical data retention | No native retention | DB-level per B-ORD-16/17 policy; verify MikroORM/DB tooling at implementation |
| T-ORD-15 | Observability | Structured logging requirements | Log order/display_id/customer/region/currency context; never PII in full |
| T-ORD-16 | Background processing | Event bus + jobs | Subscribers/jobs for notifications and reconciliation only; never move authoritative order mutations to async jobs |
| T-ORD-17 | Order edit/versioning usage | `order_change` + `ChangeActionType` (verified) | Use native order changes if/when B-ORD-06 authorizes edits |

## 34. Requirements (REQ-ORD-###)

Groups: A. Creation/identity/snapshot · B. Ownership/authorization · C.
Lifecycle · D. Payment interaction · E. Fulfillment/inventory interaction ·
F. Cancellation · G. Modification · H. Returns/refunds boundary · I.
Totals/currency · J. Idempotency/concurrency · K. Admin/audit/observability ·
L. Events/notifications · M. Querying/customer experience · N.
Failure/reconciliation · O. Testing.

- **REQ-ORD-001** (A) Order creation is backend-authoritative via
  `completeCartWorkflow`/`createOrdersStep`; the storefront never supplies
  totals, prices, or quantities. Rationale: AGENTS.md §13; cart spec §13.
  Test: API/security (tampered totals). Dep: cart spec.
- **REQ-ORD-002** (A) A cart becomes an order exactly once; duplicate or
  concurrent completion yields the same order with a single set of effects.
  Rationale: AGENTS.md §15; cart spec §21. Test: concurrency (parallel +
  duplicate completion). Dep: cart spec.
- **REQ-ORD-003** (A) Order identity: `order.id` is system identity;
  `display_id` (auto-increment) is the customer/ops reference; format policy
  per B-ORD-08. Rationale: AGENTS.md §17 (stable identifiers). Test: unit.
- **REQ-ORD-004** (A) Order snapshot immutability: currency, line items
  (unit prices/titles/SKUs), discounts, tax, shipping, totals, and addresses
  are captured at placement and never rewritten by later catalog/config/
  customer-profile changes. Rationale: markets REQ-MP-005/029/030. Test:
  snapshot immutability (price/title/tax/shipping change after placement).
- **REQ-ORD-005** (A) Order items carry per-concern quantities
  (`fulfilled_quantity`, `shipped_quantity`, `delivered_quantity`,
  `return_requested_quantity`, `return_received_quantity`,
  `return_dismissed_quantity`, `written_off_quantity`). Rationale: AGENTS.md
  §11 (independent concerns). Test: state tests.
- **REQ-ORD-006** (B) Customer A must never access Customer B's orders,
  items, addresses, payment, fulfillment/shipment, return, refund, or
  personal data; enforcement server-side. Rationale: AGENTS.md §14/§26.3.
  Test: security (A↔B read/mutate).
- **REQ-ORD-007** (B) Store order listing is scoped server-side to the
  authenticated customer (`customer_id = actor_id`) and excludes draft
  orders. Rationale: verified route behavior; AGENTS.md §14. Test: API auth.
- **REQ-ORD-008** (B) Single-order retrieval access follows the approved
  B-ORD-01 decision; no order is exposed by ID alone without the approved
  policy. Rationale: verified unauthenticated route gap. Test: security
  (enumeration/lookup). Dep: B-ORD-01, T-ORD-09.
- **REQ-ORD-009** (C) Order lifecycle, payment status, fulfillment status,
  shipment status, return status, and refund state are independent, natively
  represented concerns; no custom single order-status enum. Rationale:
  AGENTS.md §11. Test: state-model property tests.
- **REQ-ORD-010** (C) Order lifecycle transitions use native workflows:
  pending → completed/archived/canceled; invalid transitions blocked natively
  (cancel of completed order; cancel with non-canceled fulfillments).
  Rationale: verified workflows. Test: workflow state-transition tests.
- **REQ-ORD-011** (D) Payment authorization/capture/refund occur through
  Medusa payment workflows; the browser never establishes payment success;
  storefront code never mutates payment state. Rationale: AGENTS.md §11/§12;
  payments REQ-PAY-008. Test: security + workflow.
- **REQ-ORD-012** (D) Order and payment state are consistent: payment status
  is derived from payment collection aggregates; a captured payment never
  displays as unpaid. Rationale: payments §9.2. Test: integration +
  reconciliation.
- **REQ-ORD-013** (E) Orders coordinate with native fulfillment workflows;
  fulfillment logic is never duplicated in the order domain. Rationale:
  AGENTS.md §4; shipping spec. Test: integration (createOrderFulfillmentWorkflow
  from order).
- **REQ-ORD-014** (E) Partial/split fulfillment and multiple shipments are
  representable on one order with per-item fulfillment quantities; no
  separate orders per warehouse. Rationale: shipping spec §14; inventory
  spec §16. Test: workflow (multi-location order).
- **REQ-ORD-015** (F) Order cancellation uses `cancelOrderWorkflow`: blocked
  for completed orders and orders with non-canceled fulfillments; refunds
  captured payments, cancels uncaptured payments, restores inventory
  (reservations) — each exactly once. Rationale: verified workflow; AGENTS.md
  §12. Test: workflow + duplicate cancel.
- **REQ-ORD-016** (F) Customer-initiated cancellation (window, eligibility)
  follows the approved B-ORD-02/03/04 policy; the store has no native cancel
  route today. Rationale: verified store API surface. Test: decision gate.
- **REQ-ORD-017** (G) Order modification uses native versioned order changes
  (order_change + `ChangeActionType`); no custom order-edit engine; policy per
  B-ORD-06/07. Rationale: verified models/workflows. Test: workflow (order
  change + version bump).
- **REQ-ORD-018** (H) "Returned" ≠ "refunded" and vice versa; return and
  refund state progress independently. Rationale: AGENTS.md §11. Test:
  state-transition tests. Dep: Returns & Refunds spec.
- **REQ-ORD-019** (H) Order items track return quantities natively
  (requested/received/dismissed/written-off). Rationale: verified model.
  Test: integration. Dep: Returns & Refunds spec.
- **REQ-ORD-020** (I) Totals are computed natively (`order_summary` per
  version) with invariants: refunded ≤ refundable; discounts never produce
  invalid totals; captured ≤ authorized where applicable; total ≥ 0.
  Rationale: AGENTS.md §12; payments §13. Test: property tests.
- **REQ-ORD-021** (I) Order currency is preserved for life; refunds are in
  the order currency; no silent conversion; cross-currency refund policy
  APPROVED — refuse (BD-M-08). Rationale: markets REQ-MP-002/
  031/032. Test: unit + integration.
- **REQ-ORD-022** (J) Idempotency for order creation, payment callbacks,
  cancellation, fulfillment/shipment creation, refunds, returns, admin
  overrides, and notifications: at most one authoritative effect. Rationale:
  AGENTS.md §15. Test: concurrency suite.
- **REQ-ORD-023** (J) Concurrency protection is owned by the Medusa
  workflow/module layer (cart lock, order_cart link, payment row locks,
  reservation locking); no application-level read-modify-write. Rationale:
  AGENTS.md §15; verified mechanisms. Test: concurrency suite.
- **REQ-ORD-024** (K) Admin order operations use native admin routes with
  native admin authorization (RBAC); sensitive operations server-side.
  Rationale: AGENTS.md §14/§26.5; verified policies. Test: authorization.
- **REQ-ORD-025** (K) Sensitive actions (cancellation, refunds, payment
  overrides, order edits, manual fulfillment/shipment) are auditable with
  actor attribution. Rationale: AGENTS.md §19. Test: audit assertions.
- **REQ-ORD-026** (L) Order events use native `OrderWorkflowEvents` +
  payment/fulfillment events; no duplicate event infrastructure. Rationale:
  AGENTS.md §15; verified events. Test: subscriber tests.
- **REQ-ORD-027** (L) Notifications are side effects; failure never corrupts
  order/payment/fulfillment state. Rationale: AGENTS.md §18. Test:
  notification boundary.
- **REQ-ORD-028** (M) Customer order experience exposes normalized order/
  payment/fulfillment/shipment status, tracking, quantities, pricing,
  discounts, tax, shipping, totals, and addresses; never raw provider
  payloads or unnecessary internal IDs. Rationale: AGENTS.md §14/§18;
  shipping §15. Test: API + E2E.
- **REQ-ORD-029** (M) Admin order querying supports order number, customer,
  date, status, payment/fulfillment state, market, currency, amount via
  native querying + export; no Elasticsearch. Rationale: AGENTS.md §11;
  verified routes. Test: integration.
- **REQ-ORD-030** (N) Known failures vs unknown external outcomes are
  distinguished; side-effecting external operations are never blindly retried
  without status determination. Rationale: AGENTS.md §15; payments/shipping
  failure models. Test: failure-path tests.
- **REQ-ORD-031** (N) Reconciliation detects order/payment/fulfillment/
  shipment/inventory/return/refund divergence using native aggregates; never
  auto-mutates to success without verified evidence. Rationale: payments
  REQ-PAY-028/029. Test: reconciliation tests.
- **REQ-ORD-032** (O) Strict TDD suite per §35 (unit/integration/concurrency/
  security/E2E) before/with implementation. Rationale: AGENTS.md §16. Test:
  CI gate.
- **REQ-ORD-033** (A) Draft orders (`is_draft_order = true`) are excluded
  from store exposure. Rationale: verified store filters. Test: API.
- **REQ-ORD-034** (B) Guest→customer order association uses native transfer
  workflows (request/cancel require auth; accept/decline token-based).
  Rationale: verified routes. Test: API. Dep: B-ORD-19.

## 35. Testing Requirements

(Specification only — no tests written in this task. TDD per AGENTS.md §16.)

**Unit:** order state calculations; totals invariants (`refunded ≤ refundable`,
`captured ≤ authorized`, totals ≥ 0); refund calculations; ownership checks;
authorization rules; validation; idempotency-key decisions; status
normalization (customer-visible vocabulary over native state).

**Integration (real DB + Medusa workflows):** order creation from cart
(snapshot); `cancelOrderWorkflow` (payment + reservation effects); completion
of an order; archive; order changes/edits (version bump, `order_summary`);
payment integration (authorize/capture/refund reflected in order payment
status); fulfillment integration (per-item quantities);
inventory integration (reservation/restoration); customer authorization
(listing scoping); admin authorization (RBAC on sensitive routes).

**Concurrency:** duplicate order creation; duplicate cancellation; payment
callback race; fulfillment/cancellation race; refund race;
inventory/fulfillment race; two-admin same-action.

**Security:** IDOR (A↔B orders/items/addresses/payment/fulfillment); order
enumeration; unauthorized customer; unauthorized admin; tampered totals;
tampered status; tampered customer ID; guest lookup without credentials.

**E2E:** guest checkout → order creation; customer checkout → order creation;
order history; order detail; tracking; cancellation where allowed; partial
fulfillment; return/refund integration once those specifications are
implemented.

Tests verify behavior and invariants, not coverage (AGENTS.md §16).

## 36. Traceability Matrix

Requirement → section → Medusa capability → business decision → technical
decision → test expectation. Every REQ-ORD-* appears; no empty cells without
an explicit "N/A".

| REQ | Section | Medusa capability | Business decision | Technical decision | Test |
| --- | --- | --- | --- | --- | --- |
| REQ-ORD-001 | §6 | completeCartWorkflow/createOrdersStep | N/A | T-ORD-01/02 | API/security (tampered totals) |
| REQ-ORD-002 | §6 | cart lock + order_cart idempotency | N/A | T-ORD-05 | concurrency (parallel + duplicate completion) |
| REQ-ORD-003 | §6 | order.id, display_id | B-ORD-08 | T-ORD-07 | unit |
| REQ-ORD-004 | §7 | cartToOrder snapshot, order_summary | B-ORD-07 | T-ORD-03 | snapshot immutability |
| REQ-ORD-005 | §4/§16 | order_item quantity fields | N/A | N/A | state tests |
| REQ-ORD-006 | §8/§29 | store listing scoping + auth | B-ORD-01 | T-ORD-09 | security (A↔B) |
| REQ-ORD-007 | §8/§28 | GET /store/orders (customer_id filter) | N/A | N/A | API auth |
| REQ-ORD-008 | §8/§9 | GET /store/orders/:id (gap) | B-ORD-01 | T-ORD-09 | security (enumeration/lookup) |
| REQ-ORD-009 | §4/§10 | OrderStatus + computed statuses | N/A | N/A | state-model property tests |
| REQ-ORD-010 | §10 | complete/archive/cancel workflows | B-ORD-20 | N/A | workflow state-transition |
| REQ-ORD-011 | §11 | authorize-at-completion; payment workflows | N/A | N/A | security + workflow |
| REQ-ORD-012 | §11 | getLastPaymentStatus | N/A | T-ORD-12 | integration + reconciliation |
| REQ-ORD-013 | §12 | createOrderFulfillmentWorkflow | N/A | T-ORD-01 | integration |
| REQ-ORD-014 | §12/§16 | per-item quantities; per-location fulfillments | B-SHIP-12 | N/A | workflow (multi-location) |
| REQ-ORD-015 | §14 | cancelOrderWorkflow | B-ORD-03 | N/A | workflow + duplicate cancel |
| REQ-ORD-016 | §14 | no store cancel route (verified) | B-ORD-02/03/04 | T-ORD-09 (if custom route) | decision gate |
| REQ-ORD-017 | §15 | order_change/ChangeActionType | B-ORD-06/07 | T-ORD-17 | workflow (order change) |
| REQ-ORD-018 | §17 | ReturnStatus + refund state | B-ORD-22 | N/A | state-transition |
| REQ-ORD-019 | §17 | order_item return quantities | Returns spec | N/A | integration |
| REQ-ORD-020 | §18 | computed totals + payment guards | N/A | N/A | property tests |
| REQ-ORD-021 | §19 | order.currency_code; refund currency | cross-currency APPROVED — refuse (BD-M-08) | N/A | unit + integration |
| REQ-ORD-022 | §22 | workflow/module idempotency | N/A | T-ORD-05 | concurrency suite |
| REQ-ORD-023 | §23 | locks, order_cart, reservation locking | N/A | T-ORD-06 | concurrency suite |
| REQ-ORD-024 | §24 | admin routes + RBAC | B-ORD-11 | T-ORD-10 | authorization |
| REQ-ORD-025 | §27 | captured_by/created_by/marked_shipped_by | N/A | T-ORD-11 | audit assertions |
| REQ-ORD-026 | §21 | OrderWorkflowEvents | N/A | T-ORD-04 | subscriber tests |
| REQ-ORD-027 | §26 | event bus + notifications boundary | B-ORD-18 | T-ORD-16 | notification boundary |
| REQ-ORD-028 | §25 | store order response | B-ORD-01/10 | T-ORD-09 | API + E2E |
| REQ-ORD-029 | §28 | getOrdersListWorkflow, export | N/A | T-ORD-13 | integration |
| REQ-ORD-030 | §30 | workflow idempotency + provider status | N/A | T-ORD-06 | failure-path |
| REQ-ORD-031 | §31 | native aggregates + transactions | payments B-PAY-16 | T-ORD-12 | reconciliation |
| REQ-ORD-032 | §35 | N/A | N/A | N/A | CI gate |
| REQ-ORD-033 | §9 | is_draft_order store filter | B-ORD-21 | N/A | API |
| REQ-ORD-034 | §8/§9 | transfer workflows/routes | B-ORD-19 | T-ORD-08 | API |

## 37. Verification Record

**Verification record (AGENTS.md §27.4):**

```
Medusa version: 2.19.0 (locked; unchanged)
Relevant packages: @medusajs/order, @medusajs/types, @medusajs/utils,
  @medusajs/core-flows, @medusajs/medusa (all 2.19.0)
Relevant APIs: Order/OrderItem/OrderLineItem/OrderTransaction/OrderSummary/
  OrderChange/OrderChangeAction/Return/Claim/Exchange models; OrderStatus,
  ReturnStatus, ClaimType, ClaimReason, ChangeActionType enums; getLastPaymentStatus,
  getLastFulfillmentStatus aggregates; completeCartWorkflow, cancelOrderWorkflow,
  completeOrderWorkflow, archiveOrdersWorkflow, createOrderWorkflow; order-edit/
  claim/exchange/return/transfer workflows; store + admin order routes; admin RBAC
  policies; OrderWorkflowEvents
Installed source verification: order.d.ts (fields, OrderStatus, display_id),
  order-item.d.ts (per-concern quantities), order-summary.d.ts (per-version totals),
  transaction.js (amount/currency/reference/version), order-change.js (status/change_type/
  actions/version), order-change-action.d.ts (ChangeActionType 24 values), utils order/status.d.ts
  (OrderStatus/ReturnStatus/ClaimType/ClaimReason), core-flows aggregate-status.js
  (getLastPaymentStatus/getLastFulfillmentStatus), order/workflows/cancel-order.js
  (validation + refund/reservation/cancel-payment/emit), order/workflows/* listing
  (order-edit, claim, exchange, return, transfer), api/store/orders/{route,middlewares,[id]/route}
  (list requires auth + customer_id filter; detail route unauthenticated with source TODO),
  api/admin/orders/middlewares.js (RBAC read/update/create), core-flows/events.js
  (OrderWorkflowEvents), apps/storefront/src/lib/data/orders.ts
Official docs verification: not required beyond the installed-source hierarchy for this
  specification-only task; official docs (docs.medusajs.com) are the next layer for the
  exact 2.19.0 version at implementation
Context7 verification: Context7 MCP tools were NOT invocable in this environment
  (no MCP server configured — .agents/mcp.json is empty; no Context7 MCP tools available).
  Context7 was NOT used and is not claimed to have been used. Installed 2.19.0 source
  (rank #1 in AGENTS.md §27.3) is the verification basis.
Compatibility result: all behavior defined above verified against installed 2.19.0.
  No Medusa v1 concepts used (no v1 order.payment_status/fulfillment_status fields, no
  v1 shipping_method-only model, no legacy draft-order flows).
Implementation boundary: specification-only; no code/config/dependency/migration/
  storefront/Admin/database changes.
```

**Sources:**

- `@medusajs/order@2.19.0` — models: order.d.ts, order-item.d.ts,
  line-item.d.ts, order-summary.d.ts, transaction.js, order-change.js,
  order-change-action.d.ts, address.d.ts, return.d.ts, claim.d.ts,
  exchange.d.ts, credit-line.d.ts, shipping-method*.d.ts.
- `@medusajs/utils@2.19.0` — dist/order/status.d.ts (`OrderStatus`,
  `ReturnStatus`, `ClaimType`, `ClaimReason`), dist/order/order-change-action.d.ts
  (`ChangeActionType`), dist/core-flows/events.js (`OrderWorkflowEvents`).
- `@medusajs/core-flows@2.19.0` — order/utils/aggregate-status.js
  (`getLastPaymentStatus`, `getLastFulfillmentStatus`); order/workflows/
  {cancel-order, complete-orders, archive-orders, create-order, update-order,
  create-order-change(-actions), cancel-order-change, add-line-items,
  update-tax-lines, create-order-credit-lines, create-order-payment-collection,
  maybe-refresh-shipping-methods}; order/workflows/{order-edit, claim,
  exchange, return, transfer, payments}/*.
- `@medusajs/medusa@2.19.0` — api/store/orders/{route,middlewares,[id]/route,
  validators} (auth + scoping verified); api/admin/orders/middlewares.js
  (RBAC policies); api/admin/{order-changes, order-edits, claims, exchanges,
  returns, draft-orders}.
- Live DB `medusa-baby-store` — order tables verified during the deep audit
  (order, order_item, order_line_item, order_change, order_transaction,
  order_summary, return, claim, exchange, credit_line, order_shipping_method).
- Storefront boundary: `apps/storefront/src/lib/data/orders.ts`.
- Existing specs: markets-and-pricing.md, cart-and-checkout.md, payments.md,
  shipping-and-fulfillment.md, inventory-and-warehouses.md,
  docs/architecture/{authentication-authorization, medusa-capability-matrix,
  gap-analysis}.md, AGENTS.md.

## 38. Implementation Constraints

- Medusa remains the commerce engine. Do not build a custom order management
  system or a duplicate order state machine.
- Do not duplicate payment state, fulfillment state, inventory accounting, or
  customer identity — consume Medusa's modules/workflows.
- Do not bypass Medusa workflows (no raw SQL/ORM mutations against
  Medusa-owned order/payment/fulfillment tables — AGENTS.md §15).
- Do not trust frontend order data; backend resolves and snapshots all
  monetary values.
- Do not invent APIs or provider behavior; verification hierarchy per
  AGENTS.md §27 (installed 2.19.0 source > official docs > Context7 >
  inference).
- Do not create custom persistence when Medusa represents the requirement
  natively.
- No business rule from the register (§32) may be chosen without authorization
  (AGENTS.md §5); no dependency additions without the dependency protocol
  (§17).
- Tests before implementation (AGENTS.md §16); concurrency and security tests
  mandatory.

## 39. Definition of Done

Orders is complete only when: Medusa capability verified against installed
2.19.0; tests written first and passing (unit/integration/concurrency/
security/E2E); happy + failure + authorization + validation + concurrency
paths tested; idempotency demonstrated; order/payment/fulfillment/shipment/
return/refund states proven independent; TypeScript/lint/build pass; no
secrets; no business rule silently chosen (B-ORD register respected); docs
updated; backward compatibility preserved (existing carts/orders); no
architecture drift (no custom order engine, native workflows used, store
order access decision B-ORD-01/T-ORD-09 resolved).

---

**Implementation performed:** NONE (specification-only).
**Architecture changes:** NONE.
