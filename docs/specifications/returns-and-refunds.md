# Returns & Refunds Specification

**Status:** AUTHORITATIVE (specification phase)
**Platform:** Medusa v2.19.0 · Next.js storefront
**Markets:** Pakistan (PKR) · UAE (AED)
**Last updated:** specification phase

---

## 1. Purpose

This document is the authoritative contract for the **Returns & Refunds** domain
of the baby clothing e-commerce platform. It defines:

- how return requests are initiated, authorized, shipped, received, inspected,
  and accepted/rejected;
- how refunds are calculated, executed, and reconciled;
- the exact boundary between **native Medusa 2.19.0 behavior** (authoritative
  state, workflows, accounting, quantity tracking) and **required custom
  integration logic** (provider boundaries, authorization hardening,
  reconciliation);
- the invariants that must hold across return/refund/inventory/payment state;
- every unresolved business decision, registered explicitly so that
  implementation is never driven by invented rules.

It is **specification-only**. No source, configuration, dependency, schema,
storefront, Admin, payment-provider, or shipping-provider code is implemented by
this document or its companion updates.

## 2. Scope

In scope:

- Return request, authorization/decision, return shipment, return receipt,
  inspection, acceptance/rejection, inventory disposition.
- Refund eligibility, calculation, execution, completion/failure, partial and
  full refunds, duplicate/race protection.
- Payment-side refunds through Medusa's payment module and provider boundaries.
- Partial returns, multiple returns against one order.
- Exchanges and claims (native Medusa concepts — bounded, not invented).
- Customer-facing and Admin-facing contracts, authorization, auditability.
- Interaction with Order, Payment, Inventory, Shipping & Fulfillment, and
  Cart & Checkout state.

Out of scope / explicitly deferred:

- **Final business policies** (return window, refund timing, eligibility
  rules, shipping-fee refund rules, COD refund rules, etc.). **These are
  RESOLVED (2026-08-16): the `B-RET-*` register is APPROVED/DERIVED per
  `docs/architecture/consolidated-decision-register.md`** (14-day window,
  auto-accept + inspect on receipt, refund to original method after receipt,
  no restocking fee, customer-paid return shipping).
- **Provider contracts.** TCS/Aramex return-shipment and return-label
  capabilities are UNVERIFIED (see §35). Payment-provider refund behavior is
  UNVERIFIED until providers are selected (see `docs/specifications/payments.md`).
- Storefront UI, styling, and UX flows (backend capability only; see §28).
- Marketing/consent policy (referenced, not defined; see §26).

## 3. Non-goals

The platform explicitly does **not**:

- build a custom return engine, custom refund engine, or second order state
  machine;
- duplicate Medusa's native `Return`/`ReturnItem`/`ReturnReason` models or the
  native return/refund workflows;
- duplicate payment state, fulfillment state, inventory accounting, or
  customer identity;
- bypass Medusa workflows with direct database mutation of commerce state
  (AGENTS.md §15);
- invent return/refund business rules (AGENTS.md §5);
- introduce an alternative authentication framework (Better Auth is NOT used;
  §22);
- implement fake production adapters or placeholder provider logic
  (AGENTS.md §23).

## 4. Domain Ownership

| Concern | Owner | Rationale |
| --- | --- | --- |
| Return request/status/items | Medusa `order` module (`Return`, `ReturnItem`, `ReturnStatus`, native workflows) | Verified installed 2.19.0 models/workflows |
| Return reasons | Medusa `ReturnReason` (Admin-managed, hierarchical) | Verified model + admin routes |
| Return quantity accounting | Medusa `OrderItem` per-concern quantities (`return_requested_quantity`, `return_received_quantity`, `return_dismissed_quantity`, `written_off_quantity`) | Verified model (orders spec §4/§17) |
| Refund execution | Medusa `payment` module (`POST /admin/payments/:id/refund`, refund workflows) + provider adapter | Verified route/workflows |
| Refund accounting | Medusa `OrderTransaction` (reference = return), `credit_line` | Verified models |
| Inventory restoration | Medusa inventory module + return workflows | Verified receive-return flow |
| Return shipment | Medusa `OrderShipping` scoped to return + fulfillment provider boundary | Verified model (`shipping_methods` on `Return`); provider-specific behavior UNVERIFIED (§35) |
| Customer authorization | Custom store-route hardening (gap, §12/§22) | Verified store route lacks auth middleware |
| Admin authorization | Medusa Admin RBAC policies on return/refund routes | Verified middleware config |

**Medusa is authoritative for all commerce state.** Custom code is permitted
only at integration boundaries and where explicitly required (authorization
hardening, provider integration, approved reconciliation), per AGENTS.md §4.

## 5. Terminology

- **Return:** a `Return` record — a request to send ordered items back, with
  its own status lifecycle (`open → requested → received/partially_received →
  canceled`).
- **Return item:** a `ReturnItem` — one order line item's requested quantity,
  received quantity, damaged quantity, note, and reason.
- **Return reason:** a `ReturnReason` (Admin-managed `value`/`label`, optionally
  hierarchical via parent/children).
- **Return request:** the act of requesting a return (store or admin).
- **Return authorization:** the business decision to accept/reject a request.
  *Medusa's native model does not contain a separate "approved" status* — the
  platform status vocabulary is `ReturnStatus` plus the business decision
  register (§13). Authorization semantics beyond the native statuses follow
  the APPROVED policies (BD-R-02 auto-accept; BD-G-01 authenticated return
  path).
- **Return shipment:** the outbound (reverse-logistics) shipment carrying items
  back, represented as `OrderShipping` records on the `Return`.
- **Return receipt:** marking returned items as received
  (`received_quantity`, `received_at`).
- **Refund:** a payment-module refund executed against a captured payment,
  recorded as an `OrderTransaction` referencing the return.
- **Credit line:** a `credit_line` on the order representing money owed to the
  customer (native Medusa concept, used by claims).
- **Refundable amount:** the captured amount still eligible for refund
  (payments spec §13; captured − refunded).
- **Exchange/claim:** native Medusa `OrderExchange`/`OrderClaim` concepts;
  bounded in §21.

## 6. Existing Medusa Capabilities (verified in installed 2.19.0)

All items below were verified in the **installed** `@medusajs/order`,
`@medusajs/payment`, `@medusajs/medusa`, `@medusajs/core-flows`,
`@medusajs/utils` packages (see §38 Verification Record).

### 6.1 Models

- **`Return`** (`return_` id prefix): `display_id` (autoincrement), `status`
  (`ReturnStatus`, default `open`), `order_version`, `location_id` (nullable),
  `no_notification` (nullable), `refund_amount` (nullable bigNumber),
  `created_by` (nullable), `metadata`, `requested_at`/`received_at`/
  `canceled_at` (nullable), relations: `order`, `exchange` (nullable),
  `claim` (nullable), `items` (hasMany `ReturnItem`),
  `shipping_methods` (hasMany `OrderShipping`), `transactions` (hasMany
  `OrderTransaction`).
- **`ReturnItem`** (`retitem_` prefix): `quantity`, `received_quantity`
  (default 0), `damaged_quantity` (default 0), `note`, `metadata`, `reason`
  (belongsTo `ReturnReason`, nullable), `return`, `item` (belongsTo
  `OrderLineItem`).
- **`ReturnReason`** (`rr_` prefix): `value` (searchable), `label`
  (searchable, translatable), `description` (translatable, nullable),
  `parent_return_reason` / `return_reason_children` (self-referential).
- **`OrderTransaction`**: `amount`, `currency_code`, `reference`,
  `reference_id`, `version`, `actions` — refund/credit transactions reference
  the return via `reference_id` (orders spec §4).

### 6.2 Status vocabulary

- **`ReturnStatus`** (native enum): `open`, `requested`, `received`,
  `partially_received`, `canceled`.
