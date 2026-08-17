# Cross-Specification Consistency, Dependency, and Architecture Audit

**Status:** AUDIT COMPLETE — **BUSINESS DECISION PHASE: COMPLETE (2026-08-16)**
**Audited artifacts:** the seven authoritative domain specifications
**Medusa version:** 2.19.0 (installed source verified)
**Date:** specification-phase audit; decision phase concluded 2026-08-16

This document is the system-level audit of the seven domain specifications as
one coherent system. It does **not** implement, configure, migrate, or resolve
any business decision. Every finding is referenced to source text and
requirement IDs.

**Business Decision Phase record (2026-08-16):**

| Item | Value |
| --- | --- |
| Business Decision Phase | **COMPLETE** |
| User decisions | **40/40 resolved** (17 foundational + 23 Part-B; see `business-decision-questionnaire.md`) |
| Formal specification conflicts | **0** |
| Critical findings | **0** |
| Architecture drift | **0** |
| Remaining implementation gates | 1. Tax rate values (PK GST, AE VAT) · 2. Provider sandbox verification (Safepay — contract verified + adapter implemented, sandbox run pending; Stripe — verified, credentials pending; TCS/Aramex at shipping stage) |

The three HIGH security findings (A-1/A-2/A-3) are **resolved conceptually** by
the approved policies (BD-G-01 guest policy, BD-O-01 authenticated-only order
lookup, BD-R-02 auto-accept + authenticated return path, T-RET-01/02
server-side cost authority). The underlying code is **NOT** modified — the
enforcement mechanisms remain technical implementation tasks at the
respective domain stages.

---

## 1. Executive Summary

The seven specifications — Markets & Pricing, Inventory & Warehouses,
Cart & Checkout, Payments, Shipping & Fulfillment, Orders, Returns & Refunds —
are **internally consistent and mutually implementable**. The audit found:

- **No CRITICAL findings.** No specification proposes a custom commerce
  engine, a second source of truth, a non-Medusa persistence layer, a
  duplicate state machine, an unsupported Medusa API, or an architecture
  drift item. All seven respect the fixed architecture (AGENTS.md §3) and the
  Medusa-native authentication architecture (§26).
- **Three HIGH security findings**, all already *registered as decisions* by
  the specifications themselves: (1) `POST /store/returns` is unauthenticated
  and accepts a customer-supplied `return_shipping.price` (RET REQ-RET-002/003,
  T-RET-01/02); (2) `GET /store/orders/:id` is unauthenticated and
  ID-addressed (ORD B-ORD-01, T-ORD-09); (3) store cart routes are
  cart-ID-addressed with no server-side `customer_id` ownership check
  (CC T-CC-01). The three specifications and the authentication architecture
  doc **consistently require** server-side ownership enforcement; the fixes
  are gated on approved decisions, not unspecified.
- **One MEDIUM cross-spec interaction gap:** guest checkout is supported
  (CC REQ-CC-018) and guest order lookup is an open decision (ORD B-ORD-01),
  but Returns & Refunds requires an authenticated customer for store return
  requests (RET REQ-RET-002). The guest→return path (account creation,
  guest-return token, or admin-only) is not reconciled and needs a decision.
- **Traceability gaps (LOW/MEDIUM):** Markets & Pricing and Inventory &
  Warehouses decision registers use descriptive names **without stable IDs**
  (no B-MP-XX / T-MP-XX / B-INV-XX / T-INV-XX), unlike the other five specs;
  the consolidated register (§B) assigns provisional IDs. Markets &
  Pricing §27 claims Context7 is "available," contradicted by the verified
  empty `.agents/mcp.json` recorded in the four later specs.
- The **verified Medusa behaviors** that the specs all rely on are consistent:
  order-before-payment-authorization at completion; reservation at
  completion / consumption at fulfillment / restoration on cancellation;
  refund ≤ captured enforced natively; shipping-method change refreshes the
  payment collection; independent order/payment/fulfillment/shipment/return/
  refund state.

**Conclusion:** the system is ready for the business-decision phase — which
is now **COMPLETE (2026-08-16)**: all 40 user decisions approved; 0 formal
specification conflicts; 0 critical findings; 0 architecture drift. The
remaining implementation gates are **not decisions**: PK GST and AE VAT
numeric rates, and provider sandbox verification (Safepay — contract
verified + adapter implemented, sandbox run pending; Stripe — verified,
credentials pending; TCS/Aramex at the shipping stage).

---

## 2. Audit Scope

- All seven specifications in `docs/specifications/`.
- All architecture documents in `docs/architecture/`.
- `docs/project-context.md`.
- `AGENTS.md` (authoritative contract).
- Installed Medusa 2.19.0 source/types where disputed claims required
  verification.

Audit dimensions executed: domain ownership; money/currency; cart→payment→
shipping→order lifecycle; state-machine consistency; inventory; authorization
and security; guest checkout; market/pricing; payment↔shipping interaction;
returns/refunds integration; shipping/fulfillment; idempotency; transaction
boundaries; events/webhooks; provider boundaries; Medusa capability; req
traceability; business-decision dependencies; technical-decision
dependencies; definition-of-done; Context7.

**Excluded:** wishlist, reviews, notifications, abandoned-cart,
recommendations, recently viewed, bundles, search UI, localization, SEO
detail — none have specifications yet (they are V1 *feature* scope; this
audit covers the seven *domain* specifications). Noted in §25.

## 3. Authority Hierarchy

Per AGENTS.md §2, applied during this audit:

1. Explicit user instruction for the current task (audit only).
2. Approved project specifications (the seven specs).
3. Approved architecture documents.
4. Approved ADRs.
5. `AGENTS.md`.
6. Official documentation for the installed Medusa version.
7. Existing implementation.
8. Third-party provider documentation.
9. Agent inference.

Technical verification hierarchy (AGENTS.md §27.3): installed 2.19.0
source/types → official docs → Context7 → inference. **Context7 MCP was
unavailable in this environment** (`.agents/mcp.json` is empty — 0 bytes);
this is recorded, not fabricated.

Where two authoritative requirements appeared to conflict, the audit
identified both, classified the conflict, and left resolution to the decision
owner — it did not pick a winner (AGENTS.md §2/§5).

## 4. Specification Inventory

| # | Specification | File | REQs | B-decs | T-decs | Decision IDs? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Markets & Pricing | `markets-and-pricing.md` | REQ-MP-001..036 | register (no IDs) | §25 (no IDs) | **NO** |
| 2 | Inventory & Warehouses | `inventory-and-warehouses.md` | REQ-INV-001..020 | §30 (no IDs) | §31 (no IDs) | **NO** |
| 3 | Cart & Checkout | `cart-and-checkout.md` | REQ-CC-001..025 | B-CC-01..15 | T-CC-01..07 | YES |
| 4 | Payments | `payments.md` | REQ-PAY-001..035 | B-PAY-01..18 | T-PAY-01..10 | YES |
| 5 | Shipping & Fulfillment | `shipping-and-fulfillment.md` | REQ-SHIP-001..038 | B-SHIP-01..25 | T-SHIP-01..15 | YES |
| 6 | Orders | `orders.md` | REQ-ORD-001..034 | B-ORD-01..22 | T-ORD-01..17 | YES |
| 7 | Returns & Refunds | `returns-and-refunds.md` | REQ-RET-001..036 | B-RET-01..25 | T-RET-01..15 | YES |

