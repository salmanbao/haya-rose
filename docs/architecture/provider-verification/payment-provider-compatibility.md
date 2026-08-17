# Payment Provider Compatibility — Safepay (PK) & Stripe (AE) vs Medusa 2.19.0

**Verification date:** 2026-08-17 (revised — **AssanPay replaced by Safepay**
for Pakistan; Stripe unchanged for UAE)
**Task:** Verify the selected payment providers (Safepay — Pakistan, Stripe —
UAE) against official documentation and the installed Medusa 2.19.0 payment
contract, and implement the verified adapters.
**Implementation status:** Safepay adapter IMPLEMENTED
(`apps/backend/src/modules/payment-safepay`, provider key `pp_safepay_safepay`,
env-gated via `PAYMENT_PROVIDER=safepay`); Stripe registered via the bundled
`@medusajs/payment-stripe@2.19.0` (env-gated via `PAYMENT_PROVIDER=stripe`).
**Sandbox verification: COMPLETE (2026-08-18)** — both providers verified live
in sandbox/test mode: Safepay (PKR: session → hosted checkout pay → deferred
authorization → capture → refund → signed webhook pipeline) and Stripe (AED:
session → client confirmation → manual capture → refund → signed webhook
pipeline). Documented sandbox limitations: no webhook auto-delivery observed
(Safepay sandbox) and decline-card simulation unavailable (both providers) —
see `safepay-verification.md` §7 and `stripe-verification.md` §13.

> **Provider replacement record:** The Pakistan provider was originally xPay
> (XStak — XPay Fusion; replaced 2026-08-16), then AssanPay (replaced
> 2026-08-17 — its API authentication, webhook contract, refund API, and base
> URL could not be verified, blocking implementation). **Safepay is the active
> Pakistan provider (BD-P-01 revised).** xPay and AssanPay are **NOT ACTIVE**;
> their verification evidence is preserved as historical record at
> `docs/architecture/provider-verification/xpay-verification.md` and
> `docs/architecture/provider-verification/assanpay-verification.md` and must
> not be cited as the active Pakistan contract.

Evidence files:
- `docs/architecture/provider-verification/safepay-verification.md` (ACTIVE — PK)
- `docs/architecture/provider-verification/stripe-verification.md` (ACTIVE — AE)
- `docs/architecture/provider-verification/assanpay-verification.md` (HISTORICAL / REPLACED)
- `docs/architecture/provider-verification/xpay-verification.md` (HISTORICAL / REPLACED)

**Context7 status:** AVAILABLE and USED for this revision — official Safepay
documentation retrieved via Context7 (`/websites/safepay-docs_netlify_app`,
High reputation). Cross-checked against the published official Safepay Node
SDK source (`@sfpy/node-core@0.3.5`) and the installed Medusa 2.19.0 payment
contract (authoritative). No Context7 content was trusted over the installed
Medusa source; no credentials are stored in the repository.

---

## 1. Executive Summary

- **Medusa 2.19.0 payment contract (verified in installed source):**
  `IPaymentProvider` (initiate/update/delete/authorize/capture/refund/retrieve/
  cancel/getPaymentStatus/getWebhookActionAndData), `PaymentActions` enum,
  `PaymentProviderContext.idempotency_key`, native webhook pipeline
  (`POST /hooks/payment/:provider` → `payment.webhook_received` → shipped
  subscriber → `processPaymentWorkflow`), native capture/refund guards (refund
  ≤ captured, row-locked sums), provider keys `pp_{identifier}_{id}`, and the
  bundled **Stripe provider reference implementation**.
- **Safepay (Pakistan/PKR): VERIFIED + IMPLEMENTED.** Official docs (via
  Context7) + official SDK source verify: tracker-based payment sessions
  (`POST /order/payments/v3/`), hosted checkout redirect (passport `tbt` token
  + `…/embedded/` URL), status lookup (`GET /reporter/api/v1/payments/{tracker}`
  — TRACKER_STARTED/ENDED/VOIDED/REFUNDED/PARTIAL_REFUND), full + partial
  refunds (`POST /order/payments/v3/{tracker}/refund`), webhooks with
  HMAC-SHA512 signature verification (`X-SFPY-SIGNATURE` over the raw body),
  paisa amounts, sandbox/production hosts, and `x-sfpy-merchant-secret` API
  authentication. Adapter implemented with unit tests (41). **Sandbox contract
  verification pending.**
