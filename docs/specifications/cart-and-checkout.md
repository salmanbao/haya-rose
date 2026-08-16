# Cart & Checkout Specification

## 1. Purpose

Define the complete cart and checkout domain for the Pakistan + UAE B2C baby-clothing store: business behavior, invariants, state transitions, data ownership, Medusa capability mapping, API boundaries, security rules, concurrency behavior, failure behavior, and test requirements — implementation-ready, with **no business rules invented**. A future implementation agent must be able to implement this domain without guessing.

## 2. Scope

**In scope:** cart creation/lifecycle/ownership; guest and customer carts; cart persistence/retrieval/expiration; line-item add/update/remove; variant validation; inventory-check semantics at cart vs checkout; price resolution and integrity; market/currency behavior; promotions on cart; tax boundary; shipping-option boundary; cart totals; checkout as a server-side workflow; idempotency; concurrency; security; error model; observability; test requirements; E2E requirements.

**Non-goals (§3):** payment-provider behavior (Payments spec); shipping-provider behavior (Shipping & Fulfillment spec); return/refund policy (Returns & Refunds spec); catalog/taxonomy; notifications; abandoned-cart automation (defined only as an interpretation boundary here).

## 3. Non-Goals

- Payment-provider-specific behavior, gateway selection, webhook handling — Payments specification.
- TCS/Aramex behavior, rate contracts, label/tracking — Shipping & Fulfillment specification.
- Return/refund policy, COD refund behavior, return windows — Returns & Refunds specification.
- Product catalog design, category taxonomy, variant option modeling — Catalog spec.
- Discount/promotion business policy (stacking, minimum order value) — decided here only as boundaries; policy values are business decisions.
- Custom cart persistence, custom checkout engine — explicitly forbidden; Medusa provides the cart module.
- No implementation of any kind in this task.

## 4. Terminology

| Term | Meaning |
| --- | --- |
| Cart | Medusa `cart` entity — the authoritative shopping container (native). |
| Line item | `cart_line_item` — a cart's entry for a product variant with a persisted unit price and product/variant snapshot. |
| Market | Commercial territory (Pakistan/UAE) — represented by Medusa `region` (see markets-and-pricing.md). |
| Checkout completion | `POST /store/carts/{id}/complete` → `completeCartWorkflow` → order creation. |
| Guest cart | Cart with no `customer_id`; identity is the cart ID itself (stored in the `_medusa_cart_id` cookie by the starter). |
| Customer cart | Cart associated to a Medusa customer via authenticated `POST /store/carts/{id}/customer`. |
| Abandoned cart | **Business interpretation only** — Medusa has no native "abandoned" state. |

## 5. Architecture Context

```
Next.js storefront (Vercel) → Medusa v2.19.0 backend (VPS) → PostgreSQL (authoritative) / Redis (non-authoritative)
```

- Cart/checkout state is PostgreSQL (Medusa Cart module). Redis is only cache/locking/session infrastructure — never authoritative cart state.
- The starter storefront persists the cart ID in the `_medusa_cart_id` cookie (`apps/storefront/src/lib/data/cookies.ts`) and the customer JWT in `_medusa_jwt` (httpOnly, sameSite strict).
- All price/total/inventory/promotion/tax decisions are backend-authoritative (AGENTS.md §13).

## 6. Authority References

- AGENTS.md (authoritative contract) — especially §5 (no business-rule invention), §11 (high-risk domains), §12 (commerce invariants), §13 (price integrity), §15 (transactions/idempotency), §16 (tests), §17 (definition of done).
- `docs/specifications/markets-and-pricing.md` — authoritative for market (region), currency (PKR/AED), price hierarchy, tax boundaries, promotion boundaries, market selection, currency invariants.
- `docs/architecture/authentication-authorization.md` — Medusa-native customer authentication (no Better Auth).
- `docs/specifications/inventory-and-warehouses.md` — authoritative for inventory/reservation semantics; this spec references it, does not redefine it.
- Installed Medusa 2.19.0 source (verified, cited throughout).

## 7. Domain Model

Verified against installed 2.19.0 (`@medusajs/cart@2.19.0` models, `@medusajs/core-flows@2.19.0` workflows, `@medusajs/medusa@2.19.0` store API routes).

| Object | Authoritative owner | Purpose | Relationships | Lifecycle | Native/custom | Persisted | Storefront trust | Checkout participant |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cart | Medusa Cart module (PostgreSQL) | Shopping container; market/currency owner | region_id, customer_id, sales_channel_id, email, shipping/billing addresses, items, shipping_methods, credit_lines | active → completed (`completed_at` set) → soft-deleted; no status enum | Native | Yes | Reads yes; values no | Yes (completed → order) |
| Line item | Medusa Cart module | One variant in cart; **price snapshot** | variant_id, product_id, adjustments, tax_lines | add → update → remove (qty 0 = remove, verified validator) | Native | Yes | Read-only | Yes (order items) |
| Product / Variant | Product module | Catalog identity for line items | line item references variant_id/product_id | independent of cart | Native | Yes | Read | Indirectly (validated) |
| Price set / Price | Pricing module | Currency-aware variant pricing | variant ↔ price set (`product_variant_price_set`) | independent | Native | Yes | No | Yes (unit price resolved at add/update) |
| Region / Market | Region module | Market = region (markets-and-pricing.md) | cart.region_id, countries, currency | independent | Native | Yes | No | Yes (currency/pricing context) |
| Currency | Pricing/Region modules | PKR/AED | cart.currency_code (required, non-null — verified model) | independent | Native | Yes | No | Yes (money semantics) |
| Customer | Customer module | Buyer identity | cart.customer_id (nullable) | independent | Native | Yes | No (auth) | Yes (ownership, order customer) |
| Customer address | Customer module (`customer_address`) | Saved addresses | separate from cart addresses | independent | Native | Yes | No | Indirect (copy into cart) |
| Sales channel | Sales Channel module | Distribution channel | cart.sales_channel_id; `sales_channel_stock_location` links | independent | Native | Yes | No | Yes (context) |
| Inventory item / level / reservation | Inventory module | Availability + reservation | line item → variant → inventory item; reservation_item.line_item_id | inventory spec owns | Native | Yes | No | Yes (reserved at completion) |
| Stock location | Stock Location module | Warehouse | reservation_item.location_id | inventory spec owns | Native | Yes | No | Yes (location_ids into reservation) |
| Promotion / Campaign | Promotion module | Discounts/coupons | cart promotions, line-item adjustments | active/expired/usage-limited | Native | Yes | No | Yes (adjustments; `registerUsageStep` at completion) |
| Tax region / rate | Tax module | Tax configuration | region + address → tax lines | markets spec owns | Native | Yes | No | Yes (`updateTaxLinesWorkflow`) |
| Shipping option / method | Fulfillment + Cart modules | Carrier-bound option; chosen method on cart | cart.shipping_methods → shipping_option_id | shipping spec owns | Native | Yes | No | Yes (validated price) |
| Payment collection / session | Payment module | Payment boundary | cart → payment collection (created separately) | Payments spec owns | Native | Yes | No | Yes (`validateCartPaymentsStep`, authorize last) |