Totals: **224 requirements**, 119 unresolved business decisions (12 MP + 7
INV + 15 CC + 16 PAY + 25 SHIP + 20 ORD + 24 RET), 69 technical decisions
(6 MP + 5 INV + 7 CC + 9 PAY + 13 SHIP + 17 ORD + 12 RET) — per the
consolidated decision register. All requirements carry test expectations.

## 5. Domain Ownership Matrix

Single-owner verification. For each authoritative state: owner spec → Medusa
module → any other spec attempting to mutate it → duplicate source of truth?

| State | Owner spec | Medusa module/entity | Other spec mutating? | Duplicate source of truth? | Verdict |
| --- | --- | --- | --- | --- | --- |
| Product/Variant/Option | Catalog (future) + MP §7 | product module | CC reads (line items), INV links (inventory items) | NO — catalog is single source; others reference | OK |
| Category/Collection | Catalog (future) | product categories/collections | none | NO | OK |
| Market/Region | MP | region | CC (cart.region_id), PAY (region_payment_provider), SHIP (geo zones/options), ORD (order.region_id) — all reference | NO | OK |
| Currency | MP | currency | CC (cart.currency_code), PAY, ORD — all reference | NO | OK |
| Price/Price list | MP | pricing | CC resolves; none mutates price | NO | OK |
| Promotion/Discount | MP §12 | promotion | CC applies/validates; none mutates promotion config | NO | OK |
| Tax | MP §11 | tax | CC computes lines; none mutates config | NO | OK |
| Cart/Cart item | CC | cart | none (PAY/SHIP/INV read at completion) | NO | OK |
| Checkout | CC | cart workflows | PAY (payment steps), INV (reservation) — participants, not owners | NO | OK |
| Payment collection/session/payment/capture | PAY | payment | ORD reads (getLastPaymentStatus); RET triggers refunds via payment workflows | NO | OK |
| Refund | PAY (execution), RET (eligibility/calculation) | payment refund + order transaction | ORD reads (transactions); MP sets currency rules | NO — execution vs policy split is explicit (RET §4/§9/§19) | OK |
| Inventory/levels/locations/reservations | INV | inventory/stock-location | CC (reserve at completion), ORD (cancel restore), SHIP (fulfillment consume), RET (return restore) — all via native workflows | NO | OK |
| Fulfillment/Shipment | SHIP | fulfillment | ORD coordinates (createOrderFulfillmentWorkflow); INV (consumption) | NO | OK |
| Shipping option/method | SHIP | fulfillment/shipping | CC adds methods to cart; PAY refreshes collection | NO | OK |
| Order/Order item | ORD | order | CC creates (cartToOrder); PAY adds transactions; SHIP fulfills; RET returns — participants | NO | OK |
| Return/Return item | RET | order (Return) | ORD reads quantities; INV restores | NO | OK |
| Customer/Auth identity/Session | Auth architecture (§26) | customer/auth | CC (cart.customer_id), ORD, RET (ownership) — reference only | NO | OK |
| Wishlist | **NO SPEC** (V1 feature) | custom module (planned) | — | N/A | GAP (§25) |
| Review | **NO SPEC** (V1 feature) | custom module (planned) | — | N/A | GAP (§25) |
| Notification | **NO SPEC** | notification module + provider boundary | referenced by PAY/SHIP/ORD/RET/INV as side-effect | NO | GAP (§25) |

**Finding O-1 (INFO):** no duplicated ownership found. The only multi-touch
state is **refund**, and the specs split it explicitly: Payments owns
execution mechanics/invariants, Returns & Refunds owns eligibility and
calculation, Orders owns the order-side ledger (transactions). This is a
clean boundary, not a conflict.

## 6. State/Status Consistency Matrix

| State vocabulary | Owner | Spec-defined transitions | Referenced consistently by |
| --- | --- | --- | --- |
| Cart (no status enum; `completed_at`) | CC §8 | active → completed; active → deleted | CC, PAY (completion), ORD |
| Payment collection status | PAY §4/§9.2 | not_paid/awaiting/partially_authorized/authorized/partially_captured/canceled/completed | PAY, ORD (getLastPaymentStatus), RET |
| Payment session status | PAY §4 | pending/pending_authorization/authorized/captured/requires_more/error/canceled | PAY, CC (validateCartPaymentsStep) |
| Order status | ORD §4/§10 | pending/completed/draft/archived/canceled/requires_action | ORD, RET (§10), SHIP |
| Order payment status (computed) | ORD/PAY | not_paid..refunded/partially_refunded/canceled/requires_action | ORD §4, PAY §9.2 — **identical vocabulary** | 
| Fulfillment status (computed) | ORD/SHIP | 8-state computed aggregate | ORD §4, SHIP §13 |
| Return status | RET §6/§8 | open/requested/received/partially_received/canceled | RET, ORD §17 (REQ-ORD-018) |
| Refund state | PAY §9 | derived from capture/refund records | PAY, RET, ORD |
| Reservation | INV §11 | created → consumed/released | INV, CC, ORD, SHIP, RET |

**Finding S-1 (INFO):** the two computed aggregates (`getLastPaymentStatus`,
`getLastFulfillmentStatus`) are described with the same vocabulary in the
Payments and Orders specifications — no drift. No state referenced but
undefined; no transition forbidden by one spec and assumed by another.

**Finding S-2 (LOW):** Cart & Checkout REQ-CC-017's test expectation reads
"workflow (payment fail → no order? per payments spec: compensation)" — the
"no order?" is phrased as an open question, but the verified sequence
(order created **before** payment authorization; payments spec §14.1
`completeCartAfterPaymentStep` with `continueOnPermanentFailure`) resolves it:
**the order exists**; payment failure yields an order with a failed/
requires_action payment state. The cart spec should reference the payments
spec's resolution (LOW, documentation only — no behavioral conflict).

## 7. Money & Currency Flow

Traced: product → variant → price → market → cart → shipping → tax →
promotion → payment → capture → order → return → refund.

- **Currency authority:** MP REQ-MP-008..013 — cart and order carry exactly
  one authoritative currency; payment amount = order currency (REQ-MP-010/
  REQ-PAY-002); refunds in order currency (REQ-MP-031/REQ-RET-023); **no
  silent conversion** (REQ-MP-002/011, B-PAY-09 default refuse).
- **Amount authority:** backend-only (REQ-MP-003/019, REQ-CC-008/009,
  REQ-PAY-001); client never supplies price/discount/tax/total.
- **Rounding/representation:** `bigNumber`/integer minor units (REQ-MP-013,
  CC §13); rounding policy unresolved (MP register).
- **Tax:** per-market regions; rates unresolved (REQ-MP-020, B-CC-12/13);
  preserved on order snapshot.
