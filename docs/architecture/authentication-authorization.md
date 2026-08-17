# Authentication & Authorization Architecture

## Status

Approved and implemented (customer authentication phase, 2026-08-17, decisions
BD-AUTH-01..04). Medusa-native customer authentication. Better Auth is NOT used
(a previous proposal was reviewed and rejected — historical note in
`gap-analysis.md`).

Every statement is labeled **VERIFIED** (confirmed from installed Medusa 2.19.0
source/types, the repository, or official docs), **PROPOSED** (design direction
to be verified at implementation), or **UNRESOLVED** (needs a decision).

## Customer Authentication

- **VERIFIED:** Medusa v2's native auth module is the customer authentication
  infrastructure. The storefront authenticates customers with it: email/password
  via the Medusa auth API, JWT stored in the `_medusa_jwt` httpOnly cookie,
  `Authorization: Bearer` headers on store API calls
  (`apps/storefront/src/lib/data/cookies.ts`).
- **VERIFIED:** the installed auth API exposes actor-separated routes
  (`/auth/customer/{provider}` and `/auth/user/{provider}`), plus `session`,
  `token`, `mfa`, and `verification` routes (`@medusajs/medusa/dist/api/auth`).
- **Approved:** Medusa is the authoritative authentication integration for
  customer accounts. No alternative authentication framework may be introduced
  without explicit architecture authorization.

## Email/Password

- **VERIFIED:** email/password provider enabled. The storefront uses
  `sdk.auth.*` (login, register, verification) and email verification is part
  of the flow (`apps/storefront/src/lib/data/customer.ts`).
- **VERIFIED:** passwords are handled by Medusa's auth infrastructure (no
  plaintext, no custom cryptography).
- **VERIFIED (BD-AUTH-01):** email verification is REQUIRED for emailpass
  customers, configured natively via
  `projectConfig.http.authVerificationsPerActor = { customer: [{ entity_type:
  "email", auth_provider: "emailpass" }] }` (`medusa-config.ts`). Verified
  behavior:
  - `POST /auth/customer/emailpass/register` always returns an **actorless**
    token (registration is never gated).
  - `POST /auth/customer/emailpass` (login) returns `{ verification_required:
    true, token (actorless) }` until the identity is verified; the token cannot
    reach `/store/customers/me` (401).
  - `POST /auth/verification/request` (bearer: actorless token) creates the
    verification; the **plaintext code is NOT in the HTTP response** — the
    request-verification workflow strips it and delivers it via the
    `auth.verification_requested` event payload (production sends it by email).
  - `POST /auth/verification/confirm { code }` marks the identity verified
    (wrong/expired/used code → NOT_ALLOWED 4xx).
  - Verification codes are stored hashed (`provider_metadata.token_hash`),
    TTL default 900s (`ttl_seconds`, token provider).
- **Verified routes note:** the verification routes live at
  `/auth/verification/*` — NOT under `/auth/customer/*` (no actor segment in
  the path; the middleware matcher and the route directory are
  `/auth/verification/{request,confirm}`).

## Google OAuth

- **VERIFIED (BD-AUTH-03):** Google OAuth is wired ENV-GATED. The provider
  registers only when `AUTH_GOOGLE_ENABLED=true` AND all of
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` are set
  (double-checked in `medusa-config.ts` and enforced by `assertEnv` at boot).
  Currently the gate is OFF (`AUTH_GOOGLE_ENABLED=false` in `.env.example`) —
  real Google Cloud OAuth credentials are still required for end-to-end use;
  the gate must never be enabled with placeholder credentials.
- **VERIFIED:** installed-source facts (`@medusajs/auth-google` 2.19.0):
  required options are `clientId`, `clientSecret`, `callbackUrl`; OIDC
  ID-token verification (JWKS `https://www.googleapis.com/oauth2/v3/certs`,
  Google issuers, audience = clientId, `email_verified` required);
  `register()` throws `NOT_ALLOWED` — Google accounts are linked/created at
  login via the authenticate flow. `GET|POST /auth/customer/google` returns
  `{ location }` (Google authorize URL) using `body.callback_url ??
  configuredCallbackUrl`. On callback, a brand-new identity gets an
  **actorless** token (no customer actor attached).
- **VERIFIED:** storefront flow (`/api/auth/google` + `/api/auth/callback/google`
  route handlers, verified against the official third-party-login guide):
  button → login route returns `location` → redirect to Google → Google
  redirects back with `code`/`state` → `sdk.auth.callback("customer",
  "google", query)` → token; if `/store/customers/me` rejects it (no actor),
  decode the token payload (`src/lib/util/jwt.ts`, base64url, never a trust
  boundary), create the customer with `user_metadata.email`, then
  `sdk.auth.refresh()` to bind the actor → store token in `_medusa_jwt`.
