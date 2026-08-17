# Shipping & Fulfillment Specification

## 1. Purpose

Define the complete shipping and fulfillment domain for the Pakistan + UAE B2C
baby-clothing platform: shipping options and rates, market/provider isolation
(TCS → Pakistan, Aramex → UAE), warehouses/stock-location interaction,
fulfillment and shipment lifecycles, tracking, provider boundaries, failure /
retry / idempotency / concurrency, webhooks, security, admin, notifications,
payments and returns interaction boundaries, testing, and invariants —
implementation-ready, evidence-based, with **no provider API contracts
invented** and **no business rules invented**.

This document is **specification-only**. It changes no source code,
configuration, dependencies, database schema, storefront, or Admin
implementation.

## 2. Scope

**In scope:** the shipping vs fulfillment distinction; shipping
option/profile/set/service-zone/geo-zone model; rate calculation and shipping
price integrity; market/provider isolation (PK→TCS, AE→Aramex) as
configuration; warehouse / stock-location interaction including partial and
split fulfillment; fulfillment and shipment lifecycles; tracking; the
provider integration boundary (provider-neutral contract + TCS/Aramex
contract registers); failure/retry/idempotency/concurrency; webhooks and
callbacks; security and auditability; standard Medusa Admin coverage;
notification boundaries; payments interaction boundary; returns interaction
boundary (shipping-side facts only); test requirements; business and technical
decision registers; requirement traceability.

**Non-goals:** payment-provider behavior (Payments spec owns); final
return/refund policy (Returns & Refunds spec, later); provider API contracts
(must be verified against official TCS/Aramex documentation at implementation
time — every provider-specific detail below is **UNVERIFIED/TBD**); storefront
shipping UI implementation; inventory mechanics (Inventory & Warehouses spec
owns); any code/config/dependency/migration/Admin change.

## 3. Authority and Dependencies

Authority order (AGENTS.md §2): explicit user instruction > approved project
specifications > architecture documents > ADRs > AGENTS.md > official Medusa
docs for the installed version > existing implementation > third-party docs >
agent inference.

- **AGENTS.md** (authoritative engineering contract) — §4 (provider
  integration boundaries, no fake adapters), §5 (no business-rule invention),
  §9 (V1 scope: inventory + multiple warehouses + backorders), §11
  (high-risk domain: shipping; independent commerce concerns), §12 (commerce
  invariants), §13 (backend-authoritative pricing incl. shipping), §14
  (security), §15 (transactions/idempotency/webhooks), §16 (tests), §17
  (definition of done, dependency discipline), §18 (notifications/consent,
  SEO), §19 (audit logging), §27 (verification hierarchy + record).
- **`docs/specifications/markets-and-pricing.md`** — authoritative: market =
  Medusa region; PKR/AED; price hierarchy; `REQ-MP-028` (shipping amounts
  computed and applied server-side, never client-supplied); market-selection
  authority **APPROVED (BD-M-01)**: URL country code canonical + geolocation
  suggestion + explicit selector override; no silent currency conversion.
- **`docs/specifications/cart-and-checkout.md`** — authoritative: cart
  currency/region; `addShippingMethodToCartWorkflow` boundary (option price
  validated server-side); `completeCartWorkflow` sequence (validate shipping
  options step, order snapshot); address model and B-CC-07 (per-market
  address requirements); B-CC-14 (COD → Payments spec).
- **`docs/specifications/payments.md`** — **NOW EXISTS (authoritative)**.
  This spec supersedes the earlier shipping draft's "payments pending"
  framing. Shipping↔payment interaction is defined in §17 here and
  cross-referenced against payments.md §5.3/§7/§15/§16. Payment provider
  selection APPROVED (BD-P-01 Safepay — replaces earlier AssanPay selection, which replaced xPay —,
  BD-P-02 Stripe; contract verification per `docs/architecture/provider-verification/`);
  COD APPROVED — no COD in V1 (BD-P-03).
- **`docs/specifications/inventory-and-warehouses.md`** — authoritative:
  stock locations = warehouses; reservations created at completion,
  consumed at fulfillment, restored on cancellation; multi-warehouse
  allocation strategy **APPROVED — same-market (BD-I-01)**; backorder
  mechanics native at reservation level (`allow_backorder`), policy
  **APPROVED — no backorders in V1 (BD-I-02)**.
- **`docs/architecture/authentication-authorization.md`** — Medusa-native
  customer auth; admin vs customer authorization separation.
- **`docs/architecture/medusa-capability-matrix.md`** and
  **`docs/architecture/gap-analysis.md`** — capability classification and
  known gaps.
- Installed Medusa **2.19.0** source/types/database (verified throughout;
  §27 records exact artifacts).

### 3.1 Contradictions identified and resolutions

| # | Contradiction / stale claim | Resolution |
| --- | --- | --- |
| 1 | Earlier shipping draft: "`docs/specifications/payments.md` — PENDING (not yet created)". | Payments spec now exists and is authoritative. This spec defines the shipping↔payment boundary against it (§17). B-SF-14 (COD) is renumbered B-SHIP-06 and defers to payments.md B-PAY-03. |
| 2 | markets-and-pricing.md §25: "Shipping option availability mechanics per region in v2.19 (via sales channel/fulfillment sets — verify)". | **Verified in this spec** (§6.5/§8): the native chain is cart → sales channel → stock locations → fulfillment sets, filtered by service-zone geo-zone match against the cart shipping address. Open item closed. |
| 3 | inventory-and-warehouses.md §16: "exact failure policy [for fulfillment failure] is a technical decision (UNRESOLVED)". | Partially resolved: `cancelOrderFulfillmentWorkflow` **re-creates/updates reservations for unfulfilled quantities** (verified §11). Whether restoration is automatic or admin-gated remains a business/technical decision (B-SHIP-09, T-SHIP-15). |
| 4 | Older draft's `IFulfillmentProvider` method list omitted `createReturnFulfillment`, `getReturnDocuments`, `getShipmentDocuments`. | Corrected (§6.2) — these exist in the installed interface and matter to the Returns & Refunds boundary. |
| 5 | No genuine contradiction with AGENTS.md, markets-and-pricing.md, cart-and-checkout.md, payments.md, or inventory-and-warehouses.md found. **AGENTS.md is not modified.** |

## 4. Domain Definitions

All state vocabulary below is verified against installed Medusa 2.19.0
(`@medusajs/fulfillment`, `@medusajs/types`, `@medusajs/core-flows`). No state
names are invented.

| Term | Meaning (Medusa 2.19.0) |
| --- | --- |
| Shipping | Customer-visible domain: options, rates, the method selected on the cart, and the shipping cost. |
| Fulfillment | Operational execution domain: location allocation, the `fulfillment` record, shipment, labels, tracking, delivery. |
| Shipping option | `shipping_option` — an offer (e.g. "TCS Standard"): `name`, `price_type` (FLAT \| CALCULATED), `provider`, `service_zone`, `shipping_profile`, `type` (`shipping_option_type`), `rules`, currency-aware prices (`shipping_option_price_set`). Configuration, not an execution record. |
| Shipping profile | `shipping_profile` — groups options (e.g. default); products link via `product_shipping_profile`. |
| Fulfillment set | `fulfillment_set` — a set of service zones; linked to stock locations (`location_fulfillment_set`) and to the sales channel transitively via `sales_channel_stock_location`. |
| Service zone | `service_zone` — a named zone within a fulfillment set holding geo zones and shipping options. |
| Geo zone | `geo_zone` — coverage rule: `country_code` (required), `province_code?`, `city?`, `postal_expression?`. |
| Shipping method | Snapshot of a chosen option on a cart or order (`cart_shipping_method`, `order_shipping_method`) with a **server-derived amount**. |
| Shipping rate | The price attached to an option: FLAT price-set entry (per currency/region) or provider `calculatePrice` result (`calculated_amount` + `is_calculated_price_tax_inclusive`). |
| Fulfillment | `fulfillment` — execution record: `location_id` (required), `packed_at`, `shipped_at`, `marked_shipped_by`, `created_by`, `delivered_at`, `canceled_at`, `data`, `requires_shipping`, `items`, `labels`, `delivery_address`. |
| Shipment | Creation of shipping from a fulfillment: `createOrderShipmentWorkflow` sets `labels` + `marked_shipped_by` and the order shipment reference. |
| Tracking | Data on `fulfillment_label`: `tracking_number`, `tracking_url`, `label_url`, plus provider status normalized at the integration boundary. |
| Provider | TCS/Aramex adapter implementing Medusa's `IFulfillmentProvider` (verified interface, §6.2). |
| Warehouse | `stock_location` — a physical inventory location (inventory spec §8). |

**Explicitly distinct and never collapsed** (REQ-SHIP-003): shipping option
configuration ≠ selected shipping method ≠ calculated shipping price ≠
shipping method on cart/order ≠ fulfillment ≠ shipment ≠ tracking.

## 5. Architecture

```
Next.js storefront (Vercel)
   ↓ GET /store/shipping-options · POST /store/shipping-options/:id/calculate · POST /store/carts/:id/shipping-methods
Medusa v2.19.0 (VPS)
   ├── Fulfillment module (options, profiles, sets, service zones, geo zones, fulfillment, shipment, labels)
   ├── core-flows workflows (create/cancel/ship/mark-delivered, calculate prices, list options for cart)
   ├── Order module (order shipping snapshot: order_shipping_method + adjustments + tax lines)
   ├── Stock Location + Inventory modules (locations, reservations, levels)
   ├── Admin: /admin/fulfillments… · /admin/shipping-options… · /admin/fulfillment-sets… (native RBAC policies)
   └── Fulfillment provider boundary (IFulfillmentProvider)
         ├── Pakistan → TCS adapter   (PKR, PK addresses)   [NOT INTEGRATED — contract UNVERIFIED]
         └── UAE → Aramex adapter     (AED, AE addresses)   [NOT INTEGRATED — contract UNVERIFIED]
PostgreSQL (authoritative shipping/fulfillment state) · Redis (non-authoritative: cache/locking/event-bus only)
```