- **Stripe (UAE/AED): VERIFIED for V1 (unchanged).** The bundled
  `@medusajs/payment-stripe@2.19.0` implements the full Medusa contract
  (PaymentIntent lifecycle, manual/automatic capture, cancel, full/partial
  refunds, webhook signature verification, idempotency keys, AED). Re-verified
  against installed source during this revision; **no defects found — no code
  changed.** Remaining items are credentials + Dashboard configuration.
- **Overall status: COMPLETE_SANDBOX_VERIFIED** — both provider contracts are
  verified against official documentation AND live sandbox/test-mode runs
  (2026-08-18); the adapters are implemented and unit/integration-tested.
  Remaining steps are production credentials + Dashboard webhook/event
  configuration before enabling either provider for customers.

---

## 2. Compatibility Matrices

Status vocabulary: `VERIFIED_SUPPORTED` · `VERIFIED_NOT_SUPPORTED` ·
`PROVIDER_VERIFICATION_REQUIRED` · `IMPLEMENTATION_DEFINED` ·
`MEDUSA_DEFINED`.

### 2.1 Safepay (Pakistan, PKR) — implemented at `src/modules/payment-safepay`

| # | Capability | Status | Evidence | Medusa mapping | Blocking? | Implementation notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | API authentication | VERIFIED_SUPPORTED | Official docs + SDK `RequestSender` (`x-sfpy-merchant-secret`) | adapter config | no | `SAFEPAY_SECRET_KEY` header; `SAFEPAY_MERCHANT_API_KEY` body key |
| 2 | Payment/session creation | VERIFIED_SUPPORTED | Docs `POST /order/payments/v3/` | `initiatePayment` | no | tracker + `metadata.session_id` correlation; paisa amounts |
| 3 | Hosted checkout URL | VERIFIED_SUPPORTED | Docs + SDK `Checkout.js` | `data.checkout_url` | no | passport token (`tbt`) + redirect/cancel URLs |
| 4 | Authorization semantics | IMPLEMENTATION_DEFINED | Docs (auto-capture `mode: payment`) | `authorizePayment` → reporter status | no | TRACKER_ENDED → `captured` (Medusa maps captured→authorized internally where needed) |
| 5 | Capture | VERIFIED_SUPPORTED (auto-capture model; no separate capture API) | Docs (TRACKER_ENDED = completed) | `capturePayment` verifies state | no | refuses capture of a non-ENDED tracker |
| 6 | Partial capture | VERIFIED_NOT_SUPPORTED | Docs (hosted model captures once) | n/a for V1 | no | — |
| 7 | Full refund | VERIFIED_SUPPORTED | Docs modify-payments/refund | `refundPayment` | no | `POST …/{tracker}/refund` `{ currency, amount }` |
| 8 | Partial refund | VERIFIED_SUPPORTED | Docs (TRACKER_PARTIAL_REFUND) | `refundPayment` (amount) | no | paisa amounts; Medusa enforces ≤ captured natively |
| 9 | Cancellation (un-paid) | VERIFIED_NOT_SUPPORTED (no documented API) | Docs | local-only `cancelPayment` | no | late webhook on cancelled session → manual reconciliation |
| 10 | Void of a capture | VERIFIED_SUPPORTED (documented; unused by adapter) | Docs modify-payments/void | not mapped (refund is the V1 path) | no | available if a business rule requires it |
| 11 | Webhook delivery | VERIFIED_SUPPORTED | Docs webhook-types | native `/hooks/payment/safepay_safepay` | no | envelope `{ token, type, data }` |
| 12 | Webhook signature | VERIFIED_SUPPORTED | Docs verify-hmac-signatures | `getWebhookActionAndData` (REQ-PAY-013) | no | X-SFPY-SIGNATURE, HMAC-SHA512 hex over raw body, constant-time compare |
| 13 | Webhook replay/timestamp | VERIFIED_NOT_SUPPORTED (no documented timestamp) | Docs | MEDUSA_DEFINED (native event idempotency) | no | duplicate delivery → one state effect (tested) |
| 14 | Webhook event types | VERIFIED_SUPPORTED | Docs | payment.succeeded→captured, payment.failed→failed, void.succeeded→canceled, unknown→not_supported | no | events without `metadata.session_id` ignored (native guard) |
| 15 | Status lookup | VERIFIED_SUPPORTED | Docs reporter API | `getPaymentStatus`/`retrievePayment` | no | state map incl. unknown→error (never auto-success) |
| 16 | Async payments | VERIFIED_SUPPORTED | Docs (hosted redirect + webhooks) | `pending` session + webhook-driven `processPaymentWorkflow` | no | matches REQ-PAY-008 (redirect never authoritative) |
| 17 | PKR + amount unit | VERIFIED_SUPPORTED | Docs (paisa integers) | ×100 once at the boundary | no | unit-tested; non-PKR rejected (REQ-PAY-002) |
| 18 | Idempotency | VERIFIED_NOT_SUPPORTED (none documented) | Docs | MEDUSA_DEFINED keys (not transportable) | no | financial ops sent exactly once; status-before-retry (REQ-PAY-015) |
| 19 | 3DS / payer auth | VERIFIED_SUPPORTED (provider-handled, hosted page) | Docs (PAYER_AUTH_SETUP next_actions) | provider-side | no | — |
| 20 | Error model | VERIFIED_SUPPORTED (envelope `status.errors[]` + HTTP) | Docs | `SafepayApiError` → MedusaError | no | provider failure never becomes success (REQ-PAY-020) |
| 21 | Retry policy | PROVIDER_VERIFICATION_REQUIRED | — | BD-P-05 (approved) | non-blocking | read-only retries with backoff; financial ops single-attempt |
| 22 | Rate limits | PROVIDER_VERIFICATION_REQUIRED (undocumented) | — | T-PAY-07 | non-blocking | unchanged |
| 23 | Settlement/reconciliation data | PROVIDER_VERIFICATION_REQUIRED | — | T-PAY-05 (future job) | non-blocking | reporter API available for status reconciliation |
| 24 | Sandbox | VERIFIED_SUPPORTED | Docs + live sandbox run 2026-08-18 (pay/capture/refund/webhook) | contract tests + end-to-end | no | sandbox limitations: no webhook auto-delivery; decline-card simulation unavailable (see §11/safepay §7) |
| 25 | Official Node SDK | VERIFIED_SUPPORTED (`@sfpy/node-core@0.3.5`, published) | npm | not used by the adapter | no | adapter calls the verified REST contract directly (dependency discipline); published SDK lacks the documented webhooks/refund surface |
| 26 | Transaction limits | PROVIDER_VERIFICATION_REQUIRED (undocumented) | — | BD-P-10 deferred | non-blocking | unchanged |
| 27 | Payment methods | VERIFIED_SUPPORTED (cards etc. via hosted checkout; intent-based channels) | Docs | BD-P-04 | no | default intent CYBERSOURCE |