- `OrderStatus`, computed payment/fulfillment statuses, and
  `ChangeActionType` are the orders spec's domain (§10/§13) and are not
  duplicated here. "Returned" and "refunded" are **not** order statuses; they
  are reflected in per-concern quantities, `Return` records, and refund
  transactions.

### 6.3 Native workflows (order/workflows/return/)

`beginReturnOrderWorkflow`, `cancelRequestReturnWorkflow`,
`cancelReturnWorkflow`, `confirmReturnRequestWorkflow`,
`createAndCompleteReturnOrderWorkflow`, `createReturnShippingMethodWorkflow`,
`dismissItemReturnRequestWorkflow`, `receiveAndCompleteReturnOrderWorkflow`,
`receiveItemReturnRequestWorkflow`, `refreshShippingOptionsWorkflow`,
`removeItemReturnActionWorkflow`, `removeReturnShippingMethodWorkflow`,
`requestItemReturnWorkflow`, `updateRequestItemReturnWorkflow`,
`updateReturnWorkflow`, `updateReturnShippingMethodWorkflow`,
`beginReceiveReturnWorkflow`, `cancelReceiveReturnWorkflow`,
`confirmReceiveReturnRequestWorkflow`, `removeItemReceiveReturnActionWorkflow`,
`updateReceiveItemReturnRequestWorkflow` — plus refund workflows in the
payment module (`refundPaymentWorkflow`, `refundCapturedPaymentsWorkflow`).

**Verified semantics:**
- `createAndCompleteReturnOrderWorkflow` (used by store + admin creation):
  validates the return reasons, **validates a supplied refund amount is ≤ the
  order's item total** (`validateCustomRefundAmount`), creates the return with
  requested items.
- `receiveAndCompleteReturnOrderWorkflow`: validates the return is not
  canceled and the items exist in the return, then marks them received
  (`receiveReturnStep` → `service.receiveReturn`).

### 6.4 Native API routes

- **Store:** `POST /store/returns` — **no authentication middleware
  (verified)**; accepts `order_id`, `items[]` (`id`, `quantity`, `reason_id`,
  `note`), `return_shipping` (`option_id`, **`price` optional — customer
  supplied**), `note`, `receive_now`, `location_id`; runs
  `createAndCompleteReturnOrderWorkflow`.
- **Admin returns** (all RBAC-protected on the `return` entity —
  read/create/update): `GET /admin/returns`, `GET /admin/returns/:id`,
  `POST /admin/returns`, `POST /admin/returns/:id`,
  `…/request-items`, `…/request-items/:action_id` (+ DELETE),
  `…/shipping-method`, `…/shipping-method/:action_id` (+ DELETE),
  `…/request`, `…/cancel`, `…/dismiss-items`, `…/dismiss-items/:action_id`,
  `…/receive-items`, `…/receive-items/:action_id`, `…/receive`,
  `…/receive/confirm`.
- **Admin refunds:** `POST /admin/payments/:id/refund` (RBAC: `payment` read,
  `capture` create, `refund` create); refund-reasons CRUD under
  `/admin/refund-reasons`.
- **Order credit lines:** `POST /admin/orders/:id/credit-lines`.

### 6.5 Events (verified)

- `OrderWorkflowEvents.RETURN_REQUESTED` = `"order.return_requested"`.
- `OrderWorkflowEvents.RETURN_RECEIVED` = `"order.return_received"`.
- Other order-domain events (`order.placed/updated/canceled/completed/
  archived`) belong to the orders spec (§21).
- No native "refunded" order event beyond the above; refund events are
  payment-module/provider events (payments spec).

### 6.6 Capability boundary summary

| Behavior | Native (Medusa) | Custom required |
| --- | --- | --- |
| Return record, status, items, reasons | ✔ | — |
| Return request creation (store/admin) | ✔ (workflow) | ownership/authz hardening (store route) |
| Return receipt, dismissal, partial receipt | ✔ | — |
| Refund execution vs captured payment | ✔ (payment module) | provider adapter (UNVERIFIED) |
| Inventory restoration on receipt | ✔ (return workflows + inventory module) | confirm exact step behavior at implementation |
| Return shipping method on return | ✔ (`OrderShipping` on `Return`) | provider rates/labels (UNVERIFIED) |
| Admin authorization | ✔ (RBAC policies) | — |
| Customer authorization | gap (store route unauthenticated) | custom route/middleware + policy |
| Reconciliation local vs provider | — | custom job (T-RET-*) |

## 7. Architecture Boundary

```
Customer/Storefront ──▶ Next.js ──▶ Medusa backend (authoritative)
                                          │
        Returns domain ── order module (Return/ReturnItem/ReturnReason,
        │                   native workflows, quantity accounting)
        │
        Refunds domain ── payment module (refund workflows) ──▶ payment provider boundary
        │
        Inventory ── inventory module (restoration on receipt)
        │
        Return shipping ── order module (OrderShipping on Return)
                              └──▶ fulfillment provider boundary (TCS/Aramex — UNVERIFIED)
```

- Provider-specific API details must **never** leak into generic return/refund
  workflows, order entities, or the storefront (AGENTS.md §4).
- The customer never mutates authoritative return/refund/inventory state
  directly; the browser is never authoritative.

## 8. Return Lifecycle

The return lifecycle is **one independent concern**; it does not drive order,
payment, or fulfillment status.

```
open ──▶ requested ──▶ received ──▶ (no further native transition; terminal)
   │          │            └── partially_received (receipt of subset, then
   │          │                subsequent receipts until fully received)
   │          └──▶ canceled
   └──────────▶ canceled (before request confirmation)
```

Native transitions (verified workflows):

| Transition | Trigger | Native workflow |
| --- | --- | --- |
| open → requested | request confirmed (items + optional shipping method) | `confirmReturnRequestWorkflow` / `createAndCompleteReturnOrderWorkflow` |
| requested → received | receipt confirmed | `receiveAndCompleteReturnOrderWorkflow` |
| requested → partially_received | partial receipt confirmed | `receiveAndCompleteReturnOrderWorkflow` (partial items) |
| partially_received → received | remaining items received | same workflow, subsequent run |
| any → canceled | cancellation | `cancelReturnWorkflow` / `cancelRequestReturnWorkflow` (pre-request) |

Notes:

- **No native "approved/rejected" status exists.** Approval/rejection is
  business policy (B-RET-*) layered on the native vocabulary; any
  implementation must not invent a parallel return status enum.
- **Return receipt is not refund.** Receipt updates item quantities and may
  trigger inventory restoration; refund execution is a separate concern
  (§9).
- Multiple returns against one order are supported (each `Return` is
  independent, linked to the order).

## 9. Refund Lifecycle

Refund state is derived from payment-module data (captured/refunded amounts,
`OrderTransaction` records) — not a custom enum.

```
captured payment ──▶ refund initiated (admin) ──▶ provider refund ──▶ refunded
                         │                            │
                         └──▶ failed ──▶ retry/override └──▶ partial refunds repeat
```

- **Execution authority:** Medusa payment module via
  `POST /admin/payments/:id/refund` (refund workflow); the provider adapter
  executes the external refund (UNVERIFIED until provider selection).
- **Refund completion is provider-verified server-side** — never from browser
  state (AGENTS.md §11/§12).
- A return's `refund_amount` field records the intended refund amount for the
  return; the actual financial effect is the payment-module refund +
  `OrderTransaction`.

## 10. State Model

The platform keeps **independent** concerns:

- order lifecycle (`OrderStatus`),
- payment status (computed `getLastPaymentStatus`),
- fulfillment status (computed `getLastFulfillmentStatus`),
- return status (`ReturnStatus` per `Return`),
- refund state (payment-module derived),
- inventory state (reservation/available).

Valid representable combinations (no single enum):

- `paid + return requested + not yet refunded`
- `received + partially refunded`
- `partially_received + refund pending`
- `return received + fulfillment unaffected`
- `return canceled + no refund`

**Invariants:**

- "Returned" never implies "refunded" and vice versa (REQ-RET-013).
- `ReturnStatus` and refund state progress independently; neither drives the
  other's transitions.