- All shipping/fulfillment state is PostgreSQL (Medusa Fulfillment module +
  Order module snapshots). Redis never stores authoritative shipment or
  fulfillment state (AGENTS.md §3).
- Provider adapters live behind the `IFulfillmentProvider` boundary
  (AGENTS.md §4). Provider-specific API details never leak into storefront
  components, cart logic, checkout components, order entities, or generic
  fulfillment workflows.
- **No generic custom shipping engine.** Custom code exists only where
  required to integrate TCS/Aramex (the adapters) or implement explicitly
  approved business behavior (e.g. an approved allocation step).

## 6. Medusa Capability Mapping (verified)

All verified against installed `@medusajs/fulfillment@2.19.0`,
`@medusajs/core-flows@2.19.0`, `@medusajs/types@2.19.0`,
`@medusajs/medusa@2.19.0`, `@medusajs/fulfillment-manual@2.19.0`, and the live
database.

### 6.1 Data model (tables verified in `medusa-baby-store`)

| Concept | Model/table | Verified fields |
| --- | --- | --- |
| Shipping option | `shipping_option` | `name`, `price_type` (enum `ShippingOptionPriceType` FLAT \| CALCULATED), `data`, `metadata`; `service_zone` (belongsTo), `shipping_profile` (nullable), `provider` (nullable), `type` (`shipping_option_type`), `rules` (hasMany), `fulfillments` (hasMany); currency-aware prices via `shipping_option_price_set` |
| Option rule | `shipping_option_rule` | `attribute`, `operator` (enum `RuleOperator`), `value` |
| Option type | `shipping_option_type` | `label`, `description?`, `code` |
| Profile | `shipping_profile` | `name`, `type`, `metadata?`; `product_shipping_profile` link |
| Fulfillment set | `fulfillment_set` | `name`, `type`; service zones |
| Service zone | `service_zone` | `name`; belongsTo fulfillment_set; geo zones + shipping options |
| Geo zone | `geo_zone` | `type`, `country_code` (required), `province_code?`, `city?`, `postal_expression?`, `metadata?` |
| Fulfillment | `fulfillment` | `location_id` (required), `packed_at?`, `shipped_at?`, `marked_shipped_by?`, `created_by?`, `delivered_at?`, `canceled_at?`, `data?`, `requires_shipping` (bool); `items`, `labels`, `delivery_address` (hasOne `fulfillment_address`) |
| Fulfillment item | `fulfillment_item` | snapshot: `title`, `sku`, `barcode`, `quantity`, `line_item_id?`, `inventory_item_id?` |
| Fulfillment label | `fulfillment_label` | `tracking_number`, `tracking_url`, `label_url` |
| Provider | `fulfillment_provider` | `id` (registered provider identifier — the seed uses `manual_manual` for the manual provider; verified), `is_enabled` (default true) |
| Location links | `location_fulfillment_set`, `location_fulfillment_provider` | stock_location ↔ fulfillment set / provider |
| Order snapshot | `order_shipping_method` (+ adjustments, tax lines), `order_fulfillment`, `order_shipping` | historical shipping preservation |

### 6.2 Provider interface (verified `@medusajs/types` — `IFulfillmentProvider`)

The native integration boundary contract that TCS/Aramex adapters must
implement (all methods verified in the installed interface):

```
getIdentifier(): string
getFulfillmentOptions(): Promise<FulfillmentOption[]>
validateFulfillmentData(optionData, data, context): Promise<any>   // context includes from_location: StockLocationDTO
validateOption(data): Promise<boolean>
canCalculate(data): Promise<boolean>
calculatePrice(optionData, data, context): Promise<CalculatedShippingOptionPrice>   // { calculated_amount, is_calculated_price_tax_inclusive }
createFulfillment(data, items, order, fulfillment, additionalData?): Promise<CreateFulfillmentResult>  // { data, labels: [{ tracking_number, tracking_url, label_url }] }
cancelFulfillment(fulfillment): Promise<any>
getFulfillmentDocuments(data): Promise<any>
createReturnFulfillment(fromData): Promise<CreateFulfillmentResult>    // returns boundary
getReturnDocuments(data): Promise<any>
retrieveDocuments(fulfillmentData, documentType): Promise<any>
getShipmentDocuments(data): Promise<any>
```

`FulfillmentOption = { id, is_return?, [k: string]: unknown }`.
`ValidateFulfillmentDataContext = CartPropsForFulfillment & { from_location }`
— the provider receives the resolved shipping-from location, which is how a
TCS/Aramex adapter learns the warehouse.

### 6.3 Workflows (verified in `@medusajs/core-flows@2.19.0`)

- Shipping configuration: `createShippingOptionsWorkflow`,
  `updateShippingOptionsWorkflow`, `deleteShippingOptionsWorkflow`,
  `createShippingProfilesWorkflow`, `updateShippingProfilesWorkflow`,
  `createServiceZonesWorkflow`, `updateServiceZonesWorkflow`,
  `deleteServiceZonesWorkflow`, `deleteFulfillmentSetsWorkflow`,
  `batchShippingOptionRulesWorkflow`.
- Rates/eligibility: `listShippingOptionsForCartWorkflow` (store
  `GET /store/shipping-options`),
  `listShippingOptionsForCartWithPricingWorkflow` (with `calculated_price`),
  `calculateShippingOptionsPricesWorkflow` (store
  `POST /store/shipping-options/:id/calculate`).
- Execution (order-scoped): `createOrderFulfillmentWorkflow`,
  `createOrderShipmentWorkflow`, `cancelOrderFulfillmentWorkflow`,
  `markOrderFulfillmentAsDeliveredWorkflow`.
- Execution (module-level): `createFulfillmentWorkflow`,
  `createShipmentWorkflow`, `cancelFulfillmentWorkflow`,
  `markFulfillmentAsDeliveredWorkflow`, `updateFulfillmentWorkflow`,
  `createReturnFulfillmentWorkflow` (returns boundary).

Verified workflow semantics that shape this spec:

- **`listShippingOptionsForCartWorkflow`** (§6.5) — the native eligibility
  chain. It also exposes `setPricingContext` and `setShippingOptionsContext`
  hooks for extension.
- **`addShippingMethodToCartWorkflow`** — cart lock; lists options with
  pricing; `validateCartShippingOptionsStep` +
  `validateCartShippingOptionsPriceStep` (server-side price validation);
  `validateAndReturnShippingMethodsDataStep` (calls provider
  `validateFulfillmentData` with `from_location`); creates the method with
  `amount = calculated_price.calculated_amount` and
  `is_tax_inclusive = is_calculated_price_tax_inclusive`; removes colliding
  same-profile methods; then runs `refreshCartItemsWorkflow`, which **refreshes
  the payment collection** (`refreshPaymentCollectionForCartWorkflow`) — so a
  shipping-method change re-prices the payment collection while the cart is
  still mutable (see §17).
- **`completeCartWorkflow`** — validates the selected shipping methods
  (`validateShippingStep`) and builds the order from the cart snapshot,
  preserving the shipping amount in `order_shipping_method`.
- **`createOrderFulfillmentWorkflow`** — builds one fulfillment item per
  reservation (`line_item_id`, `inventory_item_id`, `location_id`, quantity
  math incl. `required_quantity`); resolves `location_id` from input or from
  the shipping option's fulfillment set location (throws `INVALID_DATA`
  "Cannot create fulfillment without stock location" when neither); sets
  `packed_at = new Date()`, `requires_shipping`, merges `delivery_address`
  overrides; records the inventory deduction (negative adjustment per
  location) and deletes or updates (remaining quantity) reservations; guards:
  "No stock reservation found for item" and "Quantity to fulfill exceeds the
  reserved quantity" (both `INVALID_DATA`) — partial fulfillment is bounded by
  reserved quantity.
- **`createOrderShipmentWorkflow`** — validates the order is not cancelled,
  the items exist, and the fulfillment belongs to the order; sets `labels`
  and `marked_shipped_by = input.created_by` on the fulfillment (via
  `createShipmentWorkflow` → `updateFulfillmentWorkflow`); registers the order
  shipment (`registerOrderShipmentStep`); emits
  `FulfillmentWorkflowEvents.SHIPMENT_CREATED`; exposes the `shipmentCreated`
  hook.
- **`markOrderFulfillmentAsDeliveredWorkflow`** — validates deliverability,
  then `markFulfillmentAsDeliveredWorkflow` sets `delivered_at`.
- **`cancelOrderFulfillmentWorkflow`** — validates order/fulfillment context;
  `cancelOrderFulfillmentStep` plus **`createReservationsStep` (toCreate) +
  `updateReservationsStep` (toUpdate)** — cancelling a fulfillment restores
  reservation coverage for the unfulfilled portion (inventory restoration
  path, idempotent; see §11).
- **`updateFulfillmentWorkflow`** (module) — the native mechanism for
  updating fulfillment data/labels; used by shipment creation and
  mark-delivered; the natural mechanism for normalized tracking updates
  (T-SHIP-04).

### 6.4 Routes (verified)

- Store: `GET /store/shipping-options` (list for cart, cart_id query),
  `POST /store/shipping-options/:id/calculate` (rate calc),
  `POST /store/carts/:id/shipping-methods` (add method — option price
  validated, verified in cart spec). Storefront consumes the first two in
  `apps/storefront/src/lib/data/fulfillment.ts` (verified).
- Admin: `/admin/fulfillments` (+ `/:id/cancel`, `/:id/shipment`),
  `/admin/orders/:id/fulfillments` (+ `/:fulfillment_id/cancel`,
  `/:fulfillment_id/mark-as-delivered`, `/:fulfillment_id/shipments`),
  `/admin/fulfillment-providers` (+ `/:id/options`),
  `/admin/fulfillment-sets` (+ service zones),
  `/admin/shipping-options`, `/admin/shipping-option-types`,
  `/admin/shipping-profiles`, `/admin/stock-locations`.
