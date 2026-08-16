# Inventory & Warehouses Specification

## 1. Status

**Foundation implemented (Phase 2, 2026-08-16) — the inventory/warehouse foundation
is built and verified:** `seed-inventory.ts` (demo warehouses + channel links +
per-variant items/levels) plus `inventory.spec.ts` (9 integration tests)
proving Medusa-native reservation semantics: no reservation on add-to-cart,
exact-once reservation on cart completion, exact-once restoration on order
cancellation (double cancel throws and never double-restores), over-reservation
rejection, and concurrency safety for a single remaining unit. Typecheck, lint,
build, and the full integration suite (16 tests) pass; the seed is applied to
the dev database (verified 2026-08-16).

Remaining spec sections (multi-warehouse allocation rules, backorders,
low-stock **notifications**, Admin visibility, custom workflows) are **not yet
implemented** — the requirements below remain the contract for future tasks.
The foundation's verified behavior is documented in `docs/testing/README.md`
and `docs/infrastructure/local-development.md`.

**Low-stock trigger (BD-I-03) implemented 2026-08-16:** per-level threshold in
`inventory_level.metadata.low_stock_threshold` (native JSONB) + subscriber
`src/subscribers/inventory-low-stock.ts` emitting the `inventory.low_stock`
domain event on threshold crossing; never mutates inventory (REQ-INV-017).
The notification **channel** (merchant email per BD-I-03) remains deferred to
the Notifications specification — see §19.

All Medusa-specific claims verified against the installed Medusa **2.19.0** source (`node_modules/.pnpm/@medusajs/{inventory,stock-location,sales-channel,core-flows,utils}@2.19.0*`), the live database (`medusa-baby-store`), and the storefront starter. This specification is the contract the future inventory implementation task must follow.

Supersedes: nothing. Extends: `docs/specifications/markets-and-pricing.md` (authoritative for market/currency/pricing decisions — referenced, not redefined).

## 2. Scope

**In scope:** inventory representation for baby-clothing product variants; multiple inventory locations (warehouses); stock levels; reservations; cart/checkout/fulfillment/cancellation inventory interaction; concurrency; backorder and low-stock technical capability; visibility; security; failure/recovery; events; test requirements; customization boundary.

**Out of scope (separate specifications):** cart/checkout flows, payments, shipping providers (TCS/Aramex), orders, returns & refunds (boundary defined only in §22), notifications (low-stock trigger defined in §19), catalog/taxonomy, promotions.

## 3. Business Context

- B2C single-merchant baby-clothing platform; Pakistan + UAE markets; PKR + AED.
- Commerce engine: Medusa v2.19.0; PostgreSQL authoritative; Redis non-authoritative; Next.js storefront on Vercel; Medusa backend on VPS; standard Medusa Admin.
- Product variants represent size/color combinations, each with its own SKU and independently managed inventory (AGENTS.md §8).
- Multiple warehouses (physical inventory locations) required. Exact warehouse configuration is deployment/business data, not architecture.
- Backorders and low-stock notifications are **V1 scope**.
- TCS (Pakistan) and Aramex (UAE) are the shipping providers; payment providers not yet selected.

### 3.1 Concept Distinction (explicit)

The following concepts are **distinct and must never be collapsed** (per AGENTS.md architecture guidance and the Markets & Pricing review):

| Concept | Meaning in this platform | Medusa 2.19.0 representation |
| --- | --- | --- |
| Market | Pakistan / UAE — commercial territory (region) | `region` (see markets-and-pricing.md) |
| Sales channel | Distribution channel through which products are sold | `sales_channel` module |
| Inventory location / warehouse | Physical place where stock is held | `stock_location` module |
| Stock level | Quantity record of one inventory item at one location | `inventory_level` |
| Fulfillment provider | Carrier/shipping execution boundary (TCS/Aramex) | `fulfillment_provider` links (`location_fulfillment_provider`) |
| Reservation | Authoritative stock held for a line item at a location | `reservation_item` |

`1 market ≠ 1 warehouse` is NOT assumed. One market may source from multiple locations; one location may serve multiple markets where Medusa supports it safely.

## 4. Authoritative Requirements

Traceability: every significant requirement carries `REQ-INV-###`. Source: AGENTS.md, markets-and-pricing.md, verified Medusa 2.19.0 behavior. Authority: approved project requirements / verified platform contract. No business rule is invented in this document; policy gaps are explicitly marked UNRESOLVED.

### 4.1 Requirements

**REQ-INV-001** — Each product variant (size/color) has independently managed inventory; variants are never aggregated into one stock count.
- Source: AGENTS.md §8. Authority: approved. Medusa capability: variant ↔ inventory item link (`product_variant_inventory`). Implementation: Medusa native (link + inventory items). Test: two variants of one product hold independent stock.

**REQ-INV-002** — Every variant's SKU is a stable business identifier tied to its inventory item.
- Source: AGENTS.md §17 (stable business identifiers). Authority: approved. Medusa capability: `inventory_item.sku`. Implementation: Medusa configuration/data. Test: SKU resolves to exactly one inventory item.

