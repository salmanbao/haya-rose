# Business Decision Dependency Graph

Normalization, canonicalization, dependency analysis, and prioritization of
the consolidated decision register. Produced as part of the Business Decision
Resolution Package. **Resolution status: COMPLETE (2026-08-16) — all 40 user
decisions answered and APPROVED.** This document retains the original
analysis (dependencies, prioritization, statuses as first written) for
traceability; the authoritative final status of every canonical decision is
the resolution record in `consolidated-decision-register.md`. Where this
document's inline status says `RECOMMENDED_NOT_APPROVED`, the decision has
since been APPROVED (or classified DERIVED / MEDUSA_DEFINED /
PROVIDER_VERIFICATION_REQUIRED / DEFERRED) by the product owner — see the
register.

Status vocabulary (per Step 17):

- `UNRESOLVED` — no recommendation yet (should not happen after this doc).
- `RECOMMENDED_NOT_APPROVED` — a recommendation exists; awaits user approval.
- `APPROVED` — approved by an authoritative source (AGENTS.md, a spec marked
  approved, or an explicit user decision).
- `DERIVED` — determined by a foundational decision; not asked independently.
- `IMPLEMENTATION_DEFINED` — decided by the implementation agent, no approval
  needed.
- `MEDUSA_DEFINED` — fixed by installed Medusa 2.19.0 behavior.
- `PROVIDER_VERIFICATION_REQUIRED` — depends on official provider docs; a
  verification task, not a business decision.
- `DEFERRED` — can wait; no architectural rework if changed later.

---

## 1. Normalized Decision Table

Original register: `docs/architecture/consolidated-decision-register.md`
(119 unique business + 69 unique technical entries). After
de-duplication of aliases, the register reduces to **89 canonical business
decisions** (the table below); the technical entries collapse into
implementation-level items resolved by native Medusa capability at
implementation time (§5). The table below lists every canonical business
decision (BD-ID), its source decision IDs, domain, type, blocking level,
status, and dependencies.

**Blocking levels:** `P0` = must decide before any commerce implementation ·
`P1` = must decide before the affected domain is built · `P2` = can defer ·
`P3` = UX/polish.

### 1.1 Markets & Pricing (BD-M-*)

| Canonical ID | Source IDs | Decision | Type | Blocking | Status | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| BD-M-01 | B-MP-08 | Market-selection authority (URL country code vs selector vs profile vs geo) | BUSINESS | P0 | **APPROVED** (hybrid: URL canonical + geolocation suggestion + selector) | — |
| BD-M-02 | B-MP-01, B-MP-02, B-CC-12 | Tax rates for Pakistan and UAE | BUSINESS | P0 | **APPROVED** (policy; numeric PK/AE rates still required) | BD-M-01 |
| BD-M-03 | B-MP-03, B-CC-13 | Tax-inclusive vs tax-exclusive display | BUSINESS | P1 | **APPROVED** (exclusive) | BD-M-02 |
| BD-M-04 | B-MP-04, B-CC-11 | Discount stacking and promotion priority | BUSINESS | P0 | **APPROVED** (single active promotion) | BD-M-01 |
| BD-M-05 | B-MP-05 | Minimum order value | BUSINESS | P2 | DEFERRED | BD-M-04 |
| BD-M-06 | B-MP-06, B-CC-10 | Price rounding policy | BUSINESS | P1 | **APPROVED** (half-up, 2 decimals) | BD-M-01 |
| BD-M-07 | B-MP-07 | Sale pricing rules (which items/when) | BUSINESS | P1 | **APPROVED** (Admin seasonal lists; no auto-scheduling) | BD-M-01, BD-M-04 |
| BD-M-08 | B-MP-09, B-PAY-09 | Cross-currency refund policy | BUSINESS | P0 | **APPROVED** (refuse) | BD-M-01 |
| BD-M-09 | B-MP-10 | Default region per market | BUSINESS | P2 | DERIVED from BD-M-01 (selector when undetermined) | BD-M-01 |
| BD-M-10 | B-MP-11 | Customer/wholesale pricing | BUSINESS | P3 | DEFERRED (excluded — B2C only) | BD-M-01 |

### 1.2 Inventory & Warehouses (BD-I-*)