- **Discount allocation:** native promotion module; stacking/priority
  unresolved (REQ-MP-021, B-CC-11); discount recalculation on refund is a
  RET business decision (B-RET-11).
- **Shipping charges:** backend-computed (REQ-MP-028, REQ-SHIP-*);
  shipping-fee refund policy B-SHIP-23/B-RET-09 (unresolved).
- **Order snapshot:** captured at placement; catalog changes never rewrite
  (REQ-MP-005/029/030, REQ-ORD-004, REQ-PAY-009).
- **Refund bounds:** refunded ≤ captured ≤ refundable (REQ-PAY-011,
  REQ-RET-018/021, REQ-MP-032) — all cite the same native
  `validateRefundPaymentExceedsCapturedAmountStep`.
- **Cross-currency:** refuse by default, all specs consistent (B-PAY-09,
  MP register, ORD §19, RET §19).

**Finding M-1 (INFO):** no statement assumes currency conversion; all seven
specs agree: no conversion, refuse cross-currency refunds unless explicitly
authorized. No price/shipping/refund inconsistency found.

## 8. Cart → Payment → Shipping → Order Flow

Verified sequence across specs (all reference the same installed workflows):

```
Guest/Customer → market selection (MP) → cart create (CC)
  → variant validation (CC REQ-CC-006) → inventory availability check at add
     (CC REQ-CC-007 / confirmInventoryStep) → pricing (backend)
  → promotions (CC REQ-CC-010) → tax (CC REQ-CC-011) → shipping method
     (CC REQ-CC-012; SHIP option eligibility) → payment collection/sessions
     (PAY) → completeCartWorkflow (CC §18):
        lock → order_cart idempotency → validate items → validate payments
        → validate shipping → create order (snapshot) → parallel
        [order-cart link, cart completed_at, reserve inventory, register
         promotion usage] → authorize payment LAST → order transaction
  → capture (PAY §11) → fulfillment (SHIP) → shipment → delivery
  → return (RET) → refund (RET/PAY)
```

**Transition-by-transition audit (authoritative owner / boundary / idempotency
/ event / failure):**

| Transition | Workflow | Boundary | Idempotency | Event | Failure behavior |
| --- | --- | --- | --- | --- | --- |
| Cart create | createCartWorkflow | CC | not idempotent by design (distinct carts) | — | — |
| Add line item | addToCartWorkflow | CC | last-write-wins | cart.updated | INSUFFICIENT_INVENTORY |
| Apply promotion | updateCartPromotionsWorkflow | CC | per code | cart.updated | rejected ineligible |
| Compute tax | updateTaxLinesWorkflow | CC | recompute | — | fail safe |
| Add shipping | addShippingMethodToCartWorkflow | CC/SHIP | validated price | cart.updated | invalid option rejected |
| **Payment collection refresh** | **refreshPaymentCollectionForCartWorkflow via refreshCartItemsWorkflow** | PAY/CC/SHIP | sessions deleted on total change | — | sessions recreated |
| Complete cart | completeCartWorkflow | CC/ORD/PAY/INV | order_cart + lock | order.placed | compensation (payments fail after order creation) |
| Reserve inventory | reserveInventoryStep | INV | idempotent | reservationItem.* | compensation deletes |
| Authorize payment | authorizePaymentSessionStep | PAY | idempotent (payment+authorized_at) | — | NOT_ALLOWED or pending_authorization |
| Capture | capturePaymentWorkflow | PAY | captured_at guard | payment.captured | canceled payment cannot capture |
| Fulfillment | createOrderFulfillmentWorkflow | SHIP/ORD/INV | reservation consume idempotent | — | partial fulfillment supported |
| Shipment | createOrderShipmentWorkflow | SHIP | — | shipment.created | provider UNVERIFIED |
| Cancel order | cancelOrderWorkflow | ORD/PAY/INV | idempotent | order.canceled | blocked if completed/non-canceled fulfillments |
| Return request | createAndCompleteReturnOrderWorkflow | RET | — | order.return_requested | auth gap (H-01) |
| Return receive | receiveAndCompleteReturnOrderWorkflow | RET/INV | T-RET-10 verify | order.return_received | non-canceled guard |
| Refund | refundPaymentWorkflow | PAY/RET | refund.id key | payment.refunded | ≤ captured guard |

**Finding F-1 (INFO):** no impossible sequence found. The only sequence the
specs intentionally support is "order exists but payment failed" — order
created first, payment authorized last, compensation handles the session,
order payment status reflects failure (ORD REQ-ORD-012).

**Finding F-2 (INFO):** payment success after cart completion / webhook
before response / duplicate webhooks / capture-cancel races / reservation
expiry during payment — all have explicit owners (PAY §14/§18, CC §20/§21,
INV §14). Reservation has **no native TTL**; release is via
cancel/fulfillment/failure paths (INV §14, CC §14) — consistent everywhere.

## 9. Inventory Lifecycle

```
Catalog → inventory item per variant (INV REQ-INV-001/002)
  → levels per location (REQ-INV-003) → availability check at add (CC)
  → reserve at completion (INV REQ-INV-015; CC REQ-CC-015)
  → consume at fulfillment (INV §16; SHIP) → restore on cancel
  (INV §15; ORD REQ-ORD-015) → restore on return (INV REQ-INV-008; RET
  REQ-RET-016) → refund never touches inventory directly
```

- Reservation timing: at completion, never at add (INV REQ-INV-015; CC
  REQ-CC-015; B-CC-04 if changed → STOP).
- Deduction: at fulfillment creation, not checkout (INV §13/§16).
- Restoration: cancellation idempotent (REQ-INV-006); fulfillment no
  double-deduct (REQ-INV-007); return no double-restore (REQ-INV-008);
  duplicate payment callbacks no inventory delta (REQ-INV-010).
- Concurrency: LOCKING module per inventory item (REQ-INV-014).
- Multi-warehouse: per-location reservations + per-fulfillment location_id;
  split fulfillment native (REQ-INV-003, §16/§17).
- Backorders: reservation-level `allow_backorder` native; per-variant policy
  custom + decision (REQ-INV-019, §18; CC B-CC-09).

**Finding I-1 (LOW):** INV REQ-INV-008 states the "exact flow defined in
Returns & Refunds spec"; RET §17 states restoration must be "routed through
Medusa inventory mechanics" and marks the exact step verification as T-RET-10.
These are consistent (RET defines the requirement and the verification item),
but the INV wording is stronger than RET's. No behavioral conflict; note for
implementation sequencing (T-RET-10 must resolve before return-to-stock
implementation).

**Finding I-2 (INFO):** backorder payment behavior (charge now vs on ship)
is an unresolved decision (INV §18) with payment interaction consequences
(B-PAY-06 session expiry). Registered; not a contradiction.

## 10. Authentication & Authorization Audit

- **Authentication:** Medusa-native everywhere; Better Auth explicitly
  rejected (auth doc, AGENTS.md §26, RET §3). No spec introduces custom
  auth persistence. Google OAuth configuration is PROPOSED/UNRESOLVED (auth
  doc) — consistent.
