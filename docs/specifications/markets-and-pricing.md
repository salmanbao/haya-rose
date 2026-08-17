# Markets & Pricing Specification

## 1. Status

- **Draft for approval** — specification-only task (2026-08-15). No code,
  configuration, migrations, or dependencies were changed.
- Claims labeled **VERIFIED** (installed Medusa 2.19.0 source/types/database),
  **PROPOSED** (design direction to confirm at implementation), or
  **UNRESOLVED** (business/technical decision required).
- Traceability: significant requirements carry IDs `REQ-MP-###`.

## 2. Scope

This specification defines how the single-merchant B2C baby-clothing platform
represents, prices, sells, discounts, taxes, and preserves monetary values for
customers in **Pakistan (PKR)** and **UAE (AED)**.

In scope: market model, currency model, price model, price resolution,
price integrity, tax architecture, promotions capability mapping, market
selection, payment/shipping boundaries, order monetary snapshot, refund
currency rules, SEO implications, security requirements, invariants, and test
requirements.

Out of scope (later specifications): inventory, cart/checkout behavior
(beyond market/currency interaction), payment provider implementation,
shipping provider implementation, orders lifecycle, returns/refunds policy,
catalog/taxonomy, promotions business policy.

## 3. Business Context

- B2C / D2C, single merchant, no marketplace/vendors.
- Markets: Pakistan, UAE. Currencies: PKR, AED.
- Commerce engine: Medusa 2.19.0. Backend on VPS; storefront Next.js on Vercel.
- PostgreSQL authoritative; Redis supporting only.
- Payments: PK/UAE gateways **not selected** — integration boundaries only.
- Shipping: TCS (PK), Aramex (UAE) — **not integrated**.
- Customer auth: Medusa-native (email/password; Google OAuth pending).
- Admin: standard Medusa Admin.
- Product domain: baby clothing; size/color variants.
- Excluded from V1: gift cards, loyalty, referral.

## 4. Authoritative Requirements

Authoritative facts (must not be contradicted):

- **REQ-MP-001** — Pakistan customers transact in PKR; UAE customers in AED.
  Source: project requirements. Authority: approved project requirement.
  Medusa capability: native region/currency/pricing. Boundary: configuration.
  Test: cart/order currency invariant per market.
- **REQ-MP-002** — No silent currency conversion; missing prices fail or are
  unavailable rather than convert. Source: AGENTS.md §10/§13. Authority:
  AGENTS.md. Boundary: Medusa configuration + storefront behavior.
- **REQ-MP-003** — Backend (Medusa) is authoritative for price, discount,
  tax, shipping, total. Client-supplied amounts are never authoritative.
  Source: AGENTS.md §13. Authority: AGENTS.md.
- **REQ-MP-004** — Payment/refund amounts are in the order currency; refunds
  never exceed the refundable amount. Source: AGENTS.md §12. Authority:
  AGENTS.md.
- **REQ-MP-005** — Order monetary values are snapshotted at placement and
  never recalculated from current catalog prices. Source: AGENTS.md §15/
  §12 (order invariants). Authority: AGENTS.md.
- **REQ-MP-006** — Provider-specific payment/shipping logic stays behind
  integration boundaries; no provider selected yet, no fake adapters.
  Source: AGENTS.md §3/§4. Authority: AGENTS.md.

## 5. Market Model

**VERIFIED (Medusa):** a market maps to a Medusa **region**
(`region` table: `name`, `currency_code`, `countries` via `region_country`,
`metadata`). A region carries exactly one currency; countries are associated
per region. Sales channels scope catalog availability
(`product_sales_channel`, `publishable_api_key_sales_channel`).

### Pakistan

| Attribute | Value | Status |
| --- | --- | --- |
| Market identifier | Region "Pakistan" (id `reg_…`) | PROPOSED |
| Country | PK | PROPOSED |
| Currency | PKR | VERIFIED native currency (present in currency table) |
| Locale | Not finalized (language set UNRESOLVED) | UNRESOLVED |
| Sales channel | One sales channel for the storefront (single-merchant) | PROPOSED |
| Payment-provider boundary | Region ↔ payment provider link (`region_payment_provider` — VERIFIED table); provider NOT selected | boundary only |
| Shipping-provider boundary | TCS via fulfillment provider boundary; NOT integrated | boundary only |
| Tax boundary | `tax_region` for PK (country_code PK) — VERIFIED native; policy APPROVED (BD-M-02), numeric rates outstanding | policy APPROVED |
| Product availability | Sales-channel scoping (native) | PROPOSED |
| Pricing behavior | Prices defined in PKR (price rules per region/currency) | VERIFIED native |