### 2.2 Stripe (UAE, AED) — via bundled `@medusajs/payment-stripe@2.19.0` (UNCHANGED — re-verified)

| # | Capability | Medusa requirement | Provider capability | Status | Evidence | Implementation impact |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Payment/session creation | `initiatePayment` | `paymentIntents.create` (amount in minor units, currency, `metadata.session_id`, idempotency key) | VERIFIED_SUPPORTED | Installed provider source + Stripe docs | Bundled provider handles it |
| 2 | Authorization | `authorizePayment` | `paymentIntents.retrieve` → status mapping | VERIFIED_SUPPORTED | Installed source | Bundled |
| 3 | Capture | `capturePayment` | `paymentIntents.capture` | VERIFIED_SUPPORTED | Installed source | Bundled |
| 4 | Partial capture | Native mechanism | Supported (up to `amount_capturable`) | VERIFIED_SUPPORTED | Stripe docs + source | Bundled; per BD-P-07 verify provider/business use |
| 5 | Cancellation | `cancelPayment` | `paymentIntents.cancel` (idempotent if already canceled) | VERIFIED_SUPPORTED | Installed source | Bundled |
| 6 | Full refund | `refundPayment` | `refunds.create` | VERIFIED_SUPPORTED | Installed source + docs | Bundled |
| 7 | Partial refund | Native mechanism | Refunds with explicit amount; multiple refunds | VERIFIED_SUPPORTED | Stripe docs | Bundled |
| 8 | Webhook | Native pipeline | `constructWebhookEvent` (signature) + event mapping table | VERIFIED_SUPPORTED | Installed source | Bundled; configure endpoint + events in Dashboard |
| 9 | Webhook signature verification | Provider-side | `Stripe-Signature` header, HMAC-SHA256, raw body, timestamp tolerance | VERIFIED_SUPPORTED | Stripe docs + source | Bundled |
| 10 | Idempotency | `context.idempotency_key` | Stripe `Idempotency-Key` header | VERIFIED_SUPPORTED | Stripe docs + source | Bundled |
| 11 | Asynchronous payment | Webhook/status | PaymentIntent lifecycle + webhook events | VERIFIED_SUPPORTED | Stripe docs + source | Bundled |
| 12 | Customer auth / 3DS | Provider-handled | SCA/3DS handled by PaymentIntents (`requires_action`) | VERIFIED_SUPPORTED | Stripe docs | Bundled |
| 13 | Payment failure | Map to `failed`/`error` | Typed decline errors + `payment_intent.payment_failed` event | VERIFIED_SUPPORTED | Stripe docs + source | Bundled |
| 14 | Refund failure | Map; no phantom refund | Refund `status` (async) + events; Medusa deletes record on failure | VERIFIED_SUPPORTED | Stripe docs + source | Bundled |
| 15 | Duplicate webhook handling | Native guards | Signature timestamp + event id; Medusa guards | VERIFIED_SUPPORTED | Stripe docs + source | Bundled |
| 16 | Retry behavior | Bounded retries | Provider `executeWithRetry` (3, backoff+jitter) | VERIFIED_SUPPORTED | Installed source | Bundled |
| 17 | AED support | Currency match | AED supported for card payments | VERIFIED_SUPPORTED | docs.stripe.com/currencies | Currency mapping trivial |
| 18 | Sandbox | Contract tests | Test mode + test keys | VERIFIED_SUPPORTED | Stripe docs | Contract tests when credentials available |
| 19 | Production | — | Live mode + live keys | VERIFIED_SUPPORTED | Stripe docs | Credentials |
| 20 | Transaction limits | — | Stripe min amounts per currency | VERIFIED_SUPPORTED (general) | Stripe docs | BD-P-10 deferred |
| 21 | Payment-method compatibility | Region-scoped | UAE: Visa, Mastercard, Apple Pay, Google Pay, Link | VERIFIED_SUPPORTED | Stripe support page | V1 card default; others configurable |