- Per-item return quantities are bounded by eligible ordered quantities
  (REQ-RET-011).

## 11. Eligibility

Native constraints (verified):

- Return items must reference order line items that exist on the order
  (`receiveAndCompleteReturnOrderWorkflow` throws if items are not in the
  return; item reference must exist).
- A supplied refund amount is validated ≤ the order's item total
  (`createAndCompleteReturnOrderWorkflow`).

**All other eligibility rules are business policy — RESOLVED (2026-08-16,
§33):** return window (B-RET-01 — 14 days), non-returnable products
(B-RET-03), sale-item returnability (B-RET-04), worn/damaged policy
(B-RET-05), hygiene policy (B-RET-06), verified-purchase/review eligibility
(reviews spec, not here), quantity limits per return (B-RET-25).

## 12. Return Request

### 12.1 Store-initiated

- Native route: `POST /store/returns` (runs
  `createAndCompleteReturnOrderWorkflow`).
- **Verified security gap:** the route has **no authentication middleware**;
  a caller supplies `order_id` and `items` directly. Without hardening, any
  caller could create a return request against any order id
  (IDOR/order-enumeration surface) and supply a `return_shipping.price`.
- **Required custom hardening (REQ-RET-003):** the store return flow must be
  gated by customer authentication and server-side order-ownership
  verification (customer owns the order) before invoking the native workflow.
  This may be implemented as a custom route wrapping the native workflow or
  route middleware; the native workflow remains the state authority.
- **`return_shipping.price` is customer-supplied (verified schema).**
  REQ-RET-004 requires the backend to disregard the client-supplied price and
  resolve return shipping cost server-side from the selected shipping option
  (mirroring cart checkout authority, cart spec §13).

### 12.2 Admin-initiated

- Native: `POST /admin/returns` + `…/request-items` + `…/request` (RBAC
  `return` create/update). Ownership checks do not apply (admin context).
- Refund amount on admin creation is validated by the native workflow.

## 13. Return Authorization

- **Native:** no separate "approved" status (see §8). Admin actions are
  `request`, `cancel`, `dismiss-items`, `receive`.
- **Business decision RESOLVED (B-RET-02/20, 2026-08-16):** APPROVED —
  auto-accept within window; no explicit pre-shipment approval; inspection
  on receipt; reject (dismiss) only for condition per the approved
  eligibility criteria. Implementation uses the native statuses (no custom
  approval workflow).
- Rejection after request maps to `cancelReturnWorkflow` (with reason
  captured in `note`/metadata) pending the B-RET-20 decision.

## 14. Return Shipment

Native representation:

- `Return.shipping_methods` (`OrderShipping` scoped to the return).
- Native workflows: `createReturnShippingMethodWorkflow`,
  `updateReturnShippingMethodWorkflow`, `removeReturnShippingMethodWorkflow`,
  `refreshShippingOptionsWorkflow` (rate refresh).

Provider-boundary facts (all **UNVERIFIED/TBD** — §35):

- TCS/Aramex return-shipment creation, return labels, return tracking,
  pickup, and reverse-logistics service levels are NOT verified.
- Return shipping cost policy (customer-paid vs merchant-paid) is APPROVED
  (B-RET-07 / BD-S-09 — customer pays; merchant pays only for defective).
- Whether a return shipment is mandatory before receipt is APPROVED
  (B-RET-21 / BD-R-07 — required before receipt).

No provider API details may be embedded in the return workflows (§7).

## 15. Return Receipt

Native:

- `receiveAndCompleteReturnOrderWorkflow` (validates non-canceled return and
  item membership) → `receiveReturnStep` → `service.receiveReturn` updates
  `received_quantity` per item and sets `received_at`.
- Partial receipt is natively supported (`partially_received` status;
  subsequent receipt of remaining items).
- `damaged_quantity` is captured per received item.

Receipt is the trigger point for inventory restoration and refund eligibility
per the approved policies (B-RET-*, see §16/§18). The exact ordering of
inventory restoration vs refund vs notification within the receive flow must be
verified against installed source at implementation (T-RET-10).

## 16. Inspection

- **Native:** no inspection workflow or status exists. Inspection is
  operational practice layered on native receive/dismiss actions.
- Dismissal of returned items is native: `dismissItemReturnRequestWorkflow` +
  admin `…/dismiss-items` routes (updates `return_dismissed_quantity`,
  `written_off_quantity` per orders spec §17).
- Inspection criteria and rejection-after-receipt policy are RESOLVED
  (B-RET-08/20, 2026-08-16 — DERIVED from BD-R-02/03: sellable = unused,
  tagged, undamaged; damaged/worn dismissed); `damaged_quantity` supports
  the data model.

## 17. Inventory Disposition

- Return receipt must restore inventory exactly once per received quantity
  (AGENTS.md §12; inventory spec §11/§16).
- **Restoration must be idempotent** — a retried receipt or duplicate callback
  must not restore twice (REQ-RET-016).
- **Native behavior must be verified at implementation (T-RET-10):** the
  exact step inside the receive-return flow that adjusts inventory, and its
  idempotency/transaction boundary, are to be confirmed against installed
  source; the inventory module owns accounting — the return domain never
  re-implements read/subtract/write (AGENTS.md §13).
- Returned items that are dismissed (not restocked) must not restore
  inventory; the disposition policy (restock vs write-off vs damaged) is
  business policy (B-RET-22).
- Cancellation of a return before receipt must not restore inventory.

## 18. Refund Calculation

Authoritative inputs:

- Captured amount and refunded amount from the payment module (payments spec
  §13: refunded ≤ captured; refunded ≤ refundable).
- The return's `refund_amount` (intended), validated ≤ order item total by the
  native workflow for the item total; **the binding upper bound is the
  payment-module refundable amount** (REQ-RET-018).
- Per-item quantities actually received (refund proportional to received
  quantity per the APPROVED policy B-RET-15/16 — full paid price of
  received items, prorated).

Business-policy components (all RESOLVED 2026-08-16 — see §33 and the
consolidated register):

- Refund basis (full item price vs received quantity vs prorated) — B-RET-15.
- Shipping-fee refund policy — B-RET-09.
- Tax refund policy — B-RET-10 (note: tax handling is Medusa-native per
  market config; refund tax follows payment-module/provider capabilities).
- Discount/promotion recalculation on refund — B-RET-11.
- Restocking fee / deduction — B-RET-17.

**Backend-authoritative:** the storefront never supplies refund amounts or
calculations (REQ-RET-017).

## 19. Refund Execution

Native:

- `POST /admin/payments/:id/refund` (RBAC: `refund` create) runs the refund
  workflow; the provider adapter performs the external refund.
- Refund records: `OrderTransaction` referencing the return; provider
  refund state (payments spec).
- Refund reasons: Admin-managed `RefundReason` records
  (`/admin/refund-reasons` CRUD).

Execution rules:

- Refunds only against **captured** payments (payments spec §13); never
  against uncaptured/authorized-only funds (REQ-RET-019).
- Refund amount ≤ refundable amount; duplicate refund requests produce at most
  one financial effect (REQ-RET-020, REQ-RET-021).
- Failed provider refunds must not be recorded as successful; a failed refund
  is retryable/overridable by admin, never auto-duplicated (REQ-RET-022).
- Currency must match the order/payment currency (orders spec §19); no silent
  conversion (REQ-RET-023).

## 20. Partial Returns / Refunds

- Multiple returns per order: supported natively (independent `Return`
  records).
- Partial return: request a subset of ordered quantities per item — natively
  bounded by eligible quantities (REQ-RET-011).
- Partial refund: multiple refund transactions against the same payment,
  each bounded by the remaining refundable amount (REQ-RET-024).
- Partial receipt → partial refund flow is allowed per the approved policy
  (B-RET-16 / BD-P-08 — prorated by received quantity).
- No separate order is created for a partial return (AGENTS.md §11; orders
  spec §16).

