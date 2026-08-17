# Local Development

Verified local development setup for the initialized repository (2026-08-15).

## Prerequisites (installed on this machine)

- Node.js v24.14.1 (official requirement: v20.19.0+ / v22.12.0+ LTS, < v25)
- pnpm 10.33.0 (root `packageManager` field pins `pnpm@10.33.0`)
- PostgreSQL 16.14 — system service on `localhost:5432`
- Redis 7.0.15 — system service on `localhost:6379` (supporting infra only)
- git 2.43.0
- Docker is NOT installed; local Postgres/Redis run as system services.

## Services

| Service | Address | Purpose | Authority |
| --- | --- | --- | --- |
| PostgreSQL | `localhost:5432` | Commerce database (`medusa-baby-store`) | authoritative |
| Redis | `localhost:6379` | Caching/graph-query cache/event bus/workflow engine/distributed locking (wired 2026-08-17) | supporting only |
| Medusa backend + Admin | `http://localhost:9000` | Commerce engine + Admin at `/app` | — |
| Next.js storefront | `http://localhost:8000` | Customer-facing storefront | — |

Redis runs as the `redis-server.service` systemd unit (supervised — it
restarts itself after a stop). Manage it with `sudo systemctl stop|start
redis-server`; the Medusa modules reconnect automatically after recovery.

## Database Setup (done during initialization)

```sql
-- Run as a PostgreSQL superuser once:
CREATE ROLE medusa LOGIN PASSWORD '<local-dev-password>';
CREATE DATABASE "medusa-baby-store" OWNER medusa;
```

The role `medusa` and database `medusa-baby-store` already exist on this
machine. The local dev password was generated at creation time and lives only
in `apps/backend/.env` (gitignored) — never commit it.

The role `medusa` also has the `CREATEDB` privilege (granted 2026-08-16), which
the backend integration test harness requires: `medusaIntegrationTestRunner`
creates one disposable database per test run
(`medusa-<name>-integration-<worker>`), migrates it, and drops it on cleanup.

## Environment Files

| File | Purpose |
| --- | --- |
| `apps/backend/.env` | Local backend env (gitignored; created by create-medusa-app) |
| `apps/backend/.env.test` | Test-only DB overrides for the integration harness (gitignored; `DB_HOST`/`DB_PORT`/`DB_USERNAME`/`DB_PASSWORD` derived from `DATABASE_URL` at setup, `NODE_ENV=test`) |
| `apps/backend/.env.example` | Names-only reference (documented) |
| `apps/backend/.env.template` | Starter-provided template (generated) |
| `apps/storefront/.env.local` | Local storefront env (gitignored; contains publishable key) |
| `apps/storefront/.env.example` | Names-only reference (documented) |

Copy `.env.example` → `.env` / `.env.local` when setting up a fresh machine.

## Starting Everything

```bash
# 1. Install workspace dependencies (already installed)
pnpm install

# 2. Backend (Medusa + Admin) — from apps/backend or via turbo
pnpm --filter @dtc/backend dev        # http://localhost:9000, Admin at /app

# 3. Storefront — from apps/storefront or via turbo (backend must be running)
pnpm --filter @dtc/storefront dev     # http://localhost:8000

# 4. Storefront unit tests (jest, node environment)
pnpm --filter @dtc/storefront test    # 124 tests / 17 suites (src/**/*.test.ts)
```

Root workspace shortcuts (turbo):

```bash
pnpm dev          # runs dev in all apps
pnpm build        # builds all apps
pnpm lint
pnpm test         # runs `test` scripts of all apps (storefront jest)
pnpm backend:dev
pnpm storefront:dev
```

## Seeding

Dev data lives in Medusa **migration scripts** (`apps/backend/src/migration-scripts/`),
executed with:

```bash
cd apps/backend
pnpm exec medusa db:migrate:scripts   # runs only pending scripts (tracked in script_migrations)
```