### UAE

Same structure: region "UAE", country AE, currency AED, `region_payment_provider`
boundary (provider selected: Stripe — contract verification pending), Aramex
shipping boundary (NOT integrated), tax region for AE (policy APPROVED;
numeric VAT rate outstanding).

**REQ-MP-007** — Markets are represented as Medusa regions with a single
currency and associated countries. Boundary: configuration.

## 6. Currency Model

**VERIFIED (Medusa 2.19.0):**
- Currency table contains ISO codes incl. PKR and AED (verified live:
  `/store/currencies` returns AED).
- Cart carries `currency_code` + `region_id` (verified: cart model).
- Order carries `currency_code` + `region_id` (verified: order model).
- Payment collections/sessions and refunds operate in the order currency
  (native payment module).

**REQ-MP-008** — A cart has exactly one authoritative currency (from its
region). **REQ-MP-009** — An order has exactly one authoritative currency
(snapshotted at placement). **REQ-MP-010** — Payment amount equals the
authoritative payable amount in the order currency. **REQ-MP-011** — No
silent currency conversion anywhere (frontend or backend). **REQ-MP-012** —
Currency mismatches (e.g., price list in another currency, payment in wrong
currency) fail safely — rejected/not offered, never converted.
**REQ-MP-013** — No floating-point arithmetic for monetary persistence or
calculation (Medusa stores prices as-is, e.g. `49.99`; `Intl.NumberFormat`
used only for display — verified storefront `money.ts`).

## 7. Medusa Domain Mapping

| Business Concept | Medusa Concept | Module | Verified | Customization |
| --- | --- | --- | --- | --- |
| Pakistan market | Region (PKR) + country PK | region | `region`, `region_country` tables | none (config) |
| UAE market | Region (AED) + country AE | region | same | none (config) |
| PKR / AED | Currency | currency | `/store/currencies` live; PKR+AED present | none |
| Product price | Price (amount + currency_code + rules) | pricing | `price` model fields verified | none |
| Variant price | Price set linked to variant | pricing + product | `product_variant_price_set` table | none |
| Market-specific price | Price with region rule | pricing | `price-rule` model; region rule | none (config) |
| Promotional price | Price list (sale/override) | pricing | `price-list` (type/status), `price-list-rule` | none (config) |
| Customer group pricing | Price list rule (customer_group) | pricing | `price-list-rule`; `customer_group` table | none (config) |
| Cart currency | `cart.currency_code` (+region_id) | cart | cart model | none |
| Order currency | `order.currency_code` (+region_id) | order | order model | none |
| Payment currency | Payment collection/sessions in order currency | payment | payment tables | none |
| Refund currency | Refund in order currency | payment | `refund` table | none |
| Tax region | `tax_region` (country/province), `tax_rate`, `tax-rate-rule`, `tax-provider` | tax | models verified | none (config) |
| Shipping option | Shipping option (fulfillment) + price set | fulfillment | `shipping_option`, `shipping_option_price_set` | none (config) |
| Sales channel | Sales channel + product links | sales-channel | `sales_channel`, `product_sales_channel` | none (config) |
| Payment provider per market | Region ↔ provider link | payment | `region_payment_provider` table | boundary only |

