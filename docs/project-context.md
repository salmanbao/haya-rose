# Project Context

Status: **Deep repository audit complete** (2026-08-15). All facts below were
verified from the repository, installed packages, database, and live
validation — not from assumptions.

## Business Model

- B2C / D2C
- Single merchant
- No marketplace, no vendors/sellers

## Markets

- Pakistan (payment provider NOT selected, TCS shipping planned)
- UAE (payment provider NOT selected, Aramex shipping planned)

## Currencies

- PKR (Pakistan) — present in Medusa's currency table (verified via `/store/currencies`)
- AED (UAE) — present in Medusa's currency table

Neither market is configured as a region yet. The seed data created a single
default region "Europe" (EUR, countries incl. `dk`/`de`/`gb` per starter seed).

## Product Domain

- Baby clothing (Girls, Boys, Unisex)
- No catalog has been created for this domain (seed data only: Medusa-branded
  sample products)

## Architecture

Verified actual architecture (matches AGENTS.md §3):

```text
Customers → Next.js storefront (apps/storefront, :8000)
              → Medusa v2.19.0 backend (apps/backend, :9000)
                  ├── PostgreSQL 16.14  (db: medusa-baby-store) — authoritative
                  ├── Redis 7.0.15       (wired 2026-08-17: cache, caching,
                  │                       event bus, workflow engine, locking — supporting only)
                  └── Cloudflare R2      (PLANNED — via native file-s3 provider)
```

- Monorepo: pnpm workspace (`pnpm-workspace.yaml`: `apps/**`), Turborepo task
  orchestration, single `pnpm-lock.yaml`.
- Standard Medusa Admin at `/app`. No custom admin app.
- Storefront: Next.js 15 App Router, Server Components by default.
- Not a git repository (no `.git` directory) — see gap analysis.
- **Specification phase complete (7 domain specs).** System-level audit
  produced: `docs/architecture/cross-specification-audit.md` (no CRITICAL
  findings, no formal contradictions), `docs/architecture/consolidated-decision-register.md`
  (119 B-* + 69 T-* decisions grouped by resolution priority), and
  `docs/architecture/implementation-dependency-graph.md` (derived
  implementation sequence). AGENTS.md impact: none required.
- **Business decision phase: COMPLETE (2026-08-16).** All **40 user
  decisions approved** (17 foundational + 23 quick ticks) — see
  `docs/architecture/business-decision-questionnaire.md` (resolved) and the
  resolution record in `docs/architecture/consolidated-decision-register.md`.
  **Approved business rules are now authoritative.** Implementation has NOT
  started; remaining gates are not decisions (see below).

## Technology Versions

Exact resolved versions (from `pnpm list -r --depth 0`, lockfile, environment):

| Component | Version |
| --- | --- |
| Node.js | v24.14.1 |
| pnpm | 10.33.0 |
| Medusa (`@medusajs/medusa`, `framework`, `cli`, `dashboard`, `js-sdk`, `types`, `admin-sdk`, `admin-shared`, `eslint-plugin`, `test-utils`) | 2.19.0 |
| Next.js | 15.5.21 |
| React / React DOM | 19.0.5 |
| TypeScript (resolved, both apps) | 5.9.3 |
| zod | 4.2.0 |
| Jest | 29.7.0 |
| ESLint | 9.39.4 |
| Turbo | 2.6.3 |
| Prettier | root 3.7.4 / storefront 2.8.8 |
| MikroORM (via `@medusajs/framework`) | core 6.6.14 (+ postgresql, migrations) |
| PostgreSQL driver `pg` | storefront 8.16.3 / backend-transitive 8.20.0 |
| Redis client `ioredis` | 5.8.2 (via installed redis modules) |
| PostgreSQL server | 16.14 (system service) |
| Redis server | 7.0.15 (system service) |

Workspace: pnpm monorepo, single lockfile (`pnpm-lock.yaml`), deps installed
in per-package `node_modules` linked to a shared root `.pnpm` store
(dependencies are workspace-shared, not duplicated).

## Repository Structure