- `initial-data-seed.ts` — starter catalog/regions (Europe/eur, demo products,
  variants, prices). **Not idempotent** — it runs once; already recorded.
- `seed-markets.ts` — Pakistan (pkr) and UAE (aed) regions, PK/AE tax regions
  (zero-rate interim), sales channel ↔ publishable key link, pkr/aed variant
  prices with region rules (DEMO amounts 2500/45 — real pricing is the catalog
  phase), and the **dev/test payment provider binding**: both PK and AE
  regions get `pp_system_default` via `updateRegionsWorkflow` (idempotent;
  dev-only — production markets replace it with real gateways). **Idempotent**
  — safe to re-run (skipped once recorded). To RE-APPLY a modified seed on an
  already-seeded DB: `DELETE FROM script_migrations WHERE script_name =
  'seed-markets.ts'` (script name, not `name`) in the app DB, then
  `db:migrate:scripts` again.
- `seed-inventory.ts` — Karachi Warehouse (pk) and Dubai Warehouse (ae) stock
  locations, linked to every sales channel (re-using the starter's European
  Warehouse); one inventory item per SKU'd variant linked via
  `product_variant_inventory_item`; stock levels (DEMO quantity 100) at the
  demo warehouses only, so every variant is sellable in both markets.
  **Idempotent** — resolves existing records, never duplicates.
- `seed-catalog.ts` — replaces the starter demo catalog with the baby-clothing
  catalog (approved taxonomy AGENTS.md §8): 15 categories (display names per
  spec; handles namespaced, e.g. `girls-bottoms`, because
  `product_category.handle` is globally unique), 4 demo products with
  per-product Size (age range) + Color options and 30 variants (SKU, EAN,
  prices pkr/aed/eur/usd), tags `cotton`/`newborn`, collection
  "Newborn Essentials", and stock levels at the Karachi/Dubai warehouses.
  Gender lives in `product.metadata.gender` — never a category (no "Unisex"
  category). No product images (real photography is business content).
  **Idempotent** — re-runs change nothing.
  Run-order note: `db:migrate:scripts` executes files alphabetically, so on a
  fresh DB `seed-catalog` runs before `seed-inventory`; the catalog's own
  level-creation then finds no warehouses and is skipped, and
  `seed-inventory` completes levels for every SKU'd variant. On databases
  where inventory already exists (like this one), `seed-catalog` creates its
  own levels. Both orders produce identical end state.

Note: the core script `create-super-admin-role.js` stays listed as pending
forever — it is self-disabled unless the `rbac` feature flag is enabled
(`MEDUSA_FF_RBAC`, off by default). Admin RBAC is intentionally not enabled.

## Media & Storage (local development)

The backend runs with Medusa's **local file provider** by default
(`FILE_PROVIDER` unset in `.env`). Files uploaded through the admin API land
in `apps/backend/static/` and are served by the backend itself at
`http://localhost:9000/static/<key>` — see the storage ADR
(`docs/architecture/decisions/0001-storage-cloudflare-r2.md`) for the
production (Cloudflare R2) configuration.

- Upload surface: `POST /admin/uploads` (admin auth required; multipart field
  `files`). There is **no store-facing upload route** (verified).
- Validation (custom middleware in `src/api/middlewares.ts`, applied
  server-side after multipart parsing): MIME allowlist (jpeg/png/webp/gif/avif
  images only) and a size cap — `MEDUSA_UPLOAD_MAX_SIZE_MB` (default 5).
  Rejected uploads return 400 and are never persisted.
- Retrieve/delete: `GET /admin/uploads/:id`, `DELETE /admin/uploads/:id`.
- Cleanup: uploaded dev/test images accumulate in `apps/backend/static/`
  (gitignored); delete files through the admin API or remove the directory.

## Admin User

A local dev admin was created during initialization:

- Email: `admin@baby-store.local` (local dev only)
- Password: generated at creation time (reported in the initialization summary)

