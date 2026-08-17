# Implementation Dependency Graph

Correct implementation sequence **derived from the seven specifications'**
actual dependencies (not the specification-writing order). Each phase lists
its inputs (dependencies), outputs (state that later phases consume), and the
decisions that gate it (see `consolidated-decision-register.md`).

The graph is a DAG rooted at foundation and Markets & Pricing. The core spine
is: **Foundation → Markets/Pricing → Inventory → Cart/Checkout → Payments →
Shipping → Orders → Returns/Refunds**, with Authentication and Catalog
cross-cutting early, and supporting features last.

---

## Dependency overview

```
Foundation (tooling, tests, env, DB/Redis)
   │
   ├──▶ Authentication (Medusa-native; Google config) ──cross-cuts all──▶
   ├──▶ Catalog (products/variants/options/categories) ──cross-cuts──▶
   │
   ▼
Markets & Pricing (regions, currencies, sales channels, price sets, tax regions)
   │
   ├──▶ Inventory & Warehouses (stock locations, inventory items, levels, links)
   │        │
   │        ▼
   │     Cart & Checkout (cart module, workflows, ownership hardening)
   │        │
   │        ├──▶ Payments (collections/sessions; provider adapters after selection)
   │        │
   │        ├──▶ Shipping & Fulfillment foundation (options/profiles/sets; TCS/Aramex later)
   │        │
   │        ▼
   │     Orders (order lifecycle, cancellation, admin, tracking)
   │        │
   │        ▼
   │     Returns & Refunds (return workflows, refund policy, inventory restore)
   │
   └──▶ Supporting features (wishlist, reviews, notifications, abandoned cart,
        recommendations, recently viewed, bundles, search/filter, localization,
        SEO) — after core spine
```

## Phase-by-phase derivation

### Phase 0 — Foundation