| Canonical ID | Source IDs | Decision | Type | Blocking | Status | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| BD-I-01 | B-INV-01, B-SHIP-02 | Warehouse allocation strategy | BUSINESS | P0 | **APPROVED** (same-market location) | BD-M-01 |
| BD-I-02 | B-INV-02, B-CC-09 | Backorder policy (which variants, max qty, payment timing, ETA, mixed carts) | BUSINESS | P0 | **APPROVED** (no backorders in V1) | BD-P-03 (COD) |
| BD-I-03 | B-INV-03 | Low-stock threshold/recipient/channels | BUSINESS | P2 | **APPROVED** (threshold per level; merchant email) | — |
| BD-I-04 | B-INV-04 | Cross-market location availability | BUSINESS | P1 | **APPROVED** (implicit via sales-channel links) | BD-I-01 |
| BD-I-05 | B-INV-05, B-SHIP-12 | Split fulfillment policy | BUSINESS | P1 | **APPROVED** (allowed, native, same-market rule) | BD-I-01 |
| BD-I-06 | B-INV-06, B-RET-22 | Return-to-stock disposition (restock/damaged/quarantine) | BUSINESS | P1 | DERIVED from BD-R-04 (restock sellable; discard damaged) | BD-R-04 |
| BD-I-07 | B-INV-07 | Cart quantity vs availability pre-check | BUSINESS | P2 | DEFERRED (validate at completion — native) | — |
| BD-I-08 | B-CC-04 | Inventory reservation timing | BUSINESS | — | MEDUSA_DEFINED (at completion) | BD-I-02 |

### 1.3 Cart & Checkout (BD-C-*)

| Canonical ID | Source IDs | Decision | Type | Blocking | Status | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| BD-C-01 | B-CC-01 | Cart expiration / guest cart lifetime | BUSINESS | P1 | **APPROVED** (30-day guest cart) | BD-G-01 |
| BD-C-02 | B-CC-02 | Cart restoration on return | BUSINESS | P3 | DEFERRED (always restore — native cookie) | — |
| BD-C-03 | B-CC-03 | Cart merge on login | BUSINESS | P2 | DEFERRED | BD-G-01 |
| BD-C-04 | B-CC-05 | Market/currency switching on existing cart | BUSINESS | P1 | **APPROVED** (reject switch; new cart) | BD-M-01 |
| BD-C-05 | B-CC-06 | Guest checkout email requirement | BUSINESS | P1 | DERIVED from BD-G-01 (required) | BD-G-01 |
| BD-C-06 | B-CC-07, B-SHIP-20 | Address field requirements + market-country consistency (PK vs UAE) | BUSINESS | P1 | **APPROVED** (per-market required fields) | BD-M-01 |
| BD-C-07 | B-CC-08 | Guest cart conversion before checkout | BUSINESS | P1 | DERIVED from BD-G-01 (not required; convert on login) | BD-G-01 |
| BD-C-08 | B-CC-15 | Checkout retry behavior | BUSINESS | P2 | DERIVED from BD-P-05 | BD-P-05 |

### 1.4 Payments (BD-P-*)

| Canonical ID | Source IDs | Decision | Type | Blocking | Status | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| BD-P-01 | B-PAY-01 | Pakistan payment provider | BUSINESS/PROVIDER | P0 | **APPROVED (selection: AssanPay)** — replaces earlier xPay selection (provider replacement requested before implementation); contract verification per `docs/architecture/provider-verification/assanpay-verification.md` | BD-M-01 |
| BD-P-02 | B-PAY-02 | UAE payment provider | BUSINESS/PROVIDER | P0 | **APPROVED (selection: Stripe)** — contract verification pending | BD-M-01 |
| BD-P-03 | B-PAY-03, B-MP-12, B-CC-14, B-SHIP-06, B-ORD-12 | COD policy (PK? AE? scope; Medusa representation) | BUSINESS | P0 | **APPROVED** (no COD in V1) | BD-P-01, BD-P-02 |
| BD-P-04 | B-PAY-04, B-PAY-12 | Supported payment methods per market | BUSINESS | P1 | PROVIDER_VERIFICATION_REQUIRED (method set per provider) | BD-P-01, BD-P-02 |
| BD-P-05 | B-PAY-05, B-CC-15 | Payment retry policy | BUSINESS | P1 | **APPROVED** (bounded retries 3, backoff, status check) | BD-P-01/02 |
| BD-P-06 | B-PAY-06 | Payment/session expiry | BUSINESS | P2 | IMPLEMENTATION_DEFINED (native has no TTL; refresh-driven) | BD-P-05 |
| BD-P-07 | B-PAY-07 | Partial capture | BUSINESS | P1 | PROVIDER_VERIFICATION_REQUIRED (native supports; provider-dependent) | BD-P-01/02 |
| BD-P-08 | B-PAY-08 | Partial refund policy | BUSINESS | P1 | DERIVED from BD-R-05 (prorated) | BD-R-05 |
| BD-P-09 | B-PAY-11 | Provider fallback strategy | BUSINESS | P2 | **APPROVED** (fail first; single provider per market) | BD-P-01/02 |
| BD-P-10 | B-PAY-13 | Min/max transaction amounts | BUSINESS | P2 | DEFERRED | BD-P-01/02 |
| BD-P-11 | B-PAY-14 | Payment restrictions by product/category | BUSINESS | P2 | DEFERRED | BD-P-01/02 |
| BD-P-12 | B-PAY-15 | Fraud/risk rules | BUSINESS | P2 | PROVIDER_VERIFICATION_REQUIRED | BD-P-01/02 |
| BD-P-13 | B-PAY-16, B-RET-24 | Reconciliation frequency | BUSINESS | P2 | DEFERRED | BD-P-01/02 |
| BD-P-14 | B-PAY-17 | Manual payment overrides | BUSINESS | P2 | DEFERRED (native mark-as-paid + audit) | — |
| BD-P-15 | B-PAY-18 | Settlement reporting requirements | BUSINESS | P3 | DEFERRED | BD-P-01/02 |