---

## 3. Medusa → Provider Mapping (implemented / bundled)

### 3.1 Safepay — custom adapter (`src/modules/payment-safepay`, provider key `pp_safepay_safepay`)

| Medusa method | Safepay call (verified endpoint) | Notes |
| --- | --- | --- |
| `initiatePayment` | `POST /order/payments/v3/` (tracker) + `POST /client/passport/v1/token` (tbt) | `amount` in paisa (×100 from Medusa major units, once); `metadata.session_id` = module-injected session id; hosted checkout URL stored in `data.checkout_url`; returns `{ id: tracker, status: pending }` |
| `updatePayment` | re-create tracker for the new amount | no documented tracker-update API; native refresh path deletes/recreates sessions anyway |
| `deletePayment` | no-op | un-paid tracker holds no funds |
| `authorizePayment` / `getPaymentStatus` | `GET /reporter/api/v1/payments/{tracker}` | TRACKER_STARTED→pending, TRACKER_ENDED/REFUNDED/PARTIAL_REFUND→captured (after amount+currency verification), TRACKER_VOIDED→canceled, unknown→error |
| `capturePayment` | reporter verification only | auto-capture model; no provider capture call; refuses non-ENDED |
| `cancelPayment` | reporter check only | captured → throw (refund instead, REQ-PAY-012); un-paid → local cancel (no documented API) |
| `refundPayment` | `POST /order/payments/v3/{tracker}/refund` `{ currency: "PKR", amount }` | paisa amounts; sent exactly once (no documented idempotency) |
| `getWebhookActionAndData` | HMAC-SHA512 verification + event mapping | payment.succeeded→SUCCESSFUL(captured) with major-unit amount, payment.failed→FAILED, void.succeeded→CANCELED; missing/invalid signature → error; no `metadata.session_id`/unknown type → NOT_SUPPORTED |