- **RBAC policies verified** on admin fulfillment routes:
  `/admin/fulfillments/*` read; `/admin/fulfillments` create;
  `/admin/fulfillments/:id/cancel` update; `/admin/fulfillments/:id/shipment`
  update; `/admin/shipping-options/*` read/create/update. Admin shipping
  operations therefore carry Medusa's native admin authorization model
  (roles/policies; AGENTS.md §14/§26.5).

### 6.5 Option eligibility (verified `listShippingOptionsForCartWorkflow`)

Eligible options are derived natively:

```
cart → sales_channel_id → stock_locations (via sales_channel_stock_location)
     → fulfillment_sets (via location_fulfillment_set) → fulfillmentSetIds
filters: fulfillment_set_id ∈ fulfillmentSetIds
         address: { country_code: cart.shipping_address.country_code,
                    province_code: cart.shipping_address.province,
                    city: cart.shipping_address.city,
                    postal_expression: cart.shipping_address.postal_code }
context: is_return ("true"/"false"), enabled_in_store ("true"/"false")
```

This is the **native market-isolation mechanism**: a PK cart (PK region +
sales channel + PK stock locations + PK fulfillment set whose service zone has
a PK geo zone) can only ever surface options whose geo zone covers PK, and
vice versa for AE. No custom eligibility code is required.

### 6.6 Native vs custom vs external summary

| Capability | Class | Notes (verified) |
| --- | --- | --- |
| Options/profiles/sets/zones/geo zones, option rules | Native + configuration | seed pattern verified in `initial-data-seed.ts` (fulfillment sets per warehouse, geo zones per country, options with FLAT prices per currency/region, rules `enabled_in_store`/`is_return`) |
| Option/method/rate workflows | Native | §6.3 |
| Eligibility chain (geo zone + location sets) | Native | §6.5 |
| Fulfillment/shipment/delivery/cancel workflows | Native | §6.3 |
| Reservation consumption + deduction at fulfillment | Native | inventory spec §16 + §6.3 here |
| Tracking storage (labels) | Native | `fulfillment_label` |
| Provider adapters (TCS/Aramex) | **Custom integration** | implement `IFulfillmentProvider`; contract UNVERIFIED |
| Rate calculation (CALCULATED options) | Provider `calculatePrice` | only after provider rate API verified |
| Tracking sync (webhook vs poll) | **Custom** (no native tracking-sync workflow verified) | T-SHIP-04 |
| Shipping webhook route | **Custom** (no native fulfillment hooks route — only `hooks/payment` exists) | T-SHIP-07 |
| Allocation strategy | Business decision + small custom step | B-SHIP-01, T-SHIP-14 |
| Backorder policy | Business decision + custom flag feeding `allow_backorder` | inventory spec §18 (owning spec) |
| Admin UI | Standard Medusa Admin (native routes) | no custom Admin UI in V1 |

## 7. Market / Provider Model

- **Pakistan:** region (PKR), country PK, **TCS** provider boundary, PK
  delivery addresses. **UAE:** region (AED), country AE, **Aramex** provider
  boundary, AE delivery addresses. (Regions/countries are configuration per
  markets-and-pricing.md; providers are **not integrated**.)
- **Provider selection is configuration-driven, never hardcoded:**
  `region → sales channel → stock location → location_fulfillment_set /
  location_fulfillment_provider → fulfillment set → service zone → geo zone →
  shipping option → provider`. TCS is selected for PK by configuring PK
  options on PK geo zones linked to PK stock locations bound to the TCS
  provider; Aramex for AE symmetrically (REQ-SHIP-004/005).
- **Currency:** shipping option prices are currency-aware
  (`shipping_option_price_set` — verified); the cart/order shipping amount is
  in the cart/order currency. **No silent PKR↔AED conversion**
  (markets-and-pricing.md; REQ-SHIP-006).
- **Market-selection authority** (which source determines the storefront's
  market) is **APPROVED (BD-M-01)**: URL country code canonical, geolocation
  suggestion (never authoritative), explicit selector override; this spec
  does not hardcode any selection rule into shipping logic.

## 8. Shipping Options

- **Model** (§6.1): `name`, `price_type` (FLAT | CALCULATED), `provider`,
  `service_zone`, `shipping_profile`, `type`, `rules`, prices.
- **Availability/eligibility:** native chain §6.5 — geo-zone coverage +
  sales-channel/location fulfillment sets + `enabled_in_store` +
  `is_return=false` for outbound options. Return options use `is_return=true`
  (Returns & Refunds boundary).
- **Weight/dimension constraints:** **no native weight/dimension constraint
  verified** on the shipping option model. If the business or provider
  requires them, they are enforced inside the provider adapter
  (`validateFulfillmentData`/`calculatePrice`) after contract verification
  (T-SHIP-06). `product.weight` exists in the catalog but is not a shipping
  constraint natively.
- **Standard vs express:** only "standard" is currently required. Additional
  service levels are **configuration** (new option entries/types), not a new
  concept (B-SHIP-04).
- **Tax treatment:** shipping methods carry `is_tax_inclusive` + tax lines
  (`cart_shipping_method_tax_line`, `order_shipping_method_tax_line`
  verified). Tax-inclusive/exclusive shipping display policy is **DERIVED
  from BD-M-02/03 (BD-S-16)** — per-market tax model, exclusive display.
- **Customer selection:** storefront lists options via
  `listShippingOptionsForCartWorkflow` and selects via
  `addShippingMethodToCartWorkflow`, which validates option price server-side
  (cart spec; REQ-SHIP-008/009). The storefront never supplies a shipping
  amount, provider, or service (REQ-SHIP-011).

## 9. Shipping Rates

- **Authoritative source:** Medusa option pricing — FLAT prices in
  `shipping_option_price_set` (per currency/region) and/or provider
  `calculatePrice` for CALCULATED options — executed server-side. The
  storefront never supplies shipping price (verified:
  `addShippingMethodToCartWorkflow` rejects options without a
  `calculated_price` and validates the price server-side; REQ-SHIP-008).
- **FLAT:** configured per currency (PKR/AED) in the option's price set —
  no custom rate infrastructure (seed pattern verified §6.6).
- **CALCULATED (provider rates):** implemented through the provider's
  `canCalculate`/`calculatePrice` inside the `IFulfillmentProvider` boundary —
  no custom rate service. `CalculatedShippingOptionPrice` carries
  `calculated_amount` + `is_calculated_price_tax_inclusive` (verified).
- **Rate requests are read-only** (safe to repeat); whether to cache
  CALCULATED rates to bound provider calls and rate abuse is a technical
  decision (T-SHIP-13) — caching is never authoritative.
- **Price changes across the flow (REQ-SHIP-029/030):**
  - *Cart*: changing shipping method re-prices the cart and refreshes the
    payment collection (§6.3) while the cart is mutable.
  - *Checkout*: `completeCartWorkflow` validates the selected method and
    snapshots the shipping amount into the order.
  - *Payment*: the shipping amount is part of the authoritative payable total
    and of the payment collection amount (payments.md §7); a payment cannot
    be authorized against a stale shipping amount because collection refresh
    precedes completion.
  - *Order creation*: the shipping amount is snapshotted
    (`order_shipping_method`) and never recalculated from later rate/config
    changes (REQ-SHIP-030).
  - *Provider rate change after payment*: does not alter the order; any
    adjustment is a refund/credit decision (Returns & Refunds spec; B-SHIP-23).

## 10. Address Requirements

- **Model (verified):** cart/order/fulfillment addresses carry `first_name`,
  `last_name`, `company?`, `address_1`, `address_2?`, `city`,
  `country_code`, `province?`, `postal_code?`, `phone?`, `metadata?`.
  Fulfillment copies the order's shipping address into `fulfillment_address`
  (`delivery_address`) at fulfillment creation (verified §6.3).
- **Field responsibility split (REQ-SHIP-012):**
  - *Platform-required:* recipient name, phone, address lines, city, country.
  - *Market-required:* PK province + city (+ postal where applicable); AE
    emirate (province) + city (+ postal where applicable). Exact mandatory
    fields per the APPROVED per-market address policy (cart-and-checkout
    B-CC-07 / BD-C-06) — per-market required fields; country must match
    region.
  - *Provider-required:* **UNVERIFIED/TBD** — must be verified against
    official TCS/Aramex documentation before implementation (e.g. phone/CNIC
    conventions if required).
- **Eligibility linkage:** geo-zone matching uses `country_code`, `province`,
  `city`, `postal_expression` (verified §6.5) — address → option matching is
  native (REQ-SHIP-013).
- **Provider normalization:** provider-specific address formatting/normalization
  (PK vs AE conventions, emirate/province codes) stays inside the provider
  adapter boundary — never in checkout UI or generic workflows.
- **Address validation:** no store-route-level required-field validation is
  verified (cart spec B-CC-07); validation is an application-layer boundary
  (cart spec REQ-CC-020) per the approved per-market policy.

## 11. Fulfillment

- **Trigger:** admin/backend-invoked `createOrderFulfillmentWorkflow`
  (admin `POST /admin/orders/:id/fulfillments` or
  `POST /admin/fulfillments`). Never client-triggered (REQ-SHIP-019).
- **Preconditions (verified):** order exists and is not cancelled; items
  exist; a stock location resolves (input or the shipping option's
  fulfillment-set location); reservations exist for managed-inventory items;
  requested quantity ≤ reserved quantity.
- **Inventory effects (verified):** consumes reservations (delete when fully
  consumed, update with remaining quantity otherwise) and records the
  deduction as a negative inventory adjustment per location. Deduction
  happens once per fulfillment (REQ-SHIP-014; inventory spec REQ-INV-007).
- **A shippable order** (what constitutes one — REQ-SHIP-019): an active
  (non-cancelled) order with at least one item that `requires_shipping`, a
  delivery address, a selected shipping method (option), and sufficient
  reservations at a resolved stock location. The native workflows do **not**
  gate fulfillment on payment state; whether the business requires captured
  payment before fulfillment is a business decision (B-SHIP-24).