## 21. Exchanges / Claims

Native Medusa concepts (bounded):

- `OrderClaim` (`ClaimType`: refund/replace; `ClaimReason`:
  missing_item/wrong_item/production_failure/other) and `OrderExchange` exist
  in the installed order module with claim/exchange workflows and admin
  routes; `Return` has nullable `claim`/`exchange` relations.
- **Business policy RESOLVED (B-RET-23, 2026-08-16):** APPROVED —
  exchanges/replacements **not offered in V1** (BD-O-18); native
  claim/exchange primitives remain dormant. Until then, implementation must
  not enable custom claim/exchange
  flows beyond native admin capabilities.
- Claim refunds use `credit_line` + refund workflows; the same refund
  invariants apply.

## 22. Authorization / Security

### 22.1 Customer authorization

- **Invariant (REQ-RET-025):** Customer A must never access, create, or
  mutate Customer B's returns, refunds, return shipments, or refund
  information. Enforcement server-side.
- The native store route (`POST /store/returns`) is **unauthenticated
  (verified)** — a security gap. REQ-RET-003 hardens it (auth + ownership).
- No store route exposes return/refund state by ID today (store API surface is
  order-scoped); any future store return-detail endpoint must enforce
  ownership (T-RET-04).
- Customer identity derives from Medusa auth (AGENTS.md §26); never from
  browser-supplied customer/order IDs.

### 22.2 Admin authorization

- Native RBAC policies verified on all admin return routes (`return`:
  read/create/update) and refund route (`payment` read, `capture` create,
  `refund` create).
- Sensitive operations (approve/reject if layered, refunds, inventory
  disposition, dismissals) must be authorized per the platform's admin
  authorization model, enforced server-side (AGENTS.md §14). No custom RBAC
  unless the native model cannot satisfy a requirement (T-RET-06).
- "Customer authenticated" never implies "admin authorized" (AGENTS.md §26.5).

### 22.3 Threats

Protection required (REQ-RET-026): IDOR, return/order ID enumeration,
customer-supplied refund amounts/statuses/customer/order IDs, replay attacks,
duplicate refunds, concurrent return/refund races, webhook/callback races,
provider failure after local refund creation, partial failure, sensitive-data
leakage. The browser is never authoritative.

## 23. Idempotency / Concurrency

Required idempotency (REQ-RET-027): return request creation, receipt,
dismissal, cancellation, refund execution, provider callbacks, retries.

Required concurrency analysis (REQ-RET-028) — each case must have an
authoritative owner (native workflow/module lock or approved custom
mechanism):

1. Duplicate return request (same order+items).
2. Duplicate return callback / duplicate receipt.
3. Duplicate refund request.
4. Refund retry after timeout (provider outcome unknown — never blindly
   retry; reconcile first, payments spec §13).
5. Provider succeeds but response lost (unknown external outcome — reconcile).
6. Provider rejects refund (failed state; admin override, not auto-retry).
7. Return accepted but refund fails.
8. Refund succeeds but notification fails (notification never blocks/rolls
   back financial state, AGENTS.md §18).
9. Return shipment created twice.
10. Return shipment callback before local response.
11. Return cancellation racing approval/receipt.
12. Return receipt racing cancellation.
13. Inventory restoration racing return retry (idempotent restoration).
14. Multiple partial returns/refunds concurrently.
15. Admin and customer actions racing.

Ownership of protection: Medusa workflows/module transactions first; custom
locking only where native mechanisms are insufficient (T-RET-09). No
read/subtract/write inventory patterns (AGENTS.md §13).

## 24. Failure Handling

| Failure | Required behavior |
| --- | --- |
| Refund provider timeout | Mark refund in-flight/unknown; do not mark successful; reconcile (REQ-RET-022) |
| Provider success, response lost | Reconcile via provider status lookup; never duplicate refund |
| Provider rejects refund | Failed state; admin decision (retry/override/credit line) |
| Return accepted, refund fails | Return stays received; refund retried per policy; notification of failure state |
| Receipt fails mid-workflow | Transactional rollback by workflow; retry idempotent |
| Return shipment creation fails | Return request preserved; shipment retry/cancel per policy |
| Duplicate/out-of-order callbacks | Idempotent processing; state-guarded transitions |
| Notification failure | Logged; never rolls back return/refund/inventory state |
| DB transaction failure | Native workflow transaction boundary; no partial commits |

Distinguish **known failure** from **unknown external outcome** (AGENTS.md §30
analog). Never blindly retry external operations that could duplicate
financial effects (REQ-RET-022).

## 25. Events

Native (verified): `order.return_requested`, `order.return_received`.
Order-domain events (`order.placed/updated/canceled/...`) per orders spec §21;
payment events per payments spec.

Required event handling (REQ-RET-029):

- Producers/consumers identified per event; idempotent consumers.
- No duplicate event infrastructure; subscribers consume native events.
- Refund completion event: use payment-module/provider events (payments spec);
  no invented "order.refunded" event unless a verified native equivalent
  exists.
- Provider events (TCS/Aramex return tracking) UNVERIFIED (§35) — do not
  fabricate.

## 26. Notifications

- Shipping notifications must be separated from authoritative return/refund
  state (AGENTS.md §18); notifications are never the source of truth.
- Candidate triggers (subject to consent policy — see AGENTS.md §18; no
  marketing/consent rules invented here): return request received, return
  authorized/rejected (per B-RET-*), return shipment created/dispatched,
  return received, refund issued/failed.
- Notification failure must not corrupt return/refund/inventory state.
- Provider return-tracking notifications UNVERIFIED (§35).

## 27. Reconciliation

Required reconciliation between return/refund records and payment-provider
refund state (REQ-RET-030), mirroring payments spec §16:

- Local refund recorded but provider disagrees (missing/partial/different
  amount).
- Return received but refund never executed.
- Inventory restored but provider/order records disagree.
- Duplicate refund across retries.

Mechanism: periodic reconciliation job (T-RET-13) using payment-module
provider status queries; automated behavior bounded by the reconciliation
policy (B-RET-24 — DEFERRED, P2). No provider-specific reconciliation until
provider contracts are verified (payments spec).

## 28. API / Storefront Contract

Backend capabilities the storefront may rely on (no UI decisions here):

- Request a return (authenticated; ownership-verified; server-side costs).
- View return status/details for the customer's own order(s) (per approved
  T-RET-04 design; not exposed by ID alone).
- View refund status/amount/timeline for the customer's own order.
- View rejected-return reason.
- View return shipment/tracking (per shipping spec tracking requirements;
  provider-verified tracking UNVERIFIED).
- Cancel a return request where permitted (APPROVED — B-RET-12 / BD-R-06:
  customer may cancel until shipped).

**Not provided by this spec:** UI styling, UX flows, copy, or layout.

## 29. Admin Contract

Admin capabilities (server-side authorized via native RBAC; sensitive
operations auditable per §30):

- List/retrieve returns (read).
- Create/request returns (create/update).
- Approve/reject **only per the APPROVED policy** (native model has no
  approve status — B-RET-02/20 APPROVED: auto-accept; dismissal only for
  condition).
- Manage return items (request/dismiss/receive, incl. partial).
- Manage return shipping methods on the return.
- Cancel returns.
- Issue partial/full refunds (`POST /admin/payments/:id/refund`) with refund
  reason.
- Manage return reasons (CRUD).
- View audit history for returns/refunds (per §30).

No custom RBAC infrastructure unless native cannot satisfy a requirement
(T-RET-06).

## 30. Data / Audit Requirements

Auditable actions (REQ-RET-031): return creation, cancellation, dismissal,
receipt, refund execution/failure/override, inventory disposition overrides,
return-reason changes, administrative overrides of any return/refund state.

Native audit support (verified): `Return.created_by`,
`OrderTransaction` records with `reference_id`/`actions`, `RefundReason`,
RBAC policy enforcement. No custom audit subsystem unless Medusa cannot
provide the required record (AGENTS.md §19; T-RET-12).