Create additional admins (backend must be able to reach the DB):

```bash
cd apps/backend
npx medusa user -e you@example.com -p 'your-password'
```

## Verification Checklist (all PASS on 2026-08-15)

```text
Backend:
  install    pnpm install                                        PASS
  build      pnpm --filter @dtc/backend build  (medusa build)    PASS
  lint       pnpm --filter @dtc/backend lint   (medusa lint)     PASS
  startup    pnpm --filter @dtc/backend dev                      PASS (http://localhost:9000)
  health     curl http://localhost:9000/health                   OK
  database   migrations applied (143 tables)                     PASS
  admin      http://localhost:9000/app → 200; login returns JWT  PASS

Frontend:
  install    pnpm install                                        PASS
  build      pnpm --filter @dtc/storefront build (next build)    PASS
  lint       pnpm --filter @dtc/storefront lint (next lint)      PASS (0 errors; 3 pre-existing warnings)
  startup    pnpm --filter @dtc/storefront dev                   PASS (http://localhost:8000)
  connection product/store pages render Medusa data              PASS
  markets    /pk, /ae, /dk render catalog with per-region prices PASS
             (PKR 2,500 / AED 45.00 / €12.00 — verified 2026-08-16)
  unit tests pnpm --filter @dtc/storefront test                  PASS (124/124)
  seo        /robots.txt + /sitemap.xml → 200                   PASS
             canonical + JSON-LD (Product/Breadcrumb/Organization) on
             product/category/home pages                         PASS
             deep category URLs (e.g. /pk/categories/baby-clothing/
             girls/girls-dresses) resolve; wrong chains → 404    PASS

Customer authentication (Phase 9, 2026-08-17, decisions BD-AUTH-01..04):
  providers  GET /auth/customer/providers → emailpass only
             (Google gate OFF: AUTH_GOOGLE_ENABLED unset)        PASS
  register   POST /auth/customer/emailpass/register → actorless
             JWT (registration never gated)                      PASS
  login      unverified → { verification_required: true, token }
             (actorless token → /store/customers/me 401)         PASS
  verify     code via `auth.verification_requested` event →
             /auth/verification/confirm → full token → me 200    PASS (integration)
  reset      /auth/customer/emailpass/reset-password → 201 for
             unknown identifiers too (no identity leak); token
             via `auth.password_reset` event; update provider
             with bearer reset token; new password logs in       PASS
  google     storefront button hidden when gate off; /api/auth/
             google + callback wired; E2E blocked on real
             Google Cloud OAuth credentials (deployment item)    PARTIAL
  pages      /pk/account (login), /pk/forgot-password,
             /pk/reset-password render (smoke-verified)          PASS

Redis:
  server     redis-cli ping → PONG                               PASS
  Medusa     wired 2026-08-17 (cache, caching, event bus, workflow
             engine, locking modules → Redis; see medusa-config.ts)
  caching    browse: miss ~0.20s → hit ~0.014s; `mc:*` keys in Redis  PASS
  sharing    second instance (:9100) hits keys written by :9000     PASS
  locking    `medusa_lock:*` keys observed during acquire/release    PASS
  outage     boot with Redis unreachable fails fast with clear error PASS

Backend integration tests (2026-08-16):
  pnpm --filter @dtc/backend test:integration:http               PASS
  (boots the app against a disposable test DB; GET /health → 200)
  suites: catalog 10, markets 3, inventory 6, storage 7, browsing 33,
  health 7 — 66/66 total PASS

Backend integration tests (2026-08-17, Redis modules wired):
  pnpm --filter @dtc/backend test:integration:http               PASS
  suites: health 1, markets 6, inventory 12, storage 7, catalog 10,
  browsing 33, shipping 6, payments 6, cart-ownership 8,
  customer-auth 9 — 98/98 total PASS
  (requires Redis running; stop `medusa develop` first — see below;
  observed 2026-08-17: with the dev server up, exactly the
  event-waiting customer-auth tests failed with `Timed out ... waiting
  for the captured event` — shared BullMQ queues; 98/98 again after
  stopping it)

Browse route (Phase 7, 2026-08-16):
  GET /store/products/browse requires the x-publishable-api-key header
  (same key as the storefront .env.local) plus region_id; supports
  q, gender, brand, season, material, category_id, tag_id, option_value_id,
  min_price, max_price, availability, sort_by, offset, limit. See
  ADR-0003 and integration-tests/http/browsing.spec.ts.
  curl -H "x-publishable-api-key: $NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY" \
    "http://localhost:9000/store/products/browse?region_id=reg_...&sort_by=price_asc"
  Note: the product query is cached (tag-invalidated); the availability
  helper caches with its own tags — zeroing stock during manual tests is
  reflected immediately because inventory level updates invalidate the
  relevant tags.
```

