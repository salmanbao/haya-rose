# System Overview

## Approved Architecture (from AGENTS.md §3 — fixed)

```text
Customers
    ↓
Next.js storefront (Vercel)   ← apps/storefront (official Medusa Next.js Starter)
    ↓
Medusa v2 backend (VPS)       ← apps/backend (Medusa v2.19.0 + standard Medusa Admin)
    ├── PostgreSQL             authoritative commerce database
    ├── Redis                  caching / sessions / temporary state only
    └── Cloudflare R2          product media (production target)

Markets:
  Pakistan (PKR)  — payment provider NOT YET SELECTED  — TCS shipping
  UAE (AED)       — payment provider NOT YET SELECTED  — Aramex shipping
```

- Single merchant, B2C/D2C. No marketplace, no vendors/sellers.
- Standard Medusa Admin (no custom admin app).
- PostgreSQL is the source of truth. Redis is supporting infrastructure only.
- No Elasticsearch, Kafka, microservices, or second primary database.

## Components in This Repository

### 1. Medusa Backend (`apps/backend`)

The commerce engine. Currently running the **official generated baseline**:

- `medusa-config.ts` — database URL, CORS, JWT/cookie secrets.
- Standard Medusa Admin served at `http://localhost:9000/app`.
- Core commerce modules auto-loaded by `@medusajs/medusa` (product, cart,
  order, customer, pricing, promotion, inventory, fulfillment, payment, region,
  sales channel, tax, etc. — see [medusa-capabilities.md](./medusa-capabilities.md)).
- Extension directories scaffolded but empty (`src/api`, `src/workflows`,
  `src/modules`, `src/jobs`, `src/subscribers`, `src/links`, `src/admin`).
- Seed data (`src/migration-scripts/initial-data-seed.ts`) inserted the
  starter's sample catalog (e.g. "Medusa T-Shirt") and a default "Europe"
  region.

### 2. Next.js Storefront (`apps/storefront`)

The official Medusa Next.js Starter (dtc-starter v1.0.3):

- Next.js 15 App Router, React Server Components by default, TypeScript strict.
- Connects to the backend via `@medusajs/js-sdk` (2.19.0) using the
  publishable API key + `NEXT_PUBLIC_MEDUSA_BACKEND_URL`.
- Runs at `http://localhost:8000` in development.
- Locale/region routing: `/` redirects to `/{countryCode}` (default region
  from seed data).

### 3. Local Infrastructure (development)

- **PostgreSQL 16.14** — system service on `localhost:5432`. Dedicated role
  `medusa` and database `medusa-baby-store` were created for this project.
- **Redis 7.0.15** — system service on `localhost:6379`. Running and
  reachable (`REDIS_URL=redis://localhost:6379` in the backend `.env`), but the
  generated baseline does not wire Redis into Medusa yet (Medusa falls back to
  in-memory caching/event-bus/workflow-engine — the official dev default).
  See [medusa-capabilities.md](./medusa-capabilities.md) and
  [../infrastructure/local-development.md](../infrastructure/local-development.md).

## Data Flow (verified during initialization)

```text
Customer browser → Next.js storefront (:8000)
                     │  SDK request with x-publishable-api-key
                     ▼
                 Medusa backend (:9000)
                     │  /store/*, /auth/*, /admin/* routes
                     ▼
                 PostgreSQL (medusa-baby-store)   ← authoritative state
                 Redis (:6379)                    ← not yet wired (baseline)
```

Verified end-to-end: storefront home/product/store pages render product data
served by the Medusa backend from the PostgreSQL database.

## Deployment Targets (PLANNED — NOT IMPLEMENTED)

- Storefront on **Vercel**.
- Backend on a **VPS**.
- Product media on **Cloudflare R2** (via Medusa's native file module with the
  S3-compatible provider — see [medusa-capabilities.md](./medusa-capabilities.md)).
- Pakistan/UAE payment gateways: **not selected**; integration boundaries only,
  per AGENTS.md. No fake adapters exist.
- TCS (PK) and Aramex (UAE) shipping: **not selected/integrated**.