**REQ-MP-014** — The mapping above is the contract; no custom persistence is
introduced for any mapped concept (AGENTS.md §8 "no custom persistence
without justification").

## 8. Price Model

**VERIFIED (Medusa 2.19.0):**
- A **price set** holds prices for a variant (link table
  `product_variant_price_set`).
- A **price** has `amount`, `currency_code`, and `rules` (region, currency,
  customer group, etc.).
- **Price lists** group prices by type (`sale`, `override`), status, and rules
  (e.g., customer groups); the pricing API computes `calculated_price`
  (verified: storefront consumes `calculated_price` with
  `calculated_amount`, `original_amount`, `price_list_type`).

**Recommended representation (PROPOSED, matches Medusa architecture):**

```text
Variant (product_variant_price_set)
  └── Price set
        ├── Price PKR  (amount, currency_code=pkr, rule region=Pakistan)
        └── Price AED  (amount, currency_code=aed, rule region=UAE)
```

This is Medusa's native market/price-set architecture — no custom pricing
persistence. Sale/promotional prices via price lists (type `sale`) and
promotion discounts at cart level.

**REQ-MP-015** — Variant prices are defined per currency and region through
price sets/prices (native). **REQ-MP-016** — Sale prices use native price
lists; sale-pricing *policy* (which items, when) is a business decision.
**REQ-MP-017** — Quantity/customer-group pricing uses native price-list rules
if/when authorized (not required for V1 baseline — business decision).

## 9. Price Resolution

**VERIFIED (native mechanism):**
```text
Customer session (region from market selection)
  → Region → currency
  → Product → Variant → price set
  → price list/override selection (rules: region, currency, customer group)
  → calculated_price (pricing API)
  → Cart totals (cart module: line items at calculated prices)
  → Promotions (promotion module; application method value/currency)
  → Tax (tax module, region-based)
  → Shipping (shipping options, currency-aware via price sets)
  → Authoritative total (cart workflow, server-side)
```
**PROPOSED:** the storefront renders only backend-computed
`calculated_price`/cart totals (current starter behavior — verified).

**REQ-MP-018** — Final payable amount is computed server-side by Medusa
workflows; the frontend never computes or submits totals.

## 10. Price Integrity

Protections (authoritative layer = Medusa backend):

| Threat | Protection | Layer | Status |
| --- | --- | --- | --- |
| Client-supplied price | Prices resolved from backend only; SDK sends variant IDs, never amounts | Medusa pricing/cart | VERIFIED native |
| Client-supplied discount | Promotions validated server-side (code, rules, dates, budgets) | Medusa promotion | VERIFIED native |
| Stale price | Cart re-prices from current catalog at each cart mutation | Medusa cart | VERIFIED native; confirm behavior |
| Changed price after cart creation | Order snapshots amounts at placement (REQ-MP-005) | Medusa order | VERIFIED native |
| Unavailable variant | Cart validation on add/update | Medusa cart | VERIFIED native |
| Wrong currency/market | Cart currency from region; price selection by region/currency rules | Medusa | VERIFIED native |
| Expired promotion | Promotion dates/budgets validated server-side | Medusa promotion | VERIFIED native |
| Manipulated totals | Client never submits totals | Medusa cart workflows | VERIFIED native |
| Rounding differences | Medusa numeric handling; display-only formatting | Medusa + storefront display | verify at implementation |
| Duplicate checkout | Cart completion is a workflow; duplicate submissions must fail idempotently | Medusa cart workflow | verify at implementation |

**REQ-MP-019** — All price/discount/tax/shipping/total calculations are
authoritative server-side; client-submitted monetary values are rejected or
ignored.

## 11. Tax

**VERIFIED (Medusa):** native tax module — `tax_region` (country/province),
`tax_rate`, `tax_rate_rule`, `tax_provider`; tax regions can be created per
market (PK, AE). The pricing module has `price-preference` for
tax-inclusive/exclusive handling (model verified; exact config to confirm).

**Architecture required:**
- Market-specific tax configuration via tax regions (native).
- Taxable products flagged natively (`taxable` on product/cart items).
- Tax-inclusive/exclusive display: native mechanism exists; **policy
  APPROVED — exclusive (BD-M-03)**.
- Tax preserved on the order (native order tax totals).
- Tax during refunds: native refund models preserve order tax context; exact
  behavior verified at implementation.

**REQ-MP-020** — Tax is configured per market (tax region) and computed
server-side. Tax policy: **APPROVED — standard per-market rates (BD-M-02)**;
**numeric rates APPROVED (2026-08-16): PK GST 17%, AE VAT 5%** — configured
via `seed-markets.ts` (native tax regions + default tax rates, codes GST/VAT)
and asserted in `markets.spec.ts`. Tax-inclusive/exclusive display:
**APPROVED — exclusive (BD-M-03)**. Tax registration requirements:
**UNRESOLVED** (legal/registration verification at implementation).

## 12. Promotions & Discounts

**VERIFIED (Medusa):** promotion module — `promotion` (+ code), campaign with
budget/usage (`promotion_campaign`, `promotion_campaign_budget`,
`promotion_campaign_budget_usage`), rules (`promotion_rule`,
`promotion_rule_value`, `promotion_application_method` with `type`,
`value`, `currency_code`, `target_type`, `allocation`).

| Capability | Classification |
| --- | --- |
| Coupon codes | SUPPORTED BY MEDUSA (promotion code) |
| Percentage discounts | SUPPORTED BY MEDUSA (application method type percentage) |
| Fixed amount discounts | SUPPORTED BY MEDUSA (per currency — `currency_code` verified) |
| Product/category restrictions | SUPPORTED BY MEDUSA (target rules: items, categories, products) |
| Market/region restrictions | SUPPORTED BY MEDUSA (application rules incl. region) |
| Currency restrictions | SUPPORTED BY MEDUSA (fixed values carry currency) |
| Customer restrictions | SUPPORTED BY MEDUSA (customer group rules) |
| Minimum order value | REQUIRES BUSINESS DECISION (verify rule support at implementation) |
| Usage limits | SUPPORTED BY MEDUSA (campaign budget) |
| Expiration | SUPPORTED BY MEDUSA (campaign starts/ends) |
| Stacking | REQUIRES BUSINESS DECISION (AGENTS.md: do not invent) |
| Promotion priority | REQUIRES BUSINESS DECISION |
| Automatic promotions | SUPPORTED BY MEDUSA (is_automatic) — business policy pending |

**REQ-MP-021** — Discounts cannot produce invalid negative totals and cannot
exceed the legally discountable amount (AGENTS.md §12). Stacking/priority:
**APPROVED — single active promotion (BD-M-04)**; minimum-order policy:
**DEFERRED (BD-M-05)**.

## 13. Market Selection

**VERIFIED (current starter):** market = region resolved from the URL
country code; middleware fetches regions and redirects unknown codes to the
default region; `NEXT_PUBLIC_DEFAULT_REGION` (seed default `dk`) is the
fallback. The starter has a region/country selector (`language-select`
component).

**Authoritative source decision (RESOLVED 2026-08-16 — BD-M-01):**
- **APPROVED** — hybrid: URL country code is the canonical/SEO structure;
  browser geolocation *suggests* the market on first visit (never
  authoritative); an explicit market selector is the manual override; the
  confirmed customer market choice is the authoritative commerce input.
  Alternatives considered: URL
  country code (current), explicit country selector, shipping address,
  customer profile, browser locale, IP geolocation, or currency selector.
- Options and implications:
  - URL country code (current): simple, indexable, per-market SEO; requires
    PK/AE regions and default-region policy per market (two storefront
    entry points: `/pk/...`, `/ae/...`).
  - Explicit selector + persisted preference: better UX for cross-border
    shoppers; needs cookie/account persistence; conflicts with SEO
    canonicalization if URLs stay country-less.
  - Shipping address / profile: most accurate per-order, but requires login
    or address entry — poor for anonymous browsing and SEO.
  - Browser locale / IP geolocation: non-deterministic, proxy-unreliable;
    not recommended as authoritative (may supplement only).
- **Recommended (technical, not business):** URL country code remains the
  authoritative market determinant for the storefront (SEO-first per
  AGENTS.md §18), with an explicit selector as an override (BD-M-01
  APPROVED); the language set remains UNRESOLVED (deferred).

**REQ-MP-022** — Market is determined server-side (URL country code per
recommendation, pending business decision); never from client-supplied market
ID. **REQ-MP-023** — Changing market: cart currency/region updates to the new
market's region; products unavailable in the new market are removed or
blocked (Medusa cart region update — verify behavior at implementation);
prices/shipping/promotions/tax re-resolve for the new region; the storefront
must clearly surface changed availability/prices.

## 14. Checkout Interaction

- **VERIFIED (native):** cart carries `region_id` + `currency_code`; checkout
  completes via cart workflow (payment collection, shipping method, order
  creation). Storefront starter flow verified (cart.ts, payment.ts).
- **REQ-MP-024** — Checkout uses the backend-authoritative total (REQ-MP-019);
  wrong currency/market rejected at cart/checkout.
- **REQ-MP-025** — Guest checkout is supported (starter baseline); market
  follows the same region/currency rules.
- Payment-provider availability per market uses `region_payment_provider`
  (VERIFIED table) — exact provider registration mechanism verified at
  implementation.

## 15. Payment Boundary

Contract (no provider implementation):

- The integration receives: market/region, currency, order amount
  (authoritative), order id, customer, shipping address, billing address,
  items, tax, shipping amount.
- Provider-specific code lives behind a payment-provider boundary
  (`payments/` integration boundary per AGENTS.md §4) registered through
  Medusa's payment module.
- **REQ-MP-026** — Payment amount must equal the authoritative payable amount
  in the order currency (REQ-MP-010); provider returns validated in the same
  currency.
- **REQ-MP-027** — Payment status never trusted from the client; server-side
  verification/webhooks per AGENTS.md §11.
- Providers for PK and UAE: **APPROVED selections — Safepay (PK), Stripe (AE)**
  (Safepay replaces the earlier AssanPay selection, which replaced xPay; contract verified per
  `docs/architecture/provider-verification/`; no fake adapters).

## 16. Shipping Boundary

Contract (no provider implementation):

- TCS (PK) / Aramex (UAE) behind the fulfillment-provider boundary.
- Shipping options are currency-aware via price sets
  (`shipping_option_price_set` — VERIFIED); rates validated server-side.
- **REQ-MP-028** — Shipping amounts are computed and applied server-side;
  never client-supplied.
- Provider selection/credentials: **APPROVED selections — Safepay (PK), Stripe (AE)**
  (contract verification per `docs/architecture/provider-verification/`;
  credentials UNVERIFIED/not set; no fake adapters).

## 17. Order Monetary Snapshot

**VERIFIED (Medusa):** order stores `currency_code` (+ region/sales channel)
and line items with unit prices captured at placement; payment/refund state
is separate and tracked (payment collection, captures, refunds). The order is
not recalculated from current catalog prices.

**REQ-MP-029** — After placement, the order preserves authoritative values
for: currency, subtotal, discounts, tax, shipping, total, paid amount,
refunded amount, remaining refundable amount. **REQ-MP-030** — Catalog price
changes after placement never mutate the order's stored monetary values.

## 18. Refund Currency Rules

**VERIFIED (native):** refunds are recorded against the order/payment in the
order's currency (`refund` table; refund ≤ captured amount enforced by
payment workflows — AGENTS.md §12 invariant; verify exact enforcement at
implementation).