**REQ-INV-003** — The platform supports multiple inventory locations per market, and a location may serve one or more markets.
- Source: AGENTS.md §9 V1 scope (multiple warehouses). Authority: approved. Medusa capability: `stock_location` + `inventory_level.location_id` + `sales_channel_stock_location` link. Implementation: Medusa native (data/config). Test: same item stocked at two locations; reservation targets one location.

**REQ-INV-004** — Available inventory must never become negative unless an explicitly approved backorder/overselling policy allows it.
- Source: AGENTS.md §12 (Commerce Invariants). Authority: approved invariant. Medusa capability: `available_quantity` computed = `stocked − reserved`; `createReservationItems` with `validateQuantityAtLocation` throws NOT_ALLOWED when insufficient unless `allow_backorder` is true. Implementation: Medusa native. Test: reservation beyond available fails without backorder flag.

**REQ-INV-005** — A reservation cannot exceed the allowed inventory boundary.
- Source: AGENTS.md §12. Authority: approved invariant. Medusa capability: same validation as REQ-INV-004. Implementation: Medusa native. Test: boundary reservation succeeds; boundary+1 fails.

**REQ-INV-006** — Inventory restoration must be idempotent (cancellation/return/fulfillment-failure never restores twice).
- Source: AGENTS.md §12. Authority: approved invariant. Medusa capability: `deleteReservationsByLineItemsStep` / reservation deletion (reserved quantity is derived from reservation items; deleting an already-deleted reservation has no effect). Implementation: Medusa native + idempotency tests. Test: duplicate cancel request restores once.

**REQ-INV-007** — Fulfillment must not deduct inventory twice.
- Source: AGENTS.md §12. Authority: approved invariant. Medusa capability: `createOrderFulfillmentWorkflow` consumes reservations (builds fulfillment items per reservation with `location_id`); reservation deletion is idempotent. Implementation: Medusa native + tests. Test: duplicate fulfillment request produces one deduction.

**REQ-INV-008** — Return processing must not restore inventory twice (boundary; Returns spec owns the flow).
- Source: AGENTS.md §12. Authority: approved invariant. Medusa capability: inventory restoration must be routed through Medusa inventory adjustments/reservation mechanics; exact flow defined in Returns & Refunds spec. Implementation: Medusa workflow + idempotency. Test: duplicate return-receive event restores once.

**REQ-INV-009** — Duplicate checkout/order requests must not create duplicate inventory reservations.
- Source: AGENTS.md §12 (INV-007 in task). Authority: approved invariant. Medusa capability: `completeCartWorkflow` is idempotent — re-execution with the same cart returns the same order without duplicating reservations (verified in complete-cart.js doc comments). Implementation: Medusa native. Test: double submit creates one order + one reservation set.

**REQ-INV-010** — Duplicate payment callbacks must not alter inventory more than once.
- Source: AGENTS.md §12/§15. Authority: approved invariant. Medusa capability: reservation is tied to cart-completion, not to payment callbacks; payment webhook handling must be idempotent (payment spec owns authority). Implementation: Medusa native + webhook idempotency. Test: duplicate webhook → no inventory delta.

**REQ-INV-011** — A failed transaction must not leave inventory permanently reserved unless the intended Medusa workflow explicitly defines such state.
- Source: AGENTS.md §12 (INV-009 in task). Authority: approved invariant. Medusa capability: `reserveInventoryStep` compensation deletes created reservations on workflow rollback. Implementation: Medusa native. Test: failed completion releases reservations.

**REQ-INV-012** — A customer cannot directly mutate inventory.
- Source: AGENTS.md §14 security. Authority: approved. Medusa capability: store API exposes no inventory mutation; mutations are admin-only. Implementation: Medusa native. Test: store API inventory mutation rejected.

**REQ-INV-013** — A storefront client cannot determine authoritative available inventory.
- Source: AGENTS.md §13 (backend authoritative). Authority: approved. Medusa capability: store API `variants.inventory_quantity` is a derived/display field (starter uses it for in-stock badges); authoritative quantity lives in the Inventory Module. Implementation: Medusa native + storefront display-only. Test: storefront value differs from DB → DB wins at checkout.

**REQ-INV-014** — Inventory operations must be concurrency-safe (no standalone read-modify-write).
- Source: AGENTS.md §11. Authority: approved. Medusa capability: `reserveInventoryStep` wraps reservation creation in the LOCKING module (`locking.execute(inventoryItemIds, …)`) — per-inventory-item lock keys; `reserved_quantity` is sanitized from direct inventory-level writes ("reserved_quantity should solely be handled through creating & updating reservation items" — verified in inventory-module.js). Implementation: Medusa native. Test: 1 unit / 2 concurrent customers → at most 1 reservation.

