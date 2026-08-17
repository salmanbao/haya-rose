# Consolidated Decision Register

Consolidation of every unresolved business (B-*) and technical (T-*) decision
from the seven domain specifications, produced by the cross-specification
audit. No decision is resolved here; each is grouped by when it must be
resolved and cross-referenced to its source.

**ID note:** Markets & Pricing and Inventory & Warehouses registers use
descriptive names without stable IDs. This register assigns **provisional
IDs** (B-MP-*, T-MP-*, B-INV-*, T-INV-*) to enable cross-referencing; the
source specs should adopt these IDs in a later documentation pass
(audit finding CON-2).

Counts: **119 unique business decisions + 69 unique technical decisions**
(188 total). Per-domain business: MP 12 / INV 7 / CC 15 / PAY 16 / SHIP 25 /
ORD 20 / RET 24. Per-domain technical: MP 6 / INV 5 / CC 7 / PAY 9 / SHIP
13 / ORD 17 / RET 12. Three business IDs (B-ORD-09, B-ORD-13, B-SHIP-17)
and four technical IDs (T-CC-04, T-INV-01, T-PAY-04, T-PAY-09) are
intentionally cross-listed in more than one part; the unique counts above
are the authoritative numbers. All UNRESOLVED unless marked otherwise.

**Canonicalization (Business Decision Resolution Package, 2026-08-16):**
the 119 registered business entries collapse to **89 canonical business
decisions** (30 couplings/aliases removed — see
`business-decision-dependency-graph.md` §2). The user-facing questionnaire
asks **40 decisions** (17 foundational + 23 P1); everything else is DERIVED,
MEDUSA_DEFINED, IMPLEMENTATION_DEFINED, PROVIDER_VERIFICATION_REQUIRED, or
DEFERRED. Canonical IDs (BD-M-*, BD-I-*, BD-C-*, BD-P-*, BD-S-*, BD-O-*,
BD-R-*, BD-G-01) map back to the rows below.

**Resolution record (Business Decision Phase, 2026-08-16): all 40 user
decisions ANSWERED and APPROVED by the product owner.** Final status per
canonical decision (the original rows below are preserved unchanged as
historical record):

