# Safepay (Pakistan / PKR) — Provider Verification

**Verification date:** 2026-08-17 (replaces AssanPay as the Pakistan provider —
approved decision BD-P-01 revised; AssanPay verification preserved as
HISTORICAL at `assanpay-verification.md`)
**Status: VERIFIED — official documentation + sandbox contract verification
COMPLETE (2026-08-17/18). Adapter implemented and verified end-to-end against
`sandbox.api.getsafepay.com`: session creation → hosted checkout payment →
deferred authorization → capture → refund, plus the native webhook pipeline
with signature verification. See §3.11 and §7 for evidence and the documented
SANDBOX_LIMITATIONs.**

## 1. Documentation Sources Used

| # | Source | Access method | Rank |
| --- | --- | --- | --- |
| 1 | Official Safepay documentation — `safepay-docs.netlify.app` (build-your-integration/express-checkout, developers/webhooks/*, modify-payments/refund, modify-payments/void, build-your-integration/advanced-checkout) | Context7 (`/websites/safepay-docs_netlify_app`, High reputation, 541 snippets) | Official provider docs |
| 2 | Official Safepay Node SDK source — `@sfpy/node-core@0.3.5` (published package inspected: `cjs/resources/*.js`, `cjs/safepay.core.js`, `cjs/RequestSender.js`, `cjs/Checkout.js`) | npm registry package download | Installed/official SDK source |
| 3 | Installed Medusa 2.19.0 payment contract — `@medusajs/types` (provider.d.ts, mutations.d.ts), `@medusajs/payment` (providers loader, payment-module service), `@medusajs/medusa` (hooks route, payment-webhook subscriber), `@medusajs/payment-stripe` (bundled reference provider, amount-unit conventions) | node_modules inspection | Installed platform source (authoritative) |

Context7 status: **available and used** for the Safepay documentation
retrieval (source #1). No credentials were hardcoded anywhere; access went
through the configured environment integration.

## 2. Verification Record (AGENTS.md §27.4)

```
Medusa version: 2.19.0 (locked; unchanged)
Relevant package/module: @medusajs/payment, @medusajs/types (IPaymentProvider,
  PaymentActions, PaymentSessionStatus, ProviderWebhookPayload,
  PaymentProviderContext.idempotency_key); native webhook pipeline
  (/hooks/payment/:provider → payment.webhook_received → subscriber →
  processPaymentWorkflow)
Relevant API: IPaymentProvider — initiatePayment, updatePayment, deletePayment,
  authorizePayment, capturePayment, refundPayment, retrievePayment,
  cancelPayment, getPaymentStatus, getWebhookActionAndData
Context7 verification: Safepay official docs (see §1) — payment session
  creation, checkout URL, passport token, reporter status API, refunds, voids,
  webhook events + HMAC-SHA512 signature verification
Installed source/type verification: provider.d.ts method signatures; payment
  module providers.js loader (pp_{identifier}_{id}); hooks route (raw body
  preserved); subscriber guards (no session_id → ignore); bundled Stripe
  provider (major-unit amounts at provider boundary; metadata.session_id
  correlation; PaymentActions.SUCCESSFUL = "captured")
Compatibility result: COMPATIBLE — Safepay tracker model maps to the Medusa
  session lifecycle; adapter implemented at
  apps/backend/src/modules/payment-safepay (provider key pp_safepay_safepay)
Implementation boundary: IPaymentProvider adapter; no custom payment engine,
  no custom webhook route, no custom payment persistence, no second state
  machine
```

## 3. Verified Contract

### 3.1 Authentication
- API auth: `x-sfpy-merchant-secret: <secret key>` header on server-to-server
  calls (verified in official SDK `RequestSender._makeAuthHeader`; the SDK's
  default `authType: "secret"` sets exactly this header).
- Tracker creation additionally carries the **public merchant API key**
  (`sec_…`) in the body as `merchant_api_key`.
- Checkout URL requires a **passport token** (`tbt`): `POST
  /client/passport/v1/token` → `{ data: "<token>" }` (verified docs + SDK
  `client.passport.create`), valid ~1 hour.

### 3.2 API base URLs (verified)
| Purpose | Sandbox | Production |
| --- | --- | --- |
| API host | `https://sandbox.api.getsafepay.com` | `https://api.getsafepay.com` |
| Hosted checkout | `https://sandbox.api.getsafepay.com/embedded/` | `https://getsafepay.com/embedded/` |

### 3.3 Payment session creation (verified)
`POST /order/payments/v3/` with body `{ merchant_api_key, intent, mode:
"payment", currency: "PKR", amount (lowest denomination — paisa), metadata }`
→ `{ data: { tracker: { token: "track_…", state: "TRACKER_STARTED", … } },
status: { errors: [], message: "success" } }`.
Documented `intent` values include `CYBERSOURCE`, `MPGS`.
The checkout URL is built as `{checkout host}?environment=&tracker=&tbt=&source=hosted&redirect_url=&cancel_url=` (verified in SDK `Checkout.js` + docs).

### 3.4 Payment status / lifecycle (verified)
`GET /reporter/api/v1/payments/{tracker}` → `{ data: { tracker: { state,
purchase_totals: { quote_amount: { currency, amount } } } } }`.
Verified states: `TRACKER_STARTED` (pending), `TRACKER_ENDED` (paid/captured —
"A payment is considered successfully completed when the tracker state property
is set to TRACKER_ENDED"), `TRACKER_VOIDED`, `TRACKER_REFUNDED`,
`TRACKER_PARTIAL_REFUND`. The payment model is **auto-capture** (`mode:
"payment"` — the hosted checkout captures on customer completion); no separate
capture API is documented.

### 3.5 Webhooks (verified)
- Endpoint (Medusa native): `POST /hooks/payment/safepay_safepay` (route
  `/hooks/payment/:provider` + provider key `pp_safepay_safepay`).
- Signature: `X-SFPY-SIGNATURE` header = HMAC-**SHA512** hex digest of the
  **raw request body**, keyed with the endpoint's shared secret from the
  Developer Dashboard. Constant-time comparison enforced in the adapter.
- Event envelope: `{ token: "evt_…", version: "2.0.0", type, data: { tracker,
  state, amount (paisa), currency, metadata, … }, created_at }`.
- Documented relevant event types: `payment.succeeded`, `payment.failed`,
  `void.succeeded` (plus `subscription.*` types, out of scope for V1).
- Replay protection: the signature has **no documented timestamp component** —
  replay protection is provided by Medusa's native event identity/processing
  idempotency (duplicate delivery → deterministic action, single state effect
  via processPaymentWorkflow; unit-tested).

### 3.6 Refunds (verified)
`POST /order/payments/v3/{tracker}/refund` with `{ currency: "PKR", amount }`
(full and **partial** refunds documented; response state `TRACKER_REFUNDED` /
`TRACKER_PARTIAL_REFUND`). Verified in docs ("Modify payments → Refund") and in
the official SDK resource `order.cancel.refund` (path
`/payments/v3/{tracker}/refund`). Amounts in paisa.

### 3.7 Void / cancellation
`POST /order/payments/v3/{tracker}/void` (kind `VOID_CAPTURE`) is documented —
but it **voids a capture**; no documented provider-side cancellation exists for
an **un-paid** (TRACKER_STARTED) tracker. Adapter behavior: cancel of a
captured tracker throws (refund instead, REQ-PAY-012); cancel of an un-paid
tracker is local-only. **PROVIDER_VERIFICATION_REQUIRED** if a business rule
ever requires voiding an un-paid tracker server-side.

### 3.8 Amounts / currency (verified)
- PKR supported; amounts are integers in the **lowest denomination** (paisa;
  PKR 6,000 → `600000` — verified across docs examples).
- Medusa 2.19.0 provider-boundary amounts are **major units** (verified via
  the bundled Stripe provider's `getSmallestUnit` usage and the Medusa
  `prices-in-major-units` lint rule). The adapter converts ×100 exactly once
  (`toSafepayAmount`) and ÷100 for webhook amounts (`fromSafepayAmount`);
  non-PKR currencies are rejected (no silent conversion — REQ-PAY-002);
  zero/negative amounts are rejected. Unit-tested.
- Min/max transaction limits: **not documented** (BD-P-10 deferred —
  unchanged).

### 3.9 Idempotency
- Safepay documents **no idempotency-key mechanism** for tracker creation or
  refunds. Consequence (implemented + tested): financial operations are sent
  **exactly once** (no automatic retries — a retry could duplicate a payment
  or refund); read-only status calls are retried with bounded backoff
  (BD-P-05). Medusa's native idempotency keys (`context.idempotency_key`) are
  available but Safepay documents no header to carry them — not invented.

### 3.10 3DS / payer authentication
Tracker creation returns `next_actions: { CYBERSOURCE: { kind:
"PAYER_AUTH_SETUP" } }` — payer authentication is handled on Safepay's hosted
checkout (provider-side). No adapter action required; classified
VERIFIED_SUPPORTED (provider-handled) / IMPLEMENTATION_DEFINED at the flow
level (hosted page controls the challenge UX).

### 3.11 Test credentials and sandbox contract verification (COMPLETE 2026-08-18)

Sandbox keys (merchant API key, secret key, webhook secret) are present in the
local environment, managed through the Medusa Admin (payment-config module,
encrypted at rest — never in source control). Verified live against
`sandbox.api.getsafepay.com`:

- **Session creation:** 201/TRACKER_STARTED; the sandbox **rejects unsupported
  metadata keys** — the session id must travel as `metadata.order_id`
  (verified: `order_id` accepted, `session_id` rejected with
  "unsupported meta key"). The adapter sends `{ order_id: sessionId }` and
  `metadataSessionId_` reads `order_id` first, falling back to `session_id`.
- **Hosted checkout:** passport (`tbt`) + tracker + redirect/cancel URLs work;
  frictionless test card `4456 5300 0000 1005` (exp 12/28, CVC 123) paid a
  PKR 27,500.00 cart → tracker `TRACKER_ENDED`, quote_amount 2,750,000 paisa,
  `metadata.order_id.value` = Medusa session id.
- **Reporter shape (sandbox):** `GET /reporter/api/v1/payments/{tracker}`
  returns the tracker **directly** at `data` (`data.state`, `data.token`,
  `data.purchase_totals.quote_amount.amount` in paisa, `data.metadata.
  order_id.value`); the webhook-style `data.tracker` wrapper was NOT present.
  The adapter accepts both shapes.
- **Deferred authorization:** the sandbox stays on `TRACKER_STARTED` until
  payment completes; `complete-cart` therefore requires the session to be
  `PENDING_AUTHORIZATION` (Medusa accepts only `PENDING_AUTHORIZATION` /
  `AUTHORIZED` / `CAPTURED` — a plain `PENDING` throws). Adapter maps
  TRACKER_STARTED → `PaymentSessionStatus.PENDING_AUTHORIZATION`.
- **Capture:** order created (`pending`), payment collection `awaiting`;
  payment.succeeded webhook → payment **captured** (payment + single capture
  of 27,500).
- **Refund:** Admin refund 27,500 → `TRACKER_REFUNDED` at Safepay.
- **Webhook pipeline:** sandbox **did not auto-deliver** the webhook to the
  backend (see §7 — SANDBOX_LIMITATION). The full pipeline was verified with
  a correctly signed payload (HMAC-SHA512 hex, `X-SFPY-SIGNATURE`) posted to
  `POST /hooks/payment/safepay_safepay`; a bad signature is rejected by the
  subscriber (3 attempts, never auto-success); a replayed valid event is
  idempotent (still exactly one capture + one refund).
- **Failed-payment invariant:** an unsuccessful payment attempt leaves the
  tracker `TRACKER_STARTED`, the session `pending`, and the order
  `pending`/`awaiting` with zero payments — a failed attempt never produces a
  success state. (Decline-card simulation: not available for this merchant in
  the sandbox — the hosted page returns 403 on the unsuccessful test card;
  see §7.)

**SANDBOX_LIMITATIONs (documented, non-blocking):**

1. The sandbox did not auto-deliver webhooks to the local backend (webhook
   delivery to `https://backend.flicter.com/hooks/payment/safepay_safepay`
   must be configured in the Developer Dashboard for production; the sandbox
   event pipeline was verified with correctly signed payloads).
2. Unsuccessful-card simulation returned 403 from the hosted page for this
   merchant; the failure-path invariant was verified via the aborted-attempt
   behavior above (and unit tests cover the state mapping).

## 4. Compatibility Matrix

Status vocabulary per the compatibility document: `VERIFIED_SUPPORTED` ·
`VERIFIED_NOT_SUPPORTED` · `PROVIDER_VERIFICATION_REQUIRED` ·
`IMPLEMENTATION_DEFINED` · `MEDUSA_DEFINED`.

| # | Capability | Status | Evidence | Medusa mapping | Blocking? | Implementation notes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Authentication (API) | VERIFIED_SUPPORTED | Docs + SDK `x-sfpy-merchant-secret` | n/a (adapter config) | was blocking | `SAFEPAY_SECRET_KEY` header + `SAFEPAY_MERCHANT_API_KEY` body |
| 2 | Payment session creation | VERIFIED_SUPPORTED | Docs POST /order/payments/v3/ + sandbox 201 (TRACKER_STARTED) | `initiatePayment` → tracker + checkout URL | no | sandbox requires `metadata.order_id` (rejects unknown meta keys); adapter stores `{ order_id: sessionId }` (session_id fallback for legacy payloads) |
| 3 | Hosted checkout redirect | VERIFIED_SUPPORTED | Docs + SDK Checkout.js + sandbox hosted payment (frictionless card) | `data.checkout_url` for the storefront | no | passport token (`tbt`) + tracker + redirect/cancel URLs |
| 4 | Status lookup | VERIFIED_SUPPORTED | Docs GET /reporter/api/v1/payments/{tracker} + sandbox reporter (direct `data` shape) | `authorizePayment` / `getPaymentStatus` / `retrievePayment` | no | sandbox returns the tracker directly at `data` (not `data.tracker`); both shapes accepted; state map: STARTED→pending_authorization, ENDED→captured, VOIDED→canceled, refunds→captured, unknown→error |
| 5 | Webhook delivery | VERIFIED_SUPPORTED | Docs webhook-types; pipeline verified with signed payload (sandbox auto-delivery not observed — see §7) | native `/hooks/payment/safepay_safepay` | no | payment.succeeded/failed, void.succeeded mapped |
| 6 | Webhook signature verification | VERIFIED_SUPPORTED | Docs verify-hmac-signatures (HMAC-SHA512, X-SFPY-SIGNATURE, raw body) | inside `getWebhookActionAndData` (REQ-PAY-013) | no | constant-time compare; missing/invalid signature → error (native pipeline retries ×3, never auto-success) |
| 7 | Webhook replay/timestamp | VERIFIED_NOT_SUPPORTED (no documented timestamp in signature) | Docs | MEDUSA_DEFINED (native event idempotency) | no | duplicate delivery → deterministic single state effect (tested) |
| 8 | Full refund | VERIFIED_SUPPORTED | Docs modify-payments/refund | `refundPayment` | no | POST …/{tracker}/refund `{ currency, amount }` |
| 9 | Partial refund | VERIFIED_SUPPORTED | Docs (TRACKER_PARTIAL_REFUND example) | `refundPayment` (amount input) | no | paisa amounts; Medusa enforces refund ≤ captured natively |
| 10 | Capture | VERIFIED_SUPPORTED (auto-capture model) | Docs (TRACKER_ENDED = completed payment) | `capturePayment` verifies TRACKER_ENDED; no provider capture call | no | no separate capture API documented — capture is verified, not issued |
| 11 | Partial capture | VERIFIED_NOT_SUPPORTED (hosted model captures once) | Docs | n/a for V1 | no | BD-P-07 remains provider-verified-unneeded for Safepay |
| 12 | Cancellation (un-paid tracker) | VERIFIED_NOT_SUPPORTED (no documented API) | Docs | `cancelPayment` local-only for un-paid trackers | no | late payment on a cancelled session surfaces via webhook → manual reconciliation (never auto-success) |
| 13 | Void of a capture | VERIFIED_SUPPORTED (documented) — not used by the adapter | Docs modify-payments/void | not mapped (refund is the V1 path per BD-P-08/R-05) | no | available if a business rule ever requires it |
| 14 | Authorization semantics | IMPLEMENTATION_DEFINED | Docs | auto-capture ⇒ `authorizePayment` maps TRACKER_ENDED→`captured` | no | Medusa maps provider `captured` to authorized internally where needed |
| 15 | 3DS / payer auth | VERIFIED_SUPPORTED (provider-handled on hosted page) | Docs (PAYER_AUTH_SETUP next_actions) | provider-side | no | no adapter action |
| 16 | PKR + amount unit | VERIFIED_SUPPORTED | Docs (paisa integers) | ×100 at the boundary, once | no | unit-tested; non-PKR rejected |
| 17 | Idempotency mechanism | VERIFIED_NOT_SUPPORTED (none documented) | Docs | MEDUSA_DEFINED native keys (not transportable to Safepay) | no | financial ops sent exactly once; status-before-retry (REQ-PAY-015) |
| 18 | Error model | VERIFIED_SUPPORTED (envelope `status.errors[]` + HTTP codes) | Docs | mapped to `SafepayApiError` → MedusaError | no | provider failure never becomes success (REQ-PAY-020) |
| 19 | Retry behavior | PROVIDER_VERIFICATION_REQUIRED (no documented provider retry policy) | — | BD-P-05 (bounded, read-only only) | non-blocking | implemented per approved BD-P-05 |
| 20 | Rate limits | PROVIDER_VERIFICATION_REQUIRED (not documented) | — | T-PAY-07 (platform rate limiting) | non-blocking | unchanged |
| 21 | Reconciliation/settlement data | PROVIDER_VERIFICATION_REQUIRED (settlement reporting not documented in retrieved pages) | — | T-PAY-05 job (future) | non-blocking | reporter API can drive status reconciliation |
| 22 | Sandbox | VERIFIED_SUPPORTED | Live sandbox run 2026-08-18 (pay/capture/refund/webhook; see §3.11) | contract tests + end-to-end verification | no | sandbox LIMITATIONS: no webhook auto-delivery observed; decline-card simulation unavailable (see §7) |
| 23 | Official Node SDK | VERIFIED_SUPPORTED (published @sfpy/node-core@0.3.5) — NOT used by the adapter | npm | n/a | no | adapter uses the verified REST contract directly (fewer deps — AGENTS.md §17 dependency discipline); SDK lacks the documented `webhooks.constructEvent`/refund surface in the published version |

## 5. Medusa → Safepay Mapping (implemented)

| Medusa method | Safepay call | Notes |
| --- | --- | --- |
| `initiatePayment` | `POST /order/payments/v3/` + `POST /client/passport/v1/token` | stores `tracker`, `checkout_url`, amount/currency in provider data; returns `{ id: tracker, status: pending }` |
| `updatePayment` | re-create tracker (new amount) | no documented tracker-update API; native refresh deletes/recreates sessions |
| `deletePayment` | no-op | un-paid tracker holds no funds |
| `authorizePayment` / `getPaymentStatus` | `GET /reporter/api/v1/payments/{tracker}` | state map + amount/currency verification (mismatch → error) |
| `capturePayment` | reporter verification only | auto-capture model; refuses non-TRACKER_ENDED |
| `refundPayment` | `POST /order/payments/v3/{tracker}/refund` | paisa amounts; exactly once |
| `cancelPayment` | reporter check only | captured → throw (refund instead); un-paid → local cancel |
| `getWebhookActionAndData` | HMAC-SHA512 verify → event map | payment.succeeded→`captured`(SUCCESSFUL), payment.failed→`failed`, void.succeeded→`canceled`, no session_id/unknown→`not_supported` |

## 6. Environment Variables (TRANSITIONAL — Admin-managed since 2026-08-17)

Provider credentials are now managed through the Medusa Admin UI
(`payment-config` module, encrypted at rest; see
`docs/specifications/payments.md` §34). The legacy variables

`SAFEPAY_MERCHANT_API_KEY` · `SAFEPAY_SECRET_KEY` ·
`SAFEPAY_WEBHOOK_SECRET` · `SAFEPAY_ENVIRONMENT` (sandbox|production) ·
`SAFEPAY_REDIRECT_URL` · `SAFEPAY_CANCEL_URL`

remain as a **TRANSITIONAL bootstrap fallback only** with explicit
precedence: **Admin-managed configuration > legacy environment
configuration**. They are no longer required for boot (`PAYMENT_PROVIDER`
containing `safepay` still registers the provider; `src/config/env.ts` no
longer requires the credential variables).

## 7. Outstanding Gates

1. **SANDBOX VERIFICATION COMPLETE (2026-08-18)** — session creation, hosted
   checkout payment, deferred authorization, capture, refund, and the signed
   webhook pipeline all verified live against `sandbox.api.getsafepay.com`
   (evidence in §3.11). Documented sandbox limitations (non-blocking):
   - **Webhook auto-delivery:** the sandbox did not deliver events to the
     local backend. Production configuration must point the Developer
     Dashboard webhook at `https://backend.flicter.com/hooks/payment/
     safepay_safepay` (events: payment.succeeded, payment.failed,
     void.succeeded). The receiving pipeline itself is verified
     (signature check, action mapping, idempotent replay).
   - **Decline simulation:** the unsuccessful test card is refused with 403
     by this merchant's sandbox checkout; the failed-attempt invariant was
     verified via aborted-attempt behavior (no state change) and unit tests.
2. Production credentials + Developer Dashboard webhook endpoint
   configuration (see above).
3. Rate limits / settlement-reporting details remain
   PROVIDER_VERIFICATION_REQUIRED (non-blocking for V1 launch; T-PAY-05/07
   unchanged).