**REQ-INV-015** — Reservation happens at checkout completion, not at add-to-cart.
- Source: AGENTS.md §11 (abandoned cart: don't permanently reserve on add). Authority: approved architecture. Medusa capability: `reserveInventoryStep` executes inside `completeCartWorkflow` in parallel with order creation (verified). Implementation: Medusa native. Test: add-to-cart does not change reserved_quantity.

**REQ-INV-016** — Admin manual inventory adjustments (receiving, correction, damaged/lost, transfers, return-to-stock) are server-side authorized, atomic, validated, auditable, and impossible for storefront customers.
- Source: AGENTS.md §14/§19. Authority: approved. Medusa capability: inventory-level adjustments via Inventory Module service (admin API), standard Medusa Admin inventory UI. Implementation: Medusa native + audit logging per AGENTS.md §19 where applicable. Test: unauthorized adjustment rejected; adjustment recorded.

**REQ-INV-017** — Low-stock notification trigger is derived from authoritative inventory state and never mutates inventory.
- Source: AGENTS.md §9/§18. Authority: approved (notifications boundary). Medusa capability: `InventoryEvents` (`inventoryLevel.updated` etc.) as trigger source; notification logic behind the notifications boundary. Implementation: Medusa subscriber/custom job + notifications boundary. Test: level crossing threshold emits one notification per policy.

**REQ-INV-018** — Redis never becomes the authoritative inventory database.
- Source: AGENTS.md §3. Authority: approved. Medusa capability: inventory state is PostgreSQL (Medusa Inventory Module); Redis only for caching/locking (in-memory lock in dev). Implementation: Medusa native. Test: Redis down → inventory queries still correct.

**REQ-INV-019** — Backorders: reservation mechanics are native; per-variant policy requires an approved business decision (§18).
- Source: AGENTS.md §9. Authority: approved scope. Medusa capability: `reservation_item.allow_backorder` (default false) permits reservation exceeding available at a location; NO product/variant backorder flag exists in 2.19 (verified — v1 concept absent). Implementation: **business decision required** + likely custom variant flag/extension. Test: allow_backorder=true reserves below zero available; policy-gated.

**REQ-INV-020** — Multi-warehouse allocation strategy is a business decision; the architecture must not hardcode one (§17).
- Source: AGENTS.md §11 (no invented business rules). Authority: approved. Medusa capability: reservation step accepts `location_ids`; fulfillment workflow takes `location_id`; Medusa provides no automatic nearest/priority allocator in 2.19. Implementation: decision required (allocation logic boundary). Test: allocation follows the approved strategy deterministically.

## 5. Inventory Domain Model

Business-level entities (distinct concepts):

```
Product (catalog entity, not inventory entity)
  └── Variant (size/color; SKU) ──link──> Inventory Item (iitem_*)
                                              ├── Stock Level @ Location A (ilev_*)
                                              ├── Stock Level @ Location B
                                              └── Reservation Items (resitem_*)
Stock Location (sloc_*) = physical warehouse
  ├── Address (stock_location_address)
  ├── Fulfillment provider links (location_fulfillment_provider)
  └── Sales channel links (sales_channel_stock_location)
```

- **Inventory Item** — one physical SKU-able unit identity; carries `sku`, `requires_shipping`, `origin_country`, `hs_code`, `material`, metadata.
- **Stock Level** — the quantity record of one inventory item at one location; carries `stocked`, `reserved`, `incoming`; `available` is derived.
- **Reservation** — authoritative commitment of N units of one inventory item at one location to one line item.
- **Warehouse/Location** — physical storage; identity + address + metadata; active/inactive is data, not a distinct Medusa concept (see §8).

## 6. Medusa Domain Mapping

Verified against installed 2.19.0 (module, model, workflow, API, native/custom):

| Business Concept | Medusa Concept | Module | Model/Table | Key facts (verified) |
| --- | --- | --- | --- | --- |
| Product | `product` | Product | `product` | catalog entity; not inventory |
| Product Variant | `product_variant` | Product | `product_variant` | linked to inventory item(s) via `product_variant_inventory` link table |
| SKU | `inventory_item.sku` | Inventory | `inventory_item` (iitem) | searchable, nullable; stable identifier |
| Inventory Item | `inventory_item` | Inventory | `inventory_item` | `requires_shipping` default true; hasMany location_levels, reservation_items |
| Warehouse | `stock_location` | Stock Location | `stock_location` (sloc) | `name` searchable, `metadata`; address via `stock_location_address` |
| Inventory Location | `stock_location` (+ level.location_id) | Inventory / Stock Location | `inventory_level.location_id` | location referenced by every level & reservation |
| Stock Level | `inventory_level` | Inventory | `inventory_level` (ilev) | `stocked/reserved/incoming` bigNumber default 0; unique (inventory_item_id, location_id) |
| Available Quantity | `inventory_level.available_quantity` | Inventory | computed | **computed = stocked − reserved** (verified: `model.bigNumber().computed()`) |
| Reserved Quantity | `inventory_level.reserved_quantity` | Inventory | persisted, sanitized | direct updates sanitized out; "solely handled through creating & updating reservation items" (verified inventory-module.js) |
| Incoming Quantity | `inventory_level.incoming_quantity` | Inventory | persisted | purchase-order/receiving oriented |
| Reservation | `reservation_item` | Inventory | `reservation_item` (resitem) | `line_item_id` (nullable), `location_id`, `quantity`, `raw_quantity` (json), `allow_backorder` (default false), `description` |
| Backorder | reservation-level `allow_backorder` only | Inventory | `reservation_item.allow_backorder` | NO product/variant backorder flag in 2.19 — **custom + business decision** (§18) |
| Fulfillment | `fulfillment` + `fulfillment_item` | Order/Fulfillment | `fulfillment*` tables | `createOrderFulfillmentWorkflow` builds fulfillment items per reservation incl. `location_id` |
| Shipment | fulfillment/shipping option | Fulfillment | fulfillment + shipping | shipping provider boundary (TCS/Aramex) — separate spec |
| Return | `return` | Order | `return*` tables | Returns spec owns flow; inventory boundary §22 |
| Sales Channel | `sales_channel` | Sales Channel | `sales_channel`, `sales_channel_stock_location` | channel ↔ location link table exists; distinct from market/location |

Key workflows (verified in `@medusajs/core-flows@2.19.0`):

| Workflow | Inventory role (verified) |
| --- | --- |
| `completeCartWorkflow` (cart/workflows/complete-cart.js) | Runs `reserveInventoryStep` **in parallel** with order creation, cart update, promotion usage registration. Idempotent: re-execution returns the same order (no duplicate reservations). Reservation at checkout completion. |
| `reserveInventoryStep` (cart/steps/reserve-inventory.js) | Wraps `createReservationItems` in the LOCKING module per inventory-item key; accepts `allow_backorder`, `location_ids`, `required_quantity`; compensation deletes created reservations (rollback). |
| `cancelOrderWorkflow` (order/workflows/cancel-order.js) | `deleteReservationsByLineItemsStep` restores inventory on cancellation. |
| `createOrderFulfillmentWorkflow` (order/workflows/create-fulfillment.js) | Consumes reservations: builds fulfillment items from reservations (`buildReservationsMap`), one fulfillment item per reservation with `location_id`; accepts `location_id`. |
| `deleteReservationsByLineItems` / `deleteReservations` (reservation/workflows) | Standalone idempotent reservation deletion; also used in cancel-exchange, cancel-claim, confirm-order-edit. |

APIs: Admin inventory APIs (`/admin/inventory-items`, `/admin/stock-locations`, levels, reservations — standard Medusa Admin UI verified in capability matrix); store API exposes no inventory mutation, only derived display (`variants.inventory_quantity` used by the starter for in-stock badges — verified in `apps/storefront/src/lib/data/products.ts`).

Customization required: **none for core inventory mechanics.** Custom code only for: backorder policy (§18), allocation strategy (§17), low-stock notifications (§19), return-to-stock disposition (§22) — each behind its own boundary.

## 7. Product Variant Inventory

- One product (e.g. "Baby Cotton T-Shirt") → variants (0-3M/White, 0-3M/Blue, …), each with own SKU.
- Each variant links to exactly one inventory item (one SKU) via the `product_variant_inventory` link. Multiple variants never share one inventory item unless the business explicitly defines a shared-SKU item (not authorized — variants must be independent).
- The inventory item carries per-location stock levels. A variant's total stock = sum of levels across locations; a variant's stock at a location = that location's level.
- Storefront availability display uses the store API's derived `inventory_quantity`; it is never authoritative (§13).

## 8. Inventory Locations & Warehouses

- **Warehouse = `stock_location`.** Medusa's native `stock_location` model (name, address, metadata) is sufficient. **No custom Warehouse entity is created.**
- Identity: `sloc_*`; stable business identity: location name/code as data.
- Country/address: `stock_location_address` (per-location).
- Active/inactive: operational status is business data managed via the Admin (no distinct Medusa status field verified — mark location availability in stock levels; note as open question if a hard-disable is needed).
- Inventory ownership: levels are per (inventory item, location).
- Sales-channel relationship: `sales_channel_stock_location` link governs which channels can sell from which locations.
- Fulfillment relationship: `location_fulfillment_provider` / `location_fulfillment_set` links associate locations with fulfillment providers (TCS/Aramex boundary — not implemented).
- Supported markets: **not a field** — derived from region → sales channel → location links; the market↔location mapping is business data (§9).

## 9. Market / Warehouse Relationship

- **Market ≠ warehouse ≠ sales channel ≠ fulfillment provider** (explicit, §3.1).
- The market→location linkage is composed: region (market) → sales channel → `sales_channel_stock_location` → locations; and region → payment/shipping provider boundaries (markets-and-pricing.md).
- Architecture must allow one market → multiple locations, and one location → multiple markets where Medusa supports it (reservation is per-location; no global "market" constraint on a location verified).
- Business rule RESOLVED (2026-08-16, BD-I-04): implicit via sales-channel links (locations serve their market's channel) — same-market allocation (BD-I-01).

## 10. Inventory Quantities

| Quantity | Persisted or derived | Source of truth | Mutators | Changes when |
| --- | --- | --- | --- | --- |
| `stocked_quantity` | persisted | Inventory Module (PostgreSQL) | admin adjustments/receiving, returns-to-stock | receiving, correction, return disposition |
| `reserved_quantity` | persisted, but sanitized from direct writes | reservation items (create/update/delete) | reservation workflows | checkout completion (create), cancellation/fulfillment (delete) |
| `incoming_quantity` | persisted | Inventory Module | admin (purchase/receiving flows) | receiving |
| `available_quantity` | **derived (computed)** | = stocked − reserved (per level) | never directly | follows stocked/reserved |
| fulfillment-consumed | not a quantity — reservation deletion at fulfillment | reservations | fulfillment workflow | fulfillment creation |

No "unavailable" or "committed" quantity concept exists in the installed module beyond these; none is invented.

## 11. Reservations

Lifecycle (mapped to verified workflows):

```
Available (derived)
   ↓ checkout completion (completeCartWorkflow → reserveInventoryStep)
Reserved (reservation_item created; reserved_quantity up)
   ↓ fulfillment (createOrderFulfillmentWorkflow consumes reservations)
Consumed (reservations deleted; stocked unchanged; available returns to stocked)
   ↓ OR order cancelled / payment failure rollback (deleteReservationsByLineItemsStep / step compensation)
Released (reservation deleted; reserved_quantity down; available restored)
```

- Reservation requires an inventory level at the target location (NOT_FOUND if item not stocked there).
- With `validateQuantityAtLocation` on, reservation beyond available throws NOT_ALLOWED unless `allow_backorder` is true.
- Reservations are line-item-scoped (`line_item_id`) and location-scoped (`location_id`).
- Add-to-cart does **not** reserve (REQ-INV-015).

## 12. Cart Interaction

- Adding an out-of-stock variant: allowed at cart level (no reservation at add time); final availability validated at completion. Storefront may show out-of-stock state from derived `inventory_quantity`.
- Adding limited-stock variant: allowed; quantity is not capped at add time by inventory (cap policy DEFERRED, BD-I-07 — validate at completion only, native).
- Cart quantity exceeding availability: backend validates at completion (reservation fails → completion fails) — backend authoritative (AGENTS.md §13).
- Stock decreasing after cart creation / becoming zero before checkout: completion-time reservation fails safely; cart retains items; customer sees out-of-stock at checkout.
- Cart expiration/abandonment: no reservations exist for an abandoned cart (reservations only at completion) — nothing to release; abandoned-cart spec owns that flow.
- Customer returning to an old cart: revalidation happens at completion; prices/availability re-resolved by backend.

## 13. Checkout Interaction

Verified sequence (do not reorder):

```
Cart
 ↓ completeCartWorkflow
 ↓ (parallel) create order + reserve inventory + register promotion usage
 ↓   reserveInventoryStep:
 ↓     resolve locations (location_ids)
 ↓     locking.execute(inventoryItemIds)   ← concurrency protection
 ↓     createReservationItems (validateQuantityAtLocation unless allow_backorder)
 ↓ order created; payment authorized/captured last
```

- Availability validation and reservation occur **inside cart completion**, protected by the LOCKING module.
- Deduction (consumption) occurs at fulfillment creation, not at checkout.
- Rollback: step compensation deletes reservations if the workflow fails.

## 14. Payment Failure Interaction

Inventory consequences only (payment spec owns authority):

- Immediate/async payment failure, expired payment, timeout, customer retry: reservation was created at completion; if the order is not placed or is cancelled, `deleteReservationsByLineItemsStep` releases it (cancel-order path). Duplicate failure callbacks must be idempotent (REQ-INV-010).
- Payment succeeds after timeout / out-of-order webhooks: handled by idempotent completeCartWorkflow (returns the same order; no duplicate reservations) + payment-webhook idempotency (payment spec).
- A failed payment must never leave the reservation permanently in place unless a later authorized state (e.g. approved backorder) defines otherwise.

## 15. Order Cancellation Interaction

- Full cancellation before fulfillment: `cancelOrderWorkflow` → `deleteReservationsByLineItemsStep` restores inventory exactly once (idempotent — REQ-INV-006).
- Cancellation after fulfillment: reservations already consumed; no restoration (inventory already deducted); refund/return flows own any stock disposition.
- Partial cancellation: Medusa order-edit/cancel-item flows reuse reservation deletion per line item; repeated cancellation requests are idempotent.
- Cancellation policy (who can cancel, windows) = business decision owned by Orders spec — inventory behavior defined only for the authorized cancellation event.

## 16. Fulfillment Interaction

- Fulfillment creation consumes reservations per line item; each fulfillment item records its `location_id` (verified `createOrderFulfillmentWorkflow`).
- Partial/split fulfillment: fulfillment items are per reservation — an order may be fulfilled from multiple locations (multiple fulfillment records, each location-scoped). Native.
- Multiple warehouses: supported natively via per-location reservations and per-fulfillment `location_id` (REQ-INV-003, §17).
- Shipment creation/cancellation and fulfillment failure: inventory effects (restore reservations on fulfillment failure) must be routed through Medusa's reservation workflows; exact failure policy is a technical decision (UNRESOLVED §31) pending verification at implementation.
- Fulfillment must not deduct twice (REQ-INV-007).

## 17. Multi-Warehouse Allocation

- Medusa 2.19.0 provides **no automatic allocator** (no nearest/priority logic verified). Reservation step requires explicit `location_ids`; fulfillment requires `location_id`.
- Therefore allocation is: (a) determine eligible locations (sales-channel links, provider links, stock), (b) choose per an approved strategy, (c) pass `location_ids` into the reservation step.
- **RESOLVED (2026-08-16, BD-I-01 APPROVED)** — strategy: **same-market/region location** (Pakistan orders → Pakistan locations; UAE → UAE locations) for TCS/Aramex cost/speed. Alternatives considered: highest available stock; lowest shipping cost; priority order; manual admin selection.
- Implementation boundary if approved: a small selection step inside a customized completion workflow or a pre-step feeding `location_ids` — **not** inside providers or generic workflows.

## 18. Backorders

Separated per requirement (technical vs business vs policy):

- **MEDUSA NATIVE:** reservation-level `allow_backorder` (default false). With it true, `createReservationItems` permits reservation exceeding available at a location (available may go negative — permitted boundary per REQ-INV-004). Confirmed in installed `inventory-module.js` and `reservation-item` model.
- **CUSTOM IMPLEMENTATION (required):** no product/variant backorder flag, expected-fulfillment-date, or customer-facing backorder state exists in 2.19 (verified — v1 `backorder` field absent). A per-variant backorder policy flag (e.g. metadata/extension) plus feeding `allow_backorder` into the reservation step is required. Customer visibility: storefront derived state (e.g. "Backorder — ships <date>").
- **RESOLVED (2026-08-16, BD-I-02 APPROVED):** **no backorders in V1** — items must be in stock; native reservation validation at completion; no custom backorder flag. (Alternatives considered: selected variants with limits; charge-on-ship.)
  - (Historical open questions, now superseded):
  - which products/variants may be backordered (all / selected);
  - maximum backorder quantity per variant and per order;
  - payment behavior (charge now / on ship);
  - cancellation/refund rules for backordered items;
  - mixed carts (stocked + backordered) handling;
  - notification on arrival;
  - expected-fulfillment-date promise.

## 19. Low-Stock Notifications

- Trigger condition: an authorized threshold crossing on authoritative inventory state (per level: `stocked` or `available` crossing threshold) — surfaced via `InventoryEvents` (`inventoryLevel.created/updated/...`) or a scheduled reconciliation job; the trigger never mutates inventory (REQ-INV-017).
- **RESOLVED (2026-08-16, BD-I-03 APPROVED):** threshold per level; recipient = merchant email; channels later (notifications spec); repeat/reset behavior per notifications spec at implementation. (Values set at implementation.)
- **Trigger IMPLEMENTED (2026-08-16):** threshold stored per level in `inventory_level.metadata.low_stock_threshold` (native JSONB — verified the module persists metadata; input sanitizer only strips `reserved_quantity`); subscriber `src/subscribers/inventory-low-stock.ts` listens to `inventory.inventory-level.updated` / `.created` (module events — every module-service mutation funnels through them; workflow events would double-emit since workflow steps call the module) and emits the `inventory.low_stock` domain event when a level with a threshold is at or below it. The trigger never mutates inventory (REQ-INV-017). Pure helper `src/inventory/low-stock.ts` unit-tested (10 tests); integration tests (3) prove crossing emits once with the correct payload, above-threshold emits none, no-threshold emits none. Demo threshold 10 set by `seed-inventory.ts`.
- **Channel DEFERRED:** merchant-email delivery, channels, repeat/reset behavior, and recipient configuration remain with the Notifications specification (BD-I-03: channels later). The `inventory.low_stock` event is the consumer contract for that phase.
- Implementation boundary: subscriber/job on the notifications boundary; never inside the Inventory Module or providers.

## 20. Manual Inventory Adjustments

- Receiving (stocked up), correction, damaged/lost/expired (stocked down with reason), transfer (level A down, level B up — see §21), return-to-stock (see §22), administrative correction.
- Every authoritative adjustment: server-side authorized (standard Medusa Admin + RBAC if sensitive), atomic (Medusa module transaction), validated (non-negative where required), auditable (AGENTS.md §19 audit logging), idempotent where retriable, impossible for storefront customers (REQ-INV-016).
- No custom RBAC/audit infrastructure is created unless Medusa's capability is verified insufficient at implementation time.

## 21. Inventory Transfers

- **Not a V1 requirement** (not in AGENTS.md V1 scope). Not silently added.
- Architecture can support later: transfer = level update at source location (down) + target location (up) via authorized admin adjustment, inside one Medusa transaction; reservation re-targeting is a separate concern requiring verification.
- If the business later requires transfers, the required rules (in-transit state, ownership, timing) are a new business decision.

## 22. Returns & Inventory Boundary

Boundary only (Returns & Refunds spec owns the flow):

```
Return approved → item received → inspection/result → inventory disposition
```

- The future Returns workflow must provide to inventory: item (variant → inventory item), quantity, receiving location, disposition result, and an idempotency key.
- Possible dispositions RESOLVED (2026-08-16, BD-I-06 DERIVED from BD-R-04/05): restock sellable; discard damaged; quarantine/discard for non-restockable per inspection.
- Restoration must be idempotent and routed through Medusa inventory mechanics (REQ-INV-008).

## 23. Inventory Visibility

- **Customer/storefront:** only derived state — in stock / low stock / out of stock / backorder (policy permitting). Exact per-warehouse quantities are never exposed (REQ-INV-013).
- **Admin:** standard Medusa Admin provides inventory items, stock levels by location, reservations, and adjustment records natively (verified in capability matrix) — no custom admin UI required for V1.
- Stale display is never authoritative; checkout always validates backend state.

## 24. Security Requirements

- No client inventory manipulation (store API has no mutation; REQ-INV-012).
- Unauthorized inventory adjustments rejected server-side (RBAC + Admin auth).
- IDOR: reservation/inventory operations are backend-internal; no customer-facing inventory IDs.
- Negative inventory injection prevented by validation + computed available + reservation validation (REQ-INV-004/005).
- Race conditions: LOCKING module per inventory item (REQ-INV-014).
- Duplicate mutations: workflow idempotency (REQ-INV-006/007/009/010).
- Forged fulfillment/return events: server-side event authority; webhooks/subscribers validate context (AGENTS.md §15).
- Unauthorized warehouse access: Admin authorization; store never addresses locations directly.
- Stale display not authoritative (REQ-INV-013).

## 25. Failure & Recovery

- DB failure/transaction rollback: Medusa workflow transactions; reservation step compensation releases partial reservations.
- Redis unavailable: locking falls back to in-memory (dev default) — correctness for V1 single-instance; multi-instance production requires the Redis locking module (technical decision). Redis is never the inventory database (REQ-INV-018).
- Shipping/payment provider unavailable: completion may fail safely; reservations released by compensation/cancellation (no permanent reservation).
- Worker/job failure (e.g. notifications): non-authoritative; retry without inventory side effects.
- Duplicate/delayed webhooks: idempotent handling (REQ-INV-010).
- Application restart mid-workflow: workflow engine resumes/compensates per Medusa semantics; reservations not double-created.
- Partial fulfillment failure: restore unconsumed reservations via Medusa reservation workflows (verify exact step at implementation — §31).

## 26. Inventory Events

Verified: `InventoryEvents` built from `inventoryItem`, `reservationItem`, `inventoryLevel` (created/updated/deleted/restored/attached/detached per entity) in `@medusajs/utils@2.19.0` (events.js). (Note: the `EventBusEventsOptions` type declarations are temporarily commented in 2.19.0 — event names exist; typed options may need local augmentation.)

- Native events: `inventoryItem.*`, `reservationItem.*`, `inventoryLevel.*`.
- Consumers (future): notifications (low-stock, backorder arrival), analytics/observability, reconciliation.
- No custom event contracts are created by this spec; custom events only where verified necessary at implementation.

## 27. Commerce Invariants

Consolidated (each maps to a requirement):

1. `available = stocked − reserved` per level, derived — never negative unless approved backorder policy (REQ-INV-004).
2. Reservation ≤ allowed boundary (REQ-INV-005).
3. Restoration idempotent (REQ-INV-006).
4. Fulfillment deducts once (REQ-INV-007).
5. Return restores once (REQ-INV-008).
6. Duplicate checkout → one reservation set (REQ-INV-009).
7. Duplicate payment callback → no inventory delta (REQ-INV-010).
8. Failed transaction → no permanent reservation (REQ-INV-011).
9. Customer cannot mutate inventory (REQ-INV-012).
10. Storefront quantity never authoritative (REQ-INV-013).
11. All inventory ops concurrency-safe (REQ-INV-014).
12. Redis non-authoritative (REQ-INV-018).

## 28. Test Requirements

**Unit:** quantity validation; invariant validation; backorder flag logic; low-stock threshold logic; allocation selector (once approved).

**Integration (real DB, Medusa Inventory Module):** stock level CRUD; level upsert per (item, location); reservation create/update/delete; available recomputation; `validateQuantityAtLocation` NOT_ALLOWED; `allow_backorder` bypass; location-scoped queries; `product_variant_inventory` link.

**API:** admin inventory operations (auth required); unauthorized inventory mutation rejected (403/401); customer cannot reach inventory mutation; store derived `inventory_quantity` correct for region/channel.

**Workflow:** completeCartWorkflow reservation; payment-failure release; order cancellation restoration; fulfillment consumption; return-to-stock; duplicate events (single effect).

**Concurrency (critical):**
- 1 unit available, 2 simultaneous customers → at most 1 successful reservation.
- Concurrent reservations on same item; duplicate checkout submission; retry after timeout; concurrent cancellation/fulfillment; duplicate webhook.

**Property/invariant tests:** `available >= 0` (absent backorder); `reserved ≤ boundary`; restoration idempotent; fulfillment no double-deduct; cancellation no double-restore; return no double-restore; duplicate event → single mutation; customer cannot mutate; per-location internal consistency.

## 29. Customization Boundary

| Requirement | Classification |
| --- | --- |
| Variant↔inventory linkage, SKU | Medusa native (link + inventory item) |
| Stock levels, quantities, reservations | Medusa native (Inventory Module) |
| Reservation at completion, concurrency locking | Medusa native (completeCartWorkflow + LOCKING) |
| Fulfillment consumption | Medusa native (createOrderFulfillmentWorkflow) |
| Cancellation restoration | Medusa native (cancelOrderWorkflow) |
| Multiple warehouses | Medusa native (stock_location + links) |
| Multi-warehouse allocation strategy | **Unresolved business decision** + custom selection step (small, feeding `location_ids`) |
| Backorder mechanics (reservation-level) | Medusa native (`allow_backorder`) |
| Backorder policy + variant flag + UX | **Custom implementation** + business decision |
| Low-stock notifications | Custom subscriber/job on notifications boundary + business decision |
| Return-to-stock disposition | Medusa workflow customization + business decision (Returns spec) |
| Inventory transfers | Not V1; supported later via native adjustments |
| Admin inventory UI | Medusa native (standard Admin) |
| Storefront availability display | Storefront-only (derived, non-authoritative) |

Goal honored: **no custom inventory module, no custom inventory tables** — Medusa Inventory Module is the engine.

## 30. Business Decision Register (was "Unresolved" — RESOLVED 2026-08-16)

**Resolution status: all decisions resolved via the Business Decision Phase.
IDs below are the provisional B-INV-* identifiers (CON-2) mapping to
canonical BD-I-* decisions — see
`docs/architecture/consolidated-decision-register.md`.**

| ID | Decision | Status | Options | Recommendation | Blocks | Canonical |
| --- | --- | --- | --- | --- | --- | --- |
| B-INV-01 | Warehouse allocation strategy | **APPROVED** | same-market location / highest stock / lowest shipping cost / priority / manual | Same-market (region-scoped) location for TCS/Aramex economics | §17, fulfillment implementation | BD-I-01 |
| B-INV-02 | Backorder policy (which variants, max qty, payment, ETA, mixed carts) | **APPROVED — no backorders in V1** | several (see §18) | No backorders; items must be in stock; native reservation validation | §18, backorder implementation | BD-I-02 |
| B-INV-03 | Low-stock threshold + recipient + channels + repeat/reset | **APPROVED** | several (see §19) | Per-level available threshold; merchant email recipient; channels later | §19, notifications | BD-I-03 |
| B-INV-04 | Cross-market location availability (one location serving multiple markets) | **APPROVED** | implicit via sales-channel links / explicit per-market allocation | Implicit via sales-channel links | §9 | BD-I-04 |
| B-INV-05 | Split fulfillment policy | **APPROVED** | allow split per location / single-location per order | Allow (native support verified) with same-market rule | §16 | BD-I-05 |
| B-INV-06 | Return-to-stock disposition (restock/damaged/quarantine/discard) | **DERIVED** (BD-R-04/05) | see §22 | Restock sellable; discard damaged | §22, Returns spec | BD-I-06 |
| B-INV-07 | Cart quantity vs availability pre-check | DEFERRED (P2) | validate at completion only / cap at add | Validate at completion (native); optional UX cap later | §12 | BD-I-07 |

## 31. Unresolved Technical Decisions

- Redis-backed LOCKING module enablement for multi-instance production concurrency (dev uses in-memory locking — verified default).
- Exact reservation-restore step for partial-fulfillment failure and fulfillment cancellation (verify against `createOrderFulfillmentWorkflow` internals at implementation).
- Whether `stock_location` needs an explicit active/inactive mechanism beyond stock-level data.
- InventoryEvents typed-options augmentation (2.19.0 temporarily comments `EventBusEventsOptions` — verify at implementation).
- Allocation-step placement within a customized completion workflow (hook vs workflow extension) — verify against 2.19.0 extension mechanisms at implementation.

## 32. Implementation Notes

- Configuration order: stock locations (warehouses) → sales channel ↔ location links → inventory items/levels → variant links → test reservation flows via seed data.
- All Medusa-specific implementation must follow the AGENTS.md verification hierarchy (installed source > official 2.19.0 docs > Context7 > inference) and the Context7 verification record (AGENTS.md §27).
- Do not introduce a second inventory persistence layer; PostgreSQL (Medusa) is authoritative.
- Concurrency tests must run against a real PostgreSQL + (for locking) the configured locking module.

## 33. Verification Sources

- Installed source: `@medusajs/inventory@2.19.0` (models `inventory-item`, `inventory-level`, `reservation-item`; `services/inventory-module.js` — validation, sanitization, `validateQuantityAtLocation`, `allow_backorder`).
- Installed source: `@medusajs/stock-location@2.19.0` (stock_location model), `@medusajs/sales-channel@2.19.0`, `@medusajs/utils@2.19.0` (events.js — InventoryEvents).
- Installed source: `@medusajs/core-flows@2.19.0` (cart/steps/reserve-inventory.js; cart/workflows/complete-cart.js; order/workflows/cancel-order.js; order/workflows/create-fulfillment.js; reservation/workflows/*).
- Live database `medusa-baby-store`: tables `inventory_item`, `inventory_level`, `reservation_item`, `stock_location`, `stock_location_address`, `sales_channel_stock_location`, `location_fulfillment_provider`, `location_fulfillment_set`, `product_variant_inventory`.
- Storefront starter: `apps/storefront/src/lib/data/products.ts` (`+variants.inventory_quantity`), product-actions availability display.
- AGENTS.md §9/§11/§12/§14/§15/§19; `docs/specifications/markets-and-pricing.md`.