Structured logging context (REQ-RET-032): order id, return id, refund
transaction id, customer id (where appropriate), provider, provider refund
id, market, currency, request/correlation id. Never log secrets, card data,
or unnecessary personal data (AGENTS.md §14/§15).

Data retention/archival/anonymization: APPROVED (B-RET-18/19 / BD-O-13 —
retain per legal minimum; anonymize on request; no auto-delete in V1).

## 31. Testing Strategy

Future strict-TDD coverage (this is a contract for implementation-time tests;
**no tests are written by this task**):

**Unit:** eligibility checks, quantity calculations (received vs requested vs
eligible), refund calculations (bounds, proration per approved policy), refund
currency, ownership checks, status transitions, invariant assertions.

**Integration:** native return workflows (create/confirm/receive/dismiss/
cancel), refund workflows vs captured amounts, payment-collection integration,
fulfillment/return-shipping integration, inventory restoration (idempotency),
order quantity accounting (`return_requested/received/dismissed`).

**Security:** IDOR (customer A ↔ B), unauthorized return/refund access,
customer-to-customer isolation, admin authorization (RBAC), tampered
amounts/statuses/customer/order IDs, enumeration.

**Concurrency:** duplicate return request, duplicate refund, refund retry,
return/refund race, return/inventory race (double restoration), admin/customer
race, duplicate callbacks.

**Contract (providers, UNVERIFIED until selected):** payment-provider refund
behavior (idempotency, failure, currency); TCS/Aramex return-shipment/label/
tracking behavior.

**E2E:** customer requests return → admin approves/receives → refund issued;
partial return; partial refund; failed refund → retry; authorization failures.
E2E requires sandbox providers (UNVERIFIED availability — §35).

## 32. Requirements Traceability

See §37 traceability matrix. Every `REQ-RET-*` has: normative statement,
rationale, authority/source, dependencies, and test expectation, all defined
in §36.

## 33. Business Decision Register (B-RET-*)

**Resolution status (2026-08-16): all decisions resolved via the Business
Decision Phase. Canonical mapping per
`docs/architecture/consolidated-decision-register.md`.**

| ID | Decision | Why it matters | Status | Affected REQs | Approved policy | Canonical |
| --- | --- | --- | --- | --- | --- | --- |
| B-RET-01 | Return window (days after delivery) | eligibility gate | **APPROVED** | REQ-RET-010 | **14 days after delivery** | BD-R-01 |
| B-RET-02 | Return approval/rejection requirement before return shipment | return lifecycle & storefront UX | **APPROVED** | REQ-RET-009 | **Auto-accept within window; inspect on receipt; reject only for condition** | BD-R-02 |
| B-RET-03 | Non-returnable product rules (e.g., final-sale) | eligibility | **APPROVED** | REQ-RET-010 | **Hygiene items + non-sellable condition excluded; sale items returnable** | BD-R-03 |
| B-RET-04 | Sale-item returnability | eligibility | **APPROVED** | REQ-RET-010 | **Sale items returnable (full-price policy applies)** | BD-R-03 |
| B-RET-05 | Worn/damaged-item policy | inspection/acceptance | **DERIVED** | REQ-RET-012 | **Damaged/worn → dismissed** | BD-R-04 |
| B-RET-06 | Hygiene-product policy (baby clothing — undergarments etc.) | eligibility/inspection | **APPROVED** | REQ-RET-010/012 | **Undergarments, opened/soiled items non-returnable** | BD-R-03 |
| B-RET-07 | Return shipping responsibility (customer vs merchant paid) | cost & refund math | **APPROVED** | REQ-RET-017 | **Customer pays; merchant pays only for defective** | BD-S-09 |
| B-RET-08 | Inspection criteria | receipt/acceptance | **DERIVED** | REQ-RET-012 | **Sellable = unused, tagged, undamaged** | BD-R-04 |
| B-RET-09 | Shipping-fee refund policy | refund calculation | **DERIVED** | REQ-RET-017 | **None on returns; only on full cancellation (BD-O-02)** | BD-S-18 |
| B-RET-10 | Tax refund policy | refund calculation | **DERIVED** | REQ-RET-017 | **Tax refunded proportionally with item refund** | BD-R-05 |
| B-RET-11 | Discount/promotion recalculation on refund | refund calculation | **DERIVED** | REQ-RET-017 | **Proportional to returned items (single promotion)** | BD-R-05 |
| B-RET-12 | Cancellation of return request (customer/admin; window) | lifecycle | **APPROVED** | REQ-RET-014 | **Customer may cancel return request until shipped** | BD-R-06 |
| B-RET-13 | Refund timing (after receipt? after inspection?) | refund execution | **APPROVED** | REQ-RET-019 | **After receipt + inspection** | BD-R-05 |
| B-RET-14 | Refund method (original payment method only? store credit?) | refund execution | **APPROVED** | REQ-RET-019 | **Original payment method only** | BD-R-05 |
| B-RET-15 | Refund basis (full price vs received qty vs prorated) | refund calculation | **APPROVED** | REQ-RET-017 | **Full paid price of received items** | BD-R-05 |
| B-RET-16 | Partial-refund policy (partial receipt → partial refund) | partial flows | **DERIVED** | REQ-RET-024 | **Prorated by received quantity** | BD-P-08 |
| B-RET-17 | Restocking fee / deduction | refund calculation | **APPROVED** | REQ-RET-017 | **None** | BD-R-05 |
| B-RET-18 | Failed/abandoned return retention & archival | data lifecycle | **APPROVED** | REQ-RET-031 | **Retain per legal minimum; anonymize on request** | BD-O-13 |
| B-RET-19 | Order/return data anonymization/deletion policy | data lifecycle | **APPROVED** | REQ-RET-031 | **(see BD-O-13)** | BD-O-13 |
| B-RET-20 | Rejection criteria + rejected-return customer communication | lifecycle | **DERIVED** | REQ-RET-009/012 | **Dismissed items per inspection criteria; rejection communicated** | BD-R-04 |
| B-RET-21 | Return shipment mandatory before receipt? | shipment/receipt | **APPROVED** | REQ-RET-015 | **Required before receipt (customer-paid)** | BD-R-07 |
| B-RET-22 | Inventory disposition policy (restock vs write-off vs damaged) | inventory | **DERIVED** | REQ-RET-016 | **Restock sellable; discard damaged** | BD-I-06 |
| B-RET-23 | Exchange/replacement offering & conditions | claims/exchanges | **APPROVED** | REQ-RET-033 | **Not offered in V1** | BD-O-18 |
| B-RET-24 | Reconciliation cadence & automated actions | reconciliation | DEFERRED (P2) | REQ-RET-030 | — | BD-P-13 |
| B-RET-25 | Quantity/attempt limits per return | eligibility | DEFERRED (P2) | REQ-RET-010 | — | BD-R-08 |

**COD refund behavior:** resolved — **no COD in V1** (payments B-PAY-03 /
BD-P-03); no COD refund rules exist in this domain.

## 34. Technical Decision Register (T-RET-*)