- **Customer authorization:** all specs require server-side ownership:
  - Cart: CC REQ-CC-003 + T-CC-01 (cart-ID-addressed gap registered).
  - Orders: ORD REQ-ORD-006/007/008 (store listing customer-scoped;
    single-order retrieval gap B-ORD-01/T-ORD-09 registered).
  - Returns: RET REQ-RET-002/025 (store return route unauthenticated gap
    T-RET-01/02 registered).
  - Refunds: RET REQ-RET-025; PAY REQ-PAY-017 (admin-only refunds).
  - Wishlist/reviews: no specs yet (auth doc §26.3 invariant applies).
- **Admin authorization:** native RBAC verified on admin order/payment/
  return/fulfillment/shipping routes (ORD, PAY §5.4, RET §6.4, SHIP). No
  custom RBAC proposed.

**Finding A-1 (HIGH) — security, decision required (registered by specs):**
`POST /store/returns` has **no authentication middleware** (verified
`store/returns/middlewares.js` — only validation) and its schema accepts
customer-supplied `order_id`, `items`, and `return_shipping.price`. The
Returns spec registers the fix (REQ-RET-002/003, T-RET-01/02). The Orders
spec and the authentication architecture require the same server-side
ownership enforcement. **The specifications are consistent in demanding the
fix; the fix itself requires approved decisions (hardening mechanism,
return-shipping price authority) before launch.** Not a contradiction.

**Finding A-2 (HIGH) — security, decision required (registered by specs):**
`GET /store/orders/:id` is unauthenticated and ID-addressed (verified source
TODO). Registered as B-ORD-01/T-ORD-09 (analog of T-CC-01). Same consistent
treatment.

**Finding A-3 (HIGH) — security, decision required (registered by specs):**
store cart routes are cart-ID-addressed; possession of the cart ID grants
access; `POST /store/carts/:id/customer` is the only authenticated cart
route. Registered as T-CC-01. Consistent across CC, auth doc.

**Finding A-4 (INFO):** client-supplied refund amounts, payment statuses,
return costs, customer/order IDs — all explicitly prohibited
(REQ-PAY-008/017, REQ-RET-017/026, REQ-CC-021, MP §10). Consistent.

## 11. Guest Checkout Audit

| Concern | Spec treatment | Status |
| --- | --- | --- |
| Guest cart creation | CC REQ-CC-001 (no auth; cart-ID cookie) | Defined |
| Guest checkout | CC REQ-CC-018 (no account required; email optional per B-CC-06) | Defined |
| Guest payment | PAY (collection per cart; no customer required) | Defined |
| Guest order creation | CC §10/ORD (order tied to cart; no customer account) | Defined |
| Guest order retrieval | ORD B-ORD-01 (UNRESOLVED — single-order retrieval policy) | **UNRESOLVED decision** |
| Guest cancellation | ORD B-ORD-02.. (UNRESOLVED) | **UNRESOLVED decision** |
| Guest returns | RET REQ-RET-002 requires authenticated customer for store returns | **Interaction gap — Finding G-1** |
| Guest refunds | RET (refund execution admin-side; guest refund visibility needs order lookup) | depends on B-ORD-01 |
| Account association after purchase | ORD B-ORD-19 (UNRESOLVED) | **UNRESOLVED decision** |
| Guest cart merge on login | CC B-CC-03 (UNRESOLVED) | **UNRESOLVED decision** |

**Finding G-1 (MEDIUM):** guest checkout is supported (CC REQ-CC-018) and
guest order lookup is an open decision (ORD B-ORD-01), but the Returns spec
requires an **authenticated customer** for store return requests
(REQ-RET-002). The guest→return path is not reconciled: a guest who ordered
cannot request a return through the store API unless (a) they create an
account and associate the order (B-ORD-19), (b) a guest-return mechanism is
approved, or (c) returns are admin-only. **No spec contradicts another** —
this is a missing cross-spec requirement. A decision is required
(recommended: account-association path via B-ORD-19; guest order lookup
resolved via B-ORD-01 first).

**Finding G-2 (INFO):** no spec assumes an authenticated customer where a
guest is permitted, with the single exception of the return path above
(G-1). Everything else (cart, checkout, payment, order creation) explicitly
supports guests.

## 12. Returns/Refunds Integration Audit

- Return/refund/inventory/payment/order state are **five independent
  concerns** (RET §10, REQ-RET-008/013; ORD REQ-ORD-018; AGENTS.md §11).
- Order-item return quantities natively tracked (ORD REQ-ORD-019; RET
  REQ-RET-011) — same fields, no duplication.
- Refund bounds: RET REQ-RET-018/021 == PAY REQ-PAY-011 == MP REQ-MP-032.
- Return quantity bounds: RET REQ-RET-004 (≤ eligible) == ORD quantities.
- Inventory restoration: RET REQ-RET-016 (idempotent) == INV REQ-INV-008.
- Return shipping: RET §14/REQ-RET-015 == SHIP B-SHIP-13/14/23 (return
  shipping responsibility/provider unresolved; provider UNVERIFIED).
- Shipping-fee/tax/discount refund policy: B-RET-09/10/11 == B-SHIP-23 ==
  PAY B-PAY-10 (all UNRESOLVED, cross-referenced).
- Multiple returns/partial refunds: RET §20/REQ-RET-024 == PAY partial refund
  support == ORD per-item quantities.
- COD refund behavior: deferred to PAY B-PAY-03 everywhere (ORD B-ORD-12,
  RET §33) — consistent.
- Refund before inspection / refund after return-cancel races: RET §23
  concurrency matrix + PAY row-lock + workflow guards — consistent.

**Finding R-1 (INFO):** "returned ≠ refunded" and "refunded ≠ returned"
invariant is stated in RET REQ-RET-013, ORD REQ-ORD-018, and AGENTS.md §11 —
uniform.

## 13. Idempotency Matrix

| Operation | Idempotency key / mechanism | Owner spec | Duplicate behavior | Consistent across specs? |
| --- | --- | --- | --- | --- |
| Cart create | none (by design) | CC | distinct carts | YES |
| Cart mutations | cart id | CC | last-write-wins | YES |
| Checkout completion | order_cart lookup + cart lock | CC/ORD | same order returned | YES |
| Order creation | cart id (within completion) | CC/ORD | same order | YES |
| Promotion redemption | registerUsageStep at completion | CC | once per order | YES |
| Inventory reservation | LOCKING + compensation | INV/CC | once per line item | YES |
| Payment session creation | per provider per collection | PAY | one session | YES |
| Authorization | payment + authorized_at | PAY | existing payment returned | YES |
| Capture | captured_at + capture-sum + capture.id key | PAY | no double charge | YES |
| Cancellation | canceled_at + payment.id key | PAY | one effect | YES |
| Refund | refund.id key + row lock + validator | PAY/RET | one financial effect | YES |
| Payment webhook | event identity + native guards | PAY | one state change | YES |
| Shipment creation | SHIP (workflow; provider UNVERIFIED) | SHIP | T-SHIP decision | YES (gated) |
| Fulfillment | reservation consumption idempotent | SHIP/INV | no double-deduct | YES |
| Return creation | RET (workflow) | RET | REQ-RET-027 | YES |
| Return receipt | RET (workflow; T-RET-10 verify) | RET/INV | no double restore | YES |
| Inventory restoration | reservation deletion idempotent | INV | restores once | YES |
| Notification | side-effect; never authoritative | (notifications) | retried without state effect | YES |

