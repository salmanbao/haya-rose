# Technology Stack (verified)

All versions below were detected from the installed environment, lockfile, and
generated `package.json` files during initialization (2026-08-15).

## Runtime Environment

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | v24.14.1 | Satisfies official Medusa requirement (v20.19.0+ / v22.12.0+ LTS, < v25) |
| Package manager | pnpm 10.33.0 | Official docs recommend pnpm/yarn; `packageManager: pnpm@10.33.0` |
| git | 2.43.0 | |
| OS | Linux (Ubuntu 24.04 base, kernel 7.0.0-generic) | |
| PostgreSQL server | 16.14 | System service, localhost:5432 |
| Redis server | 7.0.15 | System service, localhost:6379 |
| Docker / Compose | not installed | Local Postgres/Redis run as system services instead |

## Medusa Backend (`apps/backend`)

| Package | Version |
| --- | --- |
| @medusajs/medusa | 2.19.0 |
| @medusajs/framework | 2.19.0 |
| @medusajs/cli | 2.19.0 |
| @medusajs/dashboard | 2.19.0 (standard Admin) |
| @medusajs/admin-sdk / admin-shared | 2.19.0 |
| @medusajs/js-sdk (SDK, also used by storefront) | 2.19.0 |
| @medusajs/types | 2.19.0 |
| @medusajs/ui | 4.2.1 |
| @medusajs/eslint-plugin | 2.19.0 |
| zod | 4.2.0 |
| TypeScript (dev) | ^5.6.2 |
| jest (dev) | ^29.7.0 |

## Next.js Storefront (`apps/storefront`)

| Package | Version |
| --- | --- |
| next | 15.5.21 (App Router, Turbopack dev) |
| react / react-dom | 19.0.5 |
| @medusajs/js-sdk | 2.19.0 |
| @medusajs/icons / ui-preset | 2.19.0 |
| tailwindcss | ^3.0.23 |
| eslint / eslint-config-next | ^9.13.0 / 15.5.21 |
| TypeScript (dev) | ^5.3.2 |

## Workspace Tooling

| Tool | Version |
| --- | --- |
| turbo | ^2.0.14 |
| prettier | ^3.2.5 (root) / ^2.8.8 (storefront) |

## Database & Supporting Clients (resolved versions)

| Package | Version | Used by |
| --- | --- | --- |
| MikroORM core / postgresql / migrations | 6.6.14 | Medusa framework (backend) |
| pg | 8.20.0 (backend-transitive) / 8.16.3 (storefront direct) | PostgreSQL driver |
| ioredis | 5.8.2 | installed Redis modules (caching/event-bus/workflow/locking) |

## Database

- Database name: `medusa-baby-store`
- Role: `medusa` (dedicated; created for this project)
- Migrations applied: yes (143 tables in `public` schema)
- Seed data: starter sample catalog + default region (Europe) inserted

## Version Pin Policy

Per AGENTS.md §17, the Medusa v2 version selected during initialization
(**2.19.0**) is locked. Do not migrate to another Medusa major/minor release
without authorization.