**No custom tables prescribed.** Every requirement is satisfiable with native Medusa persistence.

## 8. Cart Lifecycle (Verified State Model)

**Medusa models cart state through multiple concepts — not a single enum.** Verified from the installed `cart` model:

- **State fields:** `completed_at` (nullable dateTime — set when the cart is converted to an order), soft-delete (`deleted_at`), `customer_id` (nullable), `currency_code` (required). There is **no `status` field** on the cart.
- **Active cart:** no completion marker; mutable via line-item/shipping/promotion/update routes.
- **Completed cart:** `completed_at` set by `updateCartsStep` inside `completeCartWorkflow`; the `order_cart` link records the created order. A completed cart returns the existing order on further completion attempts (idempotency, verified in `complete-cart.js`).
- **Deleted cart:** soft-deleted; line items cascade (adjustments + tax_lines cascade — verified model).

**Valid transitions (verified):**

| From | To | Trigger (who) |
| --- | --- | --- |
| Active | Completed | `POST /store/carts/{id}/complete` (customer or guest, backend workflow) |
| Active | Deleted | Admin/module-level delete (no store route verified) |
| Completed | — | terminal; only the order continues |

**Forbidden:** completing a cart with no items (`validateCartItemsStep` throws `INVALID_DATA: Cannot complete a cart with no items` — verified); mutating line items of a completed cart through the store routes (fails as cart-not-found/empty per workflow validation — to be confirmed in API tests); any client-driven completion (no client-supplied "complete" flag).

**Expiration / abandoned interpretation:** Medusa has **no native expiration or abandoned state**. Business interpretation required (Business Decision Register B-CC-01). Important verified consequence: **no inventory is reserved at cart creation or add-to-cart** (see §14), so abandoned carts hold no reservations that need release.

## 9. Cart Ownership

Verified middleware (`/store/carts` middlewares.js): all cart mutation routes take the cart ID as the access credential — **no auth required** for guest cart operations (create, get, update, line-items, promotions, shipping-methods, taxes, complete). The **only authenticated cart route** is `POST /store/carts/{id}/customer` with `authenticate("customer", ["session", "bearer"])`.

Consequences and rules:

- **Anonymous/guest cart:** identity = cart ID (unguessable `cart_*` prefixed ID). The storefront stores it in the `_medusa_cart_id` cookie.
- **Customer cart:** cart has `customer_id`. **Critical verified fact:** Medusa's store cart routes do **not** enforce `customer_id` ownership server-side by default — possession of the cart ID grants access. Therefore the **storefront must treat the cart ID as a bearer credential** (httpOnly cookie, never leaked into URLs/logs), and the project must decide whether to add ownership enforcement (Technical Decision Register T-CC-01).
- **Guest→customer association:** authenticated `POST /store/carts/{id}/customer` → `transferCartCustomerWorkflow` (verified workflow exists; `StoreUpdateCartCustomer` validator is `{}` strict — identity comes from auth, body must be empty).
- **Access after login/logout:** the cart cookie persists; the storefront decides whether to associate the current cart on login and whether to clear it on logout (business/UX decision — B-CC-03).

**Explicit invariant (REQ-CC-003):** a customer must never read or mutate another customer's cart. Enforcement is server-side, never frontend visibility. Because the native store routes are cart-ID-addressed, this invariant is satisfied for guests by credential secrecy and for customers by the **application-level ownership decision (T-CC-01)** — a documented, verified gap, not an assumption.

## 10. Guest Checkout

- Guest carts are created without authentication (`POST /store/carts` — no auth middleware verified).
- Guest checkout completes via the same `completeCartWorkflow`; the cart carries `email` (nullable, set via cart update) for order/notification identity.
- **Verified native fact:** `createCartWorkflow`/`updateCartWorkflow` call `findOrCreateCustomerStep({ customerId, email })` — a cart created or updated with an **email** gets a `customer_id` set (customer auto-created, `has_account = false`). A guest cart is therefore not distinguishable from a customer cart by `customer_id` alone; guest access relies on the unguessable cart ID as a bearer credential (see T-CC-01 enforcement semantics).
- Guest order ownership: order is tied to the cart; no customer account required.
- **Required business decision:** whether guest checkout requires email (B-CC-06) and what address fields are mandatory (B-CC-07).
- Notifications/consent for guest orders follow the notifications spec (AGENTS.md §18).

## 11. Customer Checkout