| Canonical ID | Final status | Approved policy / note |
| --- | --- | --- |
| BD-M-01 | APPROVED | Hybrid: URL country-code canonical + geolocation suggestion + manual selector; confirmed choice authoritative |
| BD-M-02 | APPROVED (policy) | Standard per-market tax regions; PK GST / AE VAT numeric values still required (zero-rate interim; REQ-MP-030 safe) |
| BD-M-03 | APPROVED | Tax-exclusive display (per-market allowed) |
| BD-M-04 | APPROVED | Single active promotion (no stacking) |
| BD-M-05 | DEFERRED | Minimum order value — P2, not required V1 |
| BD-M-06 | APPROVED | Standard half-up, 2 decimals |
| BD-M-07 | APPROVED | Seasonal sale price lists by Admin; no auto-scheduling |
| BD-M-08 | APPROVED | Cross-currency refunds refused (order currency only) |
| BD-M-09 | DERIVED (BD-M-01) | Default region: market selector when location undetermined |
| BD-M-10 | DEFERRED (excluded) | No wholesale/B2B in V1 — B2C only |
| BD-I-01 | APPROVED | Same-market location allocation (PK→PK, AE→AE) |
| BD-I-02 | APPROVED | No backorders in V1 |
| BD-I-03 | APPROVED | Low-stock threshold per level; merchant email recipient |
| BD-I-04 | APPROVED | Cross-market availability implicit via sales-channel links |
| BD-I-05 | APPROVED | Split fulfillment allowed (native), same-market rule |
| BD-I-06 | DERIVED (BD-R-04/05) | Restock sellable; discard damaged |
| BD-I-07 | DEFERRED | Cart pre-check — validate at completion only (native) |
| BD-I-08 | MEDUSA_DEFINED | Reservation at completion (native) |
| BD-C-01 | APPROVED | 30-day guest cart lifetime; no reservation impact |
| BD-C-02 | DEFERRED | Cart restoration on return — P3 UX |
| BD-C-03 | DEFERRED | Cart merge on login — P2 |
| BD-C-04 | APPROVED | Market/currency switch rejected; new cart |
| BD-C-05 | DERIVED (BD-G-01) | Guest email required at checkout |
| BD-C-06 | APPROVED | Per-market required address fields; country must match region |
| BD-C-07 | DERIVED (BD-G-01) | No pre-checkout conversion; convert on login |
| BD-C-08 | DERIVED (BD-P-05) | Checkout retry per payment retry policy |
| BD-P-01 | APPROVED (selection) | **AssanPay Pakistan (PKR)** — replaces earlier xPay selection (provider replacement requested before implementation); contract verification per `docs/architecture/provider-verification/assanpay-verification.md` |
| BD-P-02 | APPROVED (selection) | **Stripe (AED)** — contract verified (see `docs/architecture/provider-verification/stripe-verification.md`) |
| BD-P-03 | APPROVED | No COD in V1 |
| BD-P-04 | PROVIDER_VERIFICATION_REQUIRED | Method set per provider (AssanPay/Stripe) |
| BD-P-05 | APPROVED | Bounded retries (3) with backoff; status check before retry |
| BD-P-06 | IMPLEMENTATION_DEFINED | No native TTL; refresh-driven |
| BD-P-07 | PROVIDER_VERIFICATION_REQUIRED | Partial capture — provider-dependent |
| BD-P-08 | DERIVED (BD-R-05) | Partial refunds prorated by received quantity |
| BD-P-09 | APPROVED | Fail first; single provider per market; no fallback V1 |
| BD-P-10 | DEFERRED | Min/max transaction amounts |
| BD-P-11 | DEFERRED | Payment restrictions by product/category |
| BD-P-12 | PROVIDER_VERIFICATION_REQUIRED | Fraud/risk rules per provider |
| BD-P-13 | DEFERRED | Reconciliation frequency |
| BD-P-14 | DEFERRED | Manual payment overrides — native mark-as-paid + audit |
| BD-P-15 | DEFERRED | Settlement reporting |
| BD-S-01 | APPROVED | Hybrid: flat rates V1; calculated after provider rate verification |
| BD-S-02 | APPROVED | No free-shipping threshold in V1 |
| BD-S-03 | PROVIDER_VERIFICATION_REQUIRED | Delivery service levels per carrier |
| BD-S-04 | DEFERRED | Delivery-time estimates |
| BD-S-05 | PROVIDER_VERIFICATION_REQUIRED | Shipping insurance |
| BD-S-06 | PROVIDER_VERIFICATION_REQUIRED | Package size/weight limits |
| BD-S-07 | DEFERRED | Failed-delivery/return-to-origin |
| BD-S-08 | DERIVED (BD-O-02) | No post-shipment cancellation (N/A) |
| BD-S-09 | APPROVED | Customer pays return shipping (merchant pays only for defective) |
| BD-S-10 | PROVIDER_VERIFICATION_REQUIRED | Return shipping provider + reverse logistics |
| BD-S-11 | APPROVED | No international shipping PK↔AE in V1 |
| BD-S-12 | DEFERRED | Remote-area surcharges |
| BD-S-13 | PROVIDER_VERIFICATION_REQUIRED | Address correction |
| BD-S-14 | DEFERRED | Shipping provider fallback — fail first |
| BD-S-15 | IMPLEMENTATION_DEFINED | Shipment retry values at implementation |
| BD-S-16 | DERIVED (BD-M-02/03) | Shipping tax per market tax model |
| BD-S-17 | DEFERRED | Delivery exception handling |
| BD-S-18 | DERIVED (BD-R-05) | No shipping-fee refund on returns; only on full cancellation |
| BD-S-19 | APPROVED | No payment-state gate for fulfillment (native) |
| BD-S-20 | DEFERRED | Manual fulfillment via Admin (native) |
| BD-S-21 | DEFERRED | Delivery-exception notifications (notifications spec) |
| BD-O-01 | APPROVED | Authenticated-only order retrieval; guest via email+number |
| BD-O-02 | APPROVED | Cancel before fulfillment only; full-order refund |
| BD-O-03 | DERIVED (BD-O-02) | Cancel after payment allowed; full refund |
| BD-O-04 | DERIVED (BD-O-02) | Cancel after fulfillment not allowed |
| BD-O-05 | DERIVED (BD-O-02) | No partial cancellation in V1 |
| BD-O-06 | APPROVED | No customer order modification; admin-only native edits |
| BD-O-07 | APPROVED | Order addresses immutable (admin-only changes) |
| BD-O-08 | IMPLEMENTATION_DEFINED | Native `display_id` order number |
| BD-O-09 | DEFERRED | Invoice requirements |
| BD-O-10 | DERIVED (state model) | Customer-visible statuses from native state |
| BD-O-11 | APPROVED | Native admin + RBAC + audit |
| BD-O-12 | DEFERRED | Failed-payment/expired retention |
| BD-O-13 | APPROVED | Retain per legal minimum; anonymize on request; no auto-delete V1 |
| BD-O-14 | DEFERRED | Order notification policy (notifications spec) |
| BD-O-15 | DERIVED (BD-G-01) | Guest account association to access returns |
| BD-O-16 | MEDUSA_DEFINED | Native completion semantics |
| BD-O-17 | DEFERRED | Draft orders unused in V1 |
| BD-O-18 | APPROVED | Claims/exchanges not offered in V1 |
| BD-R-01 | APPROVED | 14-day return window after delivery |
| BD-R-02 | APPROVED | Auto-accept within window |
| BD-R-03 | APPROVED | Hygiene items + non-sellable condition excluded; sale items returnable |
| BD-R-04 | DERIVED (BD-R-02/03) | Inspection: sellable = unused/tagged/undamaged; damaged → dismissed |
| BD-R-05 | APPROVED | Full-value refund to original method after receipt; no restock fee; no shipping refund on returns |
| BD-R-06 | APPROVED | Customer may cancel return request until shipped |
| BD-R-07 | APPROVED | Return shipment required before receipt (customer-paid) |
| BD-R-08 | DEFERRED | Return attempt/quantity limits |
| BD-G-01 | APPROVED | Guest checkout + email lookup; returns require account |