### 3.2 Stripe — fully native via `@medusajs/payment-stripe` (unchanged)

| Medusa method | Stripe call (verified source) |
| --- | --- |
| `initiatePayment` | `paymentIntents.create({ amount: getSmallestUnit(amount, currency), currency, metadata: { session_id, … }, customer? }, { idempotencyKey: context.idempotency_key })` |
| `authorizePayment` / `getPaymentStatus` | `paymentIntents.retrieve(id, { expand: ['payment_method'] })` → `getStatus()` |
| `capturePayment` | `paymentIntents.capture(id, { idempotencyKey })` (idempotent on already-succeeded) |
| `cancelPayment` / `deletePayment` | `paymentIntents.cancel(id, { idempotencyKey })` (idempotent on already-canceled) |
| `refundPayment` | `refunds.create({ amount: getSmallestUnit(amount, currency), payment_intent: id }, { idempotencyKey })` |
| `getWebhookActionAndData` | `constructWebhookEvent(rawData, signature, secret)`; ignore if no `metadata.session_id`; map event types → `PaymentActions` |

### 3.3 Division of responsibility

- **Medusa owns (native):** payment collections/sessions/payments/captures/refunds
  persistence; status derivation; capture/refund guards (≤ captured, row-locked);
  idempotency keys; webhook HTTP entry point + event + subscriber +
  `processPaymentWorkflow`; admin routes + RBAC; `session_id` correlation guard.
- **Provider owns:** hosted payment page (card/wallet processing), redirect flow,
  payment completion, refunds, webhook delivery.
- **Adapter translates (inside the provider boundary):** request/response
  shapes, amount unit conversion (major ↔ paisa, exactly once), provider
  state → Medusa status, webhook payload → `WebhookActionResult` (with
  HMAC-SHA512 signature verification), `session_id` correlation.
- **Must NOT be built (and was not):** custom payment persistence, second
  payment state machine, custom webhook route (native route used), custom
  refund validation (native).

---

## 4. Idempotency Analysis

| Operation | Medusa mechanism (verified) | Stripe (verified) | Safepay (verified) |
| --- | --- | --- | --- |
| Session creation | collection-scoped session creation | `Idempotency-Key` on create | **no documented mechanism** → adapter sends create exactly once; duplicate sessions prevented natively (collection-scoped) |
| Authorization | `payment` + `authorized_at` guard | retrieve (idempotent) | reporter GET — idempotent read (retried with backoff) |
| Capture | `captured_at` guard + capture-sum under row lock | `Idempotency-Key` on capture | auto-capture model; adapter verifies ENDED before confirming |
| Cancellation | `canceled_at` + key `payment.id` | `Idempotency-Key` on cancel; already-canceled no-op | local-only for un-paid trackers (no documented API) |
| Refund | captured/refunded sums under row lock + validator | `IdempotencyKey` on refund | **no documented mechanism** → refund sent exactly once; failed refund surfaces for reconciliation (no phantom refund) |
| Webhook | native guards + event-bus attempts | signature + event id | signature (HMAC-SHA512) + event `token` + native duplicate-delivery determinism |

Rule preserved for both: **retry after timeout determines existing provider
state before any new financial effect** (REQ-PAY-015) — Safepay via the
reporter API, Stripe via retrieve.

## 5. Refund / Capture Analysis

- **Stripe:** full/partial/multiple refunds; partial + full capture; capture idempotent
  on already-succeeded; refunds async with status; Medusa enforces refund ≤ captured.
- **Safepay:** full and partial refunds via the documented refund API
  (paisa amounts; TRACKER_REFUNDED / TRACKER_PARTIAL_REFUND states). Capture is
  the hosted-checkout auto-capture (TRACKER_ENDED); no separate capture API.