### 1.5 Shipping & Fulfillment (BD-S-*)

| Canonical ID | Source IDs | Decision | Type | Blocking | Status | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| BD-S-01 | B-SHIP-01 | Shipping rate model (flat vs calculated per market) | BUSINESS | P0 | **APPROVED** (hybrid: flat V1, calculated later) | BD-M-01 |
| BD-S-02 | B-SHIP-03 | Free-shipping thresholds | BUSINESS | P1 | **APPROVED** (none in V1) | BD-S-01 |
| BD-S-03 | B-SHIP-04 | Delivery service levels | BUSINESS | P1 | PROVIDER_VERIFICATION_REQUIRED | BD-P-01/02, BD-S-01 |
| BD-S-04 | B-SHIP-05 | Delivery-time estimates (display) | BUSINESS | P2 | DEFERRED | BD-S-03 |
| BD-S-05 | B-SHIP-07 | Shipping insurance | BUSINESS | P3 | PROVIDER_VERIFICATION_REQUIRED | BD-S-01 |
| BD-S-06 | B-SHIP-08 | Package size/weight limits | BUSINESS | P1 | PROVIDER_VERIFICATION_REQUIRED | BD-S-01 |
| BD-S-07 | B-SHIP-09 | Failed-delivery/return-to-origin/reshipment | BUSINESS | P1 | DEFERRED | BD-S-03 |
| BD-S-08 | B-SHIP-10 | Shipment cancellation window | BUSINESS | P1 | DERIVED from BD-O-02 (no post-shipment cancellation — N/A) | BD-O-02 |
| BD-S-09 | B-SHIP-13, B-RET-07 | Return shipping responsibility (customer vs merchant paid) | BUSINESS | P1 | **APPROVED** (customer pays; merchant for defective) | BD-R-04 |
| BD-S-10 | B-SHIP-14 | Return shipping provider + reverse logistics | BUSINESS/PROVIDER | P1 | PROVIDER_VERIFICATION_REQUIRED | BD-S-09, BD-P-01/02 |
| BD-S-11 | B-SHIP-15 | International shipping PK↔AE | BUSINESS | P1 | **APPROVED** (not supported in V1) | BD-M-01 |
| BD-S-12 | B-SHIP-16 | Remote-area surcharges | BUSINESS | P2 | DEFERRED | BD-S-01 |
| BD-S-13 | B-SHIP-17 | Address correction | BUSINESS | P2 | PROVIDER_VERIFICATION_REQUIRED | BD-C-06 |
| BD-S-14 | B-SHIP-18 | Shipping provider fallback | BUSINESS | P2 | DEFERRED (fail first) | BD-P-01/02 |
| BD-S-15 | B-SHIP-19 | Shipment retry policy | BUSINESS | P2 | IMPLEMENTATION_DEFINED | BD-S-03 |
| BD-S-16 | B-SHIP-21 | Shipping tax treatment | BUSINESS | P1 | DERIVED from BD-M-02/03 | BD-M-02 |
| BD-S-17 | B-SHIP-22 | Delivery exception handling | BUSINESS | P2 | DEFERRED | BD-S-07 |
| BD-S-18 | B-SHIP-23, B-RET-09, B-PAY-10 | Shipping-fee refund treatment | BUSINESS | P1 | DERIVED from BD-R-05 (none on returns) | BD-R-05 |
| BD-S-19 | B-SHIP-24 | Payment-state gate for fulfillment | BUSINESS | P1 | **APPROVED** (no gate — native) | BD-P-03 |
| BD-S-20 | B-SHIP-25 | Manual fulfillment (admin-created) | BUSINESS | P2 | DEFERRED (supported via Admin, native) | — |
| BD-S-21 | B-SHIP-11 | Delivery exception → notifications | BUSINESS | P3 | DEFERRED (notifications spec) | BD-S-07 |