- **VERIFIED:** the login page only renders "Continue with Google" when
  `GET /auth/customer/providers` lists the `google` provider (backend is
  authoritative — `@login/page.tsx` fetches it server-side).
- **Remaining (deployment):** Google Cloud OAuth client creation, configuring
  the redirect URI (`<storefront>/api/auth/callback/google`), enabling the
  gate with real credentials, and E2E sign-in with a real Google account.

## Customer Identity

- **VERIFIED:** Medusa customers are the commerce identity
  (`customer`, `customer_group` tables; `/store/customers/me` requires
  authentication — returns 401 unauthenticated). Auth identities and provider
  identities are Medusa-managed (`auth_identity`, `provider_identity` tables
  present in the database).
- **VERIFIED:** no custom identity tables exist (all Medusa-owned).

## Session Management

- **VERIFIED (BD-AUTH-02):** session lifetime = `projectConfig.http.jwtExpiresIn
  = "1d"` (the native default, now set explicitly) and the storefront
  `_medusa_jwt` cookie maxAge matches (1 day, `httpOnly`, `sameSite: strict`,
  `secure` in production). The cookie never outlives the token.
- **VERIFIED:** bearer-token cookie is the chosen mechanism (the starter's
  pattern); Medusa's cookie-session (`/auth/session`) is not used for the
  storefront.

## Customer Authorization

- **Approved invariants (must hold):** authenticated customer A must never
  access customer B's carts, orders, addresses, profile, wishlist, reviews,
  returns, refunds, or personal data.
- **VERIFIED:** enforcement is server-side; the storefront never sends a
  browser-supplied customer ID, and customer-scoped Medusa endpoints authorize
  by the authenticated session (cart ownership enforcement: `T-CC-01` suite).
- **PROPOSED:** wishlist/reviews/returns/refunds (future custom features) must
  validate ownership server-side in workflows, per §26.3.

## Password Reset (BD-AUTH-04)

- **VERIFIED (native flow):** `POST /auth/customer/emailpass/reset-password
  { identifier }` → 201 for both existing AND unknown identifiers (`throwOnError:
  false` — no identity leak, verified and tested). The reset token is a JWT
  (jti recorded in `auth_password_reset_token`, TTL from
  `RESET_PASSWORD_TOKEN_TTL_SECONDS`), delivered via the **`auth.password_reset`
  event payload** — never in the HTTP response. Production must deliver it by
  email (notification provider boundary — future work).
- **VERIFIED:** reset completes via `POST /auth/customer/emailpass/update
  { password }` with `Authorization: Bearer <resetToken>` (SDK
  `sdk.auth.updateProvider`; the `validateToken` middleware validates and
  consumes the reset token).
- **VERIFIED (storefront):** `/forgot-password` (identical confirmation for
  existing/unknown identifiers) and `/reset-password?token=...` (hidden token
  field → update provider → success → back to sign in) pages implemented as
  server pages + server actions (`requestPasswordReset`,
  `completePasswordReset` in `customer.ts`).

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

- **VERIFIED (implemented):** server actions in `src/lib/data/customer.ts` +
  `cookies.ts`: register/login via Medusa auth API → token → `_medusa_jwt`
  httpOnly cookie → `getAuthHeaders()` adds Bearer to SDK calls; verification
  requests via `sdk.auth.verification.request` (backend sends the code through
  the event bus); pending-signup fields in `_medusa_pending_customer` cookie;
  logout clears the token cookie.
- **VERIFIED (implemented):** Google sign-in (`/api/auth/google` →
  `/api/auth/callback/google`, see Google OAuth section); forgot/reset
  password pages (see Password Reset section).

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
- Identity existence is never leaked through auth endpoints (reset-password is
  uniform; verification confirm errors are uniform).

## Environment Configuration

**VERIFIED (present in `apps/backend/.env`):** `DATABASE_URL`, `REDIS_URL`,
`STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `JWT_SECRET`, `COOKIE_SECRET`,
`AUTH_MFA_ENCRYPTION_KEY`, plus the auth-gate names in `.env.example`:
`JWT_EXPIRES_IN=1d`, `AUTH_GOOGLE_ENABLED=false`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`. Never commit real secrets;
`.env.example` contains names only.

## Open Questions

- Google OAuth end-to-end validation — needs a real Google Cloud OAuth client
  (credentials + redirect URI) before enabling `AUTH_GOOGLE_ENABLED` and
  running the E2E sign-in.
- Rate limiting for auth/password operations (no native built-in rate limiting
  found on the auth routes — verify native capability before building custom
  protection) — UNRESOLVED (T-CC-03-style decision item).
- Notification delivery for verification codes and reset tokens (event-bus
  payloads are wired; the email/SMS/WhatsApp notification boundary is a future
  phase) — PROPOSED.
- Whether `auth-github`/`auth-oidc` providers should be removed from the
  workspace if unused — UNRESOLVED (no dependency changes in this task).