---

## Part 1 — Must resolve BEFORE any commerce implementation

These decisions gate the core chain (markets → cart → payment → shipping →
order → return). Until resolved, foundation implementation can proceed but
commerce flows cannot be completed.

### Business decisions

| ID | Decision | Source spec | Blocks | Consequence of each option |
| --- | --- | --- | --- | --- |
| B-PAY-01 | Pakistan payment provider(s) | payments §24 | All PK payment flows; checkout | Provider selected ⇒ adapter implementation + contract verification (REQ-PAY-022) |
| B-PAY-02 | UAE payment provider(s) | payments §24 | All AE payment flows | Provider selected ⇒ adapter + REQ-PAY-023 |
| B-PAY-03 | COD (scope, markets, Medusa representation, refund behavior) | payments §24 (deferred everywhere: B-ORD-12, RET §33, SHIP, CC B-CC-14) | COD flows; offline/order payment states; return/refund of COD orders | System-provider offline flow vs custom provider; each changes checkout + refund handling |
| B-MP-01 | Pakistan tax policy/rates | markets-and-pricing §11/§24 | Tax config, order totals | Rates defined ⇒ tax regions configured; totals change |
| B-MP-02 | UAE tax policy/rates | markets-and-pricing §11/§24 | Same | Same |
| B-MP-03 | Tax-inclusive/exclusive display | markets-and-pricing §11; CC B-CC-13 | Pricing display, tax config | Inclusive ⇒ price-preference config; changes display + totals |
| B-MP-04 | Discount stacking / priority | markets-and-pricing §12; CC B-CC-11 | Promotion config; totals | Stacked ⇒ promotion application rules; affects discount allocation on refunds (B-RET-11) |
| B-MP-05 | Minimum order value | markets-and-pricing §12 | Promotion/cart rules | Rule support must be verified natively |
| B-MP-06 | Price rounding policy | markets-and-pricing §24; CC B-CC-10 | Totals/refunds display+math | Rounding mode affects total/refund arithmetic |
| B-MP-07 | Sale pricing rules (which items/when) | markets-and-pricing §12/§24 | Price lists | Defines sale-list creation policy |
| B-MP-08 | Market-selection authority (URL vs selector vs profile vs geo) | markets-and-pricing §13/§24 | Storefront routing; SEO; cart region | URL country code (recommended) vs selector — changes routing/canonicalization |
| B-MP-09 | Cross-currency refunds | markets-and-pricing §18; PAY B-PAY-09; ORD §19; RET §19 | Refund flows | Default refuse (no silent conversion) vs authorized conversion |
| B-MP-10 | Default region per market | markets-and-pricing §24 | Storefront config; SEO entry points | Single default vs per-market entry points |
| B-MP-11 | Customer/wholesale pricing | markets-and-pricing §24 | Price lists (not V1) | Confirm excluded from V1 |
| B-MP-12 | COD (see B-PAY-03 — single decision) | markets-and-pricing §24 | — | Alias of B-PAY-03 |
| B-INV-01 | Warehouse allocation strategy (same-market / highest stock / lowest cost / priority / manual) | inventory-and-warehouses §17/§30; SHIP B-SHIP-02 | Fulfillment implementation; reservation location_ids | Strategy drives allocation step (T-SHIP-14) |
| B-INV-02 | Backorder policy (which variants, max qty, payment timing, ETA, mixed carts) | inventory-and-warehouses §18/§30; CC B-CC-09 | Backorder flag + reservation allow_backorder | Policy defines variant flag + allow_backorder feeding |
| B-INV-03 | Low-stock threshold/recipient/channels/repeat | inventory-and-warehouses §19/§30 | Low-stock notifications | Threshold + subscriber config |
| B-INV-04 | Cross-market location availability (implicit vs explicit) | inventory-and-warehouses §9/§30 | Location↔market allocation | Sales-channel-links vs explicit allocation |
| B-INV-05 | Split fulfillment policy | inventory-and-warehouses §16/§30; SHIP B-SHIP-12 | Fulfillment UX | Allow split (native) vs single-location |
| B-INV-06 | Return-to-stock disposition (restock/damaged/quarantine/discard) | inventory-and-warehouses §22/§30; RET B-RET-22 | Return inventory handling | Disposition drives inventory adjustment |
| B-INV-07 | Cart quantity vs availability pre-check | inventory-and-warehouses §12/§30 | Cart UX; add-to-cart behavior | Validate at completion only (native) vs cap at add |
| B-CC-01 | Cart expiration / guest cart lifetime | cart-and-checkout §27 | Abandoned-cart, cleanup jobs | X-day expiry vs none |
| B-CC-04 | Inventory reservation timing | cart-and-checkout §27; INV REQ-INV-015 | Backorder behavior | Native (completion) vs custom (add) |
| B-CC-05 | Market/currency switching on existing cart | cart-and-checkout §27; MP REQ-MP-023 | Repricing, promotions | Reject/reprice/clear; interacts with T-CC-02 |
| B-CC-06 | Guest checkout email requirement | cart-and-checkout §27 | Checkout validation | Required vs optional |
| B-CC-07 | Address field requirements + market-country consistency | cart-and-checkout §27; SHIP B-SHIP-20 | Checkout validation; provider address mapping | Per-market schema |
| B-CC-09 | Backorder/overselling policy | cart-and-checkout §27 | = B-INV-02 (alias) | — |
| B-CC-11 | Promotion stacking/min order | cart-and-checkout §27 | = B-MP-04/05 (alias) | — |
| B-CC-12 | PK/UAE tax rates | cart-and-checkout §27 | = B-MP-01/02 (alias) | — |
| B-CC-13 | Tax-inclusive/exclusive display | cart-and-checkout §27 | = B-MP-03 (alias) | — |
| B-CC-14 | COD behavior | cart-and-checkout §27 | = B-PAY-03 (alias) | — |
| B-SHIP-01 | Shipping rate model (flat/dynamic per market) | shipping-and-fulfillment §24 | Shipping option config; totals | Rate model drives option price_type (FLAT vs CALCULATED) |
| B-SHIP-02 | Warehouse routing/allocation strategy | shipping-and-fulfillment §24 | = B-INV-01 (alias) | — |
| B-SHIP-03 | Free-shipping thresholds | shipping-and-fulfillment §24 | Shipping option rules | Threshold rules |
| B-SHIP-04 | Delivery service levels | shipping-and-fulfillment §24 | Option/service config | Service level set |
| B-SHIP-05 | Delivery-time estimates | shipping-and-fulfillment §24 | Storefront display; SEO | Estimate policy |
| B-SHIP-06 | COD availability (shipping) | shipping-and-fulfillment §24 | = B-PAY-03 (alias) | — |
| B-SHIP-07 | Shipping insurance | shipping-and-fulfillment §24 | Rate/label config | Optional |
| B-SHIP-08 | Package size/weight limits | shipping-and-fulfillment §24 | Provider rate calc | Limits per market |
| B-SHIP-09 | Failed-delivery/return-to-origin/reshipment | shipping-and-fulfillment §24 | Shipment exception handling | Policy per provider capability |
| B-SHIP-10 | Shipment cancellation window | shipping-and-fulfillment §24; ORD B-ORD-02.. | Cancellation flows | Window policy |
| B-SHIP-12 | Partial/split shipment experience | shipping-and-fulfillment §24 | = B-INV-05 (alias) | — |
| B-SHIP-13 | Return shipping responsibility (customer vs merchant paid) | shipping-and-fulfillment §24; RET B-RET-07 | Return shipping cost + refund math | Paid-by-whom drives cost handling |
| B-SHIP-14 | Return shipping provider + reverse logistics | shipping-and-fulfillment §24; RET B-RET-07/T-RET-03 | Return shipment implementation | Provider capability UNVERIFIED |
| B-SHIP-15 | International shipping PK↔AE | shipping-and-fulfillment §24 | Cross-market orders | Not supported (recommended) vs supported |
| B-SHIP-16 | Remote-area surcharges | shipping-and-fulfillment §24 | Rate rules | Surcharge policy |
| B-SHIP-17 | Address correction | shipping-and-fulfillment §24 | Address handling | Policy |
| B-SHIP-18 | Provider fallback | shipping-and-fulfillment §24 | Fulfillment resilience | Fail vs fallback |
| B-SHIP-19 | Shipment retry policy | shipping-and-fulfillment §24 | Retry behavior | Values policy |
| B-SHIP-20 | Address mandatory fields | shipping-and-fulfillment §24 | = B-CC-07 (alias) | — |
| B-SHIP-21 | Shipping tax treatment | shipping-and-fulfillment §24 | Tax on shipping | Per-market |
| B-SHIP-22 | Delivery exception handling | shipping-and-fulfillment §24 | Exception flow | Policy |
| B-SHIP-23 | Shipping-fee refund treatment | shipping-and-fulfillment §24; RET B-RET-09; PAY B-PAY-10 | Refund calculation | Full/partial/none per order state |
| B-SHIP-24 | Payment-state gate for fulfillment | shipping-and-fulfillment §24 | Fulfillment start | Require captured vs no gate |
| B-SHIP-25 | Manual fulfillment (admin-created) | shipping-and-fulfillment §24 | Admin ops; audit | Supported (native) vs restricted |
| B-ORD-01 | Guest/order lookup policy incl. single-order retrieval | orders §9/§8; RET G-1 | Order retrieval; guest returns; **security** | Auth-only vs token vs ID (see T-ORD-09) |
| B-ORD-02 | Customer cancellation window | orders §14 | Cancellation | Window policy |
| B-ORD-03 | Cancellation after payment | orders §14 | Cancel + refund interplay | Allowed vs restricted |
| B-ORD-04 | Cancellation after fulfillment | orders §14; SHIP B-SHIP-10 | Cancel + fulfillment | Allowed vs restricted |
| B-ORD-05 | Partial cancellation | orders §14 | Order-edit/cancel-item | Supported vs not |
| B-ORD-06 | Order modification policy | orders §15 | Order-edit workflows | Native versioned changes vs none |
| B-ORD-07 | Address-change policy after order | orders §15/§20 | Order addresses | Immutable vs changeable |
| B-ORD-08 | Order number format | orders §17 | display_id presentation | Format policy |
| B-ORD-09 | Invoice requirements | orders §17 | Documents | Needed vs not |
| B-ORD-10 | Customer-visible statuses | orders §17/§25 | Storefront display | Status mapping policy |
| B-ORD-11 | Admin override policy | orders §17 | Admin ops; audit | Override scope + audit |
| B-ORD-12 | COD order behavior | orders §14 | = B-PAY-03 (alias) | — |
| B-ORD-13 | Failed-payment order retention | orders §17 | Cleanup | Retention policy |
| B-ORD-14 | Expired order retention | orders §17 | Cleanup | Retention policy |
| B-ORD-15/16/17 | Archival/retention/anonymization | orders §17; RET B-RET-18/19 | Data lifecycle | Policy |
| B-ORD-18 | Notification policy (orders) | orders §17 | Notifications | Per AGENTS.md §18 |
| B-ORD-19 | Guest account association after purchase | orders §17; RET G-1 | Guest orders → returns | Association flow |
| B-ORD-20 | Order completion semantics | orders §17 | Completion display | Definition |
| B-ORD-21 | Draft orders usage | orders §17 | Draft-order flows | Used vs not |
| B-ORD-22 | Claims/exchanges | orders §17; RET B-RET-23 | Claim/exchange flows | Offered vs not |
| B-RET-01 | Return window | returns-and-refunds §33 | Eligibility gate | Days policy |
| B-RET-02 | Return approval/rejection requirement | returns-and-refunds §33 | Return lifecycle; store route hardening (T-RET-01) | Approval workflow vs auto-accept |
| B-RET-03 | Non-returnable products | returns-and-refunds §33 | Eligibility | Product rules |
| B-RET-04 | Sale-item returnability | returns-and-refunds §33 | Eligibility | Rule |
| B-RET-05 | Worn/damaged-item policy | returns-and-refunds §33 | Inspection | Rule |
| B-RET-06 | Hygiene-product policy | returns-and-refunds §33 | Eligibility/inspection | Rule |
| B-RET-07 | Return shipping responsibility | returns-and-refunds §33 | = B-SHIP-13 (alias) | — |
| B-RET-08 | Inspection criteria | returns-and-refunds §33 | Acceptance | Criteria |
| B-RET-09 | Shipping-fee refund policy | returns-and-refunds §33 | = B-SHIP-23 (alias) | — |
| B-RET-10 | Tax refund policy | returns-and-refunds §33 | Refund calculation | Rule |
| B-RET-11 | Discount recalculation on refund | returns-and-refunds §33 | Refund calculation | Rule |
| B-RET-12 | Return cancellation window | returns-and-refunds §33 | Lifecycle | Policy |
| B-RET-13 | Refund timing (after receipt/inspection?) | returns-and-refunds §33 | Refund execution | Timing |
| B-RET-14 | Refund method (original vs store credit) | returns-and-refunds §33 | Refund execution | Method |
| B-RET-15 | Refund basis (full vs received qty vs prorated) | returns-and-refunds §33 | Refund calculation | Basis |
| B-RET-16 | Partial-refund policy | returns-and-refunds §33 | Partial flows | Rule |
| B-RET-17 | Restocking fee | returns-and-refunds §33 | Refund calculation | Fee policy |
| B-RET-18/19 | Retention/anonymization | returns-and-refunds §33 | = B-ORD-15/16/17 (alias) | — |
| B-RET-20 | Rejection criteria + communication | returns-and-refunds §33 | Lifecycle | Criteria |
| B-RET-21 | Return shipment mandatory before receipt? | returns-and-refunds §33 | Shipment/receipt | Rule |
| B-RET-22 | Inventory disposition (restock/write-off/damaged) | returns-and-refunds §33 | = B-INV-06 (alias) | — |
| B-RET-23 | Exchange/replacement offering | returns-and-refunds §33 | = B-ORD-22 (alias) | — |
| B-RET-24 | Reconciliation cadence | returns-and-refunds §33 | Reconciliation | Cadence |
| B-RET-25 | Return attempt/quantity limits | returns-and-refunds §33 | Eligibility | Limits |