- Customer carts are associated via authenticated `POST /store/carts/{id}/customer` (the only auth-required cart route — verified).
- Customer checkout: same `completeCartWorkflow`; order is created with the cart's `customer_id`.
- Authentication is **Medusa-native** (email/password + Google OAuth, `authentication-authorization.md`). No Better Auth, no custom persistence.
- Authentication is required **only** for: (a) cart→customer association; (b) access to `/store/customers/me` resources. It is **optional** for cart creation, cart mutation, and checkout completion (guest checkout, §10).
- Whether a guest cart must be converted to a customer cart before checkout is a business decision (B-CC-08).

## 12. Market / Currency Behavior

Integrates with markets-and-pricing.md (does not redefine). Verified mechanics:

- **Cart market:** `cart.region_id` (nullable on the model). Region resolution at creation uses `findOneOrAnyRegionStep` inside `createCartWorkflow` (verified).
- **Cart currency:** `cart.currency_code` is **required and non-null** (verified model) — the cart's single authoritative currency.
- **Currency mismatch:** a cart in PKR cannot transact in AED. The backend resolves prices for the cart's region/currency; the frontend never supplies a currency or price.
- **Changing market/region:** `updateCartWorkflow` can change `region_id`; behavior of existing line items on region change (reprice? remove?) is **not** automatic recalculation of persisted `unit_price` — this is the price-snapshot vs recalculation decision (T-CC-02, B-CC-05). Markets-and-pricing.md leaves market switching open; referenced, not invented.
- **Checkout after market change:** completion uses the cart's current region/currency context; promotion eligibility, shipping options, and tax are re-evaluated against the current cart (verified: `updateCartPromotionsWorkflow` removes stale adjustments; `addShippingMethodToCartWorkflow` validates option price; `updateTaxLinesWorkflow` recomputes tax).
- Promotion/currency restrictions: promotions carry `currency_code` (verified in markets-and-pricing spec) — a PKR-only promotion cannot apply to an AED cart; enforced by the Promotion module's application rules.

## 13. Pricing Behavior

Verified mechanics:

- **Backend authority:** the browser submits only `variant_id` + `quantity` (+ metadata) for line items (`StoreAddCartLineItem` validator — verified). It never submits a price. `is_custom_price` exists on the line item but is a system flag, not a client input.
- **Price resolution:** `addToCartWorkflow` fetches variants with prices for the cart's region/currency context and persists `unit_price` (+ `compare_at_unit_price`) on the line item — **a price snapshot** (verified model fields, `getVariantsAndItemsWithPricesStep`).
- **Price snapshots vs recalculation:** line-item `unit_price` is persisted. After catalog/price-list changes, the cart's persisted line prices do **not** auto-update; `refreshCartItemsWorkflow` exists (verified) for explicit refresh. **Decision needed (T-CC-02):** whether to refresh line prices on cart access (repricing policy) — affects stale-price UX and completion totals.
- **Totals:** all totals (`total`, `subtotal`, `tax_total`, `discount_total`, `shipping_total`, `item_*`, `original_*`) are **computed** fields on the cart/line-item models (verified) — derived, never client-supplied.
- **Completion:** the order is built from the **cart snapshot** at completion (`createOrdersStep(cartToOrder)` — verified); the order is not recalculated from current catalog prices. Completion does not re-fetch variant prices.
- **Rounding/precision:** money is `bigNumber` with integer minor-unit arithmetic (`MathBN`); no floating point (AGENTS.md §7; verified `raw_*` fields). Rounding policy is a business decision (B-CC-10 per markets-and-pricing register).

## 14. Inventory Behavior

References inventory-and-warehouses.md (authoritative). Verified timing:

- **Cart creation:** no inventory involvement.
- **Add to cart:** `addToCartWorkflow` runs `confirmInventoryStep` — an **availability check without reservation** (`inventoryService.confirmInventory(item_id, location_ids, qty)`); throws `NOT_ALLOWED` with code `INSUFFICIENT_INVENTORY` when coverage is insufficient, **unless `allow_backorder`** (verified step source).
- **Checkout completion:** `completeCartWorkflow` runs `reserveInventoryStep` **in parallel with order creation** (verified); reservations are created per line item per location under the LOCKING module (per-inventory-item keys); step compensation deletes reservations on rollback.
- **Order fulfillment:** consumes reservations (verified in inventory spec §16).
- **Cancellation/failure:** `cancelOrderWorkflow` → `deleteReservationsByLineItemsStep` restores (verified in inventory spec).
- **No reservation expiration:** no native reservation TTL verified — release happens via cancellation/fulfillment/failure paths (inventory spec).
- **Backorder:** native reservation-level `allow_backorder` exists; per-variant backorder policy is a **business decision** (inventory spec §18; B-CC-09 references it).
- Concurrency: final-unit race is protected by the LOCKING module inside reservation (see §20).

## 15. Promotion Behavior

Verified mechanics (`updateCartPromotionsWorkflow`, `update-cart-promotions.js`):

- **Apply:** `POST /store/carts/{id}/promotions` (code-based) → removes existing line-item/shipping-method adjustments, runs `updateCartPromotionsStep` (validates codes/eligibility/currency/usage), then refreshes the payment collection (verified).
- **Remove:** `DELETE /store/carts/{id}/promotions/{code}` (verified route).
- **Eligibility:** evaluated server-side by the Promotion module (codes, dates, usage limits, customer/product/category restrictions, currency, minimum order value where configured). Policy rules (stacking, minimum order value) are **business decisions** (B-CC-11 per markets-and-pricing register) — not invented here.
- **Expiration/expiry:** expired/ineligible codes are rejected at application and re-evaluated on cart updates; usage is **committed at completion** via `registerUsageStep` (verified inside `completeCartWorkflow`) — the authoritative redemption point, preventing double redemption of one order.
- **Recalculation:** promotions recalc on every cart change that touches items/shipping; payment collection refreshed (verified).
- **Concurrent redemption:** usage registration happens inside the cart-locked completion workflow (see §20).

## 16. Tax Behavior

Boundary only (rates are business decisions per markets-and-pricing.md):