### 1.6 Orders (BD-O-*)

| Canonical ID | Source IDs | Decision | Type | Blocking | Status | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| BD-O-01 | B-ORD-01 | Guest/order lookup policy incl. single-order retrieval access | BUSINESS/SECURITY | P0 | **APPROVED** (authenticated-only; guest via email+number) | BD-G-01 |
| BD-O-02 | B-ORD-02 | Customer cancellation window | BUSINESS | P1 | **APPROVED** (cancel before fulfillment only) | BD-P-03 |
| BD-O-03 | B-ORD-03 | Cancellation after payment | BUSINESS | P1 | DERIVED from BD-O-02 (allowed; full refund) | BD-O-02, BD-P-03 |
| BD-O-04 | B-ORD-04 | Cancellation after fulfillment | BUSINESS | P1 | DERIVED from BD-O-02 (not allowed) | BD-O-02, BD-S-19 |
| BD-O-05 | B-ORD-05 | Partial cancellation | BUSINESS | P1 | DERIVED from BD-O-02 (none in V1) | BD-O-02 |
| BD-O-06 | B-ORD-06 | Order modification policy | BUSINESS | P1 | **APPROVED** (none by customer; admin-only native edits) | BD-O-01 |
| BD-O-07 | B-ORD-07 | Address-change policy after order | BUSINESS | P1 | **APPROVED** (immutable; admin-only) | BD-O-06 |
| BD-O-08 | B-ORD-08 | Order number format | BUSINESS | P3 | IMPLEMENTATION_DEFINED (display_id native) | — |
| BD-O-09 | B-ORD-09 | Invoice requirements | BUSINESS | P3 | DEFERRED | — |
| BD-O-10 | B-ORD-10 | Customer-visible statuses | BUSINESS | P2 | DERIVED from state model (independent concerns) | — |
| BD-O-11 | B-ORD-11 | Admin override policy | BUSINESS/SECURITY | P1 | **APPROVED** (native admin + RBAC + audit) | — |
| BD-O-12 | B-ORD-13, B-ORD-14 | Failed-payment/expired order retention | BUSINESS | P2 | DEFERRED | BD-O-13 |
| BD-O-13 | B-ORD-15/16/17, B-RET-18/19 | Order/return data archival, retention, anonymization | BUSINESS | P1 | **APPROVED** (legal minimum; anonymize on request) | BD-G-01 |
| BD-O-14 | B-ORD-18 | Order notification policy | BUSINESS | P2 | DEFERRED (notifications spec) | — |
| BD-O-15 | B-ORD-19 | Guest account association after purchase | BUSINESS | P1 | DERIVED from BD-G-01 (transfer on signup) | BD-G-01 |
| BD-O-16 | B-ORD-20 | Order completion semantics | BUSINESS | P2 | MEDUSA_DEFINED (native completion) | — |
| BD-O-17 | B-ORD-21 | Draft orders usage | BUSINESS | P3 | DEFERRED (not used in V1) | — |
| BD-O-18 | B-ORD-22, B-RET-23 | Claims/exchanges offering | BUSINESS | P1 | **APPROVED** (not offered in V1) | BD-R-04 |

### 1.7 Returns & Refunds (BD-R-*)