- **Approved policy application:** refunds to original payment method after receipt,
  prorated by received quantity (BD-R-05/BD-P-08), order currency only (BD-M-08),
  no shipping-fee refund on returns (BD-S-18). PKR refunds in PKR — no conversion.

## 6. Currency Verification

| Market | Currency | Safepay | Stripe |
| --- | --- | --- | --- |
| Pakistan | PKR | VERIFIED (paisa integers at API; adapter converts once) | n/a (not the PK provider) |
| UAE | AED | n/a | VERIFIED (docs.stripe.com/currencies) |
| Refunds | Order currency only | PKR (refund API carries `currency`) | PI-scoped (AED) |
| Cross-currency refunds | Refused (BD-M-08) | Adapter rejects non-PKR (unit-tested) | Not applicable |

## 7. Security Findings

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| S-1 | Safepay API authentication VERIFIED (`x-sfpy-merchant-secret` header; merchant API key in create body) | — | RESOLVED |
| S-2 | Safepay webhook signature VERIFIED (X-SFPY-SIGNATURE, HMAC-SHA512 hex over raw body) — implemented with constant-time comparison; invalid/missing signature never mutates payment state | — | RESOLVED |
| S-3 | Stripe webhook signature verification + raw-body preservation: fully verified (native route + bundled provider) | — | PASS |
| S-4 | Card data: Safepay hosted checkout + Stripe Elements/iframes keep card data off the Medusa server (REQ-PAY-018 aligned) | — | PASS (Safepay PCI status not independently audited) |
| S-5 | Credentials: server-side only (`SAFEPAY_*`, `STRIPE_*`); fail-fast env validation; `.env.example` names only | — | PASS |
| S-6 | Session correlation: Safepay `metadata.session_id` (tracker metadata, echoed by webhooks); Stripe `metadata.session_id` | — | PASS |
| S-7 | Safepay signature carries no timestamp — replay protection is native event idempotency (documented limitation, non-blocking) | LOW | ACCEPTED (documented) |

## 8. REQ-PAY Traceability

| Requirement | Provider evidence | Compatibility result | Unresolved issue |
| --- | --- | --- | --- |
| REQ-PAY-001 (amount authoritative) | Both accept server-supplied amounts; adapter verifies tracker amount vs session | VERIFIED_SUPPORTED | Safepay min/max undocumented (BD-P-10) |
| REQ-PAY-002 (currency = cart/order) | PKR/AED verified; Safepay adapter rejects non-PKR (tested) | VERIFIED_SUPPORTED | none |
| REQ-PAY-003 (market-scoped providers) | `region_payment_provider`; seed binds Safepay→PK, Stripe→AE | MEDUSA_DEFINED (config) | none |
| REQ-PAY-004 (native session workflows) | `initiatePayment` both providers | VERIFIED_SUPPORTED | none |
| REQ-PAY-005 (session idempotency) | Stripe idempotency keys; Safepay single-attempt create + native collection-scoped sessions | VERIFIED_SUPPORTED | — |
| REQ-PAY-006 (authorize at completion) | Safepay async confirmation (webhook/status); Stripe authorize-then-capture | VERIFIED_SUPPORTED | none |
| REQ-PAY-007 (independent payment state) | Medusa-native statuses | VERIFIED | none |
| REQ-PAY-008 (never client-confirmed success) | Webhook signature verified (Safepay) / constructEvent (Stripe); redirect never authoritative | VERIFIED_SUPPORTED | none |
| REQ-PAY-010 (capture one effect) | Medusa guards; Safepay auto-capture + ENDED verification; Stripe idempotency | VERIFIED_SUPPORTED | none |
| REQ-PAY-011 (refund ≤ captured) | Medusa-native validator + provider refund APIs | VERIFIED_SUPPORTED | none |
| REQ-PAY-013 (webhook signature/idempotency/replay) | Both verified and implemented | VERIFIED_SUPPORTED | Safepay no signature timestamp (S-7, documented) |
| REQ-PAY-014 (duplicate/out-of-order webhooks) | Native guards + deterministic provider mapping (tested) | VERIFIED_SUPPORTED | none |
| REQ-PAY-015 (retrieve before retry) | Reporter API / PI retrieve | VERIFIED_SUPPORTED | none |
| REQ-PAY-016 (secrets server-side) | Both; fail-fast validation | VERIFIED | none |
| REQ-PAY-018 (no raw card data) | Hosted page / Elements | VERIFIED_SUPPORTED | Safepay PCI not independently audited |
| REQ-PAY-020 (failure ≠ success) | Error mapping implemented; unknown Safepay state → error | VERIFIED_SUPPORTED | none |
| REQ-PAY-021 (unknown state → manual) | Safepay unknown tracker state → error (tested) | VERIFIED_SUPPORTED | none |
| REQ-PAY-022 (PK provider contract verified) | Safepay contract verified against official docs (safepay-verification.md) | VERIFIED_SUPPORTED | sandbox run pending |
| REQ-PAY-023 (AE provider contract verified) | Full lifecycle verified | VERIFIED_SUPPORTED | credentials/config only |
| REQ-PAY-026 (IPaymentProvider contract) | Both implement the verified interface | VERIFIED_SUPPORTED | none |
| REQ-PAY-027 (native webhook pipeline) | Native route used; provider signatures inside `getWebhookActionAndData` | VERIFIED_SUPPORTED | none |

