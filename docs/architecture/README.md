# Architecture Documentation

Index of architecture documents for the baby clothing e-commerce platform.

| Document | Purpose |
| --- | --- |
| [system-overview.md](./system-overview.md) | Approved architecture, components, and data flow |
| [repository-structure.md](./repository-structure.md) | Actual repository layout and directory purposes |
| [technology-stack.md](./technology-stack.md) | Verified tool/package versions |
| [medusa-capabilities.md](./medusa-capabilities.md) | Capability inventory of the installed Medusa v2.19.0 |

## Status Legend

- **IMPLEMENTED** — code/config exists and was verified in this repository.
- **CONFIGURED** — configuration exists; runtime behavior not fully exercised.
- **VERIFIED** — executed and confirmed working during initialization.
- **PLANNED** — required by the approved specifications but intentionally not implemented yet.
- **NOT IMPLEMENTED** / **NOT YET IMPLEMENTED** — explicitly deferred.

## What Exists Today (Foundation Only)

The repository contains the official Medusa v2 monorepo scaffold:

- `apps/backend` — Medusa v2.19.0 backend with the standard Medusa Admin.
- `apps/storefront` — official Next.js 15 Medusa Starter storefront (Server Components, TypeScript).
- Root pnpm/Turbo workspace (`pnpm-workspace.yaml`, `turbo.json`).

No business features (catalog, checkout customization, payments, shipping,
returns, wishlist, reviews, etc.) have been implemented. See
[medusa-capabilities.md](./medusa-capabilities.md) for what the platform
already provides natively and [../project-context.md](../project-context.md)
for the full status matrix.

## Governance

The authoritative engineering contract is [`AGENTS.md`](../../AGENTS.md) at the
repository root. It takes precedence over everything in `docs/`. These
documents only describe what actually exists; anything planned is explicitly
labeled.