| Canonical ID | Source IDs | Decision | Type | Blocking | Status | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| BD-R-01 | B-RET-01 | Return window | BUSINESS | P1 | **APPROVED** (14 days) | BD-S-03 (delivery) |
| BD-R-02 | B-RET-02 | Return approval/rejection requirement | BUSINESS | P1 | **APPROVED** (auto-accept within window) | BD-R-01 |
| BD-R-03 | B-RET-03, B-RET-04, B-RET-06 | Non-returnable / sale-item / hygiene eligibility | BUSINESS | P1 | **APPROVED** (hygiene + non-sellable excluded; sale items returnable) | BD-R-01 |
| BD-R-04 | B-RET-05, B-RET-08, B-RET-20 | Worn/damaged policy, inspection, rejection criteria | BUSINESS | P1 | DERIVED from BD-R-02/03 (sellable = unused/tagged/undamaged) | BD-R-02 |
| BD-R-05 | B-RET-13, B-RET-14, B-RET-15, B-RET-16, B-RET-17, B-RET-10, B-RET-11 | Refund policy: timing, method, basis, partial, restocking, tax, discount | BUSINESS | P0 | **APPROVED** (full value, original method, after receipt; no restock fee) | BD-R-02, BD-M-02 |
| BD-R-06 | B-RET-12 | Return cancellation window | BUSINESS | P1 | **APPROVED** (customer may cancel until shipped) | BD-R-02 |
| BD-R-07 | B-RET-21 | Return shipment mandatory before receipt | BUSINESS | P1 | **APPROVED** (required before receipt) | BD-S-09 |
| BD-R-08 | B-RET-25 | Return attempt/quantity limits | BUSINESS | P2 | DEFERRED | BD-R-01 |

### 1.8 Guest policy (BD-G-*) — cross-domain

| Canonical ID | Source IDs | Decision | Type | Blocking | Status | Depends on |
| --- | --- | --- | --- | --- | --- | --- |
| BD-G-01 | B-CC-06/08, B-ORD-19, audit G-1 | Guest checkout policy: email, conversion, account association, guest order lookup/returns | BUSINESS/SECURITY | P0 | **APPROVED** (guest checkout + email lookup; returns need account) | BD-M-01 |

---

## 2. Canonical Decision Mapping (duplicates / coupling)

When multiple register IDs represent the same business decision, they are
collapsed into one canonical ID. Couplings are documented, not deleted.

| Canonical Decision | Related Decision IDs | Reason they are coupled |
| --- | --- | --- |
| BD-M-01 Market selection | B-MP-08; (B-MP-10 derived) | Region/currency routing drives everything downstream |
| BD-M-02 Tax | B-MP-01, B-MP-02, B-CC-12 | Same question per market; one tax model |
| BD-M-03 Tax display | B-MP-03, B-CC-13 | Same display policy |
| BD-M-04 Stacking | B-MP-04, B-CC-11 (min-order part → BD-M-05) | One promotion policy |
| BD-M-06 Rounding | B-MP-06, B-CC-10 | Same arithmetic policy |
| BD-M-08 Cross-currency | B-MP-09, B-PAY-09 | One refund-currency rule |
| BD-I-01 Allocation | B-INV-01, B-SHIP-02 | Same strategy |
| BD-I-02 Backorder | B-INV-02, B-CC-09 | Same policy |
| BD-I-05 Split fulfillment | B-INV-05, B-SHIP-12 | Same policy |
| BD-I-06 Disposition | B-INV-06, B-RET-22 | Return inventory handling |
| BD-I-08 Reservation timing | B-CC-04 (+ REQ-INV-015) | Medusa-defined; changeable only via backorder decision |
| BD-P-03 COD | B-PAY-03, B-MP-12, B-CC-14, B-SHIP-06, B-ORD-12 | Single COD decision spanning payment/shipping/order |
| BD-P-04 Methods | B-PAY-04, B-PAY-12 | Method set per market |
| BD-P-08 Partial refund | B-PAY-08 → BD-R-05 | Refund policy owns it |
| BD-P-13 Reconciliation | B-PAY-16, B-RET-24 | One cadence |
| BD-S-09 Return shipping responsibility | B-SHIP-13, B-RET-07 | Same decision |
| BD-S-16 Shipping tax | B-SHIP-21 → BD-M-02/03 | Tax model owns it |
| BD-S-18 Shipping-fee refund | B-SHIP-23, B-RET-09, B-PAY-10 | Refund policy owns it |
| BD-S-08 Shipment cancel window | B-SHIP-10 → BD-O-02 | Aligns with order cancellation |
| BD-O-13 Retention | B-ORD-15/16/17, B-RET-18/19 | One data-lifecycle policy |
| BD-O-18 Claims/exchanges | B-ORD-22, B-RET-23 | One offering decision |
| BD-R-03 Eligibility | B-RET-03, B-RET-04, B-RET-06 | One eligibility rule set |
| BD-R-04 Inspection | B-RET-05, B-RET-08, B-RET-20 | One inspection policy |
| BD-R-05 Refund policy | B-RET-10/11/13/14/15/16/17 | **Foundational refund policy** — collapses 7 IDs |
| BD-G-01 Guest | B-CC-06, B-CC-08, B-ORD-19 (+ B-ORD-01 interplay) | One guest policy; resolves audit finding G-1 |

