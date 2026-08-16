# Authentication & Authorization Architecture

## Status

Architecture selected, implementation pending. Medusa-native customer
authentication. Better Auth is NOT used (a previous proposal was reviewed and
rejected — historical note in `gap-analysis.md`).

Every statement is labeled **VERIFIED** (confirmed from installed Medusa
2.19.0 source/types, the repository, or official docs), **PROPOSED** (design
direction to be verified at implementation), or **UNRESOLVED** (needs a
decision).

## Customer Authentication

- **VERIFIED:** Medusa v2's native auth module is the customer authentication
  infrastructure. The storefront starter already authenticates customers with
  it: email/password via the Medusa auth API, JWT stored in the `_medusa_jwt`
  httpOnly cookie, `Authorization: Bearer` headers on store API calls
  (`apps/storefront/src/lib/data/cookies.ts`).
- **VERIFIED:** the installed auth API exposes actor-separated routes
  (`/auth/customer/{provider}` and `/auth/user/{provider}`), plus `session`,
  `token`, and `mfa` routes (`@medusajs/medusa/dist/api/auth`).
- **Approved:** Medusa is the authoritative authentication integration for
  customer accounts. No alternative authentication framework may be introduced
  without explicit architecture authorization.

## Email/Password

- **VERIFIED:** email/password provider enabled in the baseline. The storefront
  uses `sdk.auth.*` (login, register, verification) and email-verification is
  part of the starter flow (`apps/storefront/src/lib/data/customer.ts`).
- **VERIFIED:** passwords are handled by Medusa's auth infrastructure (no
  plaintext, no custom cryptography).
- **PROPOSED:** keep the storefront server-side cookie/token flow for
  email/password login; confirm exact register/login/verification endpoints
  against the installed SDK at implementation.

## Google OAuth

- **VERIFIED:** `@medusajs/auth-google` (2.19.0) is installed. Installed-source
  facts: required options are `clientId`, `clientSecret`, `callbackUrl`;
  authentication uses OIDC ID-token verification (JWKS URI
  `https://www.googleapis.com/oauth2/v3/certs`, Google issuers);
  `register()` throws `NOT_ALLOWED` ("Google does not support registration.
  Use method `authenticate` instead") — Google accounts are linked/created at
  login via the authenticate flow.
- **PROPOSED:** register the provider in `medusa-config.ts` under the auth
  module's providers with `resolve: "@medusajs/auth-google"` and the options
  above; callback URL must be a configured redirect URI for the Google Cloud
  OAuth client.
- **UNRESOLVED:** exact environment-variable naming strategy and callback URL
  format (verify against official Medusa docs for 2.19.0 at configuration
  time); Google Cloud OAuth client creation; account-linking and
  customer-creation behavior in the full flow.

## Customer Identity

- **VERIFIED:** Medusa customers are the commerce identity
  (`customer`, `customer_group` tables; `/store/customers/me` requires
  authentication — returns 401 unauthenticated). Auth identities and provider
  identities are Medusa-managed (`auth_identity`, `provider_identity` tables
  present in the database).
- **VERIFIED:** no custom identity tables exist (143 tables, all
  Medusa-owned).

## Session Management

- **VERIFIED:** Medusa auth provides token and session routes
  (`/auth/customer/{provider}`, `token`, `session`). The starter persists the
  token in the `_medusa_jwt` httpOnly cookie (7 days, `sameSite: strict`,
  `secure` in production) and sends it as a Bearer token.
- **UNRESOLVED:** session lifetime/refresh/revocation policy; whether to move
  to Medusa's cookie-session mechanism instead of a bearer-token cookie (verify
  both against installed 2.19.0 before choosing).

## Customer Authorization

- **Approved invariants (must hold):** authenticated customer A must never
  access customer B's carts, orders, addresses, profile, wishlist, reviews,
  returns, refunds, or personal data.
- **VERIFIED:** enforcement must be server-side; the storefront never sends a
  browser-supplied customer ID, and customer-scoped Medusa endpoints authorize
  by the authenticated session.
- **PROPOSED:** wishlist/reviews/returns/refunds (future custom features) must
  validate ownership server-side in workflows, per §26.3.

## Admin Authentication

- **VERIFIED:** Medusa Admin uses native admin auth (`/auth/user/emailpass`;
  admin login returns a JWT — verified during initialization). Standard Medusa
  Admin initially.
- **Approved:** customer authentication and Admin authentication are separate
  domains; a customer session never grants Admin access.

## Admin Authorization

- **VERIFIED:** `@medusajs/rbac` is installed (native admin RBAC module).
- **Approved:** sensitive admin operations (refunds, inventory adjustments,
  price changes, customer-data access, order cancellation, fulfillment/shipping
  changes, payment overrides, administrative configuration) follow Medusa's
  supported Admin authorization model, enforced server-side.

## Storefront Authentication Flow

- **VERIFIED (baseline):** server actions in `src/lib/data/customer.ts` +
  `cookies.ts`: register/login via Medusa auth API → token → `_medusa_jwt`
  httpOnly cookie → `getAuthHeaders()` adds Bearer to SDK calls; verification
  emails via `sdk.auth.verification.request`; pending-signup fields in
  `_medusa_pending_customer` cookie; logout clears the token cookie.
- **PROPOSED:** Google OAuth button in the storefront triggers the Medusa
  Google provider callback flow; session handling stays server-side.

## API Authentication Flow

- **VERIFIED:** store API requests carry the customer token via
  `x-publishable-api-key` (public) + `Authorization: Bearer` (authenticated
  customer). Admin requests use admin auth. The SDK adds the publishable key
  automatically; `getAuthHeaders()` adds the Bearer token.

## Security Invariants

(Approved — also in AGENTS.md §26.3)

- A customer must never access another customer's Medusa resources.
- Customer authorization enforced server-side.
- Customer identity never from an arbitrary browser-provided customer ID.
- Session identity verified server-side.
- Medusa customer identity derived from Medusa's authenticated auth identity.
- Order/wishlist/review/return/refund ownership always checked server-side.
- Customer addresses scoped to the authenticated customer.
- Authentication state never inferred solely from frontend state.
- No competing sources of truth for customer authentication (one mechanism:
  Medusa auth).

## Environment Configuration

**VERIFIED (present in `apps/backend/.env`):** `DATABASE_URL`, `REDIS_URL`,
`STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `JWT_SECRET`, `COOKIE_SECRET`,
`AUTH_MFA_ENCRYPTION_KEY`.

**PROPOSED/UNRESOLVED (not yet configured):** Google OAuth provider options
(`clientId`, `clientSecret`, `callbackUrl` — names verified in installed
source; env-var names to be confirmed at configuration time). Never commit
real secrets; `.env.example` contains names only.

## Open Questions

- Google OAuth end-to-end configuration (provider registration, Google Cloud
  OAuth client, callback URL, env strategy) — UNRESOLVED.
- Session mechanism choice (bearer-token cookie vs Medusa cookie session) and
  lifetime/refresh/revocation policy — UNRESOLVED.
- Password-reset flow details for customers (verify against installed 2.19.0)
  — UNRESOLVED.
- Email-verification policy (mandatory? grace period?) — UNRESOLVED.
- Rate limiting for auth/password operations (verify native capability) —
  UNRESOLVED.
- Whether `auth-google`/`auth-github`/`auth-oidc` providers should be removed
  from the workspace if unused — UNRESOLVED (no dependency changes in this
  task).