### Technical decisions

| ID | Decision | Source spec | Blocks | Notes |
| --- | --- | --- | --- | --- |
| T-CC-01 | Customer-cart ownership enforcement | cart-and-checkout §28; **audit A-3** | Customer cart security | Custom store middleware/route override; decision required |
| T-ORD-09 | Single-order retrieval enforcement | orders §33; **audit A-2** | Order lookup security | Custom middleware/route per B-ORD-01 |
| T-RET-01 | Store return route hardening | returns-and-refunds §34; **audit A-1** | Return request security | Auth + ownership before native workflow |
| T-RET-02 | Server-side return shipping cost resolution | returns-and-refunds §34; **audit A-1** | Return cost integrity | Ignore client `price`; use option price |
| T-PAY-01/02 | Provider registration + region binding | payments §25 | Provider integration | Native `payment_provider` + `region_payment_provider` |
| T-PAY-03 | Authorization→capture timing | payments §25 | Capture flows | Immediate vs deferred per provider |
| T-SHIP-01..03 | Provider registration/lifecycle/option config | shipping-and-fulfillment §25 | Fulfillment config | Native registration; per-market fulfillment sets |
| T-SHIP-04/07 | Tracking sync + fulfillment webhook mechanism | shipping-and-fulfillment §25; **E-1** | Tracking | Custom route vs polling (no native fulfillment webhook) |
| T-SHIP-14 | Allocation-step placement | shipping-and-fulfillment §25; INV §17 | Multi-warehouse | Feeds location_ids per B-INV-01 |
| T-RET-10 | Verify exact inventory-restoration step in receive-return | returns-and-refunds §34; INV §16 | Return-to-stock | Against installed source at implementation |
| T-RET-05/07 | Refund workflow mapping + idempotency persistence | returns-and-refunds §34 | Refund execution | Native payment module |
| T-RET-09 | Concurrency ownership (native locks first) | returns-and-refunds §34 | Return/refund races | Native-first |
| T-RET-13 | Reconciliation job design | returns-and-refunds §34 | = T-PAY-05 (alias) | — |