**Dedup effect:** 119 registered business entries → 89 canonical business
decisions (30 couplings/aliases removed — the mapping above plus 3
cross-domain aliases folded in the table). Full decision tree in §5.

---

## 3. Dependency Graph

### 3.1 Foundational spine

```
BD-M-01 Market selection (URL country code)
   ├── BD-M-02 Tax rates ──► BD-M-03 Tax display
   ├── BD-M-06 Rounding
   ├── BD-M-04 Stacking ──► BD-M-05 Min order
   ├── BD-M-07 Sale pricing
   ├── BD-M-08 Cross-currency refunds
   ├── BD-P-01 PK provider ──► BD-P-04 methods ──► BD-P-07/12 capabilities
   ├── BD-P-02 AE provider ──► (same)
   ├── BD-P-03 COD ──► BD-O-02/03 cancellation ──► BD-R-05 refunds
   ├── BD-S-01 Rate model ──► BD-S-02 free shipping ──► BD-S-03 service levels
   ├── BD-S-11 International shipping
   ├── BD-G-01 Guest policy ──► BD-O-01 order lookup (security)
   └── BD-I-01 Allocation ──► BD-I-04 cross-market ──► BD-I-05 split

BD-I-02 Backorder (native allow_backorder; policy)
   └── BD-I-08 reservation timing (MEDUSA_DEFINED at completion)

BD-O-02 Cancellation policy
   ├── BD-O-03 after payment
   ├── BD-O-04 after fulfillment
   └── BD-S-08 shipment cancel window

BD-R-01 Return window ──► BD-R-02 approval ──► BD-R-04 inspection
                              ├── BD-R-05 REFUND POLICY (foundational)
                              │     ├── BD-P-08 partial refund
                              │     ├── BD-S-18 shipping-fee refund
                              │     ├── BD-R-06 return cancel window
                              │     └── BD-I-06 disposition
                              ├── BD-S-09 return shipping responsibility ──► BD-S-10 provider
                              └── BD-R-07 return shipment mandatory

BD-R-05 REFUND POLICY (collapses B-RET-10/11/13/14/15/16/17 + B-PAY-08 +
B-SHIP-23 + B-PAY-10): timing, method, basis, partial, restocking, tax,
discount — ALL DERIVED from one approval.
```

### 3.2 Derived decision set (do NOT ask independently)

These are answered automatically by a foundational decision:

| Derived | Determined by |
| --- | --- |
| BD-M-09 default region | BD-M-01 |
| BD-I-06 return disposition | BD-R-05 (restock unless damaged per BD-R-04) |
| BD-I-08 reservation timing | native (only backorder changes it) |
| BD-C-08 checkout retry | BD-P-05 |
| BD-P-04 payment methods | BD-P-01/02 + provider verification |
| BD-P-08 partial refund | BD-R-05 |
| BD-S-16 shipping tax | BD-M-02/03 |
| BD-S-18 shipping-fee refund | BD-R-05 |
| BD-O-10 customer-visible statuses | state model (orders spec §10) |
| BD-O-16 order completion semantics | native completion |

### 3.3 Medusa-defined (no decision needed)

| Item | Medusa behavior (verified) |
| --- | --- |
| Reservation timing | at completion (REQ-INV-015) |
| Refund ≤ captured | native validator |
| Payment/session expiry mechanics | no native TTL; refresh-driven |
| Order payment/fulfillment status | computed aggregates |
| Return/refund state machines | ReturnStatus + payment module |
| Refund currency = order currency | native |
| Idempotency mechanisms | order_cart, captured_at, refund.id keys |
| Partial capture/refund mechanism | native (provider-dependent) |

---

## 4. Prioritization (P0–P3)

### P0 — MUST decide before any commerce implementation (13)

