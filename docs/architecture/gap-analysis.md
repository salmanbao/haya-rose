# Architecture Gap Analysis

Gaps identified during the deep audit of the initialized Medusa v2.19.0
repository (2026-08-15). Gaps are documented, **not solved**, per task scope.
Each item notes evidence and the decision/action it awaits. Items marked
RESOLVED were closed during the Foundation implementation (2026-08-16).

## Required Before Feature Development

| # | Gap | Evidence | Notes |
| --- | --- | --- | --- |
| 1 | Storefront TypeScript does not pass `tsc --noEmit` (11 errors) | `npx tsc --noEmit` in `apps/storefront`: 9 errors in `src/lib/data/cart.ts` (`setAddresses` billing-address assignments, `FormDataEntryValue \| null` vs `string \| null \| undefined` — pre-existing starter code); 2 unused `@ts-expect-error` directives in `src/modules/layout/components/language-select/index.tsx` (introduced by the initialization lint fix) | **RESOLVED (2026-08-16)** — billing-address object cast to `HttpTypes.StoreUpdateCart["billing_address"]` (same pattern already used for `shipping_address`; runtime behavior unchanged); both `@ts-expect-error` directives removed. `tsc --noEmit` → 0 errors |
| 2 | Storefront build does not typecheck or lint | `next.config.js`: `typescript.ignoreBuildErrors: true`, `eslint.ignoreDuringBuilds: true` | **RESOLVED (2026-08-16)** — both flags set to `false`; `next build` now runs typecheck + lint and passes |
| 3 | No git repository | `git rev-parse` → "not a git repository"; no `.git` | **RESOLVED (2026-08-16)** — `git init` at repo root (no commits created yet; initial baseline commit is a separate decision) |
| 4 | No tests exist | Backend jest harness configured, 0 test files; storefront has no test framework | **RESOLVED (2026-08-16)** — backend integration harness established: `integration-tests/http/health.spec.ts` (smoke: app boot + `GET /health` → 200) PASS; required `jest.setTimeout` (official Medusa pattern), `apps/backend/.env.test` (gitignored, `DB_*` vars), and `CREATEDB` on the `medusa` role. Storefront jest harness established 2026-08-16 (gap #4 storefront part): `jest` + `next/jest`, 35 tests / 6 suites over pure lib modules (`money`, `env`, `isEmpty`, `get-percentage-diff`, `product-option-filters`, `get-product-price`) — see `docs/testing/README.md`. Backend unit/module suites remain empty until unit-testable custom code exists |
| 5 | Storefront lint warnings (3, pre-existing) | `react-hooks/exhaustive-deps` in shipping, shipping-address, product-actions | Non-blocking; still open 2026-08-16 — components are owned by later cart/checkout phases; re-evaluate there |
| 6 | Dependency vulnerabilities: `pnpm audit --prod` → 84 (4 low, 40 moderate, 39 high, 1 critical) | e.g. `apps__backend>@medusajs/cli>express>body-parser` (low) | Triage before production; upgrades require authorization per AGENTS.md §17 (Medusa 2.19.0 is version-locked) |
| 7 | Dev secrets use starter defaults | `JWT_SECRET=supersecret`, `COOKIE_SECRET=supersecret` in `apps/backend/.env` | Local-dev only; production must use secret manager values. No action until deployment phase |
| 8 | No `.env.example` for `DB_NAME`/admin onboarding parity | Starter `.env.template` includes `DB_NAME`; actual `.env` uses `DATABASE_URL` only | Cosmetic; consolidate env docs when convenient |
| 9 | Backend has no env/config validation (AGENTS.md §15 env-var boundary) | `medusa-config.ts` dereferenced `process.env.*` with no startup check; storefront had `check-env-variables.js`, backend none | **RESOLVED (2026-08-16)** — `src/config/env.ts`: `getMissingEnvVars`/`assertEnv` fail fast at startup naming missing required vars (`DATABASE_URL`, CORS, `JWT_SECRET`, `COOKIE_SECRET`, `AUTH_MFA_ENCRYPTION_KEY`; conditional `S3_*` set when `FILE_PROVIDER=s3`). Wired into `medusa-config.ts` (skipped when `NODE_ENV=test` — the integration runner supplies its own disposable DB). 11 unit tests in `src/config/__tests__/env.unit.spec.ts`; verified: `medusa build` PASS, integration suite 66/66 PASS |

## Required During Feature Development

| # | Gap | Notes |
| --- | --- | --- |
| 1 | PK/UAE markets not configured | DONE (2026-08-16): `src/migration-scripts/seed-markets.ts` creates PK/AE regions (pkr/aed), PK/AE tax regions (zero-rate interim), ensures sales channel ↔ publishable key link, adds pkr/aed variant prices with region rules (DEMO values 2500/45; real pricing is catalog phase). Run via `medusa db:migrate:scripts`; recorded in `script_migrations` (idempotent). Tested in `integration-tests/http/markets.spec.ts`. **Storefront market routing (B-MP-08) DONE (2026-08-16):** middleware rewritten per BD-M-01 — URL country code canonical, IP-geolocation auto-redirect removed (geolocation never authoritative), undetermined location routes to a market-selector page at `/` (BD-M-09) listing enabled markets (`NEXT_PUBLIC_ENABLED_MARKETS`, default pk,ae) derived from backend regions, with a non-authoritative geo *suggestion* banner. Pure helpers (`src/lib/util/market-routing.ts`, `market-selection.ts`) unit-tested (15 tests). `NEXT_PUBLIC_DEFAULT_REGION` is now legacy/unused for routing |
| 2 | Cloudflare R2 not integrated | **DONE (2026-08-16)** — native `file-s3` provider wired env-gated in `medusa-config.ts` (`FILE_PROVIDER=s3`; R2: access-key auth, `acl: false`, `forcePathStyle`, region `auto`, endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `file_url` = public delivery base). Default (unset) = local provider for dev/test. Upload hardening middleware (`src/api/middlewares.ts`): MIME allowlist + size cap (`MEDUSA_UPLOAD_MAX_SIZE_MB`), server-side, post-parse. Tested in `integration-tests/http/storage.spec.ts` (7 tests) against the local provider. ADR: `decisions/0001-storage-cloudflare-r2.md`. Residual backlog: core multer buffers multipart in memory (no pre-parse limits) — validated post-parse; deferred to security-hardening phase (see ADR) |
| 2b | Starter demo catalog not replaced | DONE (2026-08-16): `src/migration-scripts/seed-catalog.ts` deletes the starter catalog (products/options/categories/inventory) and seeds the approved taxonomy (AGENTS.md §8): 15 categories (`Baby Clothing → Girls/Boys → 12 leaves`; display names exact, handles namespaced — global unique handle index), 4 demo products × per-product Size/Color options = 30 variants (SKU/EAN/prices pkr/aed/eur/usd; `manage_inventory`), tags + "Newborn Essentials" collection, levels (100) at Karachi/Dubai. Gender = `product.metadata.gender`, no Unisex category. No images (business content). Idempotent; recorded in `script_migrations`. Tested in `integration-tests/http/catalog.spec.ts` (10 tests). Real products/pricing/photography remain business content for later phases |
| 3 | Redis-backed modules not wired | Decide whether to enable `caching-redis` / `event-bus-redis` / `workflow-engine-redis` / `locking-redis`; in-memory is the official dev default |
| 4 | Google customer auth not enabled | `auth-google` installed; requires module configuration (V1 requirement) |
| 5 | Custom V1 modules not built (none exist) | Wishlist, reviews, bundles, recommendations, recently viewed, abandoned cart — see capability matrix |
| 6 | Search not enabled/configured | `@medusajs/search` + `search-local` installed; module requires explicit config. Search/filtering is a V1 feature. **PARTIAL (2026-08-16):** backend browse route (`GET /store/products/browse`, ADR-0003) covers server-side search/filter/sort with exact counts up to a 1000-candidate cap (metadata/price/availability filters applied server-side over candidates; counts exact up to the cap). A search provider (Elasticsearch/OpenSearch or `search-local` module) is required when the catalog exceeds the cap; `q` currently uses the product module's native text matching, not a search engine's relevance ranking |
| 7 | Notification providers not selected | Email/SMS/WhatsApp; notification module native, sendgrid provider installed (not enabled) |
| 8 | Storefront SEO beyond starter baseline | No JSON-LD; slug/URL strategy, canonicalization, filter-param indexing policy needed (AGENTS.md §18) |
| 9 | i18n language set | Backend `/store/locales` endpoint exists; supported locales not finalized |
| 10 | Pricing/markets verification for PKR/AED | Price lists + rules native; per-market price setup requires business spec (markets/pricing) |
| 11 | Storefront catalog-data freshness | Starter caches catalog fetches `cache: "force-cache"` (tagged) in `.next/cache/fetch-cache`; entries persist across dev restarts and serve deleted records after reseeds (observed 2026-08-16: footer/nav showed removed starter categories until `rm -rf apps/storefront/.next/cache/fetch-cache`). Dev workflow documented in `docs/infrastructure/local-development.md`. Production invalidation strategy (e.g. backend event → storefront revalidation route) is a later-phase decision (browsing/SEO or notifications phase) — not implemented here |
| 12 | Low-stock notification trigger (BD-I-03) | **DONE (2026-08-16)** — per-level low-stock threshold stored in native `inventory_level.metadata.low_stock_threshold` (JSONB; verified the module persists it — the input sanitizer only strips `reserved_quantity`); subscriber `src/subscribers/inventory-low-stock.ts` on `inventory.inventory-level.updated/.created` (module events — every module-service mutation funnels through them; workflow events would double-emit since workflow steps call the module) emits the `inventory.low_stock` domain event when a level with a threshold is at/below it. Never mutates inventory (REQ-INV-017). Pure helper `src/inventory/low-stock.ts` unit-tested (10); integration tests (3) prove crossing emits once with correct payload, above-threshold emits none, no-threshold emits none. Seed sets demo threshold 10. **Notification channel (merchant email) DEFERRED to the Notifications specification** (BD-I-03: channels later) |
| 13 | Customer-cart ownership enforcement (T-CC-01, REQ-CC-003) | **DONE (2026-08-16)** — pure decision helper `src/api/store/carts/ownership.ts` + global store middleware in `src/api/middlewares.ts` on `/store/carts/:id` (routes sorter places global middlewares before native routes; `req.scope` + store auth `allowUnauthenticated` verified). Semantics: **unauthenticated requests use the guest bearer-credential model (allowed)** — required because native `findOrCreateCustomerStep` sets `customer_id` on any cart created/updated with an email, and approved guest checkout (BD-G-01) must not be blocked; **authenticated requests are ownership-checked** — an actor whose `actor_id` ≠ cart `customer_id` gets 403 (FORBIDDEN, per the spec error model; NOT_ALLOWED would map to 400 — verified in the error handler) without revealing the cart's existence; unknown cart IDs defer to the native 404. Unit tests (7) + integration tests (8) in `integration-tests/http/cart-ownership.spec.ts` cover guest carts, guest-with-email carts, owner access, cross-customer 403, and subroute (line-items) enforcement. **T-CC-02 verified (no code):** `completeCartWorkflow` builds the order from the cart snapshot (`unitPrice: item.unit_price`) and never re-fetches catalog prices; `refreshCartItemsWorkflow` exists as the explicit refresh mechanism (per B-CC-05/BD-C-04) |
| 14 | Payment provider integration boundaries (Phase 5) | **PARTIAL DONE (2026-08-16)** — native payment pipeline verified and exercised by `integration-tests/http/payments.spec.ts` (6 tests): region-scoped store provider listing via `region_payment_provider` (REQ-PAY-003), collection + single-authoritative-session creation (REQ-PAY-004/030), authorize-at-completion order-first flow (REQ-PAY-006), capture-once/duplicate-capture-idempotent + concurrency row-lock guard (REQ-PAY-010/031), refund ≤ captured + over-refund rejected (REQ-PAY-011), and the native webhook pipeline `POST /hooks/payment/:provider` → `payment.webhook_received` → shipped subscriber → `processPaymentWorkflow` (REQ-PAY-027; system provider maps to `not_supported`). **Stripe (UAE/AED) scaffolding DONE:** `@medusajs/payment-stripe@2.19.0` added (exact locked version; official Medusa provider); env-gated registration in `medusa-config.ts` (`PAYMENT_PROVIDER=stripe` → provider key `pp_stripe_stripe`); conditional Stripe env validation in `src/config/env.ts` (names only: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; `STRIPE_PUBLISHABLE_KEY` documented for the storefront); `.env.example` updated; AE region binds Stripe in `seed-markets.ts` when registered (T-PAY-02). **AssanPay (PK/PKR) NOT implemented — BLOCKED_PENDING_PROVIDER_VERIFICATION** (hard gates: API auth, webhook contract, refund API, base URL, status vocabulary, capture/cancel semantics, 3DS). No fake adapters; no xPay references reactivated. Env unit tests +4 (15 total) |
| 15 | Shipping & fulfillment per-market topology + native fulfillment (Phase 5) | **DONE (2026-08-16)** — per-market sales channels (BD-I-01/BD-I-04): `seed-utils/market-channels.ts` (idempotent PK/AE channel creation) + `seed-shipping.ts` (PK/AE fulfillment sets + geo zones + flat-rate options, `manual_manual` provider links, default-channel cleanup, region `metadata.sales_channel_id`, publishable-key links). Storefront passes the market channel at cart creation/region switch (`resolve-cart-sales-channel.ts` + 6 unit tests). Verified by `integration-tests/http/shipping.spec.ts` (6 tests): **REQ-SHIP-007** eligibility isolation (PK cart sees only PK option, AE only AE — channel + geo-zone chain); **BD-I-01/T-SHIP-14** same-market reservation (PK completion reserves at Karachi, AE at Dubai — `prepareConfirmInventoryInput` scopes by cart channel + `reserveInventoryStep` uses `location_ids[0]`, both verified in installed source); **REQ-SHIP-014/019** admin-only fulfillment (store attempt rejected + creates no fulfillment) consumes the same-market reservation and deducts at the fulfillment-set location; **B-SHIP-24** no payment-state gate (fulfillment succeeds without capture); **REQ-SHIP-015** shipment + native `fulfillment_label` tracking storage; **REQ-SHIP-020** cancel restores the full reservation; **REQ-SHIP-016** mark-as-delivered. **TCS/Aramex adapters NOT implemented — provider contracts UNVERIFIED** (no fake adapters); tracking sync (T-SHIP-04/07) deferred to provider verification. Integration tests +6 (89 total) |

## Production-Readiness Gaps

- Deployment: no Vercel config, no VPS/systemd/PM2 setup, no CI/CD, no Docker files.
- Secrets management: no production secret strategy; `.env` is local-only.
- Redis production modules (event bus, workflow engine, caching) not enabled.
- Observability: `instrumentation.ts` is a commented-out example; no logging/monitoring strategy.
- Rate limiting: none configured.
- Sitemap/robots: RESOLVED (Phase 6, 2026-08-16) — implemented as Next.js `MetadataRoute` (`src/app/robots.ts`, `src/app/sitemap.ts`); the starter's `next-sitemap` configuration is NOT used. Base URL is env-driven (`getBaseURL`); production must set `NEXT_PUBLIC_SITE_URL` so robots/sitemap/canonicals use the public origin.
- Image optimization disabled (`unoptimized: true`) — decide policy for production media delivery.
- Audit logging for sensitive admin actions: none (AGENTS.md §19).
- Error tracking, structured logging: none beyond Medusa defaults.
- Dependency vulnerability remediation (see above).

## System-Level Audit (2026-08-16)

A cross-specification consistency, dependency, and architecture audit of the
seven domain specifications was completed:

- `docs/architecture/cross-specification-audit.md` — system-level audit; **no
  CRITICAL findings, no formal contradictions**; three HIGH security findings
  already registered by the specs (`POST /store/returns` unauthenticated +
  customer-supplied `return_shipping.price` — T-RET-01/02; `GET /store/orders/:id`
  unauthenticated — B-ORD-01/T-ORD-09; cart-ID-addressed routes — T-CC-01); one
  MEDIUM cross-spec gap (guest order → return path, Finding G-1); status
  **READY FOR BUSINESS DECISIONS**.
- `docs/architecture/consolidated-decision-register.md` — all 119 B-* + 69 T-*
  decisions consolidated, grouped by when they must be resolved (provisional
  IDs assigned to the MP/INV registers, which previously had none).
- `docs/architecture/implementation-dependency-graph.md` — derived
  implementation sequence (Foundation → Markets/Pricing → Inventory →
  Cart/Checkout → Payments → Shipping → Orders → Returns/Refunds → supporting
  features); agrees with AGENTS.md §22.
- AGENTS.md impact assessment: **no AGENTS.md changes required** (audit §33).

## Business Decision Resolution Package (2026-08-16)

The cross-spec audit's 119 business decisions (69 technical) are normalized
into a reviewable package. **Resolution status: COMPLETE (2026-08-16) — all
40 user decisions answered and APPROVED.** The questionnaire retains the
original options for traceability; the authoritative final status of every
canonical decision is the resolution record in
`docs/architecture/consolidated-decision-register.md`.

- `docs/architecture/business-decision-questionnaire.md` — the product-owner
  questionnaire: **40 user decisions** (17 foundational BD-M-01..BD-O-02 in
  full format + 23 P1 quick ticks). Foundational set: BD-M-01 (market
  selection), BD-M-02 (tax), BD-M-04 (stacking), BD-M-08 (cross-currency),
  BD-P-01/02 (payment providers), BD-P-03 (COD), BD-S-01 (rate model),
  BD-I-01 (allocation), BD-I-02 (backorder), BD-G-01 (guest policy),
  BD-O-01 (order lookup — security), BD-R-05 (refund policy — collapses 7
  IDs), BD-R-01/02/03 (return window/approval/eligibility), BD-O-02
  (cancellation).
- `docs/architecture/business-decision-dependency-graph.md` — normalization
  (119 → 89 canonical), dependency tree, P0 (13) / P1 (42) / P2 (25) / P3
  (8) classification, technical-decision filter (user answers **no**
  technical decisions), provider-vs-verification separation, security
  isolation (T-CC-01/T-ORD-09/T-RET-01/02 policy vs mandatory enforcement).
- Canonical IDs (BD-*) supersede the raw register IDs for decision tracking;
  `consolidated-decision-register.md` retains the full mapping.

### Blocking classification — RESOLVED (2026-08-16)

- **P0 (13):** BD-M-01, BD-M-02, BD-M-04, BD-M-08, BD-P-01, BD-P-02,
  BD-P-03, BD-S-01, BD-I-01, BD-I-02, BD-G-01, BD-O-01, BD-R-05 — **all
  APPROVED.**
- **P1 (42):** all APPROVED or DERIVED (see the resolution record).
- **P2 (25) / P3 (8):** DEFERRED — no architectural rework if changed later.
- **DERIVED / MEDUSA_DEFINED / IMPLEMENTATION_DEFINED /
  PROVIDER_VERIFICATION_REQUIRED / DEFERRED:** no further user decision.
- **Security:** BD-G-01 + BD-O-01 (order lookup) + BD-R-02 (return
  approval) resolve the audit's HIGH findings A-1/A-2/A-3 **conceptually**;
  the enforcement mechanisms remain technical (T-CC-01, T-ORD-09,
  T-RET-01/02), non-negotiable, and are implemented at the relevant domain
  stage — no source code has changed.

### Remaining implementation gates (BLOCKING — not decisions)

- **PK GST numeric rate — RESOLVED (2026-08-16): 17%** (user-approved); seeded via `seed-markets.ts` tax rates (code GST, default) and asserted in `markets.spec.ts`.
- **AE VAT numeric rate — RESOLVED (2026-08-16): 5%** (user-approved); seeded via `seed-markets.ts` tax rates (code VAT, default) and asserted in `markets.spec.ts`.
- **AssanPay (PK) contract verification — PARTIALLY VERIFIED (2026-08-16):**
  core redirect/cashier lifecycle verified against official docs
  (docs.assanpay.com Integration Manual + assanpay.com): create payment
  request (`POST /payment-request/{merchantId}`), hosted payment page via
  `completeLink`, status inquiry (`GET /payment/all-inquiry/…`), PKR
  amounts in major units (2 decimals), API Key + Secret Key per branch,
  configurable webhook URL, test mode. **Still UNVERIFIED/TBD (HARD GATES):
  HTTP authentication for API calls, webhook payload/signature contract,
  refund API availability, full status vocabulary, 3DS, API base URL** —
  see `docs/architecture/provider-verification/assanpay-verification.md`.
  Payment implementation remains blocked on these (REQ-PAY-022/013/014/001).
- **Stripe (AE) contract verification — VERIFIED (2026-08-16):** AED,
  PaymentIntent model, webhook signature + event mapping, refunds,
  idempotency confirmed against official Stripe docs and the bundled
  `@medusajs/payment-stripe@2.19.0` source; remaining items are account
  keys + Dashboard webhook/event configuration (REQ-PAY-023).
- **TCS/Aramex contract verification** — at shipping implementation stage
  (REQ-SHIP-037/038).

### NON-BLOCKING

- P2/P3 deferred decisions (all listed in the register; none block V1).
- Provider capabilities requiring official-documentation verification
  (partial capture, fraud rules, service levels, return shipping provider,
  insurance, package limits, address correction).
- Implementation-time technical decisions already classified as such
  (IMPLEMENTATION_DEFINED — agent decides at the relevant stage).

## Business Decisions — RESOLVED (2026-08-16)

(All previously-listed required decisions are now APPROVED/DERIVED; the
entries below are preserved as historical record and reflect the approved
policies.)

- Return policy (window, eligibility, return shipping responsibility, sale items).
- Refund eligibility + COD refund behavior.
- Cancellation windows/rules.
- Discount stacking rules.
- Review eligibility (verified-purchase).
- Inventory/backorder/overselling policy + low-stock thresholds.
- Tax rules (PK, UAE) incl. tax-inclusive/exclusive display policy.
- Markets & pricing decisions surfaced by `docs/specifications/markets-and-pricing.md` (Business Decision Register): market-selection authority, price rounding policy, discount stacking/priority, minimum order value, sale pricing, COD, customer/wholesale pricing, cross-currency refunds, per-market default region.
- Inventory & warehouses decisions surfaced by `docs/specifications/inventory-and-warehouses.md` (Business Decision Register): warehouse allocation strategy, backorder policy, low-stock threshold/recipient/channels, cross-market location availability, split fulfillment, return-to-stock disposition, cart-quantity pre-check.
- Cart & checkout decisions surfaced by `docs/specifications/cart-and-checkout.md` (Business Decision Register): cart expiration/guest cart lifetime, cart merge on login, reservation timing, market/currency switching on existing cart, guest email + address requirements, promotion stacking/minimum order value, tax-inclusive/exclusive, COD, checkout retry.
- Cart & checkout technical gaps: customer-cart ownership enforcement (store cart routes are cart-ID-addressed; no server-side `customer_id` check — T-CC-01), line-item price refresh policy (T-CC-02), rate limiting on cart/checkout/coupon paths (T-CC-03).
- Orders decisions surfaced by `docs/specifications/orders.md` (Business Decision Register B-ORD-01..22): guest/order lookup policy incl. single-order retrieval access (B-ORD-01 — native `GET /store/orders/:id` is unauthenticated + ID-addressed, source TODO), customer cancellation window (B-ORD-02), cancellation after payment/fulfillment (B-ORD-03/04), partial cancellation (B-ORD-05), order modification policy (B-ORD-06), address-change policy (B-ORD-07), order number format (B-ORD-08), invoice requirements (B-ORD-09), customer-visible statuses (B-ORD-10), admin override policy (B-ORD-11), failed-payment/expired order retention (B-ORD-13/14), archival/retention/anonymization (B-ORD-15/16/17), notification policy (B-ORD-18), guest account association (B-ORD-19), order completion semantics (B-ORD-20), draft orders usage (B-ORD-21), claims/exchanges (B-ORD-22). COD order behavior deferred to payments B-PAY-03 (B-ORD-12).
- Orders technical gaps (spec Technical Decision Register T-ORD-01..17): **single-order retrieval enforcement** (custom store middleware/route override per B-ORD-01 — T-ORD-09; analog of T-CC-01), order-number generation (T-ORD-07), audit mechanism (native attribution vs custom view — T-ORD-11), reconciliation job (T-ORD-12), order search strategy (native query + export; no Elasticsearch — T-ORD-13), historical data retention (T-ORD-14), order edit/versioning usage (T-ORD-17). Verified: order lifecycle/payment/fulfillment statuses are computed and independent (`OrderStatus` + `getLastPaymentStatus`/`getLastFulfillmentStatus`); `cancelOrderWorkflow` is the full native cancellation contract (refund captured, cancel uncaptured, restore reservations, block completed/non-canceled-fulfillment orders); admin order routes carry RBAC policies; `GET /store/orders` is customer-scoped server-side.
- Returns & refunds decisions surfaced by `docs/specifications/returns-and-refunds.md` (Business Decision Register B-RET-01..25 — **all RESOLVED 2026-08-16**): 14-day return window (BD-R-01), auto-accept + inspect on receipt (BD-R-02/04), hygiene/non-sellable excluded, sale items returnable (BD-R-03), customer-paid return shipping (BD-S-09), refund to original method after receipt, no restock fee (BD-R-05), return cancellation until shipped (BD-R-06), return shipment required (BD-R-07), retention/anonymization per legal minimum (BD-O-13), exchange/replacement not offered (BD-O-18); deferred: reconciliation cadence (BD-P-13), attempt limits (BD-R-08). COD refund behavior: **no COD in V1** (B-PAY-03).
- Returns & refunds technical gaps (spec Technical Decision Register T-RET-01..15): **store return route hardening** — native `POST /store/returns` has NO authentication middleware and accepts customer-supplied `order_id` + `return_shipping.price` (verified schema); custom auth/ownership/server-side-cost hardening required (REQ-RET-002/003 — T-RET-01/02; analog of T-CC-01/T-ORD-09; the approved BD-G-01/BD-R-02 policies determine the required behavior — enforcement is an implementation task), customer return/refund view API ownership scoping (T-RET-04), verify exact inventory-restoration step + idempotency in the receive-return flow against installed source (T-RET-10), return-shipping provider integration for TCS/Aramex UNVERIFIED (T-RET-03/11/14), refund workflow mapping + idempotency persistence (T-RET-05/07), concurrency ownership native-locks-first (T-RET-09), audit mechanism (T-RET-12), reconciliation job post-provider-selection (T-RET-13). Verified: `Return`/`ReturnItem`/`ReturnReason` models + `ReturnStatus` (open/requested/received/partially_received/canceled); 21 native return workflows; `createAndCompleteReturnOrderWorkflow` validates refund ≤ order item total; `receiveAndCompleteReturnOrderWorkflow` validates non-canceled return + item membership; admin return routes RBAC (`return` read/create/update); admin refund `POST /admin/payments/:id/refund` (RBAC `refund` create); events `order.return_requested`/`order.return_received`.
- Payments decisions surfaced by `docs/specifications/payments.md` (Business Decision Register — **all RESOLVED 2026-08-16**): **AssanPay = PK provider (replaces earlier xPay selection — provider replacement requested before implementation), Stripe = AE provider** (contract verification per `docs/architecture/provider-verification/`), no COD, retry policy (bounded 3), provider fallback (fail first), cross-currency refunds refused; deferred: session expiry (implementation), partial capture/fraud rules (provider verification), min/max amounts, restrictions, reconciliation frequency, manual overrides, settlement reporting.
- Shipping & fulfillment decisions surfaced by `docs/specifications/shipping-and-fulfillment.md` (Business Decision Register B-SHIP-01..25 — **all RESOLVED 2026-08-16**): same-market allocation (BD-I-01), hybrid flat→calculated rate model (BD-S-01), no free-shipping threshold (BD-S-02), no COD (BD-P-03), no international shipping PK↔AE (BD-S-11), customer-paid return shipping (BD-S-09), no payment-state gate for fulfillment (BD-S-19), per-market address fields (BD-C-06), shipping-fee refund none on returns (BD-S-18), shipment cancellation N/A (BD-S-08); provider-verification: service levels (BD-S-03), insurance (BD-S-05), package limits (BD-S-06), return shipping provider (BD-S-10), address correction (BD-S-13); deferred: delivery estimates, failed-delivery, surcharges, provider fallback, exceptions, manual fulfillment.
- Shipping & fulfillment technical gaps (spec Technical Decision Register T-SHIP-01..15): TCS/Aramex API contracts UNVERIFIED (verify against official docs before adapter implementation — REQ-SHIP-037/038), tracking sync mechanism (webhook vs poll — T-SHIP-04), **no native fulfillment webhook route** (only `hooks/payment` exists — custom provider-boundary route or polling required, T-SHIP-07), retry policy values (T-SHIP-05), weight/dimension pricing applicability (T-SHIP-06), allocation-step placement (T-SHIP-14), label binary storage via file/R2 (T-SHIP-08). Resolved since the deep audit: `addShippingMethodToCartWorkflow` refreshes the payment collection (verified); `cancelOrderFulfillmentWorkflow` re-creates/updates reservations for unfulfilled quantities (verified — closes inventory spec §16 open item); admin fulfillment/shipping routes carry native RBAC policies (verified).
- Payments technical gaps (spec `docs/specifications/payments.md`, Technical Decision Register T-PAY-01..10): provider registration + region binding (T-PAY-01/02), authorization→capture timing (T-PAY-03), **webhook entry is NATIVE** — `POST /hooks/payment/:provider` → `payment.webhook_received` event → shipped subscriber → `processPaymentWorkflow`; provider-side signature verification inside `getWebhookActionAndData`; configure `webhook_delay` (default 5000ms)/`webhook_retries` (default 3) (T-PAY-04/10), reconciliation job (T-PAY-05), retry values (T-PAY-06), rate limiting on payment/webhook routes (T-PAY-07), admin extension boundaries (T-PAY-08), Redis role (T-PAY-09). Partial capture/refund are natively supported at the module level (provider capability is the only external constraint).
- Notification/communication consent policy (transactional vs marketing) — DEFERRED to the notifications spec (non-blocking for V1 core).
- Abandoned-cart classification + consent — DEFERRED (feature not yet implemented).
- Order state vocabulary/transitions beyond Medusa defaults — none required; native state machines authoritative.
- Final localization language set — DEFERRED (architecture is locale-configurable; AGENTS.md §10).

## Provider Decisions — RESOLVED (2026-08-16)

- Pakistan payment gateway: **AssanPay selected** (replaces earlier xPay selection; contract verification in progress — see `docs/architecture/provider-verification/assanpay-verification.md`).
- UAE payment gateway: **Stripe selected** (contract verified — see `docs/architecture/provider-verification/stripe-verification.md`).
- TCS integration terms/credentials (shipping) — contract verification at shipping implementation stage.
- Aramex integration terms/credentials (shipping) — contract verification at shipping implementation stage.
- Email/SMS/WhatsApp notification providers — not selected (notifications spec, deferred).
- (Approved already: Cloudflare R2 for media; Vercel for storefront; VPS for backend.)

## Authentication Gaps

(Approved direction: Medusa-native customer authentication — see `authentication-authorization.md`; implementation/configuration pending)

- **Medusa email/password configuration** — provider enabled in baseline (verified); confirm production hardening (password policy, rate limiting) at implementation.
- **Google OAuth configuration** — `@medusajs/auth-google` installed; requires provider registration (module config), options `clientId`/`clientSecret`/`callbackUrl` (verified in installed source), Google Cloud OAuth client, callback/redirect URL, and env-var strategy (names to be confirmed against official docs at configuration time).
- **Customer authorization verification** — plan tests proving customer A cannot access customer B's carts/orders/addresses/profile (IDOR).
- **Session behavior** — token vs cookie-session choice, lifetime, refresh, revocation — verify against installed auth session/token routes before implementation.
- **Password reset** — verify Medusa's customer password-reset capability against installed 2.19.0; policy unresolved.
- **Email verification** — storefront starter implements verification-required flows (verified in `customer.ts`); policy unresolved.
- **Authentication security testing** — auth-flow tests (register, login, logout, expiry, IDOR) — none exist yet.
- **Rate limiting** — login/password-op rate limiting (verify native Medusa capability; configure).
- **Production secret configuration** — JWT/COOKIE secrets + Google credentials via secret manager (current `.env` uses dev defaults).
- **Authentication E2E testing** — register/login/logout/Google E2E (sandbox) — to be added with implementation.

## SEO Foundation (Phase 6, 2026-08-16)

Implemented (deliberate policy, see `docs/architecture/decisions/0002-seo-foundation.md`):

- Site-wide metadata (title template, description, Open Graph, robots) via Next.js Metadata API; brand placeholder (`Medusa Store`) is env-overridable via `NEXT_PUBLIC_SITE_NAME` / `NEXT_PUBLIC_SITE_DESCRIPTION` (demo content, per §8 convention).
- Canonical policy: absolute, strips all filter params (`v_id`, `sortBy`, `optionValueIds`), keeps `page=N` when N>1. Category URLs canonicalize to the full hierarchy path (flat leaf URLs consolidate to the deep URL).
- Category URL resolution: full hierarchy paths (e.g. `/pk/categories/baby-clothing/girls/girls-dresses`) now resolve; wrong ancestor chains 404; flat leaf URLs still work. Requires `include_descendants_tree=true` — verified that the store API does NOT populate `parent_category` on nested tree nodes and does not expand `parent_category.parent_category` beyond depth 1.
- robots.txt (allow all + sitemap reference) and XML sitemap (every region × home, full category paths, collections, products) — data-driven from regions/catalog.
- JSON-LD: Organization (home), Product (offers/price/currency/availability derived from authoritative `calculated_price` + shared `isVariantAvailable`), BreadcrumbList (product + category pages).
- 9 countries in sitemap because the starter's leftover "Europe" region (dk/fr/de/it/es/se/gb) still exists alongside Pakistan/UAE — pre-existing baseline data, untouched.

Remaining SEO gaps (business-gated, not implemented):

- **hreflang / locale alternates** — deferred: language set not finalized (§10). Root layout still hardcodes `lang="en"`.
- **Filter/query-parameter indexing policy** — canonical strips filters, but deliberate noindex-for-filtered-combinations guidance is deferred to the browsing/search phase (§18 "Filter/query parameter indexing").
- **Backorder availability in schema** — `allow_backorder` currently maps to `InStock`; schema-level "preorder/backorder" distinction deferred.
- **B-MP-08 impact** — pending canonical/slug consolidation decision (register line 150) may affect category URLs; re-verify when resolved.
- Production base URL (`NEXT_PUBLIC_SITE_URL`) must be set in deployment config.

## Historical Note — Better Auth Proposal (REJECTED — NOT ACTIVE)

On a previous task (2026-08-15) Better Auth was proposed as the customer authentication layer. That proposal was reviewed and **rejected**; the project uses **Medusa-native customer authentication**. This note is retained for history only. It is NOT an active requirement and must not be implemented. AGENTS.md states: Better Auth — NOT USED.

## Medusa Admin Extension Gaps

(Standard Medusa Admin initially; custom Admin UI is a later, extension-based requirement)

- **Exact Admin extension mechanism** — verify against installed `@medusajs/admin-sdk` 2.19.0 / `@medusajs/dashboard` before any custom Admin UI.
- **Admin SDK verification** — inspect installed Admin SDK types/source and official docs for the exact installed version.
- **Context7 verification** — use Context7 MCP to verify Admin extension APIs where available (AGENTS.md §27).
- **Custom Admin UI requirements** — none defined yet; must remain an extension of the standard Medusa Admin (no parallel admin app).

## Unknowns Requiring Medusa Verification

- Exact behavior of Medusa's default local file provider (uploads/presigned URLs) — not exercised.
- Search module (`search-local`) enablement and query behavior — requires verification when search is built.
- Price-list customer-specific pricing details against installed 2.19.0 (native, but untested).
- `credit_line` table present in schema — determine relationship to V1 scope (gift cards excluded; verify it is unused default schema).
- Bundle approach (no native bundle concept) — extension design must be verified against installed workflows before implementation.
- Customer auth cookie/session behavior at scale (starter uses `_medusa_jwt` cookie).
- Exact CORS requirements for production origins (storefront domain, admin domain).