## Troubleshooting

- **`redisUrl not found. A fake redis instance will be used.`** — only appears
  when `REDIS_URL` is unset. With the Redis modules wired (2026-08-17) this is
  no longer expected: `.env` defines `REDIS_URL=redis://localhost:6379` and
  `MEDUSA_FF_CACHING=true` (enables the graph-query cache). If the log line
  reappears, check that `.env` is present and the service is up.
- **Redis-backed modules now wired** — `medusa-config.ts` registers
  `cache`, `caching` (provider `redis`), `eventBus`, `workflowEngine`, and
  `locking` against Redis. Log messages like "Local Event Bus installed" no
  longer appear. Queue/namespace defaults: `events-queue` (event bus),
  `bull:medusa-workflows*` (workflow engine), `mc:*` (cache),
  `medusa_lock:*` (locking). PostgreSQL remains the source of truth.
- **Integration tests require Redis and a quiet dev server** — the test
  harness boots the real `medusa-config.ts`, so Redis must be running. The
  test app uses the same Redis queues as `medusa develop`; a running dev
  server's BullMQ workers steal test jobs (and execute them against its own
  container/DB), which breaks suites non-deterministically. **Stop the dev
  server before running `test:integration:http`** and restart it afterwards.
  `jest.config.js` sets `testTimeout: 60000` because app boot with the Redis
  modules exceeds Jest's default 5s hook timeout.
- **Storefront redirects `/` → `/{countryCode}`** — the starter's locale
  middleware; the default region (`dk`) comes from seed data.
- **Stale catalog data after seeding/reseeding** — the storefront caches
  catalog fetches (`cache: "force-cache"` + tags) in
  `apps/storefront/.next/cache/fetch-cache`. After changing backend data
  (e.g. re-running `medusa db:migrate:scripts`), purge it so pages re-fetch:
  `rm -rf apps/storefront/.next/cache/fetch-cache`. This is a dev-workflow
  concern; production tag-revalidation strategy is a later-phase decision.
- **Storefront tests and env** — `jest.config.js` loads `.env.local` (then
  `.env`) into the process environment before loading `next.config.js`,
  whose `checkEnvVariables()` requires `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`.
- **`next build` clobbers dev `.next`** — running `pnpm build` while a dev
  server is up corrupts the dev build (manifest ENOENT errors, 500s). Stop
  the storefront dev server, run the build, then `rm -rf .next` and start
  `pnpm dev` again. Long-running dev sessions can also serve stale compiled
  modules after heavy edits — same cold-restart remedy.
- **SEO base URL in dev** — robots/sitemap/canonicals use `getBaseURL()`,
  which resolves to the dev origin. Production must set
  `NEXT_PUBLIC_SITE_URL` (see `src/lib/util/env.ts`, `src/lib/seo/site-config.ts`).
- **CORS issues** — adjust `STORE_CORS`/`ADMIN_CORS`/`AUTH_CORS` in
  `apps/backend/.env`.
- **pnpm peer warnings** — `.npmrc` sets `auto-install-peers=true` (generated).