| ID | Decision | Why P0 |
| --- | --- | --- |
| BD-M-01 | Market selection authority | routing, regions, currency, SEO |
| BD-M-02 | Tax rates PK + AE | totals, pricing config, orders |
| BD-M-04 | Discount stacking/priority | promotion config, totals, refunds |
| BD-M-08 | Cross-currency refunds | refund flows (default refuse) |
| BD-P-01 | PK payment provider | all PK payments |
| BD-P-02 | AE payment provider | all AE payments |
| BD-P-03 | COD | order states, cancellation, refunds |
| BD-S-01 | Shipping rate model | option config, totals |
| BD-I-01 | Warehouse allocation | fulfillment architecture |
| BD-I-02 | Backorder policy | reservation + checkout behavior |
| BD-G-01 | Guest checkout policy | cart/order/return access model (audit G-1) |
| BD-O-01 | Guest order lookup access | **security** — GET /store/orders/:id |
| BD-R-05 | Refund policy | collapses 7 downstream decisions |

**Part A of the questionnaire has 17 questions: the 13 strict-P0 rows above
plus 4 coupled policy questions (BD-O-02 cancellation, BD-R-01 return
window, BD-R-02/04 approval/inspection, BD-R-03 eligibility).** These four
are P1 in blocking terms (they gate the Orders/Returns domains, not the
foundation), but they are bundled into Part A because each is coupled to a
P0 decision (BD-P-03 COD, BD-R-05 refund policy) and answering the
Orders/Returns policy cluster once avoids re-asking later.

### P1 — must decide before affected domain (42)

BD-M-03 (display), BD-M-06 (rounding), BD-M-07 (sale), BD-I-04 (cross-market),
BD-I-05 (split), BD-C-01 (cart expiry), BD-C-04 (market switch), BD-C-05
(guest email), BD-C-06 (address fields), BD-C-07 (guest conversion),
BD-P-05 (retry), BD-P-07 (partial capture, provider), BD-S-02 (free
shipping), BD-S-03 (service levels), BD-S-06 (package limits), BD-S-07
(failed delivery), BD-S-08 (shipment cancel window), BD-S-09 (return
shipping responsibility), BD-S-10 (return shipping provider), BD-S-11
(international), BD-S-19 (fulfillment gate), BD-O-03/04 (cancel after
payment/fulfillment), BD-O-05 (partial cancel), BD-O-06/07 (modification/
address), BD-O-11 (admin override), BD-O-13 (retention), BD-O-15 (guest
account association), BD-O-18 (claims/exchanges), BD-R-02 (approval),
BD-R-03 (eligibility), BD-R-04 (inspection), BD-R-06/07 (return cancel/
shipment), BD-I-06 (disposition), BD-O-02 (order cancellation), BD-P-04
(methods, derived), BD-P-08 (partial refund, derived), BD-R-01 (return
window), BD-S-16 (shipping tax, derived), BD-S-18 (shipping-fee refund,
derived), etc. — full list in §1 table (42 P1 rows).

### P2 — can defer (25)

BD-M-05 (min order), BD-I-03 (low stock), BD-I-07 (pre-check), BD-C-03
(merge), BD-P-06 (expiry, implementation), BD-P-09 (fallback), BD-P-10
(min/max), BD-P-11 (restrictions), BD-P-12 (fraud), BD-P-13 (reconciliation),
BD-P-14 (overrides), BD-S-04 (delivery estimates), BD-S-12 (surcharges),
BD-S-14 (shipping fallback), BD-S-15 (retry), BD-S-17 (exceptions), BD-S-20
(manual fulfillment), BD-O-10 (visible statuses), BD-O-12 (retention),
BD-O-14 (notifications), BD-O-16 (completion), BD-R-08 (attempt limits),
etc.

### P3 — UX/polish (8)

BD-M-10 (wholesale — exclude), BD-C-02 (cart restore), BD-O-08 (order
number), BD-O-09 (invoices), BD-O-17 (drafts), BD-P-15 (settlement
reporting), BD-S-05 (insurance), BD-S-21 (exception notifications), etc.

### Priority counts (canonical)

P0: 13 · P1: 42 · P2: 25 · P3: 8 · BD-I-08 (MEDUSA_DEFINED, blocking
"—") · DERIVED: 8 · MEDUSA_DEFINED: 2 · IMPLEMENTATION_DEFINED: 3 ·
PROVIDER_VERIFICATION_REQUIRED: 7 · DEFERRED: 2 (= 89 canonical business
decisions).

---

## 5. Technical Decision Filter (T-*)

All 69 technical decisions from the consolidated register classified
(approximate row counts; the register's 69 unique T-IDs are the
authoritative total):