- **Mechanism:** `POST /store/carts/{id}/taxes` → `updateTaxLinesWorkflow` (verified route handler) computes tax lines for the cart via the Tax module (region + addresses + tax-inclusive flags on line items/shipping methods).
- **Timing:** tax lines recomputed on demand and during cart updates; order snapshot preserves computed tax at completion (order built from cart snapshot — §13).
- **Tax region selection:** driven by cart region + shipping address country (Tax module); PK/UAE rates **unresolved** (B-CC-12).
- **Tax-inclusive/exclusive:** line items carry `is_tax_inclusive` (verified); display policy is a business decision (B-CC-13 per markets-and-pricing register).
- **Failure:** tax failure fails cart update/completion safely; never displays fabricated tax.

## 17. Address Behavior

Verified model (`cart` module `address`): `customer_id` (nullable — guest addresses persist without a customer), `company`, `first_name`, `last_name`, `address_1`, `address_2`, `city`, `country_code`, `province`, `postal_code`, `phone`, `metadata`.

- **Shipping/billing addresses:** attached to the cart (hasOne, foreignKey — verified). Addresses are copied into the order at completion.
- **Required fields / validation:** **no store-route-level required-field validation verified** — field requirements are a business decision (B-CC-07). PK and UAE address structures differ (province/postal expectations); do not assume identical — a per-market address policy is required.
- **Market consistency:** shipping address `country_code` should match the cart's region countries (markets-and-pricing.md). Enforcement policy is a business decision (B-CC-07).
- **Customer address persistence:** saved customer addresses (`/store/customers/me/addresses`, verified routes) are a separate concern; the cart address is independent.
- **Privacy/security:** addresses contain personal data; never logged in full (AGENTS.md §15; §24 here).

## 18. Checkout Workflow (Verified Sequence)

`POST /store/carts/{id}/complete` → `completeCartWorkflow` (verified from `complete-cart.js`):

```
1. acquireLockStep            key = cart id; timeout 30s; ttl 2min  (cart-level lock)
2. query order_cart link      idempotency: if an order exists for this cart, return it
3. query cart (full fields)
4. validateCartItemsStep      empty cart → INVALID_DATA (cannot complete)
5. validateCartPaymentsStep   payment sessions must be valid; compensatePaymentIfNeededStep
6. createHook("validate")     extension point (project may add validations)
7. query shipping options + validateShippingStep   (selected methods valid for cart)
8. createOrdersStep(cartToOrder)   ← order built from cart snapshot (prices/tax/shipping as computed)
9. parallel: createRemoteLinkStep (order↔cart link) + updateCartsStep(completed_at)
            + reserveInventoryStep (reserve) + registerUsageStep (promotion usage) + emitEventStep
10. createHook("beforePaymentAuthorization")
11. authorizePaymentSessionStep   ← payment authorized/captured LAST
12. addOrderTransactionStep
13. createHook("orderCreated")
14. releaseLockStep
```

Key verified semantics: the order is created **before** payment authorization (minimizes rollback window); on payment failure, `compensatePaymentIfNeededStep` handles compensation; re-completion of a completed cart returns the same order (idempotent). **Note:** the workflow is declared `idempotent: false` at the workflow-engine level; its idempotency comes from the `order_cart` lookup + cart lock — verified behavior.

## 19. State Transitions

Consolidated from §8/§18:

- Cart: Active → Completed (completion workflow, `completed_at`); Active → Deleted (soft delete).
- Line item: Added → Updated → Removed (qty 0 = remove, verified).
- Order: created in completion workflow; order-state machine is owned by the Orders spec.
- Reservation: created at completion; consumed at fulfillment; released at cancellation/failure (inventory spec).
- Promotion usage: registered once at completion (`registerUsageStep`).

## 20. Concurrency Model

| Race | Authoritative source | Expected result | Protection (verified) | Test |
| --- | --- | --- | --- | --- |
| Two tabs update same cart | Cart module (DB) | last-write-wins per field update | cart mutations are server-side; no client merge | API test: sequential updates |
| Two checkout requests (same cart) | order_cart link + cart lock | one order; second returns same order | `acquireLockStep` (cart id, 30s timeout) + order_cart idempotency check | concurrency test: parallel completes |
| Two customers, final unit | Inventory module | at most one reservation succeeds | LOCKING module per inventory item inside `reserveInventoryStep` | concurrency test: 1 unit / 2 customers |
| Cart update while completion running | Cart lock (completion) vs update route | completion uses its snapshot; update may proceed but cart is completed | lock scopes completion; outcome per workflow semantics | integration test |
| Price change during checkout | Pricing module | order uses cart snapshot at completion (verified) | snapshot model | API test: price change before complete |
| Promotion usage race | Promotion module | usage registered once per order | `registerUsageStep` inside locked completion | concurrency test |
| Retry after timeout / duplicate HTTP | order_cart link | no duplicate order | idempotency (§21) | duplicate-request test |

## 21. Idempotency Model

| Operation | Key owner | Scope/lifetime | Duplicate behavior | Mechanism (verified) |
| --- | --- | --- | --- | --- |
| Cart creation | storefront (no key) | — | creates distinct carts (create is not idempotent by design) | createCartWorkflow |
| Cart mutations | cart id | cart lifetime | last-write-wins; qty/update validators reject invalid input | update workflows + zod validators |
| Checkout completion | **cart id** | completed cart (permanent) | returns the same order; no second order, no double reservation, no double promotion usage | `acquireLockStep` + `order_cart` lookup + snapshot order (verified) |
| Order creation | cart id | — | same as completion | `createOrdersStep` inside locked workflow |
| Promotion redemption | cart id (at completion) | per order | usage registered once | `registerUsageStep` (verified) |
| Inventory reservation | cart id / line items | released on cancel/failure | compensation deletes on rollback; reservation create is idempotent per line item in locked flow | `reserveInventoryStep` + compensation (verified) |
| External callbacks (payment webhooks) | Payments spec | — | idempotency required (AGENTS.md §15) | Payments spec owns |