- **REQ-MP-031** — Refunds are in the order currency.
- **REQ-MP-032** — Refund ≤ refundable amount; duplicate refunds produce at
  most one financial effect (idempotency).
- Full/partial/multiple refunds: native; business policy (partial-refund
  eligibility) is part of the returns/refunds specification — **APPROVED:
  partial refunds prorated by received quantity (BD-P-08, DERIVED from
  BD-R-05)**.
- Cross-currency refund behavior (refunding in a different currency than the
  order): **APPROVED — refuse cross-currency refunds (BD-M-08)**; refunds
  always in the order's original currency (no silent conversion).

## 19. SEO Implications

- **VERIFIED (starter):** market prefix in URLs (`/[countryCode]/…`),
  region-redirect middleware, `next-sitemap.js` (sitemap + robots, excludes
  checkout/account), `metadata` exports.
- **APPROVED (BD-M-01):** PK/AE market prefixes (`/pk/…`, `/ae/…`) with
  canonical URLs per market; per-market metadata and sitemap entries;
  geolocation suggestion on first visit; explicit selector override; hreflang
  only when the language set is finalized (currently UNRESOLVED, deferred);
  duplicate-content prevention via canonical URLs + deliberate
  filter-parameter indexing (AGENTS.md §18).
- **REQ-MP-033** — Market-selected URLs are canonicalized; no uncontrolled
  indexable URL generation from arbitrary query params.