- **Fulfillment state is independent** from order/payment/shipping/return/
  refund state (AGENTS.md §11). Verified per-fulfillment fields:
  `packed_at`, `shipped_at`, `delivered_at`, `canceled_at`, `marked_shipped_by`,
  `created_by` (REQ-SHIP-001).

| Derived fulfillment state | Trigger (verified workflow) |
| --- | --- |
| Created/packed-pending | `createOrderFulfillmentWorkflow` (sets `packed_at`; consumes reservations) |
| Shipped | `createOrderShipmentWorkflow` (sets `shipped_at` + `labels` + `marked_shipped_by`) |
| Delivered | `markOrderFulfillmentAsDeliveredWorkflow` (`delivered_at`) |
| Cancelled | `cancelOrderFulfillmentWorkflow` (`canceled_at`; reservations re-created/updated for the unfulfilled portion) |

Valid representable combinations (not a single enum): paid + unfulfilled;
fulfilled + in transit; fulfilled + partially returned; delivered + refund
pending; partially fulfilled (multiple fulfillments, per-fulfillment state).

## 12. Warehouse / Stock Location Interaction

- **Warehouse = `stock_location`** (inventory spec §8). No custom warehouse
  entity.
- **Links (verified):** `location_fulfillment_set`, `location_fulfillment_provider`,
  `sales_channel_stock_location`, plus `product_variant_inventory` for
  variant→inventory-item.
- **Fulfillment location:** `fulfillment.location_id` is **required**
  (verified model) — every fulfillment is location-bound (REQ-SHIP-015).
- **Provider↔location relationship:** a location links to fulfillment
  providers and fulfillment sets. PK locations link to TCS; AE locations link
  to Aramex (configuration; REQ-SHIP-004/005).
- **Allocation strategy (B-SHIP-01, RESOLVED — APPROVED BD-I-01):** Medusa
  provides **no automatic allocator** (inventory spec §17). Approved:
  same-market/region location (PK orders → PK warehouses via TCS; AE orders
  → AE warehouses via Aramex). Options considered: same-market/region
  location, highest available stock,
  lowest shipping cost, priority order, explicit admin assignment. The
  eventual selection step feeds `location_ids` into the reservation step and
  `location_id` into fulfillment (T-SHIP-14). No strategy is chosen here.
- **1 market ≠ 1 warehouse** is not assumed; an order may fulfill from
  multiple locations (split, §14) and one location may serve multiple markets
  where Medusa supports it (inventory spec §9).
- **Out-of-stock / backorder:** reservation is created at completion;
  fulfillment requires reservations. Backorder = reservation-level
  `allow_backorder` (native), policy APPROVED — no backorders in V1
  (BD-I-02). A
  backordered item that has not arrived
  simply cannot be fulfilled until reservations exist — fulfillment creation
  fails with the verified `INVALID_DATA` guard rather than fabricating stock
  (REQ-SHIP-025).

## 13. Shipment Lifecycle

- **Shipment = fulfillment + labels + shipped_at + order shipment reference**
  (verified `createOrderShipmentWorkflow`, §6.3). Labels:
  `fulfillment_label.tracking_number/tracking_url/label_url`.
- **Creation** is admin/backend-triggered (`POST
  /admin/orders/:id/fulfillments/:fulfillment_id/shipments` or
  `POST /admin/fulfillments/:id/shipment`), never client-triggered
  (REQ-SHIP-019).
- **Provider shipment creation** happens inside the adapter's
  `createFulfillment` (at fulfillment creation) — or, if the provider only
  ships at a later step, through a provider-specific call behind the boundary.
  Whether TCS/Aramex create the shipment at fulfillment creation or on a
  separate "ship" call is **UNVERIFIED** (contract register §16/§17).
- **Cancellation (REQ-SHIP-017, B-SHIP-10):** approved policy: no
  post-shipment cancellation — cancellation applies before fulfillment only
  (BD-O-02/BD-S-08), so shipment-cancellation window is N/A for V1;
  provider-level shipment cancellation remains an UNVERIFIED contract item.
  Native mechanics: `cancelOrderFulfillmentWorkflow` (order context) /
  `cancelFulfillmentWorkflow` (module) + adapter `cancelFulfillment`.
  Verified inventory consequence: cancelled fulfillment re-creates/updates
  reservations for the unfulfilled portion (idempotent). Cancellation of an
  **already-shipped** fulfillment is provider-dependent (**UNVERIFIED**) and
  business-gated — never silently assumed.
- **Race conditions (§19):** cancellation during shipment creation,
  duplicate shipment creation, callback before API response — all must
  resolve to a single deterministic outcome (REQ-SHIP-026/028).

## 14. Partial / Split Fulfillment

- **Native (REQ-SHIP-016):** fulfillment items are per reservation with
  per-location `location_id`; an order may have multiple fulfillments from
  multiple locations, each with its own shipment/labels/tracking. No
  single-warehouse restriction is introduced.
- **Complete fulfillment:** all line-item quantities fulfilled from one or
  more locations.
- **Partial fulfillment:** subset of quantities/items fulfilled; the
  remaining quantity keeps its reservation (reservation updated with the
  remaining quantity — verified §6.3) and can be fulfilled later.
- **Split fulfillment:** one order, multiple fulfillments/shipments, different
  tracking numbers. Different carriers per shipment are only permitted if the
  approved architecture allows (B-SHIP-12 — the current provider-per-market
  model makes different carriers across markets in one order **not** a V1
  requirement; cross-market orders are not supported, B-SHIP-15).
- **Fulfillment failure after partial fulfillment:** the failed portion must
  not lose its reservation or be double-deducted; restoration/re-scheduling
  is a technical decision (T-SHIP-15) using the verified reservation
  re-creation/update semantics.
- **Customer experience for partial/split shipments** (notifications, per-
  shipment tracking UI) is a business decision (B-SHIP-11) — not invented.
- **Customers cannot choose warehouses or carriers** (no requirement states
  otherwise); allocation is operational (B-SHIP-01).

## 15. Tracking

- **Storage:** native — `fulfillment_label` on the fulfillment
  (`tracking_number`, `tracking_url`, `label_url`). Provider shipment IDs and
  normalized status live in `fulfillment.data` (JSON) behind the boundary
  (REQ-SHIP-020). No custom tracking tables.
- **Sources:** (a) labels returned by the provider at shipment creation
  (`CreateFulfillmentResult.labels`); (b) provider tracking API/webhook
  updates — **UNVERIFIED** for both TCS and Aramex.
- **Treatment (REQ-SHIP-021):** provider tracking payloads are untrusted
  external input — validate structure, normalize status via an approved
  mapping, never store raw payloads in customer-visible fields, never expose
  raw provider payloads to customers.
- **Status mapping (REQ-SHIP-022):** any provider→platform mapping (e.g.
  provider "In Transit" → platform "shipped") is provider-contract
  verification territory — **UNVERIFIED/TBD** until official docs are
  reviewed; no mappings are invented in this document.
- **Synchronization (T-SHIP-04):** no native tracking-sync workflow verified;
  the native update mechanism is `updateFulfillmentWorkflow` (labels/data).
  Mechanism = provider webhook (if supported — UNVERIFIED) or a scheduled
  poll job (background, non-authoritative), normalizing at the boundary.
- **Customer-visible tracking:** derived, normalized, minimal (e.g.
  dispatched / in transit / out for delivery / delivered / exception) —
  refreshed by the authorized sync mechanism; never trusted from the client
  (REQ-SHIP-011/021). Customer access goes through order ownership checks
  (store orders API); no unauthenticated tracking endpoint is invented here.
- **Admin-visible tracking:** fulfillment/shipment/labels via standard Admin
  routes (native).

## 16. TCS Integration Boundary (Pakistan)

- **Role:** TCS adapter implementing `IFulfillmentProvider` (§6.2),
  registered as a native fulfillment provider, bound to PK stock locations /
  fulfillment sets / options via the verified link model
  (`location_fulfillment_provider`, `location_fulfillment_set`,
  `createShippingOptionsWorkflow`).
- **Market restriction:** TCS options' geo zones cover PK only; TCS never
  available to AE carts (REQ-SHIP-004).
- **Currency:** PKR.
- **Credentials/secrets:** server-side env/deployment secrets only; never in
  storefront or logs (REQ-SHIP-031).
- **Contract status: UNVERIFIED/TBD.** All of the following must be verified
  against official TCS documentation before any adapter code (REQ-SHIP-037).
  No endpoints, payloads, auth schemes, status values, or capabilities are
  invented in this document:

| Contract item | Status |
| --- | --- |
| Authentication mechanism + credentials (env names) | UNVERIFIED/TBD |
| Sandbox availability + onboarding | UNVERIFIED/TBD |
| Rate calculation API (if used; `calculatePrice`) | UNVERIFIED/TBD |
| Shipment creation (request/response shape) | UNVERIFIED/TBD |
| Shipment cancellation | UNVERIFIED/TBD |
| Label generation (format, delivery of label file) | UNVERIFIED/TBD |
| Pickup scheduling | UNVERIFIED/TBD |
| Tracking API (status vocabulary) | UNVERIFIED/TBD |
| Webhook/callback mechanism + authentication/signatures | UNVERIFIED/TBD |
| Error responses / error vocabulary | UNVERIFIED/TBD |
| Retry behavior + timeout behavior | UNVERIFIED/TBD |
| Idempotency support (keys/duplicate shipment handling) | UNVERIFIED/TBD |
| COD support + COD settlement/refund behavior | UNVERIFIED/TBD (B-SHIP-06) |
| Supported currencies / countries | UNVERIFIED/TBD |
| Address requirements (CNIC/phone conventions) | UNVERIFIED/TBD |
| Package/weight/dimension requirements + limits | UNVERIFIED/TBD |
| Service levels (standard/express/etc.) | UNVERIFIED/TBD |
| International shipping support (PK↔AE) | UNVERIFIED/TBD (B-SHIP-15) |
| Partial shipment support | UNVERIFIED/TBD |
| Return shipment / reverse logistics support | UNVERIFIED/TBD (Returns spec) |
| Rate limits | UNVERIFIED/TBD |