## Part 2 — Must resolve BEFORE the affected module (can defer module-by-module)

| ID | Decision | Source | Affected module | Notes |
| --- | --- | --- | --- | --- |
| T-MP-01 | Region↔payment-provider registration mechanics | markets-and-pricing §25 | Payments config | Verify native mechanism |
| T-MP-02 | Cart region/currency change behavior | markets-and-pricing §25; CC B-CC-05 | Cart repricing | Interacts with T-CC-02 |
| T-MP-03 | Tax-inclusive exact configuration | markets-and-pricing §25 | Tax config | price-preference mechanics |
| T-MP-04 | Shipping option availability per region | markets-and-pricing §25 | Shipping config | Via fulfillment sets |
| T-MP-05 | Promotion minimum-order rule support | markets-and-pricing §25 | Promotions | Verify native rule |
| T-MP-06 | Default region policy per market | markets-and-pricing §25 | Storefront config | Per-market entry points |
| T-INV-01 | Redis LOCKING enablement (multi-instance) | inventory-and-warehouses §31 | Inventory concurrency | Dev in-memory; prod Redis |
| T-INV-02 | Reservation-restore step for partial fulfillment failure | inventory-and-warehouses §31 | Fulfillment failure | Verify at implementation |
| T-INV-03 | stock_location active/inactive mechanism | inventory-and-warehouses §31 | Warehouse ops | Verify native |
| T-INV-04 | InventoryEvents typed-options augmentation | inventory-and-warehouses §31 | Subscribers | 2.19.0 typing note |
| T-INV-05 | Allocation-step placement | inventory-and-warehouses §31 | = T-SHIP-14 (alias) | — |
| T-CC-02 | Price refresh policy (reprice on access) | cart-and-checkout §28 | Cart pricing | refreshCartItemsWorkflow exists |
| T-CC-03 | Rate limiting cart/checkout/coupon | cart-and-checkout §28 | Launch hardening | AGENTS.md §14 |
| T-CC-04 | Native locking (Redis for prod) | cart-and-checkout §28 | Concurrency | = T-INV-01 (alias) |
| T-CC-06 | API route boundaries (native-first) | cart-and-checkout §28 | Routes | Native + T-CC-01 |
| T-CC-07 | Storefront/server-action boundaries | cart-and-checkout §28 | Storefront | Keep server-side |
| T-PAY-04 | Webhook entry point (native pipeline) | payments §25 | Webhooks | Native route + provider `getWebhookActionAndData` |
| T-PAY-05 | Reconciliation mechanism | payments §25 | Reconciliation | Scheduled job (alias T-RET-13, T-ORD-12) |
| T-PAY-06 | Retry counts/timing | payments §25 | Provider calls | Values at implementation |
| T-PAY-07 | Rate limiting payment/webhook | payments §25 | Launch hardening | AGENTS.md §14 |
| T-PAY-08 | Admin extension boundaries | payments §25 | Admin | No custom Admin V1 |
| T-PAY-09 | Redis role in payments | payments §25 | = T-INV-01 (alias) | — |
| T-PAY-10 | Webhook delay/retries options | payments §25 | Webhooks | webhook_delay 5000 / retries 3 |
| T-SHIP-05 | Retry policy values | shipping-and-fulfillment §25 | Provider calls | Bounded backoff |
| T-SHIP-06 | Weight/dimension pricing applicability | shipping-and-fulfillment §25 | Rate calc | Verify |
| T-SHIP-08 | Shipment-label storage (R2 via file) | shipping-and-fulfillment §25 | Labels | Medusa file abstraction |
| T-SHIP-09..13 | Admin extension / customer tracking API / provider fallback / webhook routing / label storage | shipping-and-fulfillment §25 | Various | See spec |
| T-ORD-01..06 | Order workflow mapping / creation boundary / snapshot / events / idempotency / concurrency | orders §33 | Orders | Native workflow mapping |
| T-ORD-07 | Order-number generation | orders §33 | Orders | display_id + policy (B-ORD-08) |
| T-ORD-08 | Guest/customer association | orders §33 | Orders | Transfer workflows |
| T-ORD-10 | Admin authorization | orders §33 | Admin | Native RBAC |
| T-ORD-11 | Audit mechanism | orders §33 | Audit | Native attribution first |
| T-ORD-12 | Reconciliation job | orders §33 | = T-PAY-05 (alias) | — |
| T-ORD-13 | Order search strategy | orders §33 | Admin querying | Native query + export |
| T-ORD-14 | Historical data retention | orders §33 | Data lifecycle | = B-ORD-15/16/17 |
| T-ORD-15 | Observability | orders §33 | Logging | Structured context |
| T-ORD-16 | Background processing | orders §33 | Jobs | Event bus |
| T-ORD-17 | Order edit/versioning usage | orders §33 | Order changes | Native order_change |
| T-RET-03/11/14 | Return-shipping provider integration / label storage / tracking sync | returns-and-refunds §34 | Return shipment | Provider UNVERIFIED |
| T-RET-04 | Customer return/refund view API | returns-and-refunds §34 | Storefront | Ownership-scoped |
| T-RET-06 | Admin auth for layered approve/reject | returns-and-refunds §34 | Admin | Native RBAC sufficiency |
| T-RET-08 | Status normalization for display | returns-and-refunds §34 | Storefront | Derived, no parallel enum |
| T-RET-12 | Audit for return/refund overrides | returns-and-refunds §34 | Audit | = T-ORD-11 (alias) |
| T-RET-15 | Customer-visible refund timeline | returns-and-refunds §34 | Storefront | Provider status UNVERIFIED |