| ID | Question | Status | Affected REQs | Notes |
| --- | --- | --- | --- | --- |
| T-RET-01 | Store return route hardening mechanism (custom route wrapping native workflow vs middleware) | RESOLVED (2026-08-19) | REQ-RET-003/025 | **DONE:** global store middleware `/store/returns` (`src/api/middlewares.ts` + pure helper `src/api/store/returns/ownership.ts`). Requires customer auth (401 unauthenticated — REQ-RET-002); ownership via `customer_id` (403 mismatch, never revealing existence — mirrors T-CC-01/T-ORD-09); unknown order → native 404. Unit (7) + integration (6) tests green; T-RET-02 handled in same middleware |
| T-RET-02 | Server-side return shipping cost resolution (ignore client `price`) | RESOLVED (2026-08-19) | REQ-RET-004 | **DONE:** middleware deletes `req.body.return_shipping.price` before native zod validation (verified native `prepareShippingMethodData` honors client price when ≥ 0); native workflow resolves shipping-option price server-side. Integration test: tampered `price` ignored (shipping_methods.amount == option price) |
| T-RET-03 | Return shipment provider integration (TCS/Aramex) — rate/label/tracking | OPEN (UNVERIFIED provider) | REQ-RET-015 | See §35 |
| T-RET-04 | Customer return/refund view API (ownership-scoped) | OPEN | REQ-RET-006/025 | No ID-only exposure |
| T-RET-05 | Refund workflow mapping & transaction boundary | OPEN | REQ-RET-019..022 | Native payment module |
| T-RET-06 | Admin authorization for layered approve/reject (native RBAC sufficiency) | OPEN | REQ-RET-009 | No custom RBAC unless required |
| T-RET-07 | Idempotency persistence for return/refund operations | OPEN | REQ-RET-027 | Native workflow idempotency first; T-RET-09 |
| T-RET-08 | Return status/refund status normalization for storefront display | OPEN | REQ-RET-006 | No parallel enum; derived display |
| T-RET-09 | Concurrency ownership (native locks vs custom) | OPEN | REQ-RET-028 | Native first |
| T-RET-10 | Verify exact inventory-restoration step/idempotency in receive-return flow | OPEN (verify at implementation) | REQ-RET-016 | Against installed source |
| T-RET-11 | Return-shipping label storage (R2 via Medusa file module) if required | OPEN | REQ-RET-015 | Medusa storage abstraction first (AGENTS.md §11) |
| T-RET-12 | Audit mechanism for return/refund overrides | OPEN | REQ-RET-031 | Native records first |
| T-RET-13 | Reconciliation job design | OPEN | REQ-RET-030 | After provider selection |
| T-RET-14 | Return-shipping/tracking sync architecture | OPEN (UNVERIFIED provider) | REQ-RET-015 | See §35 |
| T-RET-15 | Customer-visible refund timeline source (OrderTransaction + provider status) | OPEN | REQ-RET-006 | Provider status UNVERIFIED |

## 35. Provider Contract Gaps

All provider-specific return/refund details are **UNVERIFIED/TBD**. No
endpoints, payloads, or status vocabularies are invented.

| Provider | Capability | Status |
| --- | --- | --- |
| TCS (PK) | Return-shipment creation, return labels, pickup, return tracking, delivery-exception handling, reverse-logistics service levels, COD return/refund settlement | UNVERIFIED/TBD |
| Aramex (AE) | Same set for UAE | UNVERIFIED/TBD |
| Payment provider (PK/AE) | Refund execution, partial refunds, refund idempotency, refund currency, failure codes, settlement timing | UNVERIFIED/TBD (payments spec — provider not selected) |

Contract tests for these capabilities are required at implementation time,
gated on provider selection and official-documentation verification
(AGENTS.md §27 hierarchy; payments spec §14).

## 36. Requirements (REQ-RET-###)

Groups: A. Initiation/eligibility · B. Lifecycle/state · C. Quantity/
inventory · D. Refund calculation · E. Refund execution · F. Partial/multiple
· G. Authorization/security · H. Idempotency/concurrency/failure · I.
Events/notifications · J. Reconciliation/audit/observability · K. Admin/API
contracts · L. Testing.

- **REQ-RET-001** (A) Return requests are created only through native
  Medusa return workflows; the storefront never creates or mutates `Return`
  records directly. Rationale: AGENTS.md §4/§15; §12. Test: API/security.
- **REQ-RET-002** (A) Store return requests require customer authentication
  and server-side verification that the order belongs to the authenticated
  customer before invoking the native workflow. Rationale: AGENTS.md §14/
  §26.3; verified unauthenticated store route (§12.1). Test: security (IDOR,
  unauthenticated request). Dep: B-RET-*, T-RET-01.
- **REQ-RET-003** (A) The store return request must not accept or honor
  customer-supplied return shipping price; shipping cost is resolved
  server-side from the selected shipping option. Rationale: verified schema
  (`return_shipping.price`); cart spec §13 backend authority. Test: API
  (tampered price ignored). Dep: T-RET-02.
- **REQ-RET-004** (A) Return quantities requested per item must be positive
  integers and must not exceed the eligible ordered quantity for that item.
  Rationale: verified validator (`quantity.min(1)`); inventory/orders
  quantity accounting. Test: unit + API. Dep: B-RET-01/03/04/25 (eligibility
  policy).
- **REQ-RET-005** (A) Return reasons come from Admin-managed `ReturnReason`
  records; customers select among configured reasons, not free-form statuses.
  Rationale: verified model/routes. Test: integration.
- **REQ-RET-006** (B) Customer return/refund visibility is scoped to the
  customer's own orders; no return/refund is exposed by ID alone without
  ownership verification. Rationale: AGENTS.md §14/§26.3; orders B-ORD-01
  analog. Test: security (enumeration). Dep: T-RET-04.
- **REQ-RET-007** (B) Return lifecycle uses native `ReturnStatus`; no custom
  return-status enum is introduced. "Approved/rejected" concepts, if required,
  layer on native state per approved B-RET-02/20 policy only. Rationale:
  AGENTS.md §11; §8. Test: state-model tests.
- **REQ-RET-008** (B) Return state, payment/refund state, fulfillment state,
  and order state progress independently; no transition in one concern
  auto-forces a transition in another without an approved rule. Rationale:
  AGENTS.md §11. Test: state-transition property tests.
- **REQ-RET-009** (B) Return request cancellation uses native cancel
  workflows (`cancelReturnWorkflow`/`cancelRequestReturnWorkflow`); cancel
  eligibility per approved B-RET-12 policy. Rationale: verified workflows.
  Test: workflow + duplicate-cancel. Dep: B-RET-12.
- **REQ-RET-010** (B) Return eligibility (window, excluded products, sale
  items, hygiene items, attempt limits) is enforced per approved B-RET-01/03/
  04/06/25 policy; no eligibility rule is implemented before its decision is
  approved. Rationale: AGENTS.md §5. Test: decision gate. Dep: B-RET-*.
- **REQ-RET-011** (C) Order item return quantities
  (`return_requested_quantity`, `return_received_quantity`,
  `return_dismissed_quantity`, `written_off_quantity`) are the authoritative
  per-item return accounting; quantities are never double-counted. Rationale:
  orders spec §4/§17 (verified fields). Test: integration + property tests.
- **REQ-RET-012** (C) Return receipt updates received quantities and status
  via the native receive workflow; dismissal updates dismissed/written-off
  quantities via the native dismiss workflow. Rationale: verified workflows.
  Test: integration. Dep: B-RET-05/08/20 (inspection policy).
- **REQ-RET-013** (C) "Returned" never implies "refunded" and vice versa;
  return receipt and refund execution are independent. Rationale: AGENTS.md
  §11. Test: state-transition tests.
- **REQ-RET-014** (C) A canceled return must not trigger inventory
  restoration or refund. Rationale: verified workflow guards; AGENTS.md §12.
  Test: workflow (cancel before receipt).
- **REQ-RET-015** (C) Return shipments are represented as `OrderShipping`
  on the `Return` and managed via native return-shipping workflows; provider
  (TCS/Aramex) rate/label/tracking behavior is UNVERIFIED and gated on
  provider selection. Rationale: verified model/workflows; §35. Test:
  contract (provider) + integration. Dep: B-RET-07/21, T-RET-03/11/14.
- **REQ-RET-016** (C) Inventory restoration on return receipt is idempotent
  and occurs exactly once per received quantity; a retried receipt or
  duplicate callback never restores twice. Rationale: AGENTS.md §12; inventory
  spec. Test: concurrency (double receipt/restoration). Dep: T-RET-10.
- **REQ-RET-017** (D) Refund amounts are calculated server-side from
  authoritative payment, order, and quantity data per approved B-RET-07/09/10/
  11/15/17 policy; the storefront never supplies refund amounts or totals.
  Rationale: AGENTS.md §13; payments spec. Test: API (tampered refund amount).
  Dep: B-RET-*.