## 20. Security Requirements

- **REQ-MP-034** — Client-provided price/discount/total/market/currency values
  are never authoritative (AGENTS.md §14).
- **REQ-MP-035** — Market selection cannot be manipulated to bypass pricing
  rules: prices resolve from region/currency rules server-side; a client
  cannot switch market to obtain another market's price on the same cart
  without the cart's region/currency being validated server-side.
- **REQ-MP-036** — No silent conversion; no exposure of provider credentials;
  secrets via env/secret manager only.
- Rate limiting applies to abuse-prone endpoints incl. coupon validation
  (AGENTS.md §14) — verified at implementation.

## 21. Commerce Invariants

(From AGENTS.md §12/§13 — to be encoded as tests at implementation)

- Refund ≤ captured amount; refund ≤ refundable amount; duplicate refund →
  one financial effect.
- Discounts cannot produce invalid negative totals; discount ≤ legally
  discountable amount.
- Total ≥ 0. Currency immutable per order.
- Cart/order have exactly one authoritative currency.
- Client price never becomes authoritative.
- Available inventory never negative (inventory spec) — out of scope here.

## 22. Test Requirements

(Specification only — implement with the feature)

**Market:** PK region resolves correctly; AE region resolves correctly;
unsupported market fails safely; market cannot be manipulated to bypass
pricing rules.