## 17. Aramex Integration Boundary (UAE)

- **Role:** Aramex adapter implementing `IFulfillmentProvider` (§6.2),
  registered as a native fulfillment provider, bound to AE stock locations /
  fulfillment sets / options.
- **Market restriction:** Aramex options' geo zones cover AE only; never
  available to PK carts (REQ-SHIP-004).
- **Currency:** AED.
- **Credentials/secrets:** server-side env only (REQ-SHIP-031).
- **Contract status: UNVERIFIED/TBD.** Same register as §16, with the same
  rule — verify against official Aramex documentation (incl. Aramex Shipping
  API rate calculation) before any adapter code (REQ-SHIP-038):

| Contract item | Status |
| --- | --- |
| Authentication mechanism + credentials | UNVERIFIED/TBD |
| Sandbox availability + onboarding | UNVERIFIED/TBD |
| Rate calculation (Aramex Shipping API) | UNVERIFIED/TBD |
| Shipment creation (request/response shape) | UNVERIFIED/TBD |
| Shipment cancellation | UNVERIFIED/TBD |
| Label generation | UNVERIFIED/TBD |
| Pickup scheduling | UNVERIFIED/TBD |
| Tracking API (status vocabulary) | UNVERIFIED/TBD |
| Webhook/callback mechanism + authentication/signatures | UNVERIFIED/TBD |
| Error responses / vocabulary | UNVERIFIED/TBD |
| Retry + timeout behavior | UNVERIFIED/TBD |
| Idempotency support | UNVERIFIED/TBD |
| COD support + settlement/refund behavior | UNVERIFIED/TBD (B-SHIP-06) |
| Supported currencies / countries | UNVERIFIED/TBD |
| Address requirements (emirate codes, phone) | UNVERIFIED/TBD |
| Package/weight/dimension requirements | UNVERIFIED/TBD |
| Service levels | UNVERIFIED/TBD |
| International shipping support | UNVERIFIED/TBD (B-SHIP-15) |
| Partial shipment support | UNVERIFIED/TBD |
| Return shipment / reverse logistics support | UNVERIFIED/TBD (Returns spec) |
| Rate limits | UNVERIFIED/TBD |

## 18. Webhooks / Callbacks

**Verified fact:** Medusa 2.19.0 ships a native webhook pipeline for
**payments** (`POST /hooks/payment/:provider` — payments.md §14) but **no
native fulfillment/shipping webhook route** (verified: the only route under
`dist/api/hooks/` is `payment`). Shipping provider callbacks therefore require
a **custom API route behind the provider boundary** (T-SHIP-07) or a polling
job (T-SHIP-04).

Requirements (REQ-SHIP-027) — mirror the payments spec's webhook discipline
(payments.md §14/§15), applied to shipping:

- **Authentication/signature verification:** per-provider, verified against
  official docs (UNVERIFIED) — never invented; raw body + headers available
  to the adapter for verification.
- **Payload validation:** schema/type validation at the boundary; malformed
  payloads rejected, never trusted.
- **Provider event identification:** the callback must identify the provider
  shipment/fulfillment; unknown identifiers are rejected or routed to manual
  review, never auto-applied.
- **Idempotency:** duplicate/replayed events produce exactly one state effect
  (event identity + correlation key persisted per AGENTS.md §15).
- **Replay protection and out-of-order delivery:** later verified states never
  regress earlier ones; reconcile to the latest verified state.
- **Retry behavior:** bounded, with idempotency; failure handling logs and
  surfaces without faking success.
- **Correlation identifiers:** provider shipment ID ↔ fulfillment ID ↔ order
  ID ↔ webhook event ID recorded.
- **Scope limitation:** a webhook may only transition **shipping/fulfillment
  state** (labels, tracking, delivery, exceptions) through the appropriate
  Medusa workflow (`updateFulfillmentWorkflow` /
  `markOrderFulfillmentAsDeliveredWorkflow` / custom normalized-status
  workflow). It must **never** arbitrarily mutate order, payment, or
  inventory state (AGENTS.md §11; REQ-SHIP-027). Delivery confirmation is
  only via verified provider evidence or authorized admin action.
- **Delivery status:** `markOrderFulfillmentAsDeliveredWorkflow` is the only
  native delivered transition; a provider "delivered" callback maps into it
  after verification (provider signature + payload) — never blindly.

## 19. Idempotency and Concurrency

### 19.1 Idempotency

| Operation | Invariant | Mechanism (native where possible) |
| --- | --- | --- |
| Rate requests | Safe to repeat (read-only) | provider `calculatePrice` — no side effects (REQ-SHIP-010) |
| Fulfillment creation | One fulfillment per order/location/items; no double inventory deduction | `createOrderFulfillmentWorkflow` reservation consumption (idempotent reservation delete/update — verified; inventory REQ-INV-007) |
| Shipment creation | Retrying must not create duplicate provider shipments/labels or duplicate order shipment records | adapter dedupe key derived from the fulfillment + `registerOrderShipmentStep` idempotency; provider idempotency support UNVERIFIED (REQ-SHIP-026) |
| Label generation | No duplicate labels | same key as shipment creation |
| Cancellation | One cancellation effect; reservation restore once | `cancelOrderFulfillmentWorkflow` + reservation create/update idempotency (verified; inventory REQ-INV-006) |
| Tracking sync | Duplicate tracking updates → no duplicate notifications/state | normalized upsert keyed by provider shipment ID + last-sync timestamp (REQ-SHIP-021) |
| Provider callbacks/webhooks | Duplicate/replay/out-of-order → one state effect | event identity + persisted correlation key (§18) |
| Retry after uncertain outcome | Determine existing provider state before a new side-effecting attempt | provider status lookup (if supported — UNVERIFIED) before retry (REQ-SHIP-028) |

No custom idempotency storage architecture is prescribed: native workflow
engine + PostgreSQL (with Redis only for coordination/cache) is the mechanism
(T-SHIP-12).

### 19.2 Concurrency races (each → single deterministic outcome, tested)

| Race | Expected result |
| --- | --- |
| Two shipment-creation requests (same fulfillment) | one shipment/labels set |
| Fulfillment cancellation during shipment creation | one authoritative outcome (cancel or shipped), never both silently |
| Duplicate provider callbacks | one state effect |
| Callback arriving before the API response | reconcile to the later verified state; no double effect |
| Callbacks arriving out of order | latest verified state wins; no regression |
| Provider timeout followed by successful provider creation | retry detects existing provider shipment; no duplicate provider shipment |
| Retry after uncertain provider outcome | status lookup before any new side-effecting attempt |
| Concurrent fulfillment of the same reservation from two requests | reservation consumption guards (verified `INVALID_DATA` on exceed) + row-level serialization |

## 20. Security

- **Provider credentials (REQ-SHIP-031):** server-side env/deployment secrets
  only; never in storefront, never in logs, never in provider data stored
  customer-visible. Secret names in `.env.example` only.
- **Client trust boundary (REQ-SHIP-011):** shipping price, provider, service,
  delivery/shipment/tracking status are never accepted from the client;
  all authoritative transitions are server-side workflows.
- **Webhook authentication (REQ-SHIP-027):** signature verification per
  provider (UNVERIFIED mechanism until official docs), payload validation,
  replay protection; the webhook never mutates order/payment/inventory state.
- **Authorization (REQ-SHIP-032):** admin fulfillment/shipping operations use
  native admin routes with native admin authorization (RBAC policies verified
  §6.4); customer sessions never grant admin; sensitive operations
  (cancel, mark-delivered, shipment override, manual data entry) enforced
  server-side — frontend visibility is never authorization.
- **Shipment/tracking manipulation:** no store route mutates fulfillment or
  shipment state (verified store API surface); tracking data exposure is
  order-owned and authorization-checked.
- **Customer data / address privacy:** addresses are personal data — never
  logged in full, never exposed cross-customer; provider payloads containing
  addresses stay behind the boundary.
- **Secret management:** deployment secret manager; JWT/COOKIE + provider
  credentials never committed.
- **SSRF prevention:** any provider-supplied URLs (tracking_url, label_url)
  are treated as external data — validated/denylisted before the storefront
  or admin fetches them; never fetched server-side without allowlisting.
- **Provider response validation:** every provider response (rates, shipment
  results, tracking, webhooks) is schema-validated at the boundary; malformed
  responses are failures, never successes (REQ-SHIP-025).
- **Safe errors:** no stack traces/DB errors/secrets to customers; sanitized
  error responses (mirrors payments spec §19).

## 21. Notifications

- **Boundary (REQ-SHIP-035):** shipping notifications are side effects behind
  the notifications boundary (AGENTS.md §18). Notification failure never
  mutates shipping state; notifications are never the source of truth.
- **Events that may eventually trigger email/SMS/WhatsApp:** fulfillment
  created; shipment created; shipment dispatched; in transit; out for
  delivery; delivered; delivery exception; shipment cancelled. **No templates
  are defined.**
- **Consent:** transactional vs marketing/consent policy per the
  notifications/consent requirements (AGENTS.md §18); nothing invented here.
  Native events available for subscribers: `FulfillmentWorkflowEvents`
  (`shipment.created` — verified; `FulfillmentWorkflowEvents.SHIPMENT_CREATED`)
  and fulfillment module events.
- **Per-shipment customer experience for partial/split orders** (which events
  fire per fulfillment) is a business decision (B-SHIP-11).

## 22. Observability and Audit

- **Structured log context (REQ-SHIP-034):** order ID, fulfillment ID,
  shipment ID, customer ID where appropriate, provider, provider shipment ID,
  tracking number, market/region, warehouse/stock location,
  request/correlation ID. Sensitive credentials and full addresses are never
  logged.
- **Events to log:** option listing failures; rate calculation failures;
  fulfillment creation/consumption; shipment creation; tracking updates;
  delivery marking; cancellations; webhook receipt/verification results;
  provider timeouts/retries/outages; classification outcomes
  (retryable/non-retryable/manual).
