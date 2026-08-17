# Testing

## Current State (Foundation — VERIFIED, 2026-08-16)

The Medusa backend ships a **Jest test harness** that has now been exercised
end-to-end:

- `apps/backend/jest.config.js` — Jest config with three suites:
  - `test:unit` → `**/src/**/__tests__/**/*.unit.spec.[jt]s`
  - `test:integration:http` → `**/integration-tests/http/*.spec.[jt]s`
  - `test:integration:modules` → `**/src/modules/*/__tests__/**/*.[jt]s`
- `apps/backend/integration-tests/setup.js` — test bootstrap
  (`MetadataStorage.clear()`).
- `apps/backend/integration-tests/http/health.spec.ts` — first integration
  test (smoke): boots the app via `medusaIntegrationTestRunner` against a
  disposable test database and asserts `GET /health` → 200. Requires
  `jest.setTimeout(120 * 1000)` (official Medusa pattern; the runner's
  `beforeAll` exceeds jest's 5s default hook timeout).
- The storefront has no test framework configured (next starter baseline).

### Integration harness prerequisites

- `apps/backend/.env.test` exists locally (gitignored): `DB_HOST`, `DB_PORT`,
  `DB_USERNAME`, `DB_PASSWORD` (derived from `DATABASE_URL`), `NODE_ENV=test`.
  `jest.config.js` loads `.env.test` together with `.env` (via
  `loadEnv("test")`); the runner reads `DB_*` vars — it does not parse
  `DATABASE_URL`.
- The `medusa` Postgres role has `CREATEDB` (granted 2026-08-16): the runner
  creates `medusa-<name>-integration-<worker>` databases, migrates them, and
  drops them on cleanup.

Run results (2026-08-18, after Safepay/Stripe sandbox verification and the
integration-suite fixes):

```text
pnpm --filter @dtc/backend test:unit            → PASS (214/214: browse helpers 37 + env-config validation 44 + medusa-config wiring 10 [5 auth + 5 Redis modules] + low-stock helper 10 + cart-ownership helper 7 + payment-config encryption 13 + payment-config utils 16 + Stripe runtime wrapper 14 + Safepay runtime config 9 + admin payment-config helpers 8 + Safepay adapter 54)
pnpm --filter @dtc/backend test:integration:http → PASS (127 tests / 12 suites: health 1 + markets 7 + inventory 12 + storage 7 + catalog 10 + browsing 35 + cart-ownership 8 + customer-auth 9 + payments 6 + shipping 6 + checkout 13 + payment-provider-config 13; run with `--forceExit` — STOP the local `medusa develop`/`pnpm dev` server first — its in-process BullMQ workers share the `events-queue`/workflow queues with the harness and cause `waitForEvent`-style timeouts)
pnpm --filter @dtc/backend lint                 → PASS
pnpm --filter @dtc/backend build                → PASS
pnpm --filter @dtc/storefront lint              → PASS (0 errors, 3 pre-existing warnings)
pnpm --filter @dtc/storefront test              → PASS (136 tests / 18 suites)
pnpm --filter @dtc/storefront build             → PASS (requires the dev backend running — the sitemap route fetches the live catalog; clear .next cache if stale region IDs persist)
```

### Customer authentication integration suite (`customer-auth.spec.ts`)

TDD suite for the approved auth decisions BD-AUTH-01..04 (9 tests, all
green; Phase 9, 2026-08-17). Proves: provider listing (emailpass only while
the Google gate is off); register returns an actorless token; unverified
login returns `verification_required: true` and the token cannot reach
`/store/customers/me` (401); the plaintext code is NOT in the verification
HTTP response but is delivered via the `auth.verification_requested` event
(captured by an event-bus subscriber, decoded and used against
`/auth/verification/confirm`); wrong password 401; duplicate registration
401; wrong verification code 4xx; a verified login yields a full token that
reaches `/store/customers/me` and binds carts created while unverified
(cart-ownership linkage via the publishable-key↔sales-channel link); and
the password-reset flow: `/auth/customer/emailpass/reset-password` → 201 for
unknown identifiers too (no identity leak), reset token via the
`auth.password_reset` event, `/auth/customer/emailpass/update` with the
bearer reset token, then the new password logs in and the old one no longer
does.

Harness facts learned:

- The auth verification routes are at `/auth/verification/request` and
  `/auth/verification/confirm` — there is no `/auth/customer/verification/*`
  path.
- The request-verification workflow strips the code from its HTTP response;
  tests must capture it from the `auth.verification_requested` event payload
  (subscribe before the request, unsubscribe in `finally`).
- Region/SC module `create` calls return a single object, not an array; region
  `countries` are plain ISO codes.
- Cart creation with a customer requires the publishable key to be linked to
  the cart's sales channel (400 otherwise); link via
  `ContainerRegistrationKeys.LINK` + `getLinkModule(...)` + `.create(keyId,
  channelId)`.

### Shipping & Fulfillment integration suite (`shipping.spec.ts`)

TDD suite for the Phase 5 per-market topology + native fulfillment (6 tests,
all green). Proves: option-eligibility market isolation (REQ-SHIP-007 — PK
cart sees only the PK option, AE only the AE option, via the channel + geo-zone
chain); same-market reservation allocation (BD-I-01/T-SHIP-14 — PK completion
reserves at Karachi, AE at Dubai); admin-only fulfillment consuming the
same-market reservation with the deduction at the fulfillment-set location and
no payment-state gate (REQ-SHIP-014/019, B-SHIP-24); shipment + native
`fulfillment_label` tracking storage (REQ-SHIP-015); cancel restores the full
reservation (REQ-SHIP-020); mark-as-delivered (REQ-SHIP-016). Also proves the
store surface cannot create fulfillments.

### Payments integration suite (`payments.spec.ts`)

TDD suite for the native payment pipeline (6 tests, all green; Phase 5).
Proves: region-scoped store provider listing via `region_payment_provider`
(REQ-PAY-003 — updated 2026-08-17 to the dev-seed contract: both markets
list `pp_system_default`, re-binding is idempotent, a fresh region with no
bindings exposes zero providers, missing `region_id` → 400); collection +
single-authoritative-session creation
(REQ-PAY-004/030); authorize-at-completion order-first flow (REQ-PAY-006);
capture-once + duplicate-capture idempotency (REQ-PAY-010/031); refund ≤
captured + over-refund rejection (REQ-PAY-011); the native webhook pipeline
`POST /hooks/payment/:provider` → `payment.webhook_received` → shipped
subscriber → `processPaymentWorkflow` (REQ-PAY-027).

Harness facts learned:

- The store payment-collection DTO exposes only `id`/`currency_code`/`amount`/
  `payment_sessions` — verify the cart link via the remote link module instead.
- The Payment DTO's `captured_amount`/`refunded_amount` are computed from the
  `captures`/`refunds` relations — load them (`payments.captures`,
  `payments.refunds`) and sum `entry.amount` for deterministic assertions.
- A duplicate full capture returns **200** (idempotent short-circuit on
  `captured_at`) — assert "no second capture record", not an error status.
- The webhook event is emitted with a 5000ms `webhook_delay`; the shipped
  subscriber is a `not_supported` early-return, so `waitSubscribersExecution`
  resolves to `undefined` — capture the event with `eventBus.subscribe` +
  a poll loop instead.
- Admin token flow: register → `POST /auth/user/emailpass` (emailpass has no
  `validateCallback` in 2.19.0; the login returns the JWT directly).

### Backend env-config validation unit suite (`src/config/__tests__/env.unit.spec.ts`)

TDD suite for `src/config/env.ts` (21 tests, all green). Covers:
`getMissingEnvVars` (complete env → empty; missing `DATABASE_URL`; **missing
`REDIS_URL`**; all-missing sorted; empty-string treated as missing; S3 vars
**not** required when `FILE_PROVIDER` unset/local; full `S3_*` set required
when `FILE_PROVIDER=s3`; partial S3 sets; **Google auth vars not required
unless `AUTH_GOOGLE_ENABLED=true`, full set required when enabled, only absent
ones reported, other gate values need nothing**) and `assertEnv` (no-throw on
complete env; throws a `MedusaError` naming every missing var; throws when S3
selected without its vars; **throws when Google auth is enabled without its
vars**). Wired into `medusa-config.ts` **after** `loadEnv` and **skipped when
`NODE_ENV=test`** — the integration runner loads the real config and supplies
its own disposable database connection (verified: integration suite still
PASS with the guard in place).

### Backend medusa-config unit suite (`src/config/__tests__/medusa-config.unit.spec.ts`)

TDD suite for the `medusa-config.ts` wiring (10 tests, all green). Two groups:

- **Customer authentication (5 tests, BD-AUTH-01..03):** the auth module
  registers `emailpass` always and `google` only when the env gate is enabled
  with all `GOOGLE_*` vars; session lifetime `1d`; email verification
  required for emailpass customers.
- **Redis-backed infrastructure (5 tests, REDIS WIRING = ENABLE NOW):** the
  cache module resolves `@medusajs/medusa/cache-redis` with `options.redisUrl`;
  the caching module resolves `@medusajs/medusa/caching` with the `redis`
  provider (`@medusajs/medusa/caching-redis`); the event bus resolves
  `@medusajs/medusa/event-bus-redis` with `options.redisUrl`; the workflow
  engine resolves `@medusajs/medusa/workflow-engine-redis` with
  `options.redis.redisUrl` (the runtime contract — the loader destructures
  `options?.redis`, verified in installed 2.19.0); the locking module
  resolves `@medusajs/medusa/locking` with the `redis` provider
  (`@medusajs/medusa/locking-redis`).

### Browsing integration suite (`browsing.spec.ts`)

TDD suite for `src/api/store/products/browse` (35 tests, all green; see
ADR-0003). Covers: listing shape (store fields + prices + inventory +
stripped metadata), 8 validation errors, sales-channel scoping (second
channel with products / empty channel → early empty response), sorting
(created_at default, title, price asc/desc, best_selling, relevance),
filtering (gender, brand, season, material, size/color option values,
category, tag, q, **handle** and **id** — the PDP/add-to-cart lookup
paths, price range, AND semantics), availability (all default,
in_stock/out_of_stock, zeroed inventory levels), and pagination (exact
count, consistent count with filters, empty page past the end).

Key harness facts learned while writing the suite:

- axios has **no** `query` config option — query params must be built into
  the URL (a `query:` key is silently ignored → 400s).
- Runner axios throws on 4xx by default — use `validateStatus: () => true`
  for validation-error tests.
- Product `metadata` is intentionally stripped from the browse response
  (assert `undefined`).
- Option values are per-product: a product's own option value ids only match
  that product.
- Zeroing inventory must cover **all** variants of a product, and the
  availability helper caches with tags (inventory updates invalidate them —
  the framework's `getVariantAvailability` cache contract).

### Markets & Pricing integration suite (`markets.spec.ts`)

TDD suite for `src/migration-scripts/seed-markets.ts` (7 tests, all green):

1. Creates Pakistan/UAE regions with their countries (countries relation
   required: `listRegions({}, { relations: ["countries"], take: null })`).
2. Creates zero-rate tax regions for `pk`/`ae` (rates pending business
   decisions; asserted via `listTaxRates({ tax_region_id })` — `TaxRegionDTO`
   has no `rates` field).
3. Links a publishable API key to the sales channel (≥1 link: the test app
   boots before seeding, so `createDefaultsWorkflow` plus the starter seed
   produce two key/channel sets in the test DB — production has exactly one).
4. Adds pkr/aed prices with region rules to every variant price set while
   preserving existing eur/usd prices. The seed must pass ALL existing prices
   with ids (pricing's `updatePriceSets` deletes unlisted prices).
5. Store API resolves region-correct calculated prices: `GET
   /store/products?region_id=<id>` with `x-publishable-api-key` header →
   `calculated_price` in pkr/aed with the demo amounts. `currency_code` is
   **not** a valid store products query param (400) — currency comes from the
   region. The test resolves the key linked to the channel containing products.
6. Idempotency: re-running `seedMarkets` (not the non-idempotent starter seed)
   changes no counts.
7. The dev/test payment provider binding: both PK and AE regions list
   `pp_system_default` via `GET /store/payment-providers?region_id=` (the
   store API is the only observable surface for the `region_payment_provider`
   link — the region model has no `payment_providers` relation and the link
   service is not resolvable via remoteQuery in the app). Verified with the
   publishable-key header; without `region_id` the route 400s natively.

Test-environment facts (verified against installed 2.19.0):

- `api` in the test suite is **axios** (headers go in the request config, not
  `.set()`).
- All `/store/*` routes require the `x-publishable-api-key` header
  (`ensurePublishableApiKeyMiddleware` is global); without it
  `filterByValidSalesChannels` throws.
- `utils.waitWorkflowExecutions()` takes no arguments.
- `hooks.beforeServerStart` only has CONFIG_MODULE/LOGGER registered — module
  services are unavailable there; seeding happens in the test suite.
- The test DB does not run migration scripts: the "Default Shipping Profile"
  (type `default`) must be created in test setup before the starter seed runs.
- **The runner restores the DB snapshot before EVERY test** (snapshot taken
  after the suite's `beforeAll`). Every test starts from the seeded state;
  mutations in one test never leak into the next, so each test must be
  self-contained (no cross-test fixtures).

### Cart & Checkout ownership integration suite (`cart-ownership.spec.ts`)

TDD suite for **T-CC-01** (customer-cart ownership enforcement,
REQ-CC-003) — `src/api/middlewares.ts` + the pure decision helper
`src/api/store/carts/ownership.ts`. Covers: unauthenticated guest cart
access (ID as bearer credential); guest carts created with an email remain
mutable unauthenticated (BD-G-01 — native `findOrCreateCustomerStep` sets
`customer_id` from email); the owning customer accessing their cart;
another authenticated customer rejected with **403** (never revealing
cart existence); unauthenticated ID access to a customer-owned cart allowed
(guest bearer model); subroute (line-items) enforcement; native 404
preserved for unknown cart IDs. Customers are registered through the native
Medusa auth flow (register → `/store/customers` link → login JWT), which
also proves the store bearer-auth path populates `req.auth_context`.

### Cart & Checkout foundation integration suite (`checkout.spec.ts`)

TDD suite proving the **native** Medusa 2.19.0 cart/checkout contract the
storefront relies on (13 tests, all green; Phase Cart & Checkout
foundation, REQ-CC-004..022):

- Create cart: region required; unknown region → 400; client currency
  rejected (`.strict()` validator → `invalid_data`), currency resolved from
  the region; line items + calculated prices returned.
- Update cart: price/shipping fields not accepted (strict validator,
  400); discounts applied to the DTO totals.
- Line items: add (quantity + tax), quantity updates, removal, variant
  not-found → 400, over-inventory add → 400.
- Shipping: manual fulfillment option listing per region, add shipping
  method, invalid method → 400.
- Payment sessions: create (no capture), update (bad payload → 400),
  complete flow.
- Completion: empty cart → "Cannot complete a cart with no items"; missing
  shipping → "No shipping method selected…"; missing payment collection →
  "Payment collection has not been initiated for cart"; full flow
  (addresses → shipping → payment sessions → complete) → order created
  with the cart's region/currency and line items; re-completion is
  rejected once the cart is completed.

Verified 2.19.0 contracts recorded here (checkout.spec.ts asserts these):

- Store error shape: `{ message, type }`, `type` derived from status
  (400 → `invalid_data`, 401 → `unauthorized`, 404 → `not_found`).
- Store cart/order DTO totals are **tax-inclusive**: `item_total =
  item_subtotal + item_tax_total`, `total = item_total + shipping_total`
  (NOT `+ tax_total`); line items expose `unit_price`, `quantity`,
  `tax_lines` (no `total`/`subtotal`, no tax-line `amount` in defaults).
- `pricingModule.updatePrices` is the array form
  `updatePrices([{ id, amount }])`; `{selector,update}` crashes. The Price
  entity has no `variant_id` filter — resolve `variant → price_set` via
  `remoteLink.getLinkModule(Modules.PRODUCT, "variant_id",
  Modules.PRICING, "price_set_id")` then `listPrices({ currency_code,
  price_set_id })`.
- `orderModule.listOrders` crashes ("Shipping method version is required
  to load adjustments") → use `query.graph({ entity: "order", fields:
  ["id", "customer_id"] })`.
- Verified-customer helper: register → `POST /store/customers` with the
  actorless token (links the auth identity to the customer) → verification
  request/confirm → login; lowercase `authorization` header.
- Payment-session creation does **not** check region binding
  (create-payment-sessions workflow has no region check).
- `updateTaxLinesWorkflow`/`update-tax-lines` run at cart create and on
  line-item/shipping changes; totals are computed in the DTO layer.

### Inventory & Warehouses integration suite (`inventory.spec.ts`)

TDD suite for `src/migration-scripts/seed-inventory.ts`, the native
inventory semantics the seed relies on, and the BD-I-03 low-stock trigger
(12 tests, all green):

1. Creates the Karachi (pk) and Dubai (ae) demo warehouses with market
   addresses, keeping the starter's European Warehouse (DK) untouched.
2. Links every warehouse to the sales channel (re-runs of the seed add no
   links).
3. Links every variant with an SKU to an inventory item that has a stock
   level at every warehouse (3 levels per item, demo quantity 100, reserved 0).
4. Rejects reservations that exceed the available quantity at a location
   (`createReservationItems` — the inventory module enforces it).
5. Idempotency: re-running `seedInventory` changes no counts (locations,
   items, levels, links).
6. Adding a line item to a cart does **not** reserve inventory.
7. Completing the cart (`/store/carts/:id/complete`) reserves exactly once;
   re-completing the same cart returns the same order and does not reserve
   again.
8. Cancelling the order (`cancelOrderWorkflowId` — no store cancel route
   exists) restores inventory exactly once; a second cancel throws
   "Order with id ... has been canceled." and never double-restores.
9. Concurrent checkouts of the last unit: exactly one succeeds and one fails
   (in-memory reservation locking).
10. Updating a level below its configured low-stock threshold emits the
    `inventory.low_stock` domain event once with the correct payload
    (`inventory_item_id`, `location_id`, `available_quantity`, `threshold`).
11. Updating a level while it stays above its threshold emits no event.
12. A level without a configured threshold (no metadata) emits no event.

### Low-stock trigger (`src/inventory/low-stock.ts` + `src/subscribers/inventory-low-stock.ts`)

BD-I-03 (approved): the per-level low-stock threshold is stored in the native
`inventory_level.metadata.low_stock_threshold` JSONB column (no custom
persistence); the subscriber listens to `inventory.inventory-level.updated` /
`.created` (module events — every module-service mutation funnels through them;
workflow events would double-emit) and, when a level with a threshold is at or
below it, emits the `inventory.low_stock` domain event. The trigger never
mutates inventory (REQ-INV-017); the notification channel (merchant email,
recipient per BD-I-03) is deferred to the Notifications specification. 10 unit
tests + 3 integration tests.

Verified facts behind the suite (installed 2.19.0):

- The system payment provider is registered unconditionally by the payment
  module loader under the container key `pp_system_default`
  (`pp_${identifier}${_${id}}`); no medusa-config change is needed to use it
  in tests.
- The fulfillment provider id is `manual_manual`; a usable shipping option
  requires provider↔stock-location and fulfillment-set↔location remote
  links, plus `createShippingOptionsWorkflow` with nested `type` and
  `enabled_in_store`/`is_return` rules.
- Reservation items carry only `line_item_id` (no `order_id`), and
  `cancelOrderWorkflow` deletes them by line item ids.
- Level/reservation quantity fields may be `BigNumber` — compare via
  `Number(value.toString())`.
- `expect(promise).rejects.toThrow()` on `workflowEngine.run(...)` was
  unreliable here ("Received function did not throw" despite the promise
  rejecting); the double-cancel test uses an explicit try/catch + message
  assertion instead (stable across repeated runs).

The backend's `test:integration:http` suite is designed for API-level tests
against the running app; `test:integration:modules` for module tests.

### Media & Storage integration suite (`storage.spec.ts`)

TDD suite for the storage foundation: the upload validation middleware
(`src/api/middlewares.ts`) and the native admin file routes (7 tests, all
green):

1. Uploads a public PNG via `POST /admin/uploads` (multipart field `files`)
   → 200 with `{ files: [{ id, url }] }`, and the file is persisted to the
   local provider's `static/` directory.
2. Retrieves file metadata via `GET /admin/uploads/:id`.
3. Deletes via `DELETE /admin/uploads/:id` → `{ id, object: "file",
   deleted: true }` and the provider file is removed.
4. Rejects unauthenticated uploads (401).
5. Rejects uploads with a disallowed MIME type (text/plain → 400, never
   persisted).
6. Rejects uploads exceeding the configured size limit
   (`MEDUSA_UPLOAD_MAX_SIZE_MB`, default 5 → 400).
7. Exposes no store-facing upload route (404 even with a valid publishable
   key) — customers cannot upload directly.

Verified facts behind the suite (installed 2.19.0):

- The test DB does not run migration scripts; the runner applies migrations
  only. For authenticated admin API tests the suite creates an admin user +
  auth identity directly via the user/auth modules and the
  `emailpass/register` + login flow (`POST /auth/user/emailpass` →
  `{ token }`), because the test DB has no pre-seeded admin.
- `entity_id` lives on **ProviderIdentity**, not AuthIdentity; the auth
  actor linkage is set through `app_metadata.user_id` on the AuthIdentity.
- `createApiKeys` requires `created_by: ""`; key↔channel links use
  `linkService.create(key.id, channel.id)` (two-arg form).
- Local-provider uploads are written under the backend working directory's
  `static/` (served at `/static`), which is gitignored.
- **`defineMiddlewares` returns `{ routes: [...] }`** — middleware config
  must use the `routes:` form; exporting a bare route object silently
  registers nothing (middleware-file-loader reads `middlewareConfig.routes`).
  Plugin middlewares register after core middlewares (e.g. after multer's
  `upload.array("files")`) but before route handlers, so `req.files` is
  populated when the validation middleware runs.
- Rejected uploads return 400 and are never persisted; the size/MIME policy
  is server-side only (never client-side enforcement).

### Catalog & Categories integration suite (`catalog.spec.ts`)

TDD suite for `src/migration-scripts/seed-catalog.ts` and the native
catalog semantics it relies on (10 tests, all green):

1. Replaces the starter demo catalog: starter products (handles
   `t-shirt`/`sweatshirt`/`sweatpants`/`shorts`), categories
   (`shirts`/`sweatshirts`/`pants`/`merch`), unused option values
   (`S`/`M`/`L`/`XL`) and inventory item `SHIRT-S-BLACK` are gone; the
   Karachi/Dubai warehouses survive (seed-inventory data untouched).
2. Creates the approved taxonomy (AGENTS.md §8): 15 categories — root
   `Baby Clothing`, branches `Girls`/`Boys`, 12 leaves with exact display
   names (handles namespaced, e.g. `girls-bottoms`, because
   `product_category.handle` is globally unique), all active/public.
3. Gender is a product attribute, not a taxonomy concept: no "Unisex"
   category exists; the unisex tee sits in `Boys → T-Shirts` with
   `metadata.gender = "unisex"`.
4. Products carry per-product `Size` (age range) + `Color` options; 30
   variants with unique SKU/EAN, `manage_inventory`, and option values with
   option titles (`variants.options.option`).
5. Every variant is priced in pkr/aed/eur/usd; the store API
   (`/store/products?region_id=<PK region>`) resolves the pkr calculated
   price (2500 for the tee).
6. Every variant is linked to an inventory item with levels (100, reserved
   0) at exactly Karachi and Dubai warehouses.
7. Collection "Newborn Essentials" carries the tee + sleepsuit; tags
   `cotton`/`newborn` are attached.
8. Attributes map to native fields (`material`, `origin_country`) and
   `metadata` (gender, brand, season, care_instructions, seo_title,
   seo_description) — no custom persistence.
9. Store API serves the full category tree
   (`include_descendants_tree=true` → nested `category_children` at every
   depth) and `category_id`-filtered products.
10. Idempotency: re-running the seed changes no counts (products 4,
    categories 15, inventory items/levels, regions).

Verified facts behind the suite (installed 2.19.0):

- **The product-category tree repository defaults `options.fields` to `[]`**,
  so module-level `listProductCategories` returns entities containing only
  `id` (MikroORM `fields: []` → PK only; populated relations come back full).
  Category queries must pass an explicit `select: [...]` (the admin/store
  APIs always do; the seed and this suite pass explicit fields).
- `include_descendants_tree` is read by the product-category service from the
  filterable fields (`filters.include_descendants_tree`) and drives the
  repository's mpath-based tree build; the store route passes it through as a
  filter, and per-node `fields` params would strip deeper tree levels (use
  the route defaults, which include `*category_children`).
- Stock locations live on their own module: `Modules.STOCK_LOCATION`
  (`listStockLocations`), not `Modules.INVENTORY`.
- `createCollectionsWorkflow` (not `createProductCollectionsWorkflow`) with
  input key `collections`; `createProductTagsWorkflow` uses `product_tags`;
  `createProductCategoriesWorkflow` uses `product_categories` and accepts
  `parent_category_id`, `rank`, `is_active`, `is_internal`.
- `deleteProductsWorkflow` deletes inventory items for
  `manage_inventory=true` variants only when all referencing variants are
  deleted; starter Size/Color options are global, so the seed deletes them
  only when unused by remaining products.

## Storefront unit tests (jest)

Established 2026-08-16 (storefront feature work — gap #4 deferred item).

- Harness: `jest` + `next/jest` (babel `next/babel` transform, node
  environment), `jest.config.js` at `apps/storefront` (loads `.env.local`/
  `.env` before `next.config.js` so the publishable-key check passes),
  `testMatch: src/**/*.test.ts`. New devDeps: `jest@^29.7.0`,
  `@types/jest@^29.5.14`.
- Command: `pnpm --filter @dtc/storefront test` (root `pnpm test` picks it
  up via turbo). Result: **112 tests / 15 suites PASS**.
- Phase 2 market-routing suites (2026-08-16): `market-routing` (7 tests)
  and `market-selection` (8 tests) verify BD-M-01/BD-M-09: the URL country
  code is canonical (serve), country-less/unknown paths redirect to the
  market selector (never to a geolocated country), the root path serves the
  selector, enabled markets derive from `NEXT_PUBLIC_ENABLED_MARKETS`
  (default pk,ae) via backend regions, and geo countries only produce a
  suggestion (never an authoritative choice).
- Suites: `money` (7), `env` (2), `isEmpty` (6), `get-percentage-diff` (4),
  `product-option-filters` (7), `get-product-price` (9), `availability` (6),
  `canonical` (8), `json-ld` (9), `sitemap` (5), `site-config` (2),
  `category-path` (16).
- SEO/phase-6 suites (2026-08-16) verify the deliberate policy of
  ADR-0002: canonical URL mechanics (filter stripping, page params),
  JSON-LD shapes (Product offers from `calculated_price` in major units,
  availability via the shared `isVariantAvailable`, no invented
  properties), sitemap entry construction (all regions × home/categories/
  collections/products), category chain resolution from the tree
  (`include_descendants_tree=true`, deepest-chain preference, cycle
  guard), and env-driven site config. Verified against the installed
  Medusa 2.19.0 API: nested tree nodes have no `parent_category`, so
  chains are never read from `parent_category` links.
- Verified facts locked in by tests:
  - **Medusa v2 stores prices in major units** (verified against installed
    source + official docs: pricing module `calculated_amount` is the raw
    stored amount; Medusa's own ESLint rule `prices-in-major-units` and the
    Stripe `getSmallestUnit` (major→minor) utility confirm the convention).
    `convertToLocale` must NOT divide by 100; the starter's unused
    `noDivisionCurrencies` list is dead code.
  - **Currency display is CLDR-driven** (browser and Node agree): PKR 0
    decimals (`PKR 2,500`), AED/EUR/USD 2 decimals (`AED 45.00`, `€12.00`,
    `$19.99`), JPY 0. Display formatting only — no business rule.
  - `Intl.NumberFormat` uses U+00A0 separators; assertions normalize
    whitespace.
  - Price selection (cheapest variant; by id/sku) and option-value filter
    parsing behave as implemented (guards for empty/duplicate/undefined).

## Required Approach (per AGENTS.md §16)

- **Strict TDD** for every behavior-changing task: understand → write test →
  confirm it fails → minimal implementation → test passes → refactor →
  regression.
- Testing pyramid: unit / integration / API / workflow / E2E. Prefer real
  integration tests (DB, Redis, Medusa workflows, provider contracts); mock
  only external systems.
- Commerce invariants (AGENTS.md §12) must be translated into tests as the
  corresponding features are implemented.
- Deterministic fixtures; tests never depend on production data.

## Commands

```bash
# Backend (from repo root or apps/backend)
pnpm --filter @dtc/backend test:unit
pnpm --filter @dtc/backend test:integration:http   # requires Redis up;
                                                    # STOP `medusa develop` first
                                                    # (shared queues — dev workers
                                                    # steal test jobs)
pnpm --filter @dtc/backend test:integration:modules

# Storefront (from repo root or apps/storefront)
pnpm --filter @dtc/storefront test

# All (root) — turbo runs each app's `test` script (storefront jest)
pnpm test
```

## Status

- Test harness: VERIFIED (2026-08-16) — backend integration suite exercised
  end-to-end (app boot, disposable test DB, `GET /health` → 200); storefront
  jest harness established (see storefront section above).
- Backend test files: `apps/backend/integration-tests/http/health.spec.ts`
  (1 smoke test), `apps/backend/integration-tests/http/markets.spec.ts`
  (6 tests), `apps/backend/integration-tests/http/inventory.spec.ts`
  (12 tests), `apps/backend/integration-tests/http/storage.spec.ts`
  (7 tests), `apps/backend/integration-tests/http/catalog.spec.ts`
  (10 tests), `apps/backend/integration-tests/http/shipping.spec.ts`
  (6 tests), `apps/backend/integration-tests/http/payments.spec.ts`
  (6 tests), `apps/backend/integration-tests/http/browsing.spec.ts`
  (33 tests), `apps/backend/integration-tests/http/cart-ownership.spec.ts`
  (8 tests), `apps/backend/integration-tests/http/customer-auth.spec.ts`
  (9 tests) — 98 tests total; backend unit tests:
  `src/api/store/products/browse/__tests__/browse-helpers.unit.spec.ts`
  (37 tests), `src/config/__tests__/env.unit.spec.ts` (21 tests),
  `src/config/__tests__/medusa-config.unit.spec.ts` (10 tests: 5 auth
  BD-AUTH-01..03 + 5 Redis module wiring — REDIS WIRING = ENABLE NOW),
  `src/inventory/__tests__/low-stock.unit.spec.ts` (10 tests), and
  `src/api/store/carts/__tests__/ownership.unit.spec.ts` (7 tests) — 85 unit
  tests total.
- Integration suite status (2026-08-17): **98/98 PASS** with the Redis-backed
  modules wired (`jest.config.js` sets `testTimeout: 60000`; the app boot with
  Redis modules exceeds Jest's default 5s hook timeout). The suite boots the
  real `medusa-config.ts`, so Redis must be running, and the dev server must
  be stopped first (shared `events-queue`/workflow queues — a dev server's
  workers consume test jobs; observed 2026-08-17: running the suite with the
  dev server up failed exactly the event-waiting tests of the customer-auth
  suite with `Timed out ... waiting for the captured event`).
- Storefront test files: `apps/storefront/src/lib/util/*.test.ts` and
  `apps/storefront/src/lib/seo/*.test.ts` plus
  `apps/storefront/src/lib/util/jwt.test.ts` (17 suites, 124 tests).