**Currency:** PK cart uses PKR; AE cart uses AED; currency mismatch rejected;
no silent conversion.

**Pricing:** correct market price selected; variant price selected correctly;
client cannot override price; price changes do not corrupt existing orders;
promotion cannot create invalid totals.

**Tax:** correct tax configuration selected; tax preserved on the order;
invalid tax configuration fails safely.

**Discounts:** invalid coupon rejected; expired coupon rejected; ineligible
coupon rejected; currency-restricted promotion enforced; market-restricted
promotion enforced.

**Checkout:** authoritative backend total; wrong currency rejected; wrong
market rejected; price race handled safely.

**Refunds:** refund ≤ captured/refundable; duplicate refund → one effect;
currency mismatch fails safely.

**Property/invariant tests:** `refund ≤ refundable`, `discount ≤
discountable`, `total ≥ 0`, `currency immutable for order`, `client price
never authoritative`.

## 23. Medusa Native vs Custom Responsibility

| Requirement | Classification |
| --- | --- |
| Markets (regions/countries/currency) | Medusa configuration |
| Prices (per currency/region, price lists) | Medusa configuration |
| Price resolution / calculated_price | Medusa native |
| Cart/order currency | Medusa native |
| Tax regions/rates | Medusa configuration (rates = business decision) |
| Promotions/discounts | Medusa configuration + business policy |
| Payment/shipping provider boundaries | External integration (not selected) |
| Market selection (storefront) | Storefront-only (+ business decision) |
| Currency invariants enforcement | Medusa native + tests |
| Refund currency | Medusa native + business policy |
| SEO per market | Storefront-only |
| Anything else | Custom module only if a verified native capability is insufficient (none identified) |

## 24. Business Decision Register (was "Unresolved" — RESOLVED 2026-08-16)

**Resolution status: all decisions resolved via the Business Decision Phase.
See `docs/architecture/consolidated-decision-register.md` (resolution
record) and `business-decision-questionnaire.md` for the authoritative
answers; IDs below are the provisional B-MP-* identifiers (CON-2).**

- Exchange rates / conversion: **not authorized** — no conversion (REJECTED).
- Tax rates PK, AE: **policy APPROVED (BD-M-02)** — standard per-market tax
  regions; **numeric rates APPROVED (2026-08-16): PK GST 17%, AE VAT 5%**
  (seeded + asserted in `markets.spec.ts`; REQ-MP-020).
- Tax-inclusive/exclusive display: **APPROVED — exclusive (BD-M-03)**.
- Discount stacking, promotion priority: **APPROVED — single active
  promotion (BD-M-04)**. Minimum order value: **DEFERRED (BD-M-05)**.
- Price rounding policy: **APPROVED — standard half-up, 2 decimals
  (BD-M-06)**.
- Sale pricing rules: **APPROVED — Admin seasonal sale lists, no
  auto-scheduling (BD-M-07)**.
- COD policy: **APPROVED — no COD in V1 (BD-P-03 / B-MP-12)**.
- Customer-specific pricing; wholesale pricing: **excluded from V1 — B2C
  only (BD-M-10)**.
- Market-selection authority: **APPROVED — hybrid URL country code +
  geolocation suggestion + manual selector (BD-M-01)**; confirmed customer
  market choice authoritative; geolocation never authoritative.