## Part 3 — Can remain open temporarily (non-blocking)

| ID | Decision | Source | Notes |
| --- | --- | --- | --- |
| B-CC-02 | Cart restoration on return | cart-and-checkout §27 | Storefront UX |
| B-CC-03 | Cart merge on login | cart-and-checkout §27 | Login UX |
| B-CC-08 | Guest cart conversion before checkout | cart-and-checkout §27 | Checkout UX |
| B-CC-10 | Rounding policy | cart-and-checkout §27 | = B-MP-06 (alias) |
| B-CC-15 | Checkout retry behavior | cart-and-checkout §27 | UX |
| B-PAY-04 | Supported payment methods | payments §24 | After provider selection |
| B-PAY-05 | Payment retry policy | payments §24 | Failure model |
| B-PAY-06 | Payment/session expiry | payments §24 | No native TTL |
| B-PAY-07 | Partial capture | payments §24 | Provider + business |
| B-PAY-08 | Partial refund policy | payments §24 | = B-RET-16 (alias) |
| B-PAY-11 | Provider fallback | payments §24 | Fail initially (recommended) |
| B-PAY-12 | Method availability by market | payments §24 | Config |
| B-PAY-13 | Min/max transaction amounts | payments §24 | Business rule |
| B-PAY-14 | Payment restrictions by product/category | payments §24 | Business rule |
| B-PAY-15 | Fraud/risk rules | payments §24 | Provider + business |
| B-PAY-16 | Reconciliation frequency | payments §24 | Ops rule |
| B-PAY-17 | Manual payment overrides | payments §24 | Native mark-as-paid + audit |
| B-PAY-18 | Settlement reporting | payments §24 | Ops/finance |
| B-SHIP-11 | Delivery exception → notifications | shipping-and-fulfillment §24 | Notifications |
| B-SHIP-17 | Address correction | shipping-and-fulfillment §24 | Provider capability |
| B-ORD-09 | Invoice requirements | orders §17 | Documents |
| B-ORD-13/14 | Failed-payment/expired retention | orders §17 | Cleanup cadence |
| T-CC-05 | Redis involvement in cart | cart-and-checkout §28 | = T-INV-01 (alias) |