```text
baby-store/
├── AGENTS.md                     authoritative engineering contract (pre-existing)
├── package.json                  root workspace (pnpm + turbo scripts)
├── pnpm-workspace.yaml           packages: apps/**
├── turbo.json                    task pipeline
├── .npmrc                        auto-install-peers=true
├── eslint.config.ts              root ESLint (flat config, @medusajs/eslint-plugin)
├── .gitignore, LICENSE, README.md (starter), CLAUDE.md (generated)
├── .agents/                      agent tooling (pre-existing)
├── apps/
│   ├── backend/                  @dtc/backend — Medusa v2.19.0 + Admin
│   │   ├── medusa-config.ts      DB URL, CORS, JWT/cookie secrets
│   │   ├── src/                  extension dirs: api, admin, jobs, links,
│   │   │                         modules, subscribers, workflows,
│   │   │                         migration-scripts (initial-data-seed.ts)
│   │   ├── integration-tests/    jest setup only (no test files)
│   │   └── .env / .env.template / .env.example
│   └── storefront/               @dtc/storefront — Next.js 15 Medusa Starter
│       ├── src/app/              [countryCode]/ routes (main + checkout groups)
│       ├── src/lib/              SDK config, data fetch modules, utils
│       ├── src/modules/          UI modules (products, cart, checkout, account…)
│       └── .env.local / .env.example
├── node_modules/                 pnpm workspace store (gitignored)
└── docs/                         architecture, infrastructure, testing, audit
```

Detailed per-directory classification: `docs/architecture/repository-structure.md`.

## Medusa Capabilities

Verified against installed Medusa 2.19.0 (packages, database tables, live API):

- **Core (enabled + verified live):** products, variants, options, categories,
  collections, tags, images, pricing (incl. `price_list`, `price_list_rule`),
  currencies, regions, carts, checkout, customers (+ `customer_group`),
  orders, payments, fulfillment (shipping options/profiles/rates), inventory
  (items/levels/reservations/stock locations), promotions (+ campaigns,
  budgets, rules), sales channels, stores, tax, users, draft orders, auth
  (email/password enabled).
- **Infrastructure (wired to Redis 2026-08-17):** caching (+redis), event-bus
  (+redis), workflow engine (+redis), locking (+redis), file (local default +
  S3 provider), search (local; module requires config), notification
  (local/logger; sendgrid provider installed).
- **Extension points (scaffolded, empty):** `src/api`, `src/workflows`,
  `src/modules`, `src/links`, `src/subscribers`, `src/jobs`, `src/admin`.
- **Seed data:** executed via `src/migration-scripts/initial-data-seed.ts`
  (tracked in `script_migrations`); creates API keys (incl. publishable key),
  sales channels, stores, stock locations, inventory levels, regions, tax
  regions, product categories/options/products/collections, shipping
  profiles/options, and links.

Full matrix: `docs/architecture/medusa-capability-matrix.md`.

## Storefront Architecture

- Next.js 15.5.21 App Router; route groups `(main)` and `(checkout)` under
  `[countryCode]/`; parallel routes for account (`@dashboard`, `@login`).
- Server Components by default; Client Components only where interactive
  (cart, checkout, account, product actions).
- Data fetching: Medusa JS SDK (`@lib/config`), all server-side in
  `src/lib/data/*`; middleware uses raw `fetch` (Edge-compatible) for the
  region map with 1h revalidation.
- Caching: `force-cache` + `revalidateTag` keyed by a per-session
  `_medusa_cache_id` cookie; data functions use `getCacheOptions(tag)`.
- Auth: customer JWT in `_medusa_jwt` httpOnly cookie (1d since 2026-08-17,
  `sameSite: strict`, `secure` in production); email/password login via
  backend auth module; email verification REQUIRED natively
  (`authVerificationsPerActor`). Google OAuth wired env-gated
  (`AUTH_GOOGLE_ENABLED=true` + `GOOGLE_*` credentials; off by default) with
  storefront button + callback handlers. Forgot/reset-password pages use the
  native emailpass reset flow (token via `auth.password_reset` event).
  Cart id in `_medusa_cart_id` cookie; pending-signup data in
  `_medusa_pending_customer`.
- Localization: backend `/store/locales` endpoint + `x-medusa-locale` header
  added by the SDK fetch wrapper; `language-select` component in layout.
- Pricing display: backend-computed `calculated_price` only; `Intl.NumberFormat`
  for formatting (no client-side price math).