- Cross-currency refund policy: **APPROVED — refuse (BD-M-08)**.
- Default region per market: **DERIVED — market selector when location
  undetermined (BD-M-09)**.

## 25. Unresolved Technical Decisions

- Exact Medusa region↔payment-provider registration mechanics (verified table
  exists; mechanism confirmed at implementation).
- Cart region/currency change behavior on market switch (re-pricing, item
  removal) — verify native cart workflow at implementation.
- Tax-inclusive pricing exact configuration (price-preference mechanics).
- Shipping option availability mechanics per region in v2.19 (via sales
  channel/fulfillment sets — verify).
- Promotion "minimum order value" rule support (verify native rule types).
- Default region policy per market (`NEXT_PUBLIC_DEFAULT_REGION` currently a
  single value; per-market entry points `/pk`, `/ae` — storefront
  configuration decision).

## 26. Implementation Notes

(For the future implementation task — no code now)

1. Create regions Pakistan (PKR) + UAE (AED) with countries PK/AE and tax
   regions (rates pending decisions). **DONE (2026-08-16)** — seed-markets.
2. Create/assign sales channel + publishable key links. **DONE**.
3. Define variant prices per currency/region via price sets (seed script or
   Admin). **DONE** (DEMO values 2500 pkr / 45 aed; real pricing is catalog).
4. Storefront: market entry points `/pk` `/ae`, default-region handling,
   currency-aware display (display-only, backend values). **PARTIAL** —
   market routing + selector at `/` DONE (2026-08-16, BD-M-01/09);
   currency-aware display is the starter baseline.
5. Tests per §22 before/with implementation (TDD per AGENTS.md §16).
6. Follow §27 verification hierarchy for every Medusa API used.

## 27. Verification Sources

- Installed Medusa 2.19.0 source/models: `region` (name, currency_code,
  countries), `pricing` (`price`, `price-set`, `price-list`,
  `price-list-rule`, `price-rule`, `price-preference`), `cart`/`order`
  (currency_code, region_id, sales_channel_id), `promotion`
  (`application-method` type/value/currency_code/target_type/allocation),
  `tax` (`tax-region`, `tax-rate`, `tax-rate-rule`, `tax-provider`).
- Database (143 Medusa tables): `product_variant_price_set`,
  `region_payment_provider`, `region_country`, `shipping_option_price_set`,
  `price_set`, `promotion_*`, `customer_group`, `sales_channel_*`,
  `tax_region`, `refund`, `capture`.
- Live API: `/store/currencies` (AED present), `/store/regions`,
  `/store/products` (calculated_price shape consumed by storefront).
- Storefront: `money.ts` (Intl display), `get-product-price.ts`
  (calculated_price), `middleware.ts` (region map), `cookies.ts` (auth).
- Context7 MCP: available for verification at implementation; installed
  source remains authoritative.

---

## Traceability Summary