No custom idempotency infrastructure prescribed — native mechanisms suffice for the cart domain.

## 22. Security Model

Threats and invariants:

- **Cart ID leakage/token leakage:** cart ID is a bearer credential for guest carts. Storefront: httpOnly cookie (`_medusa_cart_id`), never in URLs/logs. Leaked ID grants read/mutate of that cart (native behavior) — mitigated by credential hygiene + optional ownership layer (T-CC-01).
- **IDOR / cross-customer access:** invariant REQ-CC-003. Native routes are ID-addressed; enforce at application layer for customer carts (T-CC-01).
- **Customer impersonation:** auth is Medusa-native; cart→customer association requires valid customer session (verified middleware).
- **Guest cart hijacking:** prevented by unguessable IDs + cookie security (no client-side storage of other users' cart IDs).
- **Quantity manipulation:** quantity validated server-side (`> 0` add; `>= 0` update; 0 removes — verified validators); availability checked at add and reserved at completion.
- **Price/total/discount/tax manipulation:** impossible — backend resolves/persists all monetary values; client sends only variant_id/quantity/address/option/code (verified validators).
- **Inventory manipulation:** no store inventory mutation routes (inventory spec REQ-INV-012).
- **Market/currency manipulation:** cart currency is backend-owned; client cannot set currency on update (currency not in `StoreUpdateCart` client surface — verified: update includes region_id/email/sales_channel_id, not currency).

  *Correction note:* `StoreCreateCart` accepts `currency_code`/`region_id`/`sales_channel_id` at creation (verified validator) — creation context comes from the storefront (region selection per market-selection decision in markets-and-pricing.md); **completion and pricing still resolve server-side**, so creation-time input cannot fabricate totals.
- **Address manipulation:** address data is client-supplied by design (legitimate input) but validated for market-country consistency at the application layer (B-CC-07).
- **Checkout replay / duplicate order:** prevented by completion idempotency (§21).
- **CSRF/session abuse:** `_medusa_jwt` httpOnly sameSite=strict (verified starter cookies); store cart routes are CSRF-insensitive (ID-addressed, not cookie-authenticated).
- **Malformed input:** zod validation on every route (verified middlewares).
- **Rate abuse:** rate limiting on auth/checkout/coupon paths required (AGENTS.md §14) — T-CC-03.

## 23. Error Model

Deterministic categories (server-side; never leak internals/stacks/secrets):

| Category | Native signal (verified) | Behavior |
| --- | --- | --- |
| Cart not found | 404 on cart routes | return not-found; clear cookie |
| Invalid cart (no items) | `INVALID_DATA: Cannot complete a cart with no items` (validateCartItemsStep) | block completion |
| Unauthorized cart (customer ownership) | application layer (T-CC-01) | 403; never reveal existence of another cart |
| Invalid variant | product/variant query fails at add | reject add |
| Insufficient inventory | `NOT_ALLOWED` code `INSUFFICIENT_INVENTORY` (confirmInventoryStep) | reject add with availability message |
| Invalid quantity | zod (`> 0` / `>= 0`) | 400 validation error |
| Invalid market/currency | region/currency resolution | reject create/update |
| Promotion invalid/expired | `updateCartPromotionsStep` | reject code with reason |
| Tax failure | tax workflow error | fail update/completion safely |
| Shipping selection invalid | `validateShippingStep` / option-price validation | reject method |
| Checkout already completed | order_cart lookup | return existing order (idempotent) |
| Duplicate checkout | same as above | same order |
| Concurrent mutation | lock timeout | retryable error with backoff |
| Downstream failure (DB/Redis/provider) | workflow error | 5xx; no partial success; compensation (§21) |

## 24. Observability

Structured logging with context (cart id, order id, customer id, region/currency) for: cart creation; cart mutation; add/update/remove line item; promotion apply/remove; tax calculation; shipping method add; checkout initiation; completion success/failure; inventory insufficiency; promotion rejection; tax/shipping failures; order creation. **Never log:** passwords, tokens, payment credentials, secrets, full PII (addresses/emails redacted where avoidable) (AGENTS.md §15).

## 25. API Boundaries

Verified store routes (`@medusajs/medusa@2.19.0/dist/api/store`):

| Route | Method | Auth | Workflow (verified) |
| --- | --- | --- | --- |
| `/store/carts` | POST | none | createCartWorkflow (region resolve via findOneOrAnyRegionStep) |
| `/store/carts/:id` | GET/POST | none | updateCartWorkflow |
| `/store/carts/:id/line-items` | POST | none | addToCartWorkflow (confirmInventoryStep) |
| `/store/carts/:id/line-items/:line_id` | POST/DELETE | none | updateLineItemInCartWorkflow |
| `/store/carts/:id/customer` | POST | **customer** | transferCartCustomerWorkflow |
| `/store/carts/:id/shipping-methods` | POST | none | addShippingMethodToCartWorkflow (option-price validation) |
| `/store/carts/:id/promotions` | POST/DELETE | none | updateCartPromotionsWorkflow |
| `/store/carts/:id/taxes` | POST | none | updateTaxLinesWorkflow |
| `/store/carts/:id/complete` | POST | none | completeCartWorkflow |
| `/store/shipping-options` | GET | none | listShippingOptionsForCartWorkflow |
| `/store/shipping-options/:id/calculate` | POST | none | calculateShippingOptionsPricesWorkflow |
| `/store/payment-collections` | POST | none | createPaymentCollectionForCartWorkflow (Payments spec) |

Note: **no `/store/customers/me/carts` listing route exists** in 2.19.0 (verified) — carts are addressed by ID; cart restoration relies on the cookie.

## 26. Medusa Capability Mapping

| Capability | Class | Evidence (verified) |
| --- | --- | --- |
| Cart creation/update/retrieval | A — native | cart module + createCartWorkflow/updateCartWorkflow |
| Line-item add/update/remove (qty 0 = remove) | A — native | StoreAdd/UpdateCartLineItem validators, addToCartWorkflow |
| Guest cart (ID-based) | A — native | no-auth cart routes; `_medusa_cart_id` cookie |
| Customer cart association | A — native | authenticated `/customer` route → transferCartCustomerWorkflow |
| Backend-authoritative pricing/totals | A — native | computed totals; line-item unit_price snapshot |
| Inventory availability check at add | A — native | confirmInventoryStep |
| Reservation at completion | A — native | reserveInventoryStep (LOCKING, allow_backorder) |
| Promotion apply/remove/usage | A — native | updateCartPromotionsWorkflow, registerUsageStep |
| Tax calculation | A — native | updateTaxLinesWorkflow |
| Shipping option/method selection | A — native | addShippingMethodToCartWorkflow, validateShippingStep |
| Completion idempotency | A — native | acquireLockStep + order_cart lookup |
| Market/currency on cart | A — native (config) | region_id/currency_code; region resolve at create |
| Price refresh policy (reprice on access) | D — customization/decision | refreshCartItemsWorkflow exists; policy unresolved (T-CC-02) |
| Customer-cart ownership enforcement | D — customization/decision | native routes ID-addressed; enforcement layer needed (T-CC-01) |
| Cart expiration/abandoned classification | F — business rule | no native state (B-CC-01) |
| Cart merge on login | F — business rule | no native merge workflow verified (B-CC-03) |
| Payment provider | E — external boundary | Payments spec |
| TCS/Aramex | E — external boundary | Shipping spec |
| Rate limiting on cart/checkout | B — configuration | AGENTS.md §14 (T-CC-03) |
| E2E checkout | — | test requirement (§30) |

## 27. Business Decision Register

**Resolution status (2026-08-16): all decisions resolved via the Business
Decision Phase. Canonical mapping per
`docs/architecture/consolidated-decision-register.md`; aliases point to the
owning decision.**

| ID | Decision | Why required | Options | Recommendation | Status | Canonical |
| --- | --- | --- | --- | --- | --- | --- |
| B-CC-01 | Cart expiration duration / guest cart lifetime | No native state; cleanup + abandoned-cart automation need a rule | No expiry / X days / session-only | **30-day guest cart lifetime; no reservation impact** | **APPROVED** | BD-C-01 |
| B-CC-02 | Cart restoration on return | Cookie persistence is native; restoration UX policy | Always restore / prompt / clear after order | Always restore via cookie | DEFERRED (P3) | BD-C-02 |
| B-CC-03 | Cart merge on login (guest → customer) | No native merge workflow verified | Merge / replace / keep both | Merge (native transfer + copy line items) | DEFERRED (P2) | BD-C-03 |
| B-CC-04 | Inventory reservation timing | Native = at completion (verified). Backorder/oversell policy may alter | Native (completion) / reserve at add (custom) | Native — reserve at completion (no backorders in V1) | **MEDUSA_DEFINED** | BD-I-08 |
| B-CC-05 | Market/currency switching on existing cart | Line-item reprice on region change not automatic | Reject switch / reprice / clear items | **Reject switch; customer starts a new cart** | **APPROVED** | BD-C-04 |
| B-CC-06 | Guest checkout email requirement | Order/notification identity | Optional / required | **Required** (transactional comms) | **DERIVED** (BD-G-01) | BD-C-05 |
| B-CC-07 | Address field requirements + market-country consistency (PK vs UAE) | No native required-field validation; PK/UAE structures differ | Minimal common fields / per-market schema | **Per-market required fields; country must match region** | **APPROVED** | BD-C-06 |
| B-CC-08 | Guest cart conversion before checkout | Order customer identity | Convert at login / allow guest complete / require login | **Allow guest complete; convert when logging in** | **DERIVED** (BD-G-01) | BD-C-07 |
| B-CC-09 | Backorder/overselling policy | Native allow_backorder exists; policy (inventory spec §18) | — | **No backorders in V1** | **APPROVED** (alias of B-INV-02) | BD-I-02 |
| B-CC-10 | Rounding policy | Money is integer minor units; display rounding | — | **Standard half-up, 2 decimals** | **APPROVED** (alias of B-MP-06) | BD-M-06 |
| B-CC-11 | Promotion stacking / minimum order value | Native mechanism; policy (markets register) | — | **Single active promotion; min order deferred** | **APPROVED** (alias of B-MP-04) | BD-M-04 |
| B-CC-12 | PK/UAE tax rates | Not invented | — | **Policy approved; numeric rates required** | **APPROVED** (alias of B-MP-01/02) | BD-M-02 |
| B-CC-13 | Tax-inclusive/exclusive display | Native flags; policy (markets register) | — | **Exclusive display** | **APPROVED** (alias of B-MP-03) | BD-M-03 |
| B-CC-14 | COD behavior | Payment-related business rule | — | **No COD in V1** | **APPROVED** (alias of B-PAY-03) | BD-P-03 |
| B-CC-15 | Checkout retry behavior | Payment retry UX | — | **Per payment retry policy (bounded retries)** | **DERIVED** (BD-P-05) | BD-C-08 |

## 28. Technical Decision Register

| ID | Question | Evidence | Recommendation | Depends on |
| --- | --- | --- | --- | --- |
| T-CC-01 | Customer-cart ownership enforcement: native store cart routes are cart-ID-addressed (no server-side `customer_id` check verified). Add an application-layer ownership check (custom store API middleware/route override or storefront-only guard)? | Verified middlewares.js: only `/customer` route authenticates; `createCartWorkflow` sets `customer_id` from email via `findOrCreateCustomerStep` | **DONE (2026-08-16):** global store middleware `/store/carts/:id` (`src/api/middlewares.ts` + pure helper `src/api/store/carts/ownership.ts`). Unauthenticated → guest bearer-credential model (allow; required for BD-G-01 guest checkout with email); authenticated actor ≠ `customer_id` → 403 (FORBIDDEN — `NOT_ALLOWED` maps to 400, verified), never revealing existence; unknown ID → native 404. Unit (7) + integration (8) tests | Security review |
| T-CC-02 | Price refresh policy: line-item `unit_price` is a snapshot; `refreshCartItemsWorkflow` exists. Refresh on every cart access vs on-demand vs never? | Verified model + refresh workflow | **DONE (2026-08-16, verification only):** `completeCartWorkflow` builds the order from the cart snapshot (`unitPrice: item.unit_price`) and never re-fetches catalog prices; `refreshCartItemsWorkflow` remains the explicit refresh mechanism. Per B-CC-05/BD-C-04 (reject market switch → new cart) no auto-reprice is required | Repricing policy |
| T-CC-03 | Rate limiting on cart/checkout/coupon paths | AGENTS.md §14; none configured (gap analysis) | Enable before launch | Production hardening |
| T-CC-04 | Cart locking/concurrency strategy: native LOCKING module (in-memory dev; Redis prod) | Verified acquireLockStep + reserveInventoryStep | Use native; enable Redis locking for multi-instance prod | Deployment |
| T-CC-05 | Redis involvement in cart: none for authoritative state; possible for lock/cache | AGENTS.md §3 | Keep Redis non-authoritative | — |
| T-CC-06 | API route boundaries: use native store routes; custom routes only for ownership enforcement (T-CC-01) and any market-switch policy (B-CC-05) | Verified routes | Native-first | T-CC-01, B-CC-05 |
| T-CC-07 | Storefront/server-action boundaries: starter uses server-side SDK calls (lib/data) with `_medusa_cart_id` cookie | Verified starter | Keep server-side; no client-only checkout | — |

## 29. Requirements (REQ-CC-###)

Every requirement: atomic, testable, implementation-neutral, unambiguous.

- **REQ-CC-001** — A guest can create a cart without authentication; the storefront persists the cart ID in a server-side cookie (`_medusa_cart_id`). Source: verified routes/middleware + starter cookies.ts. Test: API + E2E (guest cart).
- **REQ-CC-002** — A customer can associate an existing cart with their authenticated identity via `POST /store/carts/{id}/customer` (body empty; auth required). Source: verified validator `{}` strict + authenticate middleware. Test: API (auth required, empty body).
- **REQ-CC-003** — A customer must never read or mutate another customer's cart (server-side; never frontend visibility). Source: AGENTS.md §14; verified ID-addressed routes. Test: security tests A/B.
- **REQ-CC-004** — A cart has exactly one authoritative currency (`currency_code`, non-null) and one region; the client cannot set a currency at update. Source: verified model + update validator. Test: API.
- **REQ-CC-005** — Line items are added by `variant_id` + `quantity` only; quantity must be > 0 (0 removes on update). Source: verified validators. Test: API (zero/negative rejected).
- **REQ-CC-006** — Add-to-cart validates the variant exists and is purchasable; invalid/deleted variants are rejected server-side. Source: addToCartWorkflow variant fetch. Test: API (invalid variant).
- **REQ-CC-007** — Add-to-cart checks inventory availability (no reservation) and rejects with `INSUFFICIENT_INVENTORY` unless backorder policy allows. Source: confirmInventoryStep. Test: API + integration.
- **REQ-CC-008** — The backend resolves and persists line-item `unit_price`; the client never supplies price, discount, tax, or total. Source: verified validators + model. Test: API (client price input ignored/rejected).
- **REQ-CC-009** — All cart/order totals are backend-computed (computed fields), never client-supplied. Source: verified computed totals. Test: property test totals = f(items, prices).
- **REQ-CC-010** — Promotions are applied/removed only via the cart promotion routes; eligibility/currency/usage validated server-side; usage committed once at completion. Source: updateCartPromotionsWorkflow + registerUsageStep. Test: API + concurrency.
- **REQ-CC-011** — Tax lines are computed server-side (`updateTaxLinesWorkflow`) from region + addresses; never client-supplied. Source: verified taxes route. Test: integration (tax lines correct).
- **REQ-CC-012** — Shipping methods are added via validated route; option price is validated server-side. Source: addShippingMethodToCartWorkflow + validateCartShippingOptionsPriceStep. Test: API (invalid option rejected).
- **REQ-CC-013** — Checkout is the server-side `completeCartWorkflow`; completion with an empty cart is rejected (`INVALID_DATA`). Source: validateCartItemsStep. Test: API.
- **REQ-CC-014** — Completion is idempotent per cart: duplicate/concurrent completion yields the same order and single reservation/promotion-usage effects. Source: acquireLockStep + order_cart lookup. Test: concurrency tests.
- **REQ-CC-015** — Inventory is reserved at completion under per-inventory-item locking; released on cancellation/failure; never at cart creation/add. Source: reserveInventoryStep + cancelOrderWorkflow. Test: workflow + concurrency.
- **REQ-CC-016** — The order is created from the cart snapshot; later catalog price changes do not alter the order. Source: createOrdersStep(cartToOrder). Test: API (price change after complete).
- **REQ-CC-017** — Payment session validity is checked at completion; payment authorization occurs last, after order creation, with compensation on failure. Source: validateCartPaymentsStep + authorizePaymentSessionStep. Test: workflow (payment fail → no order? per payments spec: compensation).
- **REQ-CC-018** — Guest checkout completes without a customer account; the cart's email is used for order identity where provided. Source: guest cart routes + email field. Test: E2E guest checkout.
- **REQ-CC-019** — Customer checkout completes with the cart's associated customer; order ownership ties to that customer. Source: transferCartCustomerWorkflow + order. Test: E2E customer checkout.
- **REQ-CC-020** — Address data is validated (required fields, format, market-country consistency) at the application boundary before completion. Source: address model + decision B-CC-07. Test: API (invalid address).
- **REQ-CC-021** — No client can force completion, manipulate state, or fabricate order/payment/inventory status. Source: AGENTS.md §13/§14. Test: security tests.
- **REQ-CC-022** — Cart/checkout errors are deterministic and do not leak internals, secrets, or full PII. Source: error model §23. Test: API error-shape tests.
- **REQ-CC-023** — Structured logs cover cart/checkout lifecycle with context; sensitive data never logged. Source: AGENTS.md §15, §24 here. Test: code review / logging test.
- **REQ-CC-024** — Rate limiting protects abuse-prone cart/checkout/coupon/auth paths. Source: AGENTS.md §14. Test: rate-limit tests at launch.
- **REQ-CC-025** — Abandoned carts hold no reservations (native timing) and are classified only by an approved business rule. Source: verified no add-time reservation; B-CC-01. Test: workflow (no reservation after add).

## 30. Test Matrix

**Unit:** money/total invariants; quantity validation; promotion eligibility helpers; market-country validator; error mapping.

**Integration (real DB):** cart CRUD; line-item add/update/remove; snapshot pricing; tax lines; shipping method; promotion adjustments; reservation at completion; cancellation release.

**Workflow (Medusa):** completeCartWorkflow happy path; empty cart; payment failure compensation; duplicate completion; promotion usage single-commit; reservation rollback.

**API:** all routes with valid/invalid payloads; 401 on `/customer` without auth; invalid variant/quantity/promotion/shipping; insufficient inventory; currency/market mismatch; error shapes.

**Concurrency:** final unit (1 unit/2 customers → 1 reservation); simultaneous completion (1 order); duplicate completion request; simultaneous cart updates; promotion redemption race.

**Security:** customer A vs B cart access (read + mutate); guest cart isolation; client price/total/inventory/status manipulation attempts; checkout replay; malformed input.

**E2E (sandbox providers):** guest checkout; customer checkout; add → quantity update → remove; coupon apply/remove; out-of-stock; order creation; duplicate submit.

## 31. Requirement-to-Test Traceability

| Requirement | Test |
| --- | --- |
| REQ-CC-001 | API: guest cart create; E2E: guest checkout |
| REQ-CC-002 | API: `/customer` requires auth, empty body |
| REQ-CC-003 | Security: A↔B access read/mutate |
| REQ-CC-004 | API: currency immutable at update; one currency |
| REQ-CC-005 | API: qty >0 add; 0 removes |
| REQ-CC-006 | API: invalid/deleted variant |
| REQ-CC-007 | API: INSUFFICIENT_INVENTORY; backorder bypass |
| REQ-CC-008 | Security: client price ignored |
| REQ-CC-009 | Unit/property: totals computed |
| REQ-CC-010 | API + concurrency: promotion apply/remove/usage |
| REQ-CC-011 | Integration: tax lines from region/address |
| REQ-CC-012 | API: invalid shipping option rejected |
| REQ-CC-013 | API: empty cart completion → INVALID_DATA |
| REQ-CC-014 | Concurrency: parallel + duplicate completion → one order |
| REQ-CC-015 | Workflow: reservation at completion, release on cancel |
| REQ-CC-016 | API: price change post-completion doesn't alter order |
| REQ-CC-017 | Workflow: payment failure compensation |
| REQ-CC-018 | E2E: guest checkout |
| REQ-CC-019 | E2E: customer checkout |
| REQ-CC-020 | API: invalid address / market-country mismatch |
| REQ-CC-021 | Security: force-completion attempts |
| REQ-CC-022 | API: error shape + no leakage |
| REQ-CC-023 | Code review / logging verification |
| REQ-CC-024 | Rate-limit tests at launch |
| REQ-CC-025 | Workflow: no reservation at add |

## 32. Implementation Constraints

- Medusa-first: use native cart module, workflows, and store routes (§26). No custom cart persistence, no parallel checkout engine.
- Verification hierarchy (AGENTS.md §27): installed 2.19.0 source > official docs for the exact version > Context7 > inference. No v1 patterns.
- No business rule may be chosen from this spec's register without authorization (AGENTS.md §5).
- Tests before implementation (AGENTS.md §16 strict TDD); concurrency/security tests mandatory.
- No dependency additions without the AGENTS.md dependency protocol.

## 33. Definition of Done

The cart/checkout domain is complete only when: architecture inspected and Medusa capability verified; tests written first and passing (unit/integration/workflow/API/concurrency/security/E2E); happy + failure + authorization + validation paths tested; idempotency and concurrency demonstrated; TypeScript/lint/build pass; no unrelated files changed; no secrets; no business rule silently chosen; docs updated; backward compatibility preserved (existing carts/orders).

## 34. Verification Sources

- `@medusajs/cart@2.19.0` models: cart, line-item, address, shipping-method (fields, computed totals, cascades).
- `@medusajs/core-flows@2.19.0`: cart/workflows/{create-carts,update-cart,add-to-cart,complete-cart,update-cart-promotions,add-shipping-method-to-cart,update-tax-lines,transfer-cart-customer}; cart/steps/{confirm-inventory,reserve-inventory,validate-cart-items,validate-shipping-methods-data,validate-shipping-options-price}.
- `@medusajs/medusa@2.19.0`: api/store/carts/{route,middlewares,validators,[id]/line-items,[id]/customer,[id]/shipping-methods,[id]/promotions,[id]/taxes,[id]/complete}; api/store/shipping-options; api/store/payment-collections; api/store/customers.
- Starter storefront: `apps/storefront/src/lib/data/cookies.ts` (`_medusa_cart_id`), cart data lib.
- `docs/specifications/markets-and-pricing.md`, `docs/specifications/inventory-and-warehouses.md`, `docs/architecture/authentication-authorization.md`, AGENTS.md.