- **Admin overrides requiring audit records (REQ-SHIP-033; AGENTS.md §19):**
  manual fulfillment creation, manual shipment creation (incl. manually
  entered tracking numbers), manual delivery marking
  (`markOrderFulfillmentAsDeliveredWorkflow`), fulfillment/shipment
  cancellation, any manual override of provider-returned state. Native
  attribution fields verified: `fulfillment.created_by`,
  `fulfillment.marked_shipped_by` (set from the acting admin id). Exact audit
  persistence follows Medusa capabilities (T-SHIP-09) — no custom audit
  subsystem is prescribed.

## 23. Testing Requirements

(Specification only — no tests written in this task. TDD per AGENTS.md §16 at
implementation. REQ-SHIP-036.)

**Unit tests**
- Rate normalization (FLAT price-set resolution per currency/region;
  CALCULATED `calculated_amount`/tax-inclusive flag handling).
- Provider mapping / provider selection (market isolation).
- Status mapping (provider→platform vocabulary — only after approved
  mappings exist, REQ-SHIP-022).
- Address normalization + validation (per-market field requirements).
- Validation (quantity ≤ reserved; location required; option price present).
- Idempotency-key decisions (fulfillment/shipment/label/cancel keys).
- Error mapping (provider errors → retryable/non-retryable/manual classes).

**Integration tests (real DB + Medusa workflows)**
- Shipping option/profile/set/service-zone/geo-zone configuration (incl. the
  seed pattern).
- `listShippingOptionsForCartWorkflow` eligibility (geo-zone match +
  location fulfillment sets; PK cart never sees AE options and vice versa).
- `addShippingMethodToCartWorkflow` price validation + payment-collection
  refresh.
- `createOrderFulfillmentWorkflow` reservation consumption per location;
  partial fulfillment quantity bounds; missing-reservation failure.
- `createOrderShipmentWorkflow` labels + `shipped_at` + order shipment
  reference; duplicate-shipment idempotency.
- `cancelOrderFulfillmentWorkflow` reservation re-creation/update (restore
  once).
- `markOrderFulfillmentAsDeliveredWorkflow` deliverability validation.
- Order shipping snapshot immutability.
- Redis behavior: only where Redis-backed modules are enabled (locking/cache),
  never authoritative state.

**Contract tests (TCS and Aramex — after official docs verified; REQ-SHIP-037/038)**
- Authentication; request construction; response parsing; status mapping;
  error handling; timeout; retry; webhook signature verification; duplicate
  events; provider idempotency. **Blocked until provider documentation is
  verified.**

**Webhook tests**
- Signature verification (where supported); malformed payload; duplicate
  callback; replay; out-of-order event; unknown provider shipment ID; unknown
  status; callback attempting to mutate non-shipping state (must fail).

**Concurrency tests**
- Duplicate shipment creation; fulfillment cancellation during shipment
  creation; duplicate provider callbacks; callback-before-response; retry
  after uncertain outcome; concurrent fulfillment of the same reservation;
  duplicate fulfillment (no double inventory deduction).

**E2E (sandbox providers — do not invent unavailable sandbox behavior)**
- PK: browse → add to cart → market selection → shipping calc → option
  selection → checkout → payment → order creation → fulfillment → shipment →
  tracking → delivery.
- AE: same flow with Aramex.
- Cancellation where allowed; partial fulfillment; shipment failure recovery.

## 24. Business Decision Register

**Resolution status (2026-08-16): all decisions resolved via the Business
Decision Phase. Canonical mapping per
`docs/architecture/consolidated-decision-register.md`.**

| ID | Business decision | Why required | Options | Recommendation | Status | Canonical |
| --- | --- | --- | --- | --- | --- | --- |
| B-SHIP-01 | Warehouse routing/allocation strategy | Multiple locations; Medusa has no allocator (verified) | same-market location · highest stock · lowest shipping cost · priority · manual | same-market (region-scoped) for TCS/Aramex economics | **APPROVED** (alias of B-INV-01) | BD-I-01 |
| B-SHIP-02 | Shipping rate model | Option pricing config | FLAT only · FLAT + CALCULATED | FLAT initially; CALCULATED only after provider rate API verified | **APPROVED — hybrid (flat V1, calculated later)** | BD-S-01 |
| B-SHIP-03 | Free-shipping thresholds | Option/pricing config + marketing | none / per-market threshold | none in V1 | **APPROVED** | BD-S-02 |
| B-SHIP-04 | Delivery service levels (standard/express) | Option model supports; scope | standard only / standard + express | standard in V1; express as future config | **PROVIDER_VERIFICATION_REQUIRED** | BD-S-03 |
| B-SHIP-05 | Delivery time estimates (estimate vs guarantee) | SEO/UX promise risk | no estimates / estimated non-guaranteed / guaranteed | estimated non-guaranteed if provider supports | DEFERRED (P2) | BD-S-04 |
| B-SHIP-06 | COD availability (PK? AE?) + COD shipping/fee/settlement behavior | Payment + shipping rule | per market / none | — | **APPROVED — no COD in V1** (alias of B-PAY-03) | BD-P-03 |
| B-SHIP-07 | Shipping insurance | Cost/risk | none / per-order / optional | — | **PROVIDER_VERIFICATION_REQUIRED** | BD-S-05 |
| B-SHIP-08 | Package size/weight limits + box rules | Provider contract + ops | — | — | **PROVIDER_VERIFICATION_REQUIRED** | BD-S-06 |
| B-SHIP-09 | Failed delivery / customer unavailable / return-to-origin / re-delivery | Provider + ops behavior | — | — | DEFERRED (P1 — revisit at provider contract) | BD-S-07 |
| B-SHIP-10 | Shipment cancellation window + who can request (customer vs admin) | Cancel workflow trigger policy | admin-only / admin + customer window | — | **DERIVED** (BD-O-02: no post-shipment cancellation — N/A) | BD-S-08 |
| B-SHIP-11 | Partial/split shipment customer experience (notifications, per-shipment UI) | UX for multi-fulfillment orders | — | — | DEFERRED (P3 — notifications spec) | BD-S-21 |
| B-SHIP-12 | Split shipment policy (allow per order / single-location preference) | Multiple warehouses | allow split (native) / prefer single | allow (native verified) | **APPROVED** (alias of B-INV-05) | BD-I-05 |
| B-SHIP-13 | Customer-paid vs merchant-paid return shipping | Returns spec boundary | — | — | **APPROVED — customer pays; merchant for defective** | BD-S-09 |
| B-SHIP-14 | Return shipping provider + reverse logistics | Returns spec boundary | — | — | **PROVIDER_VERIFICATION_REQUIRED** | BD-S-10 |
| B-SHIP-15 | International shipping PK↔AE | Cross-market orders | not supported / supported | **not supported in V1** | **APPROVED** | BD-S-11 |
| B-SHIP-16 | Remote-area surcharges | Provider + ops | none / per-area | — | DEFERRED (P2) | BD-S-12 |
| B-SHIP-17 | Address correction (pre/post fulfillment) | Data quality | no correction / customer correction / provider correction | — | **PROVIDER_VERIFICATION_REQUIRED** | BD-S-13 |
| B-SHIP-18 | Provider fallback strategy | Single provider per market | fail / fallback provider | fail (per-market single provider initially) | DEFERRED (P2 — fail first) | BD-S-14 |
| B-SHIP-19 | Shipment retry policy (attempts/timing) for provider calls | AGENTS.md §15 requires idempotent retries; no values | — | bounded backoff; values at implementation (T-SHIP-05) | **IMPLEMENTATION_DEFINED** | BD-S-15 |
| B-SHIP-20 | Delivery exception handling | Ops | — | — | DEFERRED (P2) | BD-S-17 |
| B-SHIP-21 | PK/AE address mandatory fields (incl. provider-required) | No native required-field validation (cart B-CC-07) | minimal common / per-market | per-market after provider docs | **APPROVED** (alias of B-CC-07) | BD-C-06 |
| B-SHIP-22 | Tax-inclusive/exclusive shipping treatment | `is_tax_inclusive` + tax lines exist | inclusive / exclusive / per-market | — | **DERIVED** (BD-M-02/03: per-market tax model) | BD-S-16 |
| B-SHIP-23 | Shipping-fee refund treatment (full/partial/cancelled-order) | Refund policy | — | — | **DERIVED** (BD-R-05: no shipping refund on returns; only full cancellation) | BD-S-18 |
| B-SHIP-24 | Payment-state gate for fulfillment (require authorized/captured before fulfillment?) | Native workflows do not gate on payment | no gate / require captured | — | **APPROVED — no gate (native)** | BD-S-19 |
| B-SHIP-25 | Manual fulfillment (admin-created fulfillments/shipments, manual tracking entry) | Ops need | supported (native) / restricted | supported via Admin (native) | DEFERRED (P2) | BD-S-20 |

## 25. Technical Decision Register