**Finding ID-1 (INFO):** no operation requires idempotency in one spec but
not another; the mechanisms are native and cross-referenced. The only
"not yet specified" idempotency is shipment creation (provider contracts
UNVERIFIED — correctly gated by SHIP REQ-SHIP-037/038).

## 14. Transaction Boundary Matrix

| Multi-entity operation | Native workflow boundary | Compensation | Specs consistent? |
| --- | --- | --- | --- |
| Cart + payment + order + reservation + promotion | completeCartWorkflow (single workflow, order-first, authorize-last) | compensatePaymentIfNeededStep; reservation step compensation | YES (CC §18, PAY §10, INV §13) |
| Payment + order transaction | authorizePaymentSessionStep + addOrderTransactionStep | transaction recorded after auth | YES |
| Order + inventory reservation | parallel steps in completion | reservation delete on rollback | YES |
| Order cancellation + refund + inventory restore | cancelOrderWorkflow | refund captured, cancel uncaptured, restore reservations — all in one workflow | YES (ORD REQ-ORD-015, PAY §12, INV §15) |
| Fulfillment + reservation consumption | createOrderFulfillmentWorkflow | consumption is reservation deletion (idempotent) | YES |
| Shipping change + payment refresh | refreshCartItemsWorkflow → refreshPaymentCollectionForCartWorkflow | sessions deleted (recreated) | YES (verified) |
| Return + inventory restore | receive-return workflow (T-RET-10 to verify exact step) | RET/INV define requirement; verification item open | YES (with T-RET-10) |
| Return + refund | separate workflows; refund executes via payment module | refund record deleted on provider failure | YES (RET §9/§19, PAY §13) |
| Refund + notification | notification side-effect after refund | never rolls back | YES (REQ-PAY-019, RET §26) |

**Finding T-1 (INFO):** no spec assumes distributed-transaction semantics
beyond Medusa's workflow engine; no custom transaction infrastructure
proposed. The one explicitly deferred item is the exact inventory-restoration
step inside receive-return (T-RET-10) — an implementation-time verification,
not a contradiction.

## 15. Event/Webhook Matrix

| Event | Producer | Consumer | Spec | Exists natively? |
| --- | --- | --- | --- | --- |
| `order.placed/updated/canceled/completed/archived` | order workflows | subscribers (ORD §21) | ORD | VERIFIED |
| `order.return_requested` | confirm-return-request workflow | subscribers (RET §25) | RET | VERIFIED |
| `order.return_received` | receive-return workflow | subscribers (RET §25) | RET | VERIFIED |
| `payment.webhook_received` | native hooks route → event bus | shipped subscriber → processPaymentWorkflow | PAY | VERIFIED (route + subscriber) |
| `payment.captured` / `payment.refunded` | capture/refund workflows | notification/analytics subscribers | PAY | VERIFIED |
| `cart.updated` | cart workflows | (future) | CC | VERIFIED |
| `shipment.created` | createOrderShipmentWorkflow | notification subscribers | SHIP | VERIFIED (utils events) |
| `inventoryItem.*`, `inventoryLevel.*`, `reservationItem.*` | inventory module | low-stock notifications, reconciliation | INV | VERIFIED |
| Fulfillment/shipping provider callbacks | TCS/Aramex | **NO native fulfillment webhook route** (only `hooks/payment`) | SHIP T-SHIP-04/07 | GAP — custom route or polling required (registered) |
| Payment provider webhooks | PK/AE gateways | native `POST /hooks/payment/:provider` | PAY | VERIFIED route; provider signature UNVERIFIED |

**Finding E-1 (INFO):** no spec assumes a native Medusa event/webhook that
does not exist. The fulfillment-webhook gap (only `hooks/payment` exists) is
correctly registered in SHIP (T-SHIP-07). Payment webhook pipeline is native
and consistently described in PAY §14.

## 16. Provider Boundary Audit

| Provider | Boundary | Spec | Leakage? | UNVERIFIED gates? |
| --- | --- | --- | --- | --- |
| PK payment provider | IPaymentProvider (payments/) | PAY §5.2/§7 | NO | REQ-PAY-022 (contract UNVERIFIED, provider not selected) |
| UAE payment provider | IPaymentProvider | PAY | NO | REQ-PAY-023 |
| TCS | IFulfillmentProvider (shipping/) | SHIP §16 | NO | REQ-SHIP-037 (UNVERIFIED) |
| Aramex | IFulfillmentProvider | SHIP §17 | NO | REQ-SHIP-038 |
| Google OAuth | @medusajs/auth-google provider | auth doc | NO | config pending |
| Cloudflare R2 | native file-s3 provider | capability matrix | NO | config-only |
| Email/SMS/WhatsApp | notification provider boundary | (notifications, future) | NO | providers not selected |
| Return shipping (TCS/Aramex) | fulfillment provider boundary on return | RET §14/§35, SHIP B-SHIP-14 | NO | UNVERIFIED/TBD |
| Refund (payment providers) | IPaymentProvider refundPayment | PAY/RET §35 | NO | UNVERIFIED |

**Finding P-1 (INFO):** provider-specific logic stays behind integration
boundaries in every spec; no provider details leak into generic workflows,
order models, cart logic, or UI. All provider contracts marked
UNVERIFIED/TBD remain gated from implementation (REQ-PAY-022/023,
REQ-SHIP-037/038, RET §35).

## 17. Medusa Capability Audit

Every major custom-looking requirement classified:

| Requirement | Class | Evidence |
| --- | --- | --- |
| Markets/regions/currencies | CONFIGURATION | native region/currency modules |
| Prices/price lists/tax | CONFIGURATION | native pricing/tax |
| Cart/checkout | NATIVE | cart module + completeCartWorkflow |
| Promotions/discounts | NATIVE (+policy) | promotion module |
| Payments (collection/session/capture/refund) | NATIVE + EXTERNAL (providers) | payment module + IPaymentProvider |
| Shipping options/fulfillment | NATIVE + EXTERNAL (TCS/Aramex) | fulfillment module + IFulfillmentProvider |
| Orders | NATIVE | order module + workflows |
| Returns/refunds | NATIVE (+eligibility policy) | return workflows + refund workflows |
| Inventory/warehouses/reservations | NATIVE | inventory/stock-location modules |
| Multi-warehouse allocation | CUSTOM (small step) + decision | no native allocator (INV §17, SHIP T-SHIP-14) |
| Backorder variant flag | CUSTOM + decision | no native variant backorder flag (INV §18) |
| Low-stock notifications | CUSTOM subscriber + decision | InventoryEvents (INV §19) |
| Tracking sync (TCS/Aramex) | EXTERNAL + custom route/polling | no native fulfillment webhook (SHIP T-SHIP-04/07) |
| Reconciliation jobs | CUSTOM scheduled jobs | T-PAY-05, T-ORD-12, T-RET-13 |
| Wishlist/reviews/recently-viewed/recommendations | CUSTOM modules (no spec yet) | capability matrix |
| Bundles | CUSTOM (approach unknown — verify) | capability matrix |
| Auth (email/password) | NATIVE | auth module enabled |
| Google OAuth | CONFIGURATION | auth-google installed |