## Part 4 — Already resolved elsewhere (no action)

| Item | Resolved by | Note |
| --- | --- | --- |
| Currency fallback/conversion | MP register — REJECTED | No conversion anywhere |
| Cross-currency refunds | B-PAY-09 / MP register — default refuse | Confirmed as default |
| Better Auth | AGENTS.md §26 — REJECTED | Medusa-native auth only |
| Provider boundaries | AGENTS.md §4 | payments/ shipping/ boundaries |
| R2 media | capability matrix | file-s3 provider |
| No Elasticsearch | AGENTS.md §11 | search-local |
| Redis non-authoritative | AGENTS.md §3 | Confirmed all specs |
| T-CC-04/T-PAY-09/T-INV-01 locking | native LOCKING module | Use native; Redis for prod |
| T-PAY-04 webhook entry | native `/hooks/payment/:provider` | Verified |
| Admin RBAC | @medusajs/rbac installed | Verified policies on admin routes |
| Return/refund execution mechanics | native workflows | ReturnStatus, refundPaymentWorkflow |
| No custom engines | AGENTS.md §4 + all specs | No drift |

## Decision-owner summary (blocking counts)

- **Before ANY commerce implementation (Part 1):** 100 business + 15
  technical decisions (all unique within the part). **All 40 user decisions
  resolved 2026-08-16; Part 1 business decisions are APPROVED/DERIVED per
  the resolution record above.**