## 9. Implementation Status / Remaining Gates

1. **Sandbox contract verification (both providers)** — run against
   `sandbox.api.getsafepay.com` / Stripe test mode once credentials are
   available. **Hard gate before enabling for customers.**
2. Production credentials + Safepay Developer Dashboard webhook endpoint
   (`POST /hooks/payment/safepay_safepay`; events: payment.succeeded,
   payment.failed, void.succeeded) + Stripe Dashboard webhook configuration
   (`POST /hooks/payment/stripe_stripe`).
3. Safepay rate limits + settlement reporting remain
   PROVIDER_VERIFICATION_REQUIRED (non-blocking; T-PAY-05/07 unchanged).
4. Storefront Safepay checkout redirect UX (reads `data.checkout_url` from the
   payment session) — storefront task, not a provider-contract gate.

## 10. Environment Variables / Secrets (names only)

- **Safepay:** `SAFEPAY_MERCHANT_API_KEY` · `SAFEPAY_SECRET_KEY` ·
  `SAFEPAY_WEBHOOK_SECRET` · `SAFEPAY_ENVIRONMENT` (sandbox|production) ·
  `SAFEPAY_REDIRECT_URL` · `SAFEPAY_CANCEL_URL`
  (gate: `PAYMENT_PROVIDER` containing `safepay`)
- **Stripe:** `STRIPE_SECRET_KEY` · `STRIPE_PUBLISHABLE_KEY` ·
  `STRIPE_WEBHOOK_SECRET` (gate: `PAYMENT_PROVIDER` containing `stripe`)
- Typical production value: `PAYMENT_PROVIDER=safepay,stripe`

## 11. Final Status

**COMPLETE_SANDBOX_VERIFIED** (2026-08-18)

- **Safepay (PK):** contract VERIFIED against official documentation (Context7)
  + official SDK source; adapter implemented and unit-tested (54 tests);
  registered env-gated; PK region binding seeded; **sandbox run COMPLETE** —
  session creation, hosted checkout payment (frictionless card), deferred
  authorization, capture, refund, and the signed webhook pipeline verified
  live (evidence: `safepay-verification.md` §3.11). SANDBOX_LIMITATIONs:
  no webhook auto-delivery from the sandbox; decline-card simulation
  unavailable.
- **Stripe (AE):** verified via bundled official provider; re-verified during
  this revision with no defects found; **test-mode run COMPLETE** — session →
  client confirmation (pm_card_visa) → deferred authorization → manual
  capture → refund → signed webhook pipeline verified live. SANDBOX_LIMITATION:
  raw card numbers and prebuilt declined payment-method ids are rejected by
  this test account; the failure path is covered by the signed
  `payment_intent.payment_failed` webhook test (no state change) and status-
  mapping unit tests.
- **AssanPay (PK):** REPLACED / NOT ACTIVE (historical evidence preserved).
- **xPay (PK):** REPLACED / NOT ACTIVE (historical evidence preserved).