**Finding C-1 (INFO):** no specification proposes a custom order/payment/
inventory/auth/pricing/fulfillment engine or custom persistence where Medusa
provides the capability. The flagged custom items are small, bounded, and
decision-gated (allocation step, backorder flag, low-stock subscriber,
reconciliation jobs, provider adapters).

## 18. Requirement Dependency Graph

Derived cross-spec requirement dependencies (direction: dependency → depends
on):

```
REQ-MP-001..036 (root: markets/currency/pricing/tax)
  ├─ REQ-INV-* (regions/sales-channel context; currency-safe pricing)
  ├─ REQ-CC-004/008/009/011/012 (currency/pricing/tax/shipping authority)
  ├─ REQ-PAY-001/002/003/009 (currency/amount/market/provider scoping)
  ├─ REQ-SHIP-* (region→geo-zone→option; currency-aware rates)
  └─ REQ-ORD-004/020/021 (snapshot, totals, currency)

REQ-INV-001..020
  ├─ REQ-CC-007/015 (availability check; reserve at completion)
  ├─ REQ-PAY-010 (payment failure → release)
  ├─ REQ-ORD-014/015 (fulfillment consumption; cancel restore)
  ├─ REQ-SHIP-* (fulfillment location_id; split fulfillment)
  └─ REQ-RET-016 (idempotent restore on receipt)

REQ-CC-001..025
  ├─ REQ-PAY-004..006 (payment collection; authorize-at-completion)
  ├─ REQ-SHIP-* (shipping method validation)
  └─ REQ-ORD-001/002 (order creation from cart)

REQ-PAY-001..035
  ├─ REQ-ORD-011/012 (payment state derivation; consistency)
  └─ REQ-RET-017..023 (refund execution bounds)

REQ-SHIP-001..038
  ├─ REQ-ORD-013/014 (fulfillment from order)
  └─ REQ-RET-015 (return shipping)

REQ-ORD-001..034
  └─ REQ-RET-018/019 (return quantities; refund bounds) [via ORD REQ-ORD-018/019]

REQ-RET-001..036
  ├─ REQ-ORD-018/019 (order-side quantities)
  ├─ REQ-PAY-011 (refund bounds)
  ├─ REQ-SHIP-* (return shipping)
  └─ REQ-INV-008 (restoration)
```

**Finding D-1 (INFO):** the dependency graph is a DAG rooted at Markets &
Pricing, with cart/checkout as the functional spine (CC → PAY → SHIP → ORD →
RET). No circular dependency exists at the requirement level. Mutual
references between CC and SHIP/PAY are boundary references (participants),
not dependency cycles.

## 19. Business Decision Dependency Matrix

See `consolidated-decision-register.md` (§B) for the full register. Key
structure:

- **Blocking all commerce implementation:** payment providers (B-PAY-01/02),
  tax rates (MP), market-selection authority (MP), COD (B-PAY-03), discount
  stacking (MP/B-CC-11), return/refund policy (B-RET-*), cancellation policy
  (B-ORD-02..05), shipping rate model (B-SHIP-01..), backorder policy
  (INV §18/B-CC-09), cross-currency refunds (B-PAY-09 default refuse), guest
  order lookup (B-ORD-01), return shipping responsibility (B-SHIP-13/
  B-RET-07).
- **Affecting architecture (not just behavior):** none of the unresolved
  decisions changes the fixed architecture; they are policy values and
  integration choices within it. The closest to architectural is the
  fulfillment-webhook mechanism (T-SHIP-07: custom route vs polling) — a
  technical decision, not an architecture change.
- **Safe to remain open initially:** cart restoration UX (B-CC-02), manual
  fulfillment (B-SHIP-25), settlement reporting (B-PAY-18), invoice
  requirements (B-ORD-09), order number format (B-ORD-08).

## 20. Technical Decision Dependency Matrix

- **Already resolved by AGENTS.md / installed Medusa:** provider boundaries
  (AGENTS.md §4), Medusa-first (AGENTS.md §4), no custom engines (AGENTS.md
  §4), native auth (AGENTS.md §26), Redis non-authoritative (AGENTS.md §3),
  R2 via file-s3 (capability matrix), no Elasticsearch (AGENTS.md §11).
- **Resolved by installed capability:** T-CC-04 (native locking),
  T-PAY-04 (native webhook pipeline), T-PAY-10 (webhook options),
  T-ORD-02 (creation boundary), T-SHIP-* allocation step placement is
  implementation-level.
- **Implementation-level (no authorization needed):** T-CC-02 (price refresh
  policy), T-ORD-07 (order number generation), T-PAY-06 (retry values),
  T-RET-05 (refund workflow mapping).
- **Blocked by business decisions:** T-CC-01 (cart ownership — needs
  security posture decision), T-ORD-09 (order retrieval — B-ORD-01),
  T-RET-01/02 (return hardening — B-RET-02 + policy), T-SHIP-14 (allocation
  placement — INV allocation strategy).
- **Genuinely requiring explicit authorization:** none identified that
  changes architecture; the provider integrations (TCS/Aramex/PK/AE
  gateways) are external integrations authorized by scope but require
  provider selection first.

## 21. Security Findings

| ID | Severity | Finding | Spec/IDs | Decision required? |
| --- | --- | --- | --- | --- |
| A-1 | HIGH | Store return route unauthenticated; customer-supplied `return_shipping.price` | RET REQ-RET-002/003, T-RET-01/02; auth doc §26.3 | YES (hardening mechanism + price authority) |
| A-2 | HIGH | Store single-order retrieval unauthenticated + ID-addressed | ORD B-ORD-01, REQ-ORD-008, T-ORD-09 | YES (lookup policy) |
| A-3 | HIGH | Cart routes cart-ID-addressed; no server-side customer_id ownership | CC REQ-CC-003, T-CC-01 | YES (ownership layer) |
| S-1 | LOW | REQ-CC-017 test expectation open question | CC REQ-CC-017 | NO (doc clarification) |
| ID-2 | INFO | All client-supplied monetary/status inputs prohibited consistently | MP/CC/PAY/ORD/RET | NO |

No additional IDOR, enumeration, replay, tamper, or manipulation vectors
were found beyond the three registered gaps. All three are **documented,
gated, and consistently treated** — the audit's role is to confirm the specs
demand server-side enforcement and to keep them open until decisions land.

## 22. Concurrency Findings

All race scenarios from the task prompt are owned:

| Race | Owner | Mechanism |
| --- | --- | --- |
| Two checkout requests, same cart | CC §20/§21 | cart lock + order_cart |
| Duplicate payment webhook | PAY §14/§15 | event identity + native guards |
| Payment callback vs cancellation | PAY §18 | row lock + cancel guards |
| Fulfillment vs cancellation | ORD §15/§23 | cancelOrderWorkflow guards |
| Shipment timeout, success externally | SHIP §19; PAY §15 | reconcile before retry |
| Admin cancel vs provider callback | PAY §18; ORD §23 | state guards; reconcile |
| Return vs refund race | RET §23 | refund bounds + row lock |
| Two admins same action | ORD/PAY/RET | workflow idempotency + RBAC |
| Inventory change vs fulfillment | INV §14/§25 | LOCKING module |
| Final unit / two customers | INV §28 | LOCKING per inventory item |
| Return receipt vs inventory retry | RET §23.13 | idempotent restoration (T-RET-10) |

**Finding X-1 (INFO):** no race is unowned; protection is native-first
(workflows, locks, idempotency), with custom locking only where native is
insufficient (T-RET-09, T-CC-04).

## 23. Architecture Drift Findings

| AGENTS.md constraint | All specs comply? |
| --- | --- |
| Medusa is the commerce engine | YES — no parallel engine |
| PostgreSQL authoritative; Redis non-authoritative | YES |
| No custom auth persistence; Better Auth NOT used | YES |
| No Elasticsearch/Kafka/microservices/second DB | YES |
| No custom payment/shipping/order engines | YES |
| Provider logic behind integration boundaries | YES |
| No business-rule invention | YES — all policy UNRESOLVED registers |
| No fake adapters / placeholder logic | YES — providers gated |
| Per-market logic not hardcoded generically | YES — configuration-driven (MP §5/§7, PAY §7, SHIP §8) |

**Finding D-2 (INFO):** no architecture drift found. No AGENTS.md change is
warranted (see §D of this deliverable set).

## 24. Contradictions

**Formal contradictions (requirement A vs requirement B, mutually
exclusive): NONE.**

The audit actively searched for: currency conversion conflicts (none — all
refuse), state-machine conflicts (none — computed vocabularies match),
inventory restoration conflicts (none — idempotent everywhere), payment
semantics conflicts (none — same native mechanisms cited), fulfillment
semantics conflicts (none), return/refund semantics conflicts (none),
authorization conflicts (none — server-side enforcement demanded uniformly),
transaction/idempotency conflicts (none).

**Documented inconsistencies (non-contradictions, LOW):**

1. **MP §27** states "Context7 MCP: available for verification at
   implementation" — contradicted by the later-verified empty
   `.agents/mcp.json` and by the honest records in PAY §31, SHIP, ORD, RET
   §38 ("Context7 MCP not invocable"). LOW — the MP claim is stale/incorrect;
   update MP §27 to record unavailability.
2. **MP/INV decision registers lack stable IDs** (no B-MP-XX/T-MP-XX/
   B-INV-XX/T-INV-XX) — inconsistent with the other five specs; LOW/MEDIUM
   traceability gap. Consolidated register assigns provisional IDs (see §B).
3. **ORD §17** references "Returns & Refunds spec (later)" and **SHIP §2**
   says "Returns & Refunds spec (later)" — now that
   `returns-and-refunds.md` exists, these are stale but not contradictory;
   LOW doc updates.
4. **CC REQ-CC-017** open-question phrasing (S-2) — LOW doc clarification.
5. **INV REQ-INV-008** vs **RET §17** wording strength (I-1) — LOW.

## 25. Missing Requirements

1. **Guest return/refund path** (G-1, MEDIUM) — no requirement defines how a
   guest order is returned/refunded; needs decision tied to B-ORD-01/B-ORD-19.
2. **Wishlist, reviews, notifications, abandoned-cart, recommendations,
   recently viewed, bundles, search/filter, localization, SEO detail** — V1
   scope in AGENTS.md §9 but no specifications exist. They are feature gaps
   (next specification candidates), not gaps in the seven audited domains.
   Their absence does not block the core commerce chain.
3. **Rate-limiting decisions** — required by AGENTS.md §14 (auth, password
   ops, reviews, coupon validation, payment initiation, webhooks,
   abuse-prone search); registered as T-CC-03/T-PAY-07 but no central
   decision exists. LOW (deployment hardening).
4. **Redis module enablement** (caching/event-bus/workflow-engine/locking)
   — a configuration decision recorded in gap-analysis; affects production
   concurrency (locking) and webhook retries (event bus). LOW/INFO.

## 26. Orphan Requirements

**Finding OR-1 (INFO):** every REQ-* has a section, a Medusa capability (or
explicit UNVERIFIED/gap marker), and a test expectation. No orphan
requirements found. The traceability matrices in all seven specs were
cross-checked for empty cells — none found.

## 27. Circular Dependencies

**Finding CD-1 (INFO):** no circular dependency found at requirement,
specification, or implementation level. The dependency graph (§18) is a DAG
rooted at Markets & Pricing. The CC↔SHIP/PAY mutual references are boundary
participations, not cycles.

## 28. Implementation Blockers

**Business decisions that must be resolved before ANY commerce
implementation:**

1. Payment providers PK + UAE (B-PAY-01/02).
2. Tax rates + inclusive/exclusive display (MP register).
3. Market-selection authority (MP register).
4. COD (B-PAY-03).
5. Discount stacking/priority (MP register / B-CC-11).
6. Return/refund policy — window, eligibility, shipping responsibility,
   refund timing/basis (B-RET-01..17).
7. Cancellation policy — window, after-payment/fulfillment, partial
   (B-ORD-02..05).
8. Shipping rate model + free-shipping + service levels (B-SHIP-01..).
9. Backorder policy (INV §18).
10. Guest order lookup (B-ORD-01) — gates order retrieval + guest returns.
11. Cart ownership posture (T-CC-01) and return-route hardening (T-RET-01/02)
    — security decisions before launch.

**Technical decisions blocking specific modules:** T-CC-01 (cart ownership),
T-ORD-09 (order retrieval), T-RET-01/02 (return hardening), T-SHIP-04/07
(tracking sync), T-RET-10 (return inventory restoration verification),
T-PAY-05/T-ORD-12/T-RET-13 (reconciliation design).

## 29. Non-Blocking Issues