**Inputs:** none (repository state).
**Work:** fix storefront `tsc`/lint gaps (gap-analysis #1/#2), establish git,
establish TDD harness (backend jest configured, 0 tests — gap #4), PostgreSQL/
Redis local foundation, secret handling baseline.
**Redis state:** **DONE (2026-08-17, approved decision REDIS WIRING = ENABLE
NOW)** — cache, caching (graph-query, `MEDUSA_FF_CACHING=true`), event bus,
workflow engine, and locking are wired to Redis (see gap-analysis row 3 and
project-context). Redis remains supporting infrastructure only; PostgreSQL is
the authoritative persistence layer.
**Outputs:** a buildable, tested base.
**Gates:** none (prerequisite to everything; AGENTS.md §16/§17).
**Specs:** project-context, gap-analysis.

### Phase 1 — Markets & Pricing (configuration)

**Why first:** every other module depends on regions/currencies/sales
channels/pricing (dependency root of the DAG; audit §18).
**Work:** create regions Pakistan (PKR) + UAE (AED), countries PK/AE,
sales channel + publishable-key links, price sets per variant per
currency/region, tax regions (rates pending decisions).
**Inputs:** Foundation.
**Outputs:** market/currency/pricing/tax context consumed by Inventory, Cart,
Payments, Shipping, Orders.
**Gates:** B-MP-01..10 (tax rates, market selection, stacking, rounding),
B-PAY-03 (COD — affects pricing display only minimally). Market-selection
authority (B-MP-08) gates storefront routing; region creation itself can
proceed.
**Verification per AGENTS.md §27:** native region/currency/pricing modules.

### Phase 2 — Inventory & Warehouses (configuration + verification)

**Why here:** Cart/Checkout reserves at completion, Shipping needs
stock-location→fulfillment links, Orders consumes reservations. Inventory
must exist before checkout can be exercised end-to-end.
**Work:** stock locations (warehouses), sales-channel↔location links,
inventory items per variant, levels, variant↔inventory links, verify
`completeCartWorkflow` reservation + `cancelOrderWorkflow` restoration.
**Inputs:** Phase 1 (sales channels, variants).
**Outputs:** authoritative availability/reservation state; per-location
reservation data feeding Shipping/Orders.
**Gates:** B-INV-01 (allocation strategy — needed before allocation step),
B-INV-02 (backorder policy), B-INV-04 (cross-market availability). Core
mechanics (levels, reservations, links) are native and unblocked.
**Verification:** installed `@medusajs/inventory` / `stock-location` /
`core-flows` (recorded in INV §33).

### Phase 3 — Cart & Checkout

**Why here:** the functional spine — everything (payment, shipping, order)
consumes the cart and its completion workflow.
**Work:** verify cart module + `completeCartWorkflow`; implement ownership
hardening (T-CC-01) — custom store middleware/route; confirm price refresh
policy (T-CC-02); cart/checkout tests (unit/integration/concurrency/
security/E2E per CC §30).
**Inputs:** Phases 1–2 (market context, availability).
**Outputs:** cart state, completion workflow, order creation entry point.
**Gates:** T-CC-01 (security, decision), B-CC-01/04/05/06/07 (policy),
T-CC-03 (rate limiting, before launch). Payment collection creation
(`createPaymentCollectionForCartWorkflow`) is called by checkout but is
Payments-domain; the store route already exists natively.
**Verification:** installed cart module/workflows (CC §34).

### Phase 4 — Payments

**Why here:** completion authorizes payment; Orders reads payment state;
Returns refunds via the payment module. Can be developed in parallel with
Shipping (both consume Cart) but must precede full Order/Return flows.
**Work:** verify payment module + native webhook pipeline; provider
registration + region binding (T-PAY-01/02); **provider selection and
adapter implementation after B-PAY-01/02 + contract verification
(REQ-PAY-022/023)**; webhook options (T-PAY-10); capture/refund/cancel flows;
reconciliation job (T-PAY-05); rate limiting (T-PAY-07).
**Inputs:** Phase 3 (checkout sequence), Phase 1 (region/provider binding).
**Outputs:** payment state consumed by Orders/Returns.
**Gates:** B-PAY-01/02 (providers — hard gate), B-PAY-03 (COD), B-PAY-06
(session expiry), T-PAY-03 (capture timing), T-PAY-06 (retry values).
System-provider mechanics (`pp_system_default`, mark-as-paid) can be
verified without a provider.
**Verification:** installed `@medusajs/payment` (PAY §31).

### Phase 5 — Shipping & Fulfillment

**Why here:** consumes Cart (shipping methods) and Inventory (per-location
fulfillment); Order fulfillment depends on it. Provider integration
(TCS/Aramex) is gated on provider selection; **the fulfillment foundation
(profiles, sets, zones, options, manual provider) is not.**
**Work:** fulfillment sets per market, geo zones (PK/AE), shipping options
with rates (price_type per B-SHIP-01), verify eligibility chain; fulfillment
workflows; tracking sync mechanism (T-SHIP-04/07 — custom route or polling,
no native fulfillment webhook); TCS/Aramex adapters after selection +
contract verification (REQ-SHIP-037/038); allocation step (T-SHIP-14, per
B-INV-01).
**Inputs:** Phases 1–3 (regions, locations, cart shipping methods).
**Outputs:** shipping options/rates, fulfillments, shipments, tracking.
**Gates:** B-SHIP-01/03/04 (rate model/thresholds/service levels), B-SHIP-13/14
(return shipping), T-SHIP-04/07 (tracking sync), provider contracts.
**Verification:** installed fulfillment module (`IFulfillmentProvider`,
models — SHIP §27).

### Phase 6 — Orders

**Why here:** created by `completeCartWorkflow` (Phase 3), consumes payment
state (Phase 4), coordinates fulfillment (Phase 5), reads inventory (Phase 2).
**Work:** verify order module; order retrieval hardening (T-ORD-09 + B-ORD-01 —
**security decision**); cancellation policy implementation (B-ORD-02..05)
via `cancelOrderWorkflow`; order admin + search; order events/subscribers;
order snapshot immutability tests; reconciliation (T-ORD-12).
**Inputs:** Phases 3–5.
**Outputs:** order state consumed by Returns/Refunds.
**Gates:** B-ORD-01 (lookup/security), B-ORD-02..05 (cancellation), B-ORD-06/07
(modification), T-ORD-09.
**Verification:** installed order module (ORD §37).

### Phase 7 — Returns & Refunds

**Why last in the spine:** consumes Orders (quantities, transactions),
Payments (refunds), Shipping (return shipment), Inventory (restoration).
**Work:** store return route hardening (T-RET-01/02 — **security decision**);
eligibility per B-RET-01..06/25; return workflows; refund calculation per
B-RET-09..17; refund execution via payment module; inventory restoration
(T-RET-10 verify); return shipping per B-SHIP-13/14; reconciliation
(T-RET-13).
**Inputs:** Phases 4–6.
**Outputs:** return/refund state; inventory restoration.
**Gates:** B-RET-01..25 (policy — largest unresolved cluster), T-RET-01/02/10,
B-PAY-03 (COD refunds).
**Verification:** installed return/refund workflows (RET §38).

### Phase 8 — Supporting features (after core spine)

Wishlist, reviews, notifications (email/SMS/WhatsApp providers + consent),
abandoned cart, recommendations, recently viewed, bundles, search/filter UI,
localization, SEO. Each is V1 scope (AGENTS.md §9) but **has no specification
yet** (audit §25) and is independent of the core spine. Notifications are
cross-cutting (consumed by PAY/SHIP/ORD/RET/INV as side-effects) and can be
built incrementally after the core modules emit their events.

---

## Cross-cutting concerns (parallel tracks)

- **Authentication:** Medusa-native (email/password enabled; Google config
  pending). Can proceed in parallel with Phases 1–3; required before
  customer-scoped features (cart association, orders, returns hardening).
  Gates: Google OAuth config (auth doc, UNRESOLVED).
- **Catalog:** products/variants/options/categories/collections. Required
  before pricing/inventory data (Phases 1–2). No dedicated spec yet
  (taxonomy per AGENTS.md §8; seed data exists).
- **Media (R2):** configuration-only via file-s3; needed when product images
  are uploaded (catalog phase).
- **Security hardening:** T-CC-01, T-ORD-09, T-RET-01/02 decisions should be
  made early (they are Part-1 gates) even though enforcement lands in the
  respective phases.
- **Observability:** structured logging per spec — build per phase.

## Sequencing rules (from the audit)

1. Never start a phase whose inputs are gated by an unresolved Part-1
   decision without that decision.
2. Foundation and configuration phases (0–2) can proceed while business
   decisions are being made (they do not require policy values beyond region
   creation).
3. Payment provider selection is the hard external gate (B-PAY-01/02,
   REQ-PAY-022/023); Shipping provider selection gates TCS/Aramex
   (REQ-SHIP-037/038) but not the fulfillment foundation.
4. Returns & Refunds implementation must wait for the B-RET policy cluster
   and the T-RET-01/02/10 decisions.
5. Supporting features are independent and can be scheduled after the spine;
   abandoned-cart requires B-CC-01 first.

## Relationship to AGENTS.md §22 development order

The derived graph **agrees with** AGENTS.md §22 (repo/tooling → foundation →
markets → inventory → media → catalog → storefront → SEO → browsing → auth →
cart/checkout → payment boundaries → providers → shipping boundaries →
orders → returns). The audit's derivation adds: (a) security decisions
(T-CC-01/T-ORD-09/T-RET-01/02) must be made early even though enforcement is
phased; (b) Inventory is confirmed as a prerequisite of Cart (reservation at
completion), matching §22; (c) supporting features are scheduled after the
spine, matching §22's "complete E2E/regression" tail.