- SEO: `metadata` exports on layouts/pages; `next-sitemap.js` (sitemap +
  robots.txt, excludes checkout/account); **no JSON-LD structured data**.
- Images: `unoptimized: true` in `next.config.js`; remote patterns for
  localhost + S3 hosts + optional Medusa Cloud S3.
- **`next.config.js` sets `typescript.ignoreBuildErrors: true` and
  `eslint.ignoreDuringBuilds: true`** — the production build does NOT typecheck
  or lint. A direct `tsc --noEmit` currently fails (see Database/Testing notes
  and gap analysis).
- Starter code only; no custom business logic. Minor lint fixes were applied
  during initialization (documented in `docs/architecture/README.md`).

## Database

- PostgreSQL 16.14, database `medusa-baby-store`, role `medusa` (dedicated).
- **143 tables, all Medusa-owned** — no custom tables exist.
- Migration mechanisms (verified): `mikro_orm_migrations` (177 framework
  migrations applied), `link_module_migrations` (module links), and
  `script_migrations` (custom scripts; contains `initial-data-seed.ts`).
- Native module tables verified: products/variants/options/categories/
  collections, price lists + rules, promotions/campaigns/budgets/rules,
  customer groups, sales channels, stock locations + levels + reservations,
  inventory items, shipping options/profiles/rates, payment/capture/refund,
  order/return/fulfillment, tax regions/rules, users/auth identities,
  notifications, draft orders, workflow executions.
- Connection: `DATABASE_URL` in `apps/backend/.env`, loaded by
  `medusa-config.ts` via `loadEnv()`; MikroORM 6.6.14 driver.
- Transactions: Medusa workflows/ORM transactions (native); no custom SQL.

## Redis

- Redis 7.0.15 running on `localhost:6379` (system service, `redis-server.service`
  systemd unit); `redis-cli ping` → PONG.
- `REDIS_URL=redis://localhost:6379` present in `apps/backend/.env`.
- **Wired into Medusa (2026-08-17):** `medusa-config.ts` registers `cache`
  (`cache-redis`), `caching` (`caching` + `caching-redis` provider; gated by
  `MEDUSA_FF_CACHING=true` — enables the graph-query cache), `eventBus`
  (`event-bus-redis`, queue `events-queue`), `workflowEngine`
  (`workflow-engine-redis`, queues `bull:medusa-workflows*`), and `locking`
  (`locking` + `locking-redis`, namespace `medusa_lock:`). Option names
  verified against the installed 2.19.0 module contracts; defaults retained
  (cache prefix `mc:`). `REDIS_URL` is validated at startup by
  `src/config/env.ts`. Framework default workerMode `"shared"` keeps BullMQ
  workers in-process. Runtime evidence: browse cache miss ~0.20s → hit
  ~0.014s (`mc:*` keys), multi-process cache sharing verified, `medusa_lock:*`
  observed during a `medusa exec` lock demo, boot with Redis unreachable
  fails fast with clear errors.
- Verified NOT authoritative: all commerce state lives in PostgreSQL; Redis is
  strictly supporting infrastructure.

## Storage

- Current: Medusa native file module with local provider (`file-local`
  installed; default; not separately exercised).
- R2 integration point (verified in installed source): `@medusajs/file-s3`
  provider options include `region`, `bucket`, and `endpoint?` (S3-compatible
  endpoint support) with a note about `BucketOwnerEnforced` ACL behavior —
  exactly what Cloudflare R2 requires.
- Required configuration (future): enable `file` module in `medusa-config.ts`
  with `resolve: "@medusajs/file-s3"` + R2 credentials + `endpoint`.
  **Custom code: none required** (native provider). Not implemented yet.
- No image binaries stored in PostgreSQL (media stays in the catalog as
  references).## Authentication

**Customer authentication:**
Medusa-native authentication.

**Methods:**
- Email/password (enabled; email verification REQUIRED per BD-AUTH-01)
- Google OAuth (provider `@medusajs/auth-google` wired ENV-GATED per
  BD-AUTH-03 — off by default; real Google Cloud credentials required to
  enable; storefront button + callback handlers implemented)

**Admin:**
Standard Medusa Admin authentication/authorization.

**Better Auth:**
Not used (previous proposal rejected — see `docs/architecture/gap-analysis.md` historical note).