| ID | Requirement | Source / Authority | Medusa capability | Boundary | Test expectation |
| --- | --- | --- | --- | --- | --- |
| REQ-MP-001 | PK→PKR, AE→AED | Project req. | Region/currency native | Config | Currency invariant per market |
| REQ-MP-002 | No silent conversion | AGENTS.md §10/§13 | Native price selection | Config + storefront | No-conversion tests |
| REQ-MP-003 | Backend authoritative pricing | AGENTS.md §13 | Native workflows | Native | Backend-total tests |
| REQ-MP-004 | Payment/refund in order currency; refund ≤ refundable | AGENTS.md §12 | Native payment | Native + policy | Refund invariants |
| REQ-MP-005 | Order snapshot immutability | AGENTS.md §15 | Native order | Native | Order-not-repriced test |
| REQ-MP-006 | Provider boundaries only | AGENTS.md §3/§4 | Integration boundary | Boundary | N/A |
| REQ-MP-007 | Markets = regions | Project req. | Region module | Config | Market resolution tests |
| REQ-MP-008..013 | Currency invariants | AGENTS.md §12/§13 | Native | Native + tests | See §22 |
| REQ-MP-014 | No custom pricing persistence | AGENTS.md §8 | Native pricing | None | Schema unchanged |
| REQ-MP-015..017 | Price model / sale / group pricing | Project req. | Native price lists/rules | Config | Price selection tests |
| REQ-MP-018 | Server-side final total | AGENTS.md §13 | Cart workflows | Native | Checkout tests |
| REQ-MP-019 | Client amounts never authoritative | AGENTS.md §14 | Native | Native | Manipulation tests |
| REQ-MP-020 | Per-market tax, rates unresolved | AGENTS.md §11 | Tax module | Config | Tax tests |
| REQ-MP-021 | Discount safety invariants | AGENTS.md §12 | Promotion module | Native | Coupon tests |
| REQ-MP-022..023 | Market selection + change | Project req. + AGENTS.md §18 | Region/cart | Storefront + config | Market/currency tests |
| REQ-MP-024..025 | Checkout market/currency integrity | AGENTS.md §13 | Cart workflow | Native | Checkout tests |
| REQ-MP-026..027 | Payment amount/status integrity | AGENTS.md §11/§12 | Payment module | Boundary | Payment tests |
| REQ-MP-028 | Server-side shipping amounts | AGENTS.md §13 | Fulfillment | Native | Shipping tests |
| REQ-MP-029..030 | Order monetary snapshot | AGENTS.md §12/§15 | Order module | Native | Snapshot tests |
| REQ-MP-031..032 | Refund currency/idempotency | AGENTS.md §12 | Payment refunds | Native | Refund tests |
| REQ-MP-033 | SEO canonicalization | AGENTS.md §18 | Storefront | Storefront | SEO review |
| REQ-MP-034..036 | Security of monetary values | AGENTS.md §14 | Native | Native + storefront | Security tests |

## Business Decision Register

**Resolution status (2026-08-16): decisions resolved via the Business Decision
Phase. IDs below are the provisional B-MP-* IDs assigned by the consolidated
register (audit finding CON-2) and map to canonical BD-M-* decisions — see
`docs/architecture/consolidated-decision-register.md`.**

| ID | Decision | Status | Options | Recommendation | Blocks | Canonical |
| --- | --- | --- | --- | --- | --- | --- |
| B-MP-01 | Pakistan tax policy/rates | **APPROVED** (17% GST) | rate models per business/legal | Standard per-market tax regions | Tax config, order totals | BD-M-02 |
| B-MP-02 | UAE tax policy/rates | **APPROVED** (5% VAT) | rate models per business/legal | Standard per-market tax regions | Tax config, order totals | BD-M-02 |
| B-MP-03 | Tax-inclusive/exclusive display | **APPROVED** | inclusive / exclusive / per-market | Exclusive (tax added at checkout); per-market allowed | Pricing display, price config | BD-M-03 |
| B-MP-04 | Discount stacking / promotion priority | **APPROVED** | single vs stacked; limits | Single active promotion (no stacking) | Promotion config | BD-M-04 |
| B-MP-05 | Minimum order value | DEFERRED (P2) | none / per-market | — | Promotion/cart rules | BD-M-05 |
| B-MP-06 | Price rounding policy | **APPROVED** | standard half-up etc. | Standard half-up, 2 decimals | Totals/refunds | BD-M-06 |
| B-MP-07 | Sale pricing rules | **APPROVED** | when/what discount | Admin seasonal sale price lists; no auto-scheduling | Price lists | BD-M-07 |
| B-MP-08 | Market-selection authority | **APPROVED + IMPLEMENTED (2026-08-16)** | URL / selector / profile / geo | Hybrid: URL country code canonical + geolocation suggestion + manual selector override | Storefront routing | BD-M-01 |
| B-MP-10 | Default region per market | **DERIVED + IMPLEMENTED (2026-08-16)** | single default / per entry point | Market selector at `/` when location undetermined (BD-M-09) | Storefront config | BD-M-09 |
| B-MP-09 | Cross-currency refunds | **APPROVED** | refuse vs convert | Refuse (no silent conversion; order currency only) | Refund flows | BD-M-08 |

| B-MP-11 | Customer/wholesale pricing | DEFERRED (excluded — B2C only V1) | — | Exclude from V1 | Price lists | BD-M-10 |
| B-MP-12 | COD policy | **APPROVED** | — | No COD in V1 (alias of B-PAY-03) | Payment flows | BD-P-03 |

---

**Implementation performed:** NONE (specification-only).
**Architecture changes:** NONE.