- **REQ-RET-018** (D) Refund amount is bounded by both the native workflow
  validation (≤ order item total) and the payment-module refundable amount
  (captured − refunded); the binding upper bound is the refundable amount.
  Rationale: payments spec §13; verified workflow validation. Test: unit +
  property tests.
- **REQ-RET-019** (E) Refunds execute only against captured payments through
  the native payment-module refund workflow and provider boundary; never
  against uncaptured funds; timing per approved B-RET-13/14 policy. Rationale:
  payments spec §13. Test: workflow + security. Dep: B-RET-13/14.
- **REQ-RET-020** (E) A refund request produces at most one financial effect;
  duplicate refund requests and retries do not create duplicate refunds.
  Rationale: AGENTS.md §12 (refund idempotency). Test: concurrency
  (duplicate refund). Dep: T-RET-07.
- **REQ-RET-021** (E) Refunded amount never exceeds captured amount, and
  total refunded amount never exceeds refundable amount, at any point.
  Rationale: AGENTS.md §12; payments spec §13. Test: property tests +
  integration.
- **REQ-RET-022** (E) A failed or provider-rejected refund is never recorded
  as successful; unknown external outcomes are reconciled, never blindly
  retried. Rationale: AGENTS.md §15/§30; payments spec §13. Test: failure-path
  + reconciliation tests.
- **REQ-RET-023** (E) Refund currency matches the order/payment currency; no
  silent conversion; cross-currency refund policy APPROVED — refuse
  (BD-M-08). Rationale: orders spec §19; markets spec.
  Test: unit + integration.
- **REQ-RET-024** (F) Partial returns and multiple returns per order are
  supported; partial refunds are bounded by the remaining refundable amount;
  partial-refund flow per approved B-RET-16 policy. Rationale: §20; orders
  spec §16. Test: integration + property tests. Dep: B-RET-16.
- **REQ-RET-025** (G) Customer A must never access or mutate Customer B's
  returns, refunds, return shipments, or refund data; enforcement server-side.
  Rationale: AGENTS.md §14/§26.3. Test: security (A↔B read/mutate).
- **REQ-RET-026** (G) The return/refund surface is protected against IDOR,
  enumeration, tampered amounts/statuses/IDs, replay, and duplicate financial
  effects; the browser is never authoritative. Rationale: AGENTS.md §14/§29.
  Test: security suite.
- **REQ-RET-027** (H) Return request, receipt, dismissal, cancellation,
  refund execution, and provider callbacks are idempotent; at most one
  authoritative effect per operation. Rationale: AGENTS.md §15. Test:
  concurrency suite. Dep: T-RET-07/09.
- **REQ-RET-028** (H) All enumerated race conditions (§23) have an
  authoritative owner (native workflow/module mechanism or approved custom
  mechanism); no unguarded read-modify-write on return/refund/inventory state.
  Rationale: AGENTS.md §11/§15. Test: concurrency suite.
- **REQ-RET-029** (I) Return/refund events use native events
  (`order.return_requested`, `order.return_received`) and payment-module
  events; no duplicate event infrastructure; consumers are idempotent.
  Rationale: §25; AGENTS.md §18. Test: subscriber tests.
- **REQ-RET-030** (J) Return/refund records are reconciled against
  payment-provider refund state and inventory state on an approved cadence;
  mismatches are detected and surfaced. Rationale: §27; payments spec §16.
  Test: reconciliation tests. Dep: B-RET-24, T-RET-13.
- **REQ-RET-031** (J) Sensitive return/refund operations (creation,
  cancellation, dismissal, receipt, refund execution/failure/override,
  inventory disposition overrides) are auditable with actor, timestamp,
  before/after state. Rationale: AGENTS.md §19. Test: audit assertions.
  Dep: T-RET-12.
- **REQ-RET-032** (J) Return/refund logs carry structured context (order id,
  return id, refund transaction id, customer id where appropriate, provider,
  provider refund id, market, currency, correlation id) and never log secrets
  or unnecessary personal data. Rationale: AGENTS.md §15/§20. Test:
  observability assertions.
- **REQ-RET-033** (K) Exchanges/claims are bounded to native Medusa
  `OrderClaim`/`OrderExchange` capabilities and are not enabled for customers
  until the B-RET-23 policy is approved. Rationale: AGENTS.md §5; §21. Test:
  decision gate. Dep: B-RET-23.
- **REQ-RET-034** (K) All admin return/refund operations are server-side
  authorized through native RBAC policies; sensitive layered operations
  (approve/reject, refunds, disposition) require the appropriate permission.
  Rationale: AGENTS.md §14; §22.2. Test: authorization. Dep: T-RET-06.
- **REQ-RET-035** (L) Return/refund behavior is covered by unit, integration,
  security, concurrency, contract (provider), and E2E tests per §31 before
  implementation is considered complete. Rationale: AGENTS.md §16/§17. Test:
  CI gate.
- **REQ-RET-036** (A) The store return flow's `receive_now` behavior
  (verified schema option) is only honored per approved policy — immediate
  receipt implies the item is already in-hand and must not bypass
  authorization/ownership checks. Rationale: verified schema; §12. Test:
  security + workflow. Dep: T-RET-01.

## 37. Traceability Matrix

Requirement → section → Medusa capability → business decision → technical
decision → test expectation. Every REQ-RET-* appears; no empty cells without
an explicit "N/A".

| REQ | Section | Medusa capability | Business decision | Technical decision | Test |
| --- | --- | --- | --- | --- | --- |
| REQ-RET-001 | §12 | native return workflows | N/A | N/A | API/security |
| REQ-RET-002 | §12/§22 | createAndCompleteReturnOrderWorkflow (auth gap) | B-RET-02 | T-RET-01 | security (IDOR) |
| REQ-RET-003 | §12/§18 | shipping-option pricing; return_shipping schema | B-RET-07 | T-RET-02 | API (tampered price) |
| REQ-RET-004 | §11/§20 | validator qty min 1; order_item quantities | B-RET-01/03/04/25 | N/A | unit + API |
| REQ-RET-005 | §5/§12 | ReturnReason model + admin routes | N/A | N/A | integration |
| REQ-RET-006 | §28/§22 | store order-scoped data | B-RET-02 | T-RET-04/08 | security (enumeration) |
| REQ-RET-007 | §8/§10 | ReturnStatus | N/A | N/A | state-model |
| REQ-RET-008 | §10 | independent concerns | N/A | N/A | state-transition |
| REQ-RET-009 | §8/§24 | cancelReturnWorkflow | B-RET-12 | N/A | workflow + duplicate-cancel |
| REQ-RET-010 | §11 | eligibility hooks | B-RET-01/03/04/06/25 | N/A | decision gate |
| REQ-RET-011 | §17/§20 | order_item return quantities | N/A | N/A | integration + property |
| REQ-RET-012 | §15/§16 | receive/dismiss workflows | B-RET-05/08/20 | N/A | integration |
| REQ-RET-013 | §9/§10 | ReturnStatus vs refund state | N/A | N/A | state-transition |
| REQ-RET-014 | §15/§17 | cancel guards | N/A | N/A | workflow |
| REQ-RET-015 | §14 | OrderShipping on Return; return-shipping workflows | B-RET-07/21 | T-RET-03/11/14 | contract + integration |
| REQ-RET-016 | §17 | receive flow + inventory module | B-RET-22 | T-RET-10 | concurrency (double restore) |
| REQ-RET-017 | §18 | payment/order authoritative data | B-RET-07/09/10/11/15/17 | N/A | API (tampered amount) |
| REQ-RET-018 | §18 | workflow validation + refundable amount | N/A | T-RET-05 | unit + property |
| REQ-RET-019 | §9/§19 | refund workflow (captured only) | B-RET-13/14 | T-RET-05 | workflow + security |
| REQ-RET-020 | §19/§23 | payment refund idempotency | N/A | T-RET-07 | concurrency (duplicate refund) |
| REQ-RET-021 | §19/§18 | captured/refunded aggregates | N/A | N/A | property + integration |
| REQ-RET-022 | §24 | provider status (UNVERIFIED) | B-RET-13 | T-RET-13 | failure-path + reconciliation |
| REQ-RET-023 | §18/§19 | payment currency | cross-currency APPROVED — refuse (BD-M-08) | N/A | unit + integration |
| REQ-RET-024 | §20 | multiple Returns; multiple refunds | B-RET-16 | N/A | integration + property |
| REQ-RET-025 | §22 | auth + ownership checks | N/A | T-RET-01 | security (A↔B) |
| REQ-RET-026 | §22/§29 | native validation + RBAC | N/A | T-RET-01/05 | security suite |
| REQ-RET-027 | §23 | workflow idempotency | N/A | T-RET-07/09 | concurrency suite |
| REQ-RET-028 | §23 | module transactions/locks | N/A | T-RET-09 | concurrency suite |
| REQ-RET-029 | §25 | RETURN_REQUESTED/RECEIVED events | N/A | N/A | subscriber tests |
| REQ-RET-030 | §27 | provider status (UNVERIFIED) | B-RET-24 | T-RET-13 | reconciliation |
| REQ-RET-031 | §30 | created_by, OrderTransaction, RBAC | B-RET-18/19 | T-RET-12 | audit assertions |
| REQ-RET-032 | §30 | structured logging | N/A | N/A | observability |
| REQ-RET-033 | §21 | OrderClaim/OrderExchange | B-RET-23 | N/A | decision gate |
| REQ-RET-034 | §29 | admin RBAC policies | N/A | T-RET-06 | authorization |
| REQ-RET-035 | §31 | N/A | N/A | N/A | CI gate |
| REQ-RET-036 | §12 | receive_now schema option | B-RET-02 | T-RET-01 | security + workflow |