**Implementation status (2026-08-17):**
Customer authentication phase DONE per decisions BD-AUTH-01..04 — backend
(emailpass + env-gated google registration, mandatory email verification,
1d session, native reset flow) and storefront (login page Google button,
`/api/auth/google` + `/api/auth/callback/google`, `/forgot-password`,
`/reset-password`). Integration-tested (customer-auth suite, 9 tests;
114/114 total) and runtime-verified on :9000. Remaining: enable the Google
gate with real credentials + E2E sign-in; email delivery of verification
codes/reset tokens (notification boundary — later phase).

**Verified baseline facts:** the storefront starter authenticates customers with Medusa's native auth (email/password, `_medusa_jwt` httpOnly cookie, Bearer headers; email-verification flow in `customer.ts`). Analysis: `docs/architecture/authentication-authorization.md`.

## Payments

- Medusa payment module present (default). `@medusajs/payment-stripe@2.19.0`
  added (exact locked version).
- **Provider selection APPROVED (2026-08-16), REVISED (2026-08-17):
  Safepay for Pakistan (replaces the earlier AssanPay selection, which
  replaced xPay — replacements requested before implementation; both
  historical / NOT ACTIVE), Stripe for UAE.**
- **Provider verification (revised 2026-08-17) — see
  `docs/architecture/provider-verification/`:**
  - **Stripe (AE): VERIFIED for V1** — AED supported; PaymentIntent model;
    webhook signature + event mapping; refunds; idempotency — all confirmed
    against official Stripe docs and the bundled
    `@medusajs/payment-stripe@2.19.0` source. Remaining: UAE account keys +
    Dashboard webhook/event configuration.
  - **Safepay (PK): VERIFIED + ADAPTER IMPLEMENTED (2026-08-17)** —
    official documentation (retrieved via Context7) + official SDK source
    verify tracker payment sessions, hosted checkout redirect (passport
    `tbt` token), reporter status API, full/partial refunds,
    X-SFPY-SIGNATURE HMAC-SHA512 webhook signatures, paisa amounts, and
    `x-sfpy-merchant-secret` authentication. Adapter:
    `src/modules/payment-safepay` (provider key `pp_safepay_safepay`,
    env-gated, 41 unit tests). AssanPay was REPLACED precisely because its
    webhook/auth/refund contract could not be verified; xPay was replaced
    earlier (both historical records preserved:
    `assanpay-verification.md`, `xpay-verification.md`).
  - Overall payment status: **COMPLETE_SANDBOX_VERIFIED (2026-08-18)** — both
    provider contracts verified; adapters implemented (REQ-PAY-022/023); live
    sandbox/test-mode runs completed for Safepay (PKR pay/capture/refund/
    webhook) and Stripe (AED confirm/capture/refund/webhook); remaining steps
    are production credentials + Dashboard webhook configuration.