| ID | Question | Evidence (verified) | Recommendation |
| --- | --- | --- | --- |
| T-SHIP-01 | Medusa fulfillment provider registration + lifecycle | `fulfillment_provider` model, admin `/admin/fulfillment-providers` (+ `/:id/options`), `location_fulfillment_provider` link, seed `manual_manual` pattern | Register TCS/Aramex adapters as native providers (module options in `medusa-config.ts`); bind to PK/AE locations |
| T-SHIP-02 | Fulfillment set / service zone / geo zone configuration for PK/AE | Verified models + workflows + seed pattern | One fulfillment set per market (or per location group) with geo zones PK / AE respectively |
| T-SHIP-03 | Option pricing: FLAT vs CALCULATED | `price_type` enum + `shipping_option_price_set`; `calculateShippingOptionsPricesWorkflow` | FLAT per currency initially; CALCULATED only when provider rate API verified (B-SHIP-02) |
| T-SHIP-04 | Tracking update mechanism (webhook vs poll) | No native tracking-sync workflow verified; native update mechanism = `updateFulfillmentWorkflow`; provider webhook support UNVERIFIED | Verify provider webhook support in contract phase; else scheduled poll job (background, non-authoritative) writing normalized labels/status via `updateFulfillmentWorkflow` |
| T-SHIP-05 | Provider timeout/retry strategy values | AGENTS.md §15; no values specified | Bounded exponential backoff; values approved at implementation (B-SHIP-19) |
| T-SHIP-06 | Weight/dimension-based pricing | Not verified native | Only if business requires; then via provider `validateFulfillmentData`/`calculatePrice` after contract verification |
| T-SHIP-07 | Provider webhook routing | **No native fulfillment hooks route** (only `hooks/payment` exists — verified) | Custom API route behind the provider boundary (e.g. `/hooks/shipping/:provider` with raw-body preservation) + subscriber/workflow; or polling (T-SHIP-04). Signature verification inside the adapter |
| T-SHIP-08 | Shipment-label storage | `fulfillment_label` native (URLs); label binaries (PDF) are files | Store label **URLs** natively; if label binaries must persist, use the file module/R2 (AGENTS.md §11 media boundary) — currently not required; no binaries in PostgreSQL |
| T-SHIP-09 | Admin extension boundaries | Standard Admin covers verified routes + RBAC policies | No custom Admin UI in V1; revisit only on a verified gap (incl. audit views per §22) |
| T-SHIP-10 | Customer tracking API | Store orders API exposes order data; no native unauthenticated tracking endpoint verified | Expose tracking via authenticated order-scoped store API; authorization server-side; exact fields verified at implementation |
| T-SHIP-11 | Redis role in shipping | Locking/cache/event-bus only (AGENTS.md §3) | Keep non-authoritative; enable Redis locking for production multi-instance concurrency |
| T-SHIP-12 | Idempotency persistence | Native workflow engine + PostgreSQL | Use native; no custom idempotency store |
| T-SHIP-13 | Rate caching for CALCULATED options | Provider rate calls are external | Cache non-authoritative (Redis) with short TTL if provider rate abuse is a concern; never authoritative |
| T-SHIP-14 | Allocation step placement | Reservation step accepts `location_ids`; fulfillment requires `location_id` (verified) | Small selection step feeding `location_ids`/`location_id` (workflow hook/extension), per approved B-SHIP-01 — not inside providers or generic workflows |
| T-SHIP-15 | Fulfillment-failure restoration policy | `cancelOrderFulfillmentWorkflow` re-creates/updates reservations (verified) | Restore via reservation re-creation/update semantics; automatic vs admin-gated per business decision (B-SHIP-09) |

## 26. Requirement Traceability Matrix

Groups: A. Scope/architecture · B. Market/provider isolation · C. Shipping
options & rates · D. Address · E. Fulfillment & inventory · F. Shipment
lifecycle & tracking · G. Failure/retry/idempotency/concurrency · H. Payments
interaction · I. Security/admin/observability · J. Notifications · K. Testing ·
L. Provider contracts.

| ID | Group | Requirement | Test expectation |
| --- | --- | --- | --- |
| REQ-SHIP-001 | A | Shipping (customer-visible selection/rates) and fulfillment (operational execution) are distinct domains with independent state; never collapsed into one enum or custom entity. | state-model unit test |
| REQ-SHIP-002 | A | All fulfillment/shipment state transitions execute through Medusa workflows/services; no arbitrary mutation from controllers. | workflow/API tests |
| REQ-SHIP-003 | A | No generic custom shipping engine or custom shipping persistence; Medusa Fulfillment module owns options/methods/fulfillments/shipments. | schema unchanged; architecture review |
| REQ-SHIP-004 | B | PK orders can only use TCS-bound options and AE orders only Aramex-bound options; cross-market leakage impossible (native chain §6.5). | eligibility integration tests |
| REQ-SHIP-005 | B | Market/provider selection is configuration-driven (region → sales channel → location → fulfillment set/zone → option → provider); no PK/AE hardcoding in generic components. | config-only review + integration |
| REQ-SHIP-006 | B | Shipping currency always equals cart/order currency; no silent conversion. | currency validation unit test |
| REQ-SHIP-007 | C | Eligible options are determined natively (geo-zone match + location fulfillment sets + `enabled_in_store`/`is_return` context). | integration (`listShippingOptionsForCartWorkflow`) |
| REQ-SHIP-008 | C | Shipping option price comes from FLAT price set or provider `calculatePrice`, server-side; storefront-supplied shipping amount is never authoritative. | API/security (amount tamper) |
| REQ-SHIP-009 | C | Shipping method is added via the native workflow with server-derived amount; invalid options rejected. | API (invalid option rejected) |
| REQ-SHIP-010 | C | CALCULATED rates go through provider `canCalculate`/`calculatePrice`; no custom rate service. | integration |
| REQ-SHIP-011 | C | The storefront can request options/rates but cannot dictate price, provider, service, delivery/shipment/tracking status. | security tests |
| REQ-SHIP-012 | D | Address fields are classified platform-/market-/provider-required; provider-required fields verified against official docs before implementation. | validation unit + contract phase |
| REQ-SHIP-013 | D | Shipping address drives geo-zone eligibility (country/province/city/postal). | integration |
| REQ-SHIP-014 | E | Fulfillment creation consumes reservations per line item per location; never deducts twice (inventory REQ-INV-007). | workflow + concurrency |
| REQ-SHIP-015 | E | Fulfillment records are location-bound (`location_id` required). | model/API test |
| REQ-SHIP-016 | E | Partial/split fulfillment across multiple locations is supported natively; no single-warehouse restriction. | workflow (multi-location order) |
| REQ-SHIP-017 | E | Cancelling a fulfillment restores reservation coverage for unfulfilled quantities exactly once (verified `cancelOrderFulfillmentWorkflow`). | workflow + duplicate cancel |
| REQ-SHIP-018 | E | Warehouse allocation strategy is an approved business decision before any allocation logic is built. | decision gate (B-SHIP-01) |
| REQ-SHIP-019 | F | Shipment = fulfillment + labels + `shipped_at` via `createOrderShipmentWorkflow`; admin/backend-triggered, never client-triggered; a shippable order is a non-cancelled order with ship-requiring items, address, method, and reservations. | workflow + security |
| REQ-SHIP-020 | F | Tracking numbers/URLs/labels stored natively in `fulfillment_label`; provider IDs/status in `fulfillment.data` behind the boundary. | integration |
| REQ-SHIP-021 | F | Provider tracking payloads are validated external input, normalized at the boundary; raw payloads never exposed to customers. | webhook/validation tests |
| REQ-SHIP-022 | F | Provider→platform status mappings are approved only after official contract verification; no invented mappings. | contract phase |
| REQ-SHIP-023 | F | A cancelled fulfillment cannot silently become delivered; a shipment belongs to a valid fulfillment/order context. | state-transition tests |
| REQ-SHIP-024 | F | Delivery is marked only via the native workflow (admin-authorized, audited). | admin tests + audit assertions |
| REQ-SHIP-025 | G | Provider failures are never represented as successful fulfillment; classified retryable/non-retryable/manual. | failure-path tests |
| REQ-SHIP-026 | G | Shipment/fulfillment/label/cancel/tracking operations are idempotent — one logical operation creates at most one provider shipment/label/effect. | concurrency (duplicate shipment creation) |
| REQ-SHIP-027 | G | Provider webhooks/callbacks: signature verification where supported, payload validation, idempotency, replay protection, out-of-order handling; never arbitrarily mutate order/payment/inventory state. | webhook suite |
| REQ-SHIP-028 | G | Retry after uncertain provider outcome determines existing provider state before a new side-effecting attempt. | concurrency (retry race) |
| REQ-SHIP-029 | H | The shipping amount is part of the authoritative cart/order total and payment collection; payment collection refreshed when the shipping method changes (verified). | integration |
| REQ-SHIP-030 | H | After order creation, shipping amount is snapshotted; later rate/config/provider changes never alter the order; adjustments are refund/credit territory (Returns & Refunds spec). | order snapshot test |
| REQ-SHIP-031 | I | Provider credentials are server-side env only; never in storefront or logs. | security scan |
| REQ-SHIP-032 | I | Admin fulfillment/shipping operations use native admin routes + native admin authorization (RBAC policies verified); sensitive ops server-side. | authorization tests |
| REQ-SHIP-033 | I | Sensitive overrides (manual fulfillment/shipment, manual delivery mark, cancellation, manual tracking entry) are auditable with actor attribution (`created_by`/`marked_shipped_by`). | audit assertions |
| REQ-SHIP-034 | I | Structured logs carry order/fulfillment/shipment/provider/correlation context; secrets and full PII never logged. | code review / logging test |
| REQ-SHIP-035 | J | Shipping notifications are side effects; failure never mutates shipping state; consent per notifications requirements. | notification boundary test |
| REQ-SHIP-036 | K | TDD suite per §23 (unit/integration/contract/webhook/concurrency/E2E) written before/with implementation. | CI gate |
| REQ-SHIP-037 | L | TCS contract (register §16) verified against official docs before implementation. | contract tests |
| REQ-SHIP-038 | L | Aramex contract (register §17) verified against official docs before implementation. | contract tests |

## 27. Verification Record

**Verification record (AGENTS.md §27.4):**