## 38. Verification Record

**Context7 MCP was not invocable in this environment.** No MCP server is
configured (`.agents/mcp.json` is empty); it is therefore honestly recorded as
unavailable, and no Context7 claims are made.

Verification basis (hierarchy applied):

1. **Installed Medusa 2.19.0 source/types** (primary): `@medusajs/order`
   models (`Return`, `ReturnItem`, `ReturnReason`, `OrderTransaction`),
   `@medusajs/utils` enums (`ReturnStatus`) and events
   (`OrderWorkflowEvents.RETURN_REQUESTED/RECEIVED`), `@medusajs/core-flows`
   return workflows (`createAndCompleteReturnOrderWorkflow`,
   `receiveAndCompleteReturnOrderWorkflow`, receive/dismiss/cancel/shipping
   workflows), `@medusajs/medusa` store/admin routes and middleware
   (`store/returns/middlewares.js`, `admin/returns/middlewares.js`,
   `admin/payments/[id]/refund`, `admin/return-reasons`,
   `admin/orders/[id]/credit-lines`), `@medusajs/payment` refund workflows.
2. **Official Medusa documentation:** not consulted for this task's facts;
   installed source was authoritative and sufficient.
3. **Context7 MCP:** unavailable (recorded above).
4. **Agent inference:** used only where explicitly marked (e.g., T-RET-10
   implementation-time verification items); never for business rules or
   provider contracts.

Verified specifics:

- `Return` model fields and relations — VERIFIED (installed source).
- `ReturnStatus` vocabulary — VERIFIED.
- `ReturnItem`/`ReturnReason` fields — VERIFIED.
- Native return workflow list and key semantics — VERIFIED.
- Store route `POST /store/returns` unauthenticated; schema accepts
  `order_id`, `items`, `return_shipping` (with optional `price`), `note`,
  `receive_now`, `location_id` — VERIFIED.
- Admin return routes RBAC (`return` read/create/update) — VERIFIED.
- Admin refund route RBAC (`payment` read, `capture` create, `refund` create)
  — VERIFIED.
- Events `order.return_requested` / `order.return_received` — VERIFIED.
- TCS/Aramex return-shipment capabilities — UNVERIFIED (see §35).
- Payment-provider refund capabilities — UNVERIFIED (payments spec; provider
  not selected).

### T-RET-01/02 Implementation Verification Record (2026-08-19)

```
Medusa version: 2.19.0 (locked; unchanged)
Relevant packages: @medusajs/medusa (api/store/returns middlewares + validators),
  @medusajs/order (return/return-item/return-reason models, return workflows),
  @medusajs/core-flows (createAndCompleteReturnOrderWorkflow)
Relevant APIs: POST /store/returns (native route, zod-validated schema with
  return_shipping.price; createAndCompleteReturnOrderWorkflow);
  Modules.ORDER.retrieveOrder(id, { select: ["id", "customer_id"] })
Installed source verification: store/returns/middlewares.js (no auth middleware),
  store/returns/validators.js (return_shipping.price accepted), order module
  return-item action (fulfilled-quantity bound), create-complete-return.js
  (shipping-method resolution + prepareShippingMethodData honoring client price)
Official docs verification: not required beyond installed source (hierarchy §27)
Context7 verification: Context7 MCP not invocable in this environment (recorded §38)
Compatibility result: verified against installed 2.19.0; no v1 concepts
Implementation boundary: global store middleware + pure decision helper + unit/
  integration tests in apps/backend; no dependency/config/DB/storefront changes
Tests: unit 7/7 (ownership.unit.spec.ts), integration 6/6 (returns.spec.ts);
  full regression: backend unit 232, backend integration 144, storefront 136,
  tsc/lint/build green on both apps
```

## 39. Cross-Specification Dependencies

| Spec | Dependency | Reference |
| --- | --- | --- |
| Markets & Pricing | currency preservation, price snapshots, discounts, taxes | §18/§23; markets REQ-MP-002/005/029/030 |
| Cart & Checkout | backend-authoritative totals, checkout snapshot, payment collection | §12/§18; cart §13 |
| Payments | captured/refundable amounts, refund idempotency, provider refund, cross-currency | §18/§19/§27; payments §13/§14/§16, B-PAY-03 (COD) |
| Shipping & Fulfillment | delivered/fulfilled state, return fulfillment, return shipment, tracking | §14/§15; shipping spec §13/§14 (B-SHIP-13/14/23) |
| Orders | order snapshots, per-item quantities, computed statuses, cancellation | §10/§11/§17; orders §4/§16/§17 (REQ-ORD-018/019) |
| Inventory & Warehouses | reservation/restoration, idempotent restoration, partial quantities | §17; inventory spec §11/§16 |
| Authentication | Medusa-native auth, server-side ownership | §22; AGENTS.md §26; auth spec |
| Returns & Refunds (this spec) | authoritative contract | — |

## 40. Definition of Done

The Returns & Refunds domain is complete only when ALL apply:

- Every `B-RET-*` decision is APPROVED or DERIVED (2026-08-16) or
  explicitly DEFERRED with a recorded owner (B-RET-24, B-RET-25).
- Every `T-RET-*` item is resolved; T-RET-10 verification against installed
  source is recorded.
- Provider contracts (TCS/Aramex return shipping; payment refund) are verified
  against current official documentation and contract tests pass.
- REQ-RET-001..036 each has passing tests per §37.
- TypeScript strict, lint, build pass; no regressions.
- No invented business rules, no fake adapters, no duplicate state machines,
  no unauthorized architecture change.

## 41. Implementation Constraints

- Medusa remains the commerce engine; no custom return/refund engine.
- No duplicate order/payment/fulfillment/inventory state machines.
- No direct mutation of Medusa-managed tables to bypass workflows.
- The storefront never supplies refund amounts, return prices, or statuses.
- No invented Medusa or provider APIs.
- No placeholder production logic; mocks only in isolated tests.
- Any architectural change beyond this contract requires explicit
  authorization (AGENTS.md §3/§4).