- **Payments implementation (Phase 5, 2026-08-16) — PARTIAL by design:**
  native pipeline verified + exercised (`integration-tests/http/payments.spec.ts`,
  6 tests: region-scoped provider listing, session creation, authorize-at-completion,
  capture idempotency, refund bounds, webhook pipeline); **Stripe scaffolding
  DONE** — env-gated registration (`PAYMENT_PROVIDER=stripe` → `pp_stripe_stripe`,
  manual/deferred capture default per T-PAY-03), conditional env validation
  (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), `.env.example` updated,
  AE-region binding in `seed-markets.ts`; **Safepay adapter IMPLEMENTED
  (2026-08-17)** at `src/modules/payment-safepay` with PK-region binding
  seeded. See `docs/specifications/payments.md` §32-§33.
  - **Admin-managed provider configuration (2026-08-17, approved
    architecture):** Safepay/Stripe credentials and enable/disable state are
    managed through the Medusa Admin (Settings → Payment Providers), stored
    encrypted at rest (AES-256-GCM; master key `PAYMENT_CONFIG_ENCRYPTION_KEY`
    stays in the environment) by the new `payment-config` module
    (`src/modules/payment-config`, tables `payment_provider_config` +
    `_audit`). Admin API: `/admin/payment-provider-config` (masked views —
    secret values are never returned). Providers resolve configuration at
    runtime: Safepay reads it per operation; Stripe uses a thin runtime
    wrapper (`src/modules/payment-stripe-runtime`) that preserves
    `pp_stripe_stripe` and lazily constructs the official provider. Legacy
    `SAFEPAY_*`/`STRIPE_*` env variables are TRANSITIONAL fallbacks only
    (precedence: Admin config > legacy env). See
    `docs/specifications/payments.md` §34.
  - **Markets & Pricing implementation (Phase 2, 2026-08-16):** backend
    configuration DONE earlier (regions pkr/aed, tax regions, prices,
    sales-channel links); tax rates APPROVED (PK GST 17%, AE VAT 5%) and
    seeded; storefront market routing per BD-M-01 DONE (URL country code
    canonical; IP-geolocation auto-redirect removed — geolocation only
    suggests; undetermined location routes to a market-selector page at `/`
    per BD-M-09, markets derived from backend regions filtered by
    `NEXT_PUBLIC_ENABLED_MARKETS`; `NEXT_PUBLIC_DEFAULT_REGION` now legacy). Verified
  baseline: payment collections/sessions/payments/captures/refunds + status
  derivation (`PaymentCollectionStatus`/`PaymentSessionStatus`), native
  webhook pipeline (`POST /hooks/payment/:provider` → `payment.webhook_received`
  → subscriber → `processPaymentWorkflow`), native admin routes (capture/
  refund/mark-as-paid with RBAC), and the system provider `pp_system_default`
  (enabled; used by mark-as-paid). PK/AE regions configured (Phase 2);
  Stripe bound to AE and Safepay bound to PK when registered via
  `PAYMENT_PROVIDER` (Phase 5, revised 2026-08-17).

## Shipping

- Medusa fulfillment module present; `fulfillment-manual` provider available.
- **Shipping & Fulfillment implementation (Phase 5, 2026-08-16) — DONE
  (topology + native mechanics):** per-market sales channels (`Pakistan` /
  `UAE` Sales Channels — BD-I-01/BD-I-04), per-market fulfillment sets + geo
  zones + flat-rate options seeded by `seed-shipping.ts`; the storefront
  passes the market channel at cart creation (`resolve-cart-sales-channel.ts`
  reading region `metadata.sales_channel_id`); `integration-tests/http/shipping.spec.ts`
  (6 tests) proves eligibility isolation (REQ-SHIP-007), same-market
  reservation allocation (PK→Karachi, AE→Dubai), admin-only fulfillment
  (REQ-SHIP-014/019) without a payment gate (B-SHIP-24), shipment + tracking
  labels (REQ-SHIP-015), cancel restoring reservations (REQ-SHIP-020), and
  mark-as-delivered (REQ-SHIP-016). `manual_manual` is the interim
  fulfillment provider.
- **TCS (PK) and Aramex (UAE): NOT integrated — provider contracts
  UNVERIFIED** (no adapter code, no fake adapters). Rate model APPROVED:
  **hybrid — flat rates V1, carrier-calculated after contract verification**
  (BD-S-01); same-market allocation (BD-I-01); no COD (BD-P-03); no
  international PK↔AE shipping in V1 (BD-S-11).
- Specification: `docs/specifications/shipping-and-fulfillment.md`
  (authoritative; reconciled against markets, cart/checkout, payments, and
  inventory specs — supersedes the earlier draft that predated payments.md).
- Verified baseline facts (installed 2.19.0): `IFulfillmentProvider` interface
  (incl. `createReturnFulfillment`, `getShipmentDocuments`); fulfillment model
  (`location_id` required, `packed_at`/`shipped_at`/`delivered_at`/
  `canceled_at`/`marked_shipped_by`/`created_by`); shipping option model
  (`price_type` FLAT|CALCULATED, service zone, rules); geo zone
  (`country_code` required + province/city/postal); native eligibility chain
  (cart → sales channel → stock locations → fulfillment sets + geo-zone
  address match); `addShippingMethodToCartWorkflow` refreshes the payment
  collection; `cancelOrderFulfillmentWorkflow` re-creates/updates reservations
  for unfulfilled quantities; admin fulfillment/shipping routes carry native
  RBAC policies; **no native fulfillment webhook route** (only
  `hooks/payment`); Context7 MCP not invocable in this environment (empty
  `.agents/mcp.json`).

## Orders

- Specification: `docs/specifications/orders.md` (authoritative; reconciled
  against markets, cart/checkout, payments, shipping/fulfillment, and
  inventory specs).