- Context7 doc inconsistency in MP §27 (LOW).
- MP/INV decision registers without IDs (LOW/MEDIUM traceability).
- Stale "later spec" references (ORD §17, SHIP §2) (LOW).
- REQ-CC-017 phrasing (LOW).
- Rate-limiting and Redis-module enablement (deployment hardening).
- Storefront `tsc` failures (gap-analysis #1/#2) — pre-existing foundation
  issue, not a spec issue.

## 30. Recommended Resolution Order

1. **Security decisions first** (launch blockers): B-ORD-01 (order lookup) +
   T-ORD-09, T-CC-01 (cart ownership), T-RET-01/02 + B-RET-02 (return route
   hardening). These are the three HIGH findings.
2. **Provider decisions**: B-PAY-01/02 (payment gateways), TCS/Aramex
   contracts (REQ-SHIP-037/038), return-shipping provider (B-SHIP-14).
3. **Money decisions**: tax rates, market-selection authority, COD,
   discount stacking, cross-currency refunds (confirm refuse).
4. **Policy decisions**: return/refund (B-RET), cancellation (B-ORD),
   shipping model (B-SHIP), backorders (INV §18), guest lookup (B-ORD-01/19).
5. **Technical decisions**: T-RET-10 verification, T-SHIP-04/07 tracking
   sync, reconciliation jobs (T-PAY-05/T-ORD-12/T-RET-13).
6. **Non-blocking**: doc fixes (MP §27, MP/INV IDs, stale references),
   rate limiting, Redis modules, storefront typecheck.

## 31. Final Readiness Assessment

- **Are the specifications internally consistent?** YES — no formal
  contradictions found; three registered security gaps and one cross-spec
  interaction gap (guest returns) require decisions.
- **Are they mutually implementable?** YES — all reference the same verified
  native Medusa mechanisms; the dependency graph is a DAG; transaction,
  idempotency, and event boundaries are consistent.
- **What MUST be resolved before implementation?** §28 blockers: security
  decisions, providers, tax, market-selection, COD, discount stacking,
  return/refund/cancellation/shipping/backorder policy, guest lookup.
- **What CAN be deferred?** §29 non-blocking items (doc fixes, UX decisions
  like B-CC-02, settlement reporting, invoice format).
- **What should be implemented first after decisions?** Foundation →
  Markets/Pricing configuration → Inventory foundation → Cart/Checkout →
  Payments (after provider selection) → Shipping foundation → Orders →
  Returns & Refunds (see `implementation-dependency-graph.md` §C).

**Overall status: READY FOR BUSINESS DECISIONS.** No specification conflict
blocks the decision phase; the specifications are implementable as a
coherent system once the registered decisions are made.

## 32. Verification Record

**Context7 MCP unavailable in this environment.** `.agents/mcp.json` exists
but is empty (0 bytes); no MCP server is configured. No Context7 claims are
made; recorded honestly. (Note: Markets & Pricing §27's claim that Context7
is "available" is stale — see Finding CON-1.)

Verification performed:

1. Read all seven specifications completely (224 requirements, all decision
   registers).
2. Read AGENTS.md, project-context.md, gap-analysis.md,
   medusa-capability-matrix.md, medusa-capabilities.md,
   authentication-authorization.md.
3. Inspected installed Medusa 2.19.0 source to verify disputed claims:
   - `add-shipping-method-to-cart.js` → `refreshCartItemsWorkflow` →
     `refresh-payment-collection.js` (payment collection refresh on
     shipping-method add) — **VERIFIED**.
   - `store/returns/middlewares.js` (no auth middleware) and
     `store/returns/validators.js` (`return_shipping.price` optional) —
     **VERIFIED** (A-1).
   - `store/orders/:id` unauthenticated (previously verified in ORD spec
     creation) — **VERIFIED** (A-2).
   - Return/refund workflows, admin RBAC, `ReturnStatus`, events — verified
     during RET spec creation (recorded in RET §38).
   - `IPaymentProvider`, native webhook route `/hooks/payment/:provider`,
     refund validator — verified during PAY spec creation (recorded in PAY
     §31).
4. Extracted all requirement IDs and decision IDs programmatically
   (224 REQs; B/T counts per spec — see §4).
5. Searched for duplicated terminology and conflicting rules across specs
   (currency conversion, state vocabularies, refund bounds, inventory
   restoration, auth).
6. Every finding is anchored to source text and requirement IDs.

**Files changed by this audit:** the three new architecture documents
(`cross-specification-audit.md`, `consolidated-decision-register.md`,
`implementation-dependency-graph.md`) plus pointers in `project-context.md`
and `gap-analysis.md`. **No source, configuration, dependency, or database
files were modified.**

---

## 33. AGENTS.md Impact Assessment (deliverable D)

**Conclusion: NO AGENTS.md changes are required.** The audit found no
architectural contradiction between the seven specifications and AGENTS.md;
all specifications comply with the fixed architecture (§3), the commerce
invariants (§12), the security rules (§14), the Medusa-first rule (§4), the
business-rule non-invention rule (§5), the Medusa-native authentication
architecture (§26), and the verification hierarchy (§27).

Assessed sections and findings:

| AGENTS.md section | Assessment | Change needed? |
| --- | --- | --- |
| §3 fixed architecture | All specs comply (no drift found, Finding D-2) | NO |
| §4 Medusa-first / no custom engines | All specs Medusa-first; custom items bounded and gated | NO |
| §5 business-rule non-invention | All specs register UNRESOLVED decisions; none invented | NO |
| §10 multi-market isolation | No spec hardcodes PK/UAE/PKR/AED; configuration-driven | NO |
| §11 high-risk domains | Payments/shipping/inventory/orders/returns treated as high-risk in specs | NO |
| §12 commerce invariants | Refund ≤ captured, idempotent restoration, etc. — all specs encode them | NO |
| §13 price integrity | Backend-authoritative everywhere | NO |
| §14 security | Server-side enforcement demanded; three gaps registered (A-1..A-3) | NO — decisions, not AGENTS.md changes |
| §16 strict TDD | All specs carry test requirements; none weaken | NO |
| §17 dependency discipline | No new dependencies proposed by specs | NO |
| §19 audit logging | Specs reference native attribution first (T-ORD-11/T-RET-12) | NO |
| §22 development order | Derived graph (§C) agrees with §22 | NO |
| §26 Medusa-native auth | All specs conform; Better Auth never reintroduced | NO |
| §27 verification hierarchy | All specs record installed-source verification; Context7 honestly reported | NO — one doc fix in MP §27 (CON-1), not AGENTS.md |

**If a future decision changes the following, AGENTS.md impact must be
re-evaluated (no change now):**

1. **Guest return/refund access model** (Finding G-1): if a guest-return
token or guest-return API is approved, §14/§26.3's "customer authorization"
wording may need an explicit guest-access carve-out. Documented here;
no change now.
2. **Payment provider selection with COD** (B-PAY-03): if an offline/COD
flow is approved using the system provider, §11's payment rules apply as-is;
no AGENTS.md change anticipated.
3. **Fulfillment webhook mechanism** (T-SHIP-07): if a custom provider
webhook route is required, it must live behind the provider boundary (§4) —
consistent with AGENTS.md; no change.
4. **Multi-instance production locking** (T-INV-01): enabling Redis locking
modules is configuration within AGENTS.md §3 (Redis non-authoritative) — no
change.

**Recommended wording, should the guest-access decision land differently than
recommended (recorded for future use, NOT applied):**

- If guest returns are approved via an unauthenticated token path, AGENTS.md
  §26.3 "Order/wishlist/review/return/refund ownership always checked
  server-side" would require a clarifying clause: *"guest return access is
  authorized by an unforgeable, expiring, order-bound token verified
  server-side; no guest access to another customer's orders or returns."*

No AGENTS.md modification was made by this audit.