| Class | Count | Examples | User action |
| --- | --- | --- | --- |
| **Already determined by AGENTS.md/Medusa/architecture** | ~30 | T-CC-04 (native locking), T-PAY-04 (native webhook), T-ORD-01..06 (native workflow mapping), T-ORD-10 (native RBAC), T-ORD-11 (native attribution), T-ORD-13 (native query), T-INV-01 (Redis prod), T-RET-09 (native-first) | NONE |
| **Implementation-time decision** (agent decides) | ~20 | T-CC-02 (refresh policy), T-ORD-07 (order number gen), T-PAY-06 (retry values), T-SHIP-05/06, T-MP-01..06 (verify mechanics), T-INV-02/03/04 | NONE |
| **Requires explicit architectural authorization** | 0 | none found (audit D-2: no drift) | NONE |
| **Blocked by a business decision** | ~12 | T-CC-01 (BD-G-01/BD-O-01), T-ORD-09 (BD-O-01), T-RET-01 (BD-R-02), T-RET-02 (BD-S-09), T-SHIP-14 (BD-I-01), T-RET-03/11/14 (BD-S-10), T-PAY-03 (BD-P-01/02) | Approve the B-decision |
| **Provider verification** | ~3 | T-PAY-07 rate limiting (config), T-PAY-10 webhook options, T-SHIP-04/07 tracking sync | None — verification task |

**Conclusion:** the user is not asked to make technical decisions. The only
technical items requiring user input are those *blocked by* business
decisions, and the business decision itself is the question.

---

## 6. Security Decision Isolation (Step 16)

| Technical item | Business policy part (user decides) | Mandatory security part (non-negotiable, AGENTS.md §14/§26) |
| --- | --- | --- |
| T-CC-01 cart ownership | Whether guest carts stay ID-only; customer carts enforce ownership (BD-G-01) | Server-side ownership; no client customer ID; never frontend-only auth |
| T-ORD-09 order retrieval | Access policy: authenticated-customer-only vs guest lookup token (BD-O-01) | Never ID-only exposure; ownership server-side; no enumeration |
| T-RET-01 return route | Whether returns require login vs guest token (BD-G-01/BD-R-02) | Authenticate + ownership before workflow; no client order_id trust |
| T-RET-02 return shipping cost | Who pays return shipping (BD-S-09) | Never trust client-supplied `price`; server-side cost authority |

The mandatory column is **not** weakened by any business decision. The
questionnaire asks only the policy part.

---

## 7. Provider Decision Separation (Step 7)

**Provider selection (business/user decisions — in questionnaire):**
BD-P-01 (PK payment), BD-P-02 (AE payment), BD-S-10 (return shipping
provider), and the fixed architecture decisions: TCS (PK shipping),
Aramex (AE shipping), Google OAuth, R2 — the latter four are **already
fixed** by AGENTS.md/project context and are not re-asked.

**Provider contract verification (NOT business decisions — verification
tasks, never asked):** endpoints, payloads, response schemas, webhook
schemas, signature mechanisms, retry semantics, rate limits, sandbox
availability. All currently UNVERIFIED (REQ-PAY-022/023, REQ-SHIP-037/038,
RET §35) and gated.

---

## 8. Recommended Resolution Order

1. BD-M-01 Market selection → 2. BD-M-02 Tax → 3. BD-P-01 + BD-P-02
   providers → 4. BD-P-03 COD → 5. BD-G-01 Guest policy + BD-O-01 order
   lookup (security) → 6. BD-M-04 stacking → 7. BD-S-01 rate model →
   8. BD-I-01 allocation + BD-I-02 backorder → 9. BD-R-05 refund policy →
   10. BD-R-01/02/03 return policy → 11. BD-O-02 cancellation →
   12. remaining P1s per domain.

**EXECUTED 2026-08-16 — all 40 decisions resolved in the order above
(BD-M-01 → BD-P-01/02 → BD-P-03 → BD-M-02 → BD-G-01/BD-O-01 → BD-R-05 →
BD-R-01/02/03 → BD-S-01 → BD-I-01 → BD-I-02 → BD-M-04 → BD-M-08 →
BD-O-02 → Part B).** Remaining implementation gates (not decisions): PK GST
numeric rate, AE VAT numeric rate, provider contract verification (AssanPay,
Stripe; TCS/Aramex at shipping stage). Business-decision resolution is
COMPLETE.