- Verified baseline facts (installed 2.19.0): `order` model (no
  `payment_status`/`fulfillment_status` fields — those are **computed**);
  `OrderStatus` enum (pending/completed/draft/archived/canceled/requires_action);
  `getLastPaymentStatus` and `getLastFulfillmentStatus` aggregates (independent
  concerns); `order_item` per-concern quantities (fulfilled/shipped/delivered/
  return_requested/return_received/return_dismissed/written_off);
  `order_change` + `ChangeActionType` (versioned modification);
  `order_transaction` ledger; `order_summary` per version; native order-edit /
  claim / exchange / return / transfer workflows; `OrderWorkflowEvents`
  (order.placed/updated/canceled/completed/archived); admin order routes with
  RBAC policies (read/update/create on cancel/archive/complete/authorize/
  credit-lines/fulfillments); store `GET /store/orders` requires customer auth
  with server-side `customer_id` filter; **store `GET /store/orders/:id` is
  unauthenticated and ID-addressed (source TODO — registered as B-ORD-01 /
  T-ORD-09, decision required before launch)**.
- `cancelOrderWorkflow` verified: blocked for completed orders and orders with
  non-canceled fulfillments; refunds captured payments, cancels uncaptured
  payments, restores reservations — full native cancellation contract.
- **Approved order policies (2026-08-16):** cancel before fulfillment only,
  full-order (BD-O-02); authenticated-only order retrieval, guest via
  email+number (BD-O-01); no customer order modification; addresses immutable
  (BD-O-06/07); guest checkout with returns after account association
  (BD-G-01). Enforcement of `GET /store/orders/:id` hardening remains an
  implementation task (T-ORD-09) — code unchanged.

## Returns & Refunds

- Specification: `docs/specifications/returns-and-refunds.md` (authoritative;
  reconciled against markets, cart/checkout, payments, shipping/fulfillment,
  orders, and inventory specs). **B-RET register RESOLVED (2026-08-16): 14-day
  window, auto-accept + inspect on receipt, hygiene/non-sellable excluded,
  refund to original method after receipt (no restock fee), customer-paid
  return shipping, return cancel until shipped.**
- Verified baseline facts (installed 2.19.0): `Return` model (display_id,
  `ReturnStatus` default `open`, order_version, location_id, refund_amount,
  requested_at/received_at/canceled_at, relations to order/exchange/claim/
  items/shipping_methods/transactions); `ReturnItem` (quantity,
  received_quantity, damaged_quantity, note, reason); `ReturnReason`
  (hierarchical, Admin-managed); `ReturnStatus` enum
  (open/requested/received/partially_received/canceled); 21 native return
  workflows (begin/cancel/confirm/request/receive/dismiss/shipping-method
  variants); `createAndCompleteReturnOrderWorkflow` validates refund ≤ order
  item total; `receiveAndCompleteReturnOrderWorkflow` validates non-canceled
  return + item membership then marks received; admin return routes RBAC
  (`return` read/create/update); admin refund `POST /admin/payments/:id/refund`
  (RBAC `refund` create); refund reasons CRUD; order credit lines; events
  `order.return_requested` / `order.return_received`.
- **Verified security gap (registered):** store `POST /store/returns` has NO
  authentication middleware and accepts customer-supplied `order_id`,
  `items`, and `return_shipping.price` — hardening (auth + ownership +
  server-side cost) required before launch (REQ-RET-002/003, T-RET-01/02).
- No return-shipping or refund provider behavior implemented or verified
  (TCS/Aramex return capabilities and payment-provider refund behavior
  UNVERIFIED — §35 of the spec).

## Testing

- Backend: Jest 29.7.0 harness configured (`jest.config.js`) with three suites
  (unit / integration:http / integration:modules) via
  `@swc/jest`. **Zero test files shipped** — all suites report "no tests".
- Storefront: no test framework configured.
- E2E: none. Fixtures/factories: none.
- Fresh validation during this audit: backend `tsc --noEmit` PASS; backend
  `medusa build` (incl. lint) PASS; storefront `next lint` PASS (3 pre-existing
  warnings); **storefront `tsc --noEmit` FAILS with 11 errors** (9 pre-existing
  in `src/lib/data/cart.ts` — `FormDataEntryValue | null` not assignable to
  `string | null | undefined` in `setAddresses` billing-address assignments;
  2 unused `@ts-expect-error` directives in
  `src/modules/layout/components/language-select/index.tsx` introduced by the
  initialization lint fix).

