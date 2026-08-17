# Medusa Capability Inventory (v2.19.0, verified)

Inventory of what the **installed** Medusa version already provides, so we do
not rebuild platform capabilities. Sources: installed `node_modules`
(`@medusajs/*` packages), the generated `medusa-config.ts`, and live API
verification during initialization.

## Status Legend

- **AVAILABLE** — package installed in the workspace (native module/provider).
- **ENABLED** — loaded by the running baseline (default or configured).
- **NOT ENABLED** — installed but not activated in the baseline `medusa-config.ts`.
- **VERIFIED** — exercised via live API during initialization.

## Core Commerce Modules (all AVAILABLE and ENABLED by default)

| Capability | Status | Evidence / Notes |
| --- | --- | --- |
| Products | ENABLED + VERIFIED | `GET /store/products` returns seeded products |
| Product variants | ENABLED | product module ships variants (`variants` on product API) |
| Product options | ENABLED | options model part of product module (size/color options) |
| Product categories | ENABLED + VERIFIED | `GET /store/product-categories` returns categories (seed created "Shirts") |
| Collections | ENABLED + VERIFIED | `GET /store/collections` returns `{collections,count}` |
| Tags | ENABLED | `tags` on product model (metadata, filtering) |
| Pricing | ENABLED | pricing module (price lists, rules, per-region/currency) |
| Currencies | ENABLED + VERIFIED | `GET /store/currencies` — includes AED, PKR |
| Regions / markets | ENABLED + VERIFIED | `GET /store/regions` returns seeded region; multi-country support |
| Carts | ENABLED | cart module (`/store/carts`) |
| Checkout | ENABLED | cart complete → order workflow; shipping/payment steps |
| Customers | ENABLED + VERIFIED | `GET /store/customers/me` correctly 401s unauthenticated |
| Authentication | ENABLED | auth module; email/password provider enabled (`/auth/user/emailpass`) |
| Google auth provider | AVAILABLE, NOT ENABLED | `@medusajs/auth-google` installed; requires config (V1 requirement) |
| Orders | ENABLED | order module + workflows |
| Payments | ENABLED (module) | payment module; providers SELECTED+IMPLEMENTED: Safepay PK (custom adapter `src/modules/payment-safepay`, replaces earlier AssanPay/xPay selections) and Stripe AE (bundled provider) — both env-gated via `PAYMENT_PROVIDER`, contracts verified, sandbox runs pending |
| Fulfillment | ENABLED | fulfillment module; manual provider available |
| Inventory | ENABLED | inventory module (`inventory_*` tables present) |
| Stock locations | ENABLED | stock-location module (multi-warehouse foundation) |
| Reservations | ENABLED | inventory reservations model present |
| Promotions / discounts | ENABLED | promotion module (`/admin/promotions`) |
| Sales channels | ENABLED | sales-channel module |
| Stores | ENABLED | store module |
| Tax | ENABLED | tax module (regions can define tax rules) |
| Users (admin) | ENABLED + VERIFIED | admin user created; login returns JWT |
| Draft orders | AVAILABLE, ENABLED | `@medusajs/draft-order` loads at startup |

## Extension / Development Capabilities (AVAILABLE)

| Capability | Package / Notes |
| --- | --- |
| Custom API routes | `src/api/**` (file-based; store/custom + admin/custom examples ship) |
| Workflows | `@medusajs/workflows-sdk`, `@medusajs/core-flows`; `src/workflows` |
| Modules (data models) | `src/modules`; MikroORM-based (`@medusajs/framework`) |
| Module links | `src/links` |
| Subscribers / events | `src/subscribers`; event bus below |
| Scheduled jobs | `src/jobs` |
| Admin customizations | `@medusajs/admin-sdk`, `@medusajs/ui`, `src/admin` (widgets, routes, i18n) |
| Admin RBAC | `@medusajs/rbac` AVAILABLE (admin permission model) |
| Admin analytics | `@medusajs/analytics` + `analytics-local`/`analytics-posthog` AVAILABLE |

## Infrastructure Modules (AVAILABLE; baseline uses in-memory defaults)

| Capability | Installed packages | Baseline status |
| --- | --- | --- |
| Cache | `@medusajs/caching`, `cache-inmemory`, `cache-redis`, `caching-redis` | in-memory (fake redis warning on boot); Redis provider NOT configured |
| Event bus | `event-bus-local`, `event-bus-redis` | Local Event Bus (dev default; warns "not recommended for production") |
| Workflow engine | `workflow-engine-inmemory`, `workflow-engine-redis` | in-memory |
| Locking | `locking`, `locking-postgres`, `locking-redis` | in-memory |
| File / media storage | `@medusajs/file`, `file-local`, `file-s3` | default local storage; **S3-compatible provider available → Cloudflare R2 target** |
| Search | `@medusajs/search`, `search-local` | local search provider (no Elasticsearch needed — per AGENTS.md §11) |
| Notification | `@medusajs/notification`, `notification-local`, `notification-sendgrid` | local/logger default |

## Key Findings

1. **R2 (PLANNED, NOT INTEGRATED):** Medusa's native file module
   (`@medusajs/file` + `file-s3`) is the supported storage abstraction.
   Cloudflare R2 is S3-compatible, so R2 will be configured via the native
   S3 provider during the media/catalog phase — **no custom media module is
   needed** (AGENTS.md §11).
2. **Payments:** payment module + Stripe provider are installed, but **no
   payment provider is selected**. Nothing is configured; no fake adapters
   exist. Provider selection and verification is a future task.
3. **Shipping:** fulfillment module + manual provider exist. TCS/Aramex are
   NOT integrated (providers not selected; no fake adapters).
4. **Search:** native search module with local provider satisfies the V1
   "start simplest" requirement; no Elasticsearch.
5. **Auth:** email/password works today; Google (OIDC) provider is installed
   and only needs configuration for the V1 customer-auth requirement.
6. **Redis:** supporting infrastructure is running, but the baseline
   intentionally runs in-memory fallbacks (official dev default). Enabling
   `caching-redis` / `event-bus-redis` / `workflow-engine-redis` /
   `locking-redis` in `medusa-config.ts` is a config change for later phases.
7. **Multi-warehouse:** inventory + stock-location + reservations modules
   provide the V1 inventory foundation natively.

## What Is NOT Provided Natively (custom work, future tasks)

Wishlist, reviews/ratings, order tracking UI, abandoned-cart classification,
recommendations, recently viewed, bundles-as-products, per-market
payment/shipping providers, TCS/Aramex, email/SMS/WhatsApp notification
providers, SEO strategy. These are V1 features to be built as custom modules /
integrations later — none are implemented in this foundation.