```
Medusa version: 2.19.0 (locked; unchanged)
Relevant packages: @medusajs/fulfillment, @medusajs/types, @medusajs/core-flows,
  @medusajs/medusa, @medusajs/utils, @medusajs/fulfillment-manual (all 2.19.0)
Relevant APIs: IFulfillmentProvider; fulfillment/shipping-option/geo-zone/
  service-zone/fulfillment-set/fulfillment-label models; list-shipping-options-for-cart,
  add-shipping-method-to-cart, create-order-fulfillment, create-order-shipment,
  cancel-order-fulfillment, mark-order-fulfillment-as-delivered, update-fulfillment,
  calculate-shipping-options-prices workflows; store/admin routes; admin RBAC policies
Installed source verification: fulfillment models (fulfillment.d.ts, shipping-option.d.ts,
  geo-zone.d.ts), types provider.d.ts (IFulfillmentProvider), core-flows
  list-shipping-options-for-cart.js / add-shipping-method-to-cart.js / create-fulfillment.js /
  create-shipment.js / cancel-order-fulfillment.js / mark-order-fulfillment-as-delivered.js,
  admin middlewares (RBAC policies), dist/api/hooks (only payment route exists),
  initial-data-seed.ts (manual_manual provider, fulfillment sets, geo zones, option prices),
  apps/storefront/src/lib/data/fulfillment.ts
Official docs verification: not required beyond the installed-source hierarchy for this
  specification-only task; official docs (docs.medusajs.com) are the next verification layer
  for the exact 2.19.0 version at implementation
Context7 verification: Context7 MCP tools were NOT invocable in this environment
  (no MCP server configured — .agents/mcp.json is empty and no Context7 MCP tools are
  available). Context7 was NOT used and is not claimed to have been used. Installed
  2.19.0 source (rank #1 in AGENTS.md §27.3) is the verification basis.
Compatibility result: all behavior defined above verified against installed 2.19.0.
  The earlier draft's "payments pending" framing was corrected (§3.1). No Medusa v1
  concepts used (no legacy shipping_method-only model, no medusa-fulfillment-* legacy adapters).
Implementation boundary: specification-only; no code/config/dependency/migration/
  storefront/Admin/database changes.
```

**Sources:**

- `@medusajs/fulfillment@2.19.0` — models: `fulfillment.d.ts` (location_id
  required; packed_at/shipped_at/delivered_at/canceled_at/marked_shipped_by/
  created_by; items; labels; delivery_address), `shipping-option.d.ts`
  (price_type enum, provider, service_zone, rules, fulfillments),
  `geo-zone.d.ts` (country_code required, province_code/city/postal_expression),
  `fulfillment-provider.d.ts`, `fulfillment-set.d.ts`, `service-zone.d.ts`,
  `shipping-profile.d.ts`, `shipping-option-rule.d.ts`, `shipping-option-type.d.ts`.
- `@medusajs/types@2.19.0` — `dist/fulfillment/provider.d.ts`
  (`IFulfillmentProvider`, `FulfillmentOption`,
  `CalculatedShippingOptionPrice`, `CreateFulfillmentResult`,
  `ValidateFulfillmentDataContext.from_location`).
- `@medusajs/utils@2.19.0` — `ShippingOptionPriceType` (FLAT | CALCULATED),
  `RuleOperator`, `FulfillmentWorkflowEvents` (`SHIPMENT_CREATED`).
- `@medusajs/core-flows@2.19.0` — cart/workflows/{list-shipping-options-for-cart,
  add-shipping-method-to-cart, refresh-payment-collection, refresh-cart-items};
  order/workflows/{create-fulfillment, create-shipment, cancel-order-fulfillment,
  mark-order-fulfillment-as-delivered}; fulfillment/workflows/{calculate-shipping-options-prices,
  create-shipping-options, update-fulfillment, mark-fulfillment-as-delivered,
  create-shipment, cancel-fulfillment, create-return-fulfillment}.
- `@medusajs/medusa@2.19.0` — `dist/api/admin/fulfillments/middlewares.js`
  (RBAC create/read/update), `dist/api/admin/shipping-options/middlewares.js`
  (RBAC), `dist/api/admin/orders/middlewares.js`, `dist/api/hooks/` (only
  `payment` — no fulfillment hooks route), store shipping-options routes.
- `@medusajs/fulfillment-manual@2.19.0` — installed (manual provider).
- Live DB `medusa-baby-store` — tables per §6.1 (verified during the deep
  audit).
- Seed/config: `apps/backend/src/migration-scripts/initial-data-seed.ts`
  (fulfillment set + geo zones + options + `manual_manual` +
  `location_fulfillment_set`/`location_fulfillment_provider` links +
  `linkSalesChannelsToStockLocationWorkflow`).
- Storefront boundary: `apps/storefront/src/lib/data/fulfillment.ts`
  (`/store/shipping-options`, `/store/shipping-options/:id/calculate`).
- Existing specs: markets-and-pricing.md, cart-and-checkout.md, payments.md,
  inventory-and-warehouses.md, docs/architecture/authentication-authorization.md,
  docs/architecture/medusa-capability-matrix.md, docs/architecture/gap-analysis.md,
  AGENTS.md.

## 28. Implementation Constraints

- Medusa-first: use the Fulfillment module, native workflows, and verified
  routes. No custom shipping persistence, no parallel fulfillment engine, no
  custom state machine where Medusa represents the requirement (REQ-SHIP-003).
- Verification hierarchy (AGENTS.md §27): installed 2.19.0 source > official
  docs for the exact version > Context7 > inference. No Medusa v1 concepts.
- TCS/Aramex contracts are **UNVERIFIED** — official provider documentation
  must be verified before any adapter code; no endpoints/payloads/auth
  schemes/status values are invented (REQ-SHIP-037/038; §16/§17).
- No business rule from the register (§24) may be chosen without authorization
  (AGENTS.md §5).
- No dependency additions without the AGENTS.md dependency protocol.
- Tests before implementation (AGENTS.md §16); concurrency and webhook tests
  mandatory.

## 29. Open Questions

- Provider contract verification tasks: TCS and Aramex API availability,
  sandbox access, webhook support, status vocabularies, idempotency, COD
  (REQ-SHIP-037/038; §16/§17).
- Provider-required address fields (phone/CNIC conventions) — contract phase.
- Allocation strategy (B-SHIP-01), delivery estimates (B-SHIP-05), payment
  gate for fulfillment (B-SHIP-24), cancellation policy (B-SHIP-10) —
  business decisions.
- Tracking sync mechanism (webhook vs poll) — T-SHIP-04, dependent on
  provider contract.
- Whether weight/dimension-based pricing applies (T-SHIP-06).
- COD shipping implications — deferred to payments.md B-PAY-03 (B-SHIP-06).
- Returns/refunds shipping treatment (return shipping provider, return
  charges, shipping-fee refunds) — deferred to the Returns & Refunds spec
  (B-SHIP-13/14/23).

## 30. Definition of Done

Shipping & Fulfillment is complete only when: Medusa capability verified
against installed 2.19.0; provider contracts verified against official
TCS/Aramex docs (or explicitly deferred with contract tests pending); tests
written first and passing (unit/integration/contract/webhook/concurrency/E2E);
happy + failure + authorization + validation + concurrency paths tested;
idempotency demonstrated; TypeScript/lint/build pass; no secrets; no business
rule silently chosen; docs updated; backward compatibility preserved; no
architecture drift (no custom shipping engine, provider logic isolated behind
`IFulfillmentProvider`, native workflows used, no fake provider adapters).

---

**Implementation performed:** NONE (specification-only).
**Architecture changes:** NONE.

## 31. Implementation Status (2026-08-16)

Phase 5 (Shipping & Fulfillment) implemented scope — per-market topology +
native fulfillment mechanics. Provider adapters remain gated.

- **Per-market sales channels (BD-I-01/BD-I-04, T-SHIP-14):** idempotent
  `seed-utils/market-channels.ts` creates the `Pakistan Sales Channel` /
  `UAE Sales Channel`; `seed-shipping.ts` finalizes the topology — Karachi
  Warehouse ↔ PK channel, Dubai Warehouse ↔ AE channel, stale default-channel
  links removed (the default channel keeps serving the starter European demo
  data). Verified mechanics in installed 2.19.0 source:
  `prepareConfirmInventoryInput` scopes candidate stock locations by the
  cart's sales channel and `reserveInventoryStep` uses `location_ids[0]` — so
  a cart on the market channel always reserves at the market warehouse
  (same-market allocation). A channel-less cart now fails fast instead of
  silently cross-allocating.
- **Fulfillment sets / geo zones / options (REQ-SHIP-004/005/007):**
  `seed-shipping.ts` creates per-market fulfillment sets (PK/AE geo zones),
  links them to the market warehouse, and creates flat-rate options
  (`Standard Delivery (PK)` PKR / `Standard Delivery (AE)` AED) with
  `enabled_in_store=true`, `is_return=false`. `manual_manual` provider links
  are the interim fulfillment provider (TCS/Aramex adapters deferred — see
  below). Region `metadata.sales_channel_id` is set on PK/AE regions and the
  publishable key serves both market channels.
- **Storefront (REQ-SHIP-005):** `resolve-cart-sales-channel.ts` derives the
  market channel from the region the storefront already resolves and passes
  it at cart creation and on region switch — no hardcoded channel IDs, no
  per-market branch logic.
- **Verified by `integration-tests/http/shipping.spec.ts` (6 tests):**
  REQ-SHIP-007 eligibility isolation (PK cart → PK option only; AE cart → AE
  option only); BD-I-01/T-SHIP-14 same-market reservation (PK → Karachi, AE →
  Dubai); REQ-SHIP-014/019 admin-only fulfillment consuming the same-market
  reservation + deduction at the fulfillment-set location; B-SHIP-24 no
  payment-state gate (fulfillment succeeds without capture); REQ-SHIP-015
  shipment + native `fulfillment_label` tracking storage; REQ-SHIP-020 cancel
  restores the full reservation; REQ-SHIP-016 mark-as-delivered.
- **NOT implemented (gated):** TCS/Aramex adapters (provider contracts
  UNVERIFIED — REQ-SHIP-037/038; no fake adapters), tracking sync mechanism
  (T-SHIP-04/07 — needs provider contract), CALCULATED rate pricing
  (BD-S-01 hybrid model; flat rates seeded as replaceable demo values),
  return-shipping options (`is_return=true` — Returns & Refunds boundary,
  B-SHIP-13/14).

Verification: backend tsc PASS · eslint src PASS (0 issues) · `medusa build`
PASS · unit 69/69 · integration 89/89 (9 suites) · storefront tsc PASS ·
storefront tests 118/118 · root lint 2/2 PASS. No dependencies added.