- **Module-gated (Part 2):** 53 technical decisions (most resolved by
  native capability at implementation time).
- **Non-blocking (Part 3):** 22 business + 1 technical decision.
- **Already resolved (Part 4):** 13 items (no new decisions; 4 technical
  IDs referenced there are cross-listed from Part 2).

Cross-listed IDs (counted once in the 119/69 unique totals): B-ORD-09,
B-ORD-13, B-SHIP-17 (Parts 1 + 3); T-CC-04, T-INV-01, T-PAY-04, T-PAY-09
(Parts 2 + 4).

**Resolution status (2026-08-16): BUSINESS DECISIONS COMPLETE.** The
highest-priority cluster is resolved: security (B-ORD-01, B-RET-02), providers
(BD-P-01 AssanPay — replacement of earlier xPay selection —, BD-P-02
Stripe), money policy (tax policy BD-M-02, market
selection BD-M-01, COD BD-P-03 no, stacking BD-M-04), returns/refunds
(B-RET-01..17), cancellation (BD-O-02..05), shipping model (BD-S-01), and
backorders (BD-I-02 no). Remaining implementation gates (not decisions): PK
GST numeric rate, AE VAT numeric rate, provider contract verification
(AssanPay, Stripe; TCS/Aramex at shipping stage).

**Resolution order executed (2026-08-16, per
`business-decision-dependency-graph.md` §8):** BD-M-01 → BD-P-01/02 →
BD-P-03 → BD-M-02 → BD-G-01/BD-O-01 → BD-R-05 → BD-R-01/02/03 → BD-S-01 →
BD-I-01 → BD-I-02 → BD-M-04 → BD-M-08 → BD-O-02 → Part B (23 ticks). The
questionnaire is `docs/architecture/business-decision-questionnaire.md`.

## Customer Authentication Decisions (BD-AUTH-01..04, 2026-08-17)

Resolved during the customer-authentication phase (AGENTS.md §26 authority:
Medusa-native auth). All APPROVED and IMPLEMENTED. Details and verification
record: `docs/architecture/authentication-authorization.md`.

| ID | Decision | Resolution | Note |
| --- | --- | --- | --- |
| BD-AUTH-01 | Email verification required for emailpass customers | **APPROVED** — native `projectConfig.http.authVerificationsPerActor = { customer: [{ entity_type: "email", auth_provider: "emailpass" }] }` | Verified against installed 2.19.0: register returns actorless token; unverified login returns `verification_required: true`; code delivered via `auth.verification_requested` event (never in HTTP response); confirm via `/auth/verification/confirm`. Integration-tested (customer-auth suite) |
| BD-AUTH-02 | Session lifetime | **APPROVED** — `http.jwtExpiresIn = "1d"` + storefront `_medusa_jwt` cookie 1d | Bearer-token cookie kept (starter pattern); Medusa cookie-session not used |
| BD-AUTH-03 | Google OAuth scope | **APPROVED** — env-gated registration now (`AUTH_GOOGLE_ENABLED=true` AND all `GOOGLE_*` vars present); gate OFF by default; storefront button gated on provider list; full E2E blocked on real Google Cloud credentials | `@medusajs/auth-google@2.19.0` options verified: `clientId`, `clientSecret`, `callbackUrl`. New Google identities → actorless token → storefront creates customer from token `user_metadata.email` → `auth.refresh()` |
| BD-AUTH-04 | Forgot/reset password | **APPROVED** — native flow: `/auth/customer/emailpass/reset-password` (201 for unknown identifiers too — no leak; token via `auth.password_reset` event) + `/auth/customer/emailpass/update` (bearer reset token) | `/forgot-password` and `/reset-password` storefront pages implemented; notification delivery (email) is a future notification-boundary phase |