## Deployment

- Local development only. **Nothing production is configured:** no Vercel
  config, no VPS/PM2/systemd setup, no CI/CD, no Docker files, no monitoring,
  no instrumentation (`instrumentation.ts` is a commented-out example).
- Deployment topology (Vercel storefront → Medusa on VPS → PostgreSQL/Redis,
  media on R2) is the approved target; all production pieces are PLANNED.

## Implemented

- Medusa backend scaffold (2.19.0) + standard Admin — verified build/startup.
- Next.js storefront scaffold — verified build/startup/backend connection.
- PostgreSQL role/database + migrations + seed.
- Redis server running, wired into Medusa 2026-08-17 (cache, caching, event
  bus, workflow engine, locking — see the Redis section above).
- `.env.example` files (backend + storefront, names only).
- Documentation: `docs/` (architecture, infrastructure, testing).
- Minor storefront lint fixes during initialization (see gap analysis for the
  type-check status).

## Planned

## Planned / Implemented

Implemented phases (see the phase sections above and
`docs/architecture/gap-analysis.md` for detail): Markets & Pricing,
Inventory & Warehouses, Media/Storage, Catalog & Categories,
Browsing/Search, Foundation env-validation, low-stock trigger, cart
ownership enforcement (T-CC-01), Payments native pipeline + provider
boundaries (Stripe scaffolding; Safepay adapter implemented — sandbox
runs pending), Shipping & Fulfillment topology, Customer Authentication,
Redis modules, and the **Cart & Checkout foundation** (native contract
suite + storefront wiring, BD-C-04 market-switch fresh cart, BD-C-05/06
field validation — runtime smoke-verified end-to-end; see gap rows 16-17).

Approved future requirements (AGENTS.md §9 + task list), **not yet
implemented** (gates: sandbox verification for the PK/UAE gateways;
later phases):
orders (specification:
`docs/specifications/orders.md`) — returns/refunds — specification:
`docs/specifications/returns-and-refunds.md` — TCS/Aramex shipping
adapters (contract verification per `docs/architecture/provider-verification/`) —
catalog for baby clothing, R2
media, Google auth, wishlist, reviews, coupons,
returns/refunds implementation, abandoned cart, recommendations, recently viewed,
bundles, notifications, search/filter UI, localization, SEO enhancements
(JSON-LD, slug strategy, sitemap).

## Unknown / Requires Decision (remaining, 2026-08-16)

**Business decisions: COMPLETE (40/40).** Remaining items are inputs,
verification tasks, or deferred features — not open business decisions:

- **PK GST numeric rate — RESOLVED (2026-08-16): 17%** (user-approved).
- **AE VAT numeric rate — RESOLVED (2026-08-16): 5%** (user-approved).
  Both configured as native tax-region default rates in `seed-markets.ts`
  (codes GST/VAT) and asserted in `markets.spec.ts`.
- **Provider sandbox verification — COMPLETE (2026-08-18)** — Safepay (PK:
  live sandbox pay/capture/refund + signed webhook pipeline verified;
  limitations: no sandbox webhook auto-delivery, no decline-card simulation)
  and Stripe (AE: test-mode confirm/capture/refund + signed webhook pipeline
  verified; limitation: decline simulation blocked by account). Remaining:
  production credentials + Dashboard webhook endpoints; TCS/Aramex at the
  shipping stage.
- Final localization language set — not finalized (DEFERRED; locale-
  configurable architecture per AGENTS.md §10).
- Review eligibility (verified-purchase) — feature not yet implemented.
- Notification/communication consent policy — DEFERRED to notifications spec.
- Email/SMS/WhatsApp notification providers — not selected (notifications
  spec, deferred).
- Whether Redis-backed modules should be enabled before feature work —
  **RESOLVED (2026-08-17): REDIS WIRING = ENABLE NOW** — cache, caching,
  event bus, workflow engine, and locking are wired to Redis (see the Redis
  section and gap-analysis row 3).
- Search module enablement details — requires verification when search is built.
- Medusa file module local-provider behavior — not exercised yet.
