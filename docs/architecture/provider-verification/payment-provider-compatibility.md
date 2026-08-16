# Payment Provider Compatibility — AssanPay (PK) & Stripe (AE) vs Medusa 2.19.0

**Verification date:** 2026-08-16 (revised 2026-08-16 — **xPay replaced by
AssanPay** for Pakistan; Stripe unchanged for UAE)
**Task:** Verify the selected payment providers (AssanPay — Pakistan, Stripe —
UAE) against official documentation and the installed Medusa 2.19.0 payment
contract.
**Documentation only — zero implementation performed.**

> **Provider replacement record:** The Pakistan provider was originally xPay
> (XStak — XPay Fusion). **xPay is REPLACED by AssanPay** (provider replacement
> requested before implementation). xPay is **NOT ACTIVE**; its verification
> evidence is preserved as historical record at
> `docs/architecture/provider-verification/xpay-verification.md` and must not
> be cited as the active Pakistan contract.

Evidence files:
- `docs/architecture/provider-verification/assanpay-verification.md`
- `docs/architecture/provider-verification/stripe-verification.md`
- `docs/architecture/provider-verification/xpay-verification.md` (HISTORICAL / REPLACED)

**Context7 status:** Context7 MCP was **not invocable in this environment** (empty
`.agents/mcp.json`). Verification hierarchy used: installed Medusa 2.19.0 source
(rank #1) → official provider documentation (rank #2). No Context7 content was used
and none is claimed.

---

## 1. Executive Summary

- **Medusa 2.19.0 payment contract (verified in installed source):**
  `IPaymentProvider` (initiate/update/delete/authorize/capture/refund/retrieve/
  cancel/getPaymentStatus/getWebhookActionAndData), `PaymentActions` enum,
  `PaymentProviderContext.idempotency_key`, native webhook pipeline
  (`POST /hooks/payment/:provider` → `payment.webhook_received` → shipped subscriber
  → `processPaymentWorkflow`), native capture/refund guards (refund ≤ captured,
  row-locked sums), and the bundled **Stripe provider reference implementation**.
- **Stripe (UAE/AED): VERIFIED for V1.** Official docs confirm AED, the
  PaymentIntent model, webhook signature verification, and refund/idempotency
  semantics; the bundled `@medusajs/payment-stripe@2.19.0` implements the full
  Medusa contract. Remaining items are credentials + Dashboard configuration.
- **AssanPay (Pakistan/PKR): PARTIALLY VERIFIED.** Official docs
  (docs.assanpay.com Integration Manual + assanpay.com) verify the
  **redirect/cashier model**: create payment request
  (`POST /payment-request/{merchantId}`), hosted AssanPay payment page
  (`completeLink`), return-redirect on success/failure, status inquiry
  (`GET /payment/all-inquiry/…`), PKR amounts in major units (2 decimals),
  API Key + Secret Key per branch, configurable webhook URL, test mode, and
  merchant portal. **Blocking gaps: the HTTP authentication mechanism for API
  calls, the webhook payload/signature contract, refund API availability, the
  full status vocabulary, 3DS, and the API base URL are UNVERIFIED/TBD.**
- **Overall status: BLOCKED_PENDING_PROVIDER_VERIFICATION** — AssanPay
  webhook/auth/refund details must be verified before payment implementation
  (REQ-PAY-022). Stripe alone is ready; the PKR provider is the gate.

---

## 2. Compatibility Matrices

Status vocabulary: `VERIFIED_SUPPORTED` · `VERIFIED_UNSUPPORTED` ·
`PROVIDER_DOC_UNCLEAR` · `MEDUSA_MAPPING_REQUIRED` · `NOT_REQUIRED_FOR_V1`.

### 2.1 AssanPay (Pakistan, PKR)

| # | Capability | Medusa requirement | Provider capability | Status | Evidence | Adapter impact |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Payment/session creation | `initiatePayment` → session | `POST /payment-request/{merchantId}` with `{ amount, order_id, store_name, link }`; returns `transactionId`, `id`, `completeLink`, `status: pending` | VERIFIED_SUPPORTED | Official Integration Manual | `initiatePayment` calls create-payment-request; stores `transactionId`/`completeLink` in provider `data`; returns `{ id, status: pending }` |
| 2 | Authorization | `authorizePayment` → status | Redirect model: customer pays on the hosted page **after** session creation; authorization is confirmed asynchronously (webhook/status inquiry) → maps to Medusa's `pending_authorization`/deferred-authorization path | VERIFIED_SUPPORTED (flow); authorization semantics PROVIDER_DOC_UNCLEAR | Manual | `authorizePayment` = status inquiry + map; the async path is the natural fit (§3) |
| 3 | Capture | `capturePayment` | **No separate capture endpoint documented** — hosted page completes/captures the payment (auto-capture) | PROVIDER_DOC_UNCLEAR (likely NOT_APPLICABLE for redirect model) | Manual | Confirm with AssanPay whether a capture API exists; otherwise capture is driven by the webhook/status `captured` action (Medusa `processPaymentWorkflow`) |
| 4 | Partial capture | Native mechanism | Not documented | PROVIDER_DOC_UNCLEAR | Manual | NOT_REQUIRED_FOR_V1 unless confirmed |
| 5 | Cancellation | `cancelPayment`/`deletePayment` | **No void/cancel API documented** | PROVIDER_DOC_UNCLEAR | Manual | Session expiry config + return-flow abandonment; confirm cancel mechanism with AssanPay |
| 6 | Full refund | `refundPayment` | Refunds mentioned via the Business Portal ("initiate swift refunds"); go-live checklist includes "Refund process verified" | PROVIDER_DOC_UNCLEAR — **no refund API endpoint documented** | Features page + Shopify guide | **Blocker**: Medusa `refundPayment` needs a provider API call; if AssanPay exposes none, refunds must be portal/manual (must be confirmed) |
| 7 | Partial refund | Native mechanism | Not documented | PROVIDER_DOC_UNCLEAR | Manual | Depends on refund API |
| 8 | Webhook | Native pipeline; provider `getWebhookActionAndData` | Webhook URL configurable ("Webhook URL for receiving payment notifications"); Shopify app auto-configures webhooks; webhooks notify about payment status changes | VERIFIED_SUPPORTED (exists) — **payload/signature contract UNVERIFIED** | Manual + Shopify guide | **Blocker**: adapter `getWebhookActionAndData` cannot be implemented until payload shape, event types, and signature verification are documented |
| 9 | Webhook signature verification | Provider-side | **Not documented** (no HMAC/signature algorithm described for webhooks) | PROVIDER_DOC_UNCLEAR — **BLOCKING** | Manual | Mandatory for REQ-PAY-013 |
| 10 | Idempotency | `context.idempotency_key` passthrough | **Create-time duplicate detection verified**: duplicate `order_id` → 200 "Order Id already exists" (server-side uniqueness). No formal idempotency-key header documented | VERIFIED_SUPPORTED (create-time) / PROVIDER_DOC_UNCLEAR (key) | Manual | Create is safely retryable (duplicate order_id rejected); status-before-retry still applies (REQ-PAY-015) |
| 11 | Async payments | Confirmation via webhook/status | Redirect model is inherently asynchronous; status inquiry endpoint exists | VERIFIED_SUPPORTED | Manual | Matches Medusa `pending_authorization` flow |
| 12 | Customer auth / 3DS | Provider-handled | **3DS not documented** | PROVIDER_DOC_UNCLEAR | — | Verify before launch |
| 13 | Payment failure | Map to `failed`/`error` | Error responses documented: 400 "Argument 'amount' is missing.", 400/500 "Transaction not Created"; redirect supports success/failure return | VERIFIED_SUPPORTED (partial) | Manual | Error-mapping tests; full decline catalog UNVERIFIED |
| 14 | Refund failure | Map; no phantom refund | Not documented | PROVIDER_DOC_UNCLEAR | — | Medusa deletes local refund record on provider failure (native) |
| 15 | Duplicate webhook handling | Native guards | Depends on webhook contract | PROVIDER_DOC_UNCLEAR — **BLOCKING** | — | — |
| 16 | Retry behavior | Bounded retries | Not documented | PROVIDER_DOC_UNCLEAR | — | Adapter retry policy per T-PAY-06 |
| 17 | PKR support | Currency match | PKR payment processing (major units, 2 decimals — "natural numbers or float with two decimal number") | VERIFIED_SUPPORTED | Manual | Amount unit **VERIFIED: major units (PKR), not paisa** |
| 18 | Sandbox | Contract tests | Test mode documented (test card 4111 1111 1111 1111, exp 12/25, CVV 123); API keys per branch (test/live branches) | VERIFIED_SUPPORTED | Manual + WordPress/Shopify guides | Contract tests against test branch |
| 19 | Production | — | Merchant portal (merchant.assanpay.com), branches for live keys, go-live checklist | VERIFIED_SUPPORTED (process); API base URL UNVERIFIED | Manual + features page | Env config at implementation |
| 20 | Transaction limits | — | Min/max not documented | PROVIDER_DOC_UNCLEAR | — | BD-P-10 deferred |
| 21 | Payment-method compatibility | Region-scoped | Visa, Mastercard, Easypaisa, JazzCash, bank transfers, payment links (official site); configurable ("leave blank for all payment methods") | VERIFIED_SUPPORTED | Features page + WordPress guide | V1 method scope per BD-P-04 |

### 2.2 Stripe (UAE, AED) — via bundled `@medusajs/payment-stripe@2.19.0` (UNCHANGED)

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
| 18 | Sandbox | Contract tests | Test mode + test keys | VERIFIED_SUPPORTED | Stripe docs | Contract tests |
| 19 | Production | — | Live mode + live keys | VERIFIED_SUPPORTED | Stripe docs | Credentials |
| 20 | Transaction limits | — | Stripe min amounts per currency | VERIFIED_SUPPORTED (general) | Stripe docs | BD-P-10 deferred |
| 21 | Payment-method compatibility | Region-scoped | UAE: Visa, Mastercard, Apple Pay, Google Pay, Link | VERIFIED_SUPPORTED | Stripe support page | V1 card default; others configurable |

---

## 3. Medusa → Provider Mapping (no code written)

### 3.1 Stripe — fully native via `@medusajs/payment-stripe` (unchanged)

| Medusa method | Stripe call (verified source) |
| --- | --- |
| `initiatePayment` | `paymentIntents.create({ amount: getSmallestUnit(amount, currency), currency, metadata: { session_id, … }, customer? }, { idempotencyKey: context.idempotency_key })` |
| `authorizePayment` / `getPaymentStatus` | `paymentIntents.retrieve(id, { expand: ['payment_method'] })` → `getStatus()` |
| `capturePayment` | `paymentIntents.capture(id, { idempotencyKey })` (idempotent on already-succeeded) |
| `cancelPayment` / `deletePayment` | `paymentIntents.cancel(id, { idempotencyKey })` (idempotent on already-canceled) |
| `refundPayment` | `refunds.create({ amount: getSmallestUnit(amount, currency), payment_intent: id }, { idempotencyKey })` |
| `getWebhookActionAndData` | `constructWebhookEvent(rawData, signature, secret)`; ignore if no `metadata.session_id`; map event types → `PaymentActions` |

**Webhook event mapping (verified source):** `payment_intent.created/.processing` →
`PENDING` (or `PENDING_AUTHORIZATION` for async methods); `.canceled` → `CANCELED`;
`.payment_failed` → `FAILED`; `.requires_action` → `REQUIRES_MORE`;
`.amount_capturable_updated` → `AUTHORIZED`; `.partially_funded` → `REQUIRES_MORE`;
`.succeeded` → `SUCCESSFUL` (captured); default → `NOT_SUPPORTED`.

### 3.2 AssanPay — adapter mapping (target; implementation after verification)

| Medusa method | AssanPay call (verified endpoint) | Notes |
| --- | --- | --- |
| `initiatePayment` | `POST /payment-request/{merchantId}` with `{ amount, order_id, store_name, link }` | Server-side; `amount` in major units (PKR, 2 decimals — VERIFIED); `order_id` = Medusa session id (≤20 chars, no special chars) for correlation; `store_name` required; `link` = return URL; store `transactionId` + `completeLink` in provider `data`; return `{ id: transactionId, status: pending }` |
| `authorizePayment` / `getPaymentStatus` | `GET /payment/all-inquiry/{merchantId}?transactionId={order_id}` | Map provider status → `PaymentSessionStatus` (full status vocabulary UNVERIFIED); async `pending_authorization` path is the natural fit |
| `capturePayment` | No separate capture endpoint documented — auto-capture on hosted page; capture driven by webhook/status `captured` action via `processPaymentWorkflow` | Confirm with AssanPay |
| `cancelPayment` / `deletePayment` | No void API documented — confirm with AssanPay | Session expiry/return-flow handling |
| `refundPayment` | **No refund API endpoint documented** — **BLOCKED**; confirm with AssanPay (portal refunds verified as existing) | If no API, Medusa refund flow needs a confirmed mechanism |
| `getWebhookActionAndData` | **BLOCKED** — webhook contract UNVERIFIED | Signature verification + event mapping per official spec |

### 3.3 Division of responsibility

- **Medusa owns (native):** payment collections/sessions/payments/captures/refunds
  persistence; status derivation; capture/refund guards (≤ captured, row-locked);
  idempotency keys; webhook HTTP entry point + event + subscriber +
  `processPaymentWorkflow`; admin routes + RBAC; `session_id` correlation guard.
- **Provider owns:** hosted payment page (card/wallet processing), redirect flow,
  payment completion, (portal) refunds, webhook delivery.
- **Adapter translates (custom, inside the provider boundary):** request/response
  shapes, amount/currency mapping, provider status → Medusa status, webhook payload
  → `WebhookActionResult` (with signature verification, once documented),
  `order_id` correlation.
- **Must NOT be built:** custom payment persistence, second payment state machine,
  custom webhook route (native route exists), custom refund validation (native).

---

## 4. Idempotency Analysis

| Operation | Medusa mechanism (verified) | Stripe (verified) | AssanPay (verified/unknown) |
| --- | --- | --- | --- |
| Session creation | collection-scoped session creation | `Idempotency-Key` on create | **Create-time duplicate detection VERIFIED** (duplicate `order_id` → "Order Id already exists"); no formal idempotency key |
| Authorization | `payment` + `authorized_at` guard | retrieve (idempotent) | status inquiry (GET) — idempotent by nature |
| Capture | `captured_at` guard + capture-sum under row lock | `Idempotency-Key` on capture | no capture API documented — **UNVERIFIED** |
| Cancellation | `canceled_at` + key `payment.id` | `Idempotency-Key` on cancel; already-canceled no-op | no void API documented — **UNVERIFIED** |
| Refund | captured/refunded sums under row lock + validator | `Idempotency-Key` on refund | no refund API documented — **UNVERIFIED** |
| Webhook | native guards + event-bus attempts | signature + event id | webhook contract **UNVERIFIED** |

Rule preserved for both: **retry after timeout determines existing provider state
before any new financial effect** (REQ-PAY-015) — AssanPay via status inquiry,
Stripe via retrieve. AssanPay's `order_id` uniqueness makes create retries safe
(duplicates rejected server-side).

## 5. Refund / Capture Analysis

- **Stripe:** full/partial/multiple refunds; partial + full capture; capture idempotent
  on already-succeeded; refunds async with status; Medusa enforces refund ≤ captured.
- **AssanPay:** refunds exist via the **Business Portal** (verified: "initiate swift
  refunds"); go-live checklist includes "Refund process verified"; **no refund API
  endpoint is documented** — the refund API is **UNVERIFIED and a hard gate** for
  Medusa's native `refundPayment` flow. Capture: redirect model auto-captures at the
  hosted page; no capture API documented.
- **Approved policy application:** refunds to original payment method after receipt,
  prorated by received quantity (BD-R-05/BD-P-08), order currency only (BD-M-08),
  no shipping-fee refund on returns (BD-S-18). PKR refunds in PKR — no conversion.

## 6. Currency Verification

| Market | Currency | AssanPay | Stripe |
| --- | --- | --- | --- |
| Pakistan | PKR | VERIFIED (official docs; amounts in major units, 2 decimals — not paisa) | n/a (not the PK provider) |
| UAE | AED | n/a | VERIFIED (docs.stripe.com/currencies) |
| Refunds | Order currency only | PKR (refund currency UNVERIFIED at API level) | PI-scoped (AED) |
| Cross-currency refunds | Refused (BD-M-08) | Not applicable | Not applicable |

## 7. Security Findings

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| S-1 | AssanPay **HTTP API authentication not documented** (no Authorization/Bearer/API-key header in the Integration Manual; API Key + Secret Key exist per branch) — must be verified before any API call | HIGH | PROVIDER_VERIFICATION_REQUIRED |
| S-2 | AssanPay **webhook signature/verification contract UNVERIFIED** — native hooks route must not be enabled for AssanPay until verified (REQ-PAY-013) | HIGH | PROVIDER_VERIFICATION_REQUIRED |
| S-3 | Stripe webhook signature verification + raw-body preservation: fully verified (native route + bundled provider) | — | PASS |
| S-4 | Card data: AssanPay redirects to its hosted payment page (card data on AssanPay side); Stripe Elements/iframes — both keep card data off the Medusa server (REQ-PAY-018 aligned) | — | PASS (AssanPay PCI status not independently verified) |
| S-5 | Credentials: server-side only (AssanPay API Key + Secret Key, merchant ID; Stripe secret key); publishable keys client-side where applicable | — | PASS (names only; no values recorded) |
| S-6 | Session correlation: AssanPay `order_id` (unique, ≤20 chars) serves as the correlation key; Stripe `metadata.session_id` — required for `getWebhookActionAndData` association | — | PASS (AssanPay correlation via order_id; verify exact webhook payload field) |

## 8. REQ-PAY Traceability

| Requirement | Provider evidence | Compatibility result | Unresolved issue |
| --- | --- | --- | --- |
| REQ-PAY-001 (amount authoritative) | Both accept server-supplied amount; Medusa computes | VERIFIED_SUPPORTED | AssanPay amount major units VERIFIED; no min/max documented |
| REQ-PAY-002 (currency = cart/order) | PKR/AED verified; no conversion | VERIFIED_SUPPORTED | none |
| REQ-PAY-003 (market-scoped providers) | Region-scoped via `region_payment_provider`; providers per market | MEDUSA_MAPPING_REQUIRED (config) | none |
| REQ-PAY-004 (native session workflows) | `initiatePayment` both providers | VERIFIED_SUPPORTED | none |
| REQ-PAY-005 (session idempotency) | Stripe idempotency keys; AssanPay `order_id` uniqueness | Stripe VERIFIED / AssanPay VERIFIED_SUPPORTED (create-time) | AssanPay formal idempotency key |
| REQ-PAY-006 (authorize at completion) | AssanPay redirect model = async confirmation (deferred authorization); Stripe authorize-then-capture | VERIFIED_SUPPORTED (async path) | AssanPay status vocabulary |
| REQ-PAY-007 (independent payment state) | Medusa-native statuses; providers map into them | VERIFIED | AssanPay status mapping |
| REQ-PAY-008 (never client-confirmed success) | Both confirm via webhook/status server-side | VERIFIED_SUPPORTED (design) | **AssanPay webhook contract UNVERIFIED → BLOCKED** |
| REQ-PAY-010 (capture one effect) | Medusa guards; AssanPay redirect auto-capture; Stripe idempotency | Stripe VERIFIED / AssanPay PROVIDER_DOC_UNCLEAR | AssanPay capture semantics |
| REQ-PAY-011 (refund ≤ captured) | Medusa-native validator | VERIFIED_SUPPORTED | AssanPay refund API |
| REQ-PAY-013 (webhook signature/idempotency/replay) | Stripe verified; AssanPay contract absent | Stripe VERIFIED / AssanPay **PROVIDER_VERIFICATION_BLOCKED** | AssanPay webhook contract |
| REQ-PAY-014 (duplicate/out-of-order webhooks) | Native guards + provider event identity | Stripe VERIFIED / AssanPay **PROVIDER_VERIFICATION_BLOCKED** | AssanPay webhook contract |
| REQ-PAY-015 (retrieve before retry) | Both have retrieve/status endpoints | VERIFIED_SUPPORTED | AssanPay status vocabulary |
| REQ-PAY-016 (secrets server-side) | Both; AssanPay API/Secret keys per branch | VERIFIED (design) | S-1 (auth mechanism) |
| REQ-PAY-018 (no raw card data) | Hosted page / Elements | VERIFIED_SUPPORTED | AssanPay PCI status UNVERIFIED |
| REQ-PAY-020 (failure ≠ success) | Medusa semantics; AssanPay error shapes documented (partial) | VERIFIED_SUPPORTED (design) | AssanPay error catalog |
| REQ-PAY-021 (unknown state → manual) | Status inquiry endpoint enables checks | VERIFIED_SUPPORTED | AssanPay status vocabulary |
| REQ-PAY-022 (PK provider contract verified) | Redirect lifecycle verified; **auth/webhook/refund UNVERIFIED** | **PROVIDER_VERIFICATION_BLOCKED** | items §13 of assanpay-verification.md |
| REQ-PAY-023 (AE provider contract verified) | Full lifecycle verified | VERIFIED_SUPPORTED | credentials/config only |
| REQ-PAY-026 (IPaymentProvider contract) | Both map to the verified interface | VERIFIED_SUPPORTED | AssanPay webhook + refund mapping |
| REQ-PAY-027 (native webhook pipeline) | Native route + subscriber; provider signature inside `getWebhookActionAndData` | VERIFIED_SUPPORTED | AssanPay signature mechanism |

## 9. Implementation Blockers

1. **AssanPay HTTP API authentication mechanism** (how API Key/Secret Key /
   merchant ID are presented on `/payment-request/` and `/payment/all-inquiry/`)
   — blocks any adapter API call. **Hard blocker.**
2. **AssanPay webhook contract** (event types, payload shape, delivery, signature
   verification, replay/duplicate semantics) — blocks REQ-PAY-008/013/014 and the
   adapter's `getWebhookActionAndData`. **Hard blocker.**
3. **AssanPay refund API availability** — portal refunds verified; an API for
   Medusa's `refundPayment` is not documented. If none exists, Medusa-native refund
   flow requires a confirmed mechanism. **Hard blocker.**
4. **AssanPay API base URL** (endpoints documented as relative paths) — must be
   confirmed. **Hard blocker for configuration.**
5. AssanPay full status vocabulary + 3DS + capture/cancel semantics — required for
   status mapping and error paths. **Hard blocker for adapter correctness.**
6. Stripe account/keys + Dashboard webhook/event configuration — non-blocking setup
   at implementation.

## 10. Required Environment Variables / Secrets (names only)

- **AssanPay:** `ASSANPAY_MERCHANT_ID` · `ASSANPAY_API_KEY` · `ASSANPAY_SECRET_KEY` ·
  `ASSANPAY_BASE_URL` · `ASSANPAY_WEBHOOK_URL` (return URL / webhook config) ·
  `ASSANPAY_WEBHOOK_SECRET` (after webhook contract verification)
  *(names are proposals pending verification of the actual auth contract; no values)*
- **Stripe:** `STRIPE_SECRET_KEY` · `STRIPE_PUBLISHABLE_KEY` · `STRIPE_WEBHOOK_SECRET`

## 11. Recommended Implementation Sequence

1. Verify the AssanPay blockers (API authentication, webhook contract, refund API,
   base URL, status vocabulary, 3DS) with AssanPay (official docs / support@assanpay.com).
2. Enable Stripe module in `medusa-config.ts` (bundled `@medusajs/payment-stripe`),
   bind AE region → stripe (T-PAY-01/02), configure webhook endpoint + events.
3. Implement the AssanPay adapter (`payments/` boundary) implementing
   `IPaymentProvider` once step 1 completes; map the redirect model to the
   `pending_authorization`/deferred-authorization flow.
4. Region binding for PK (AssanPay) per T-PAY-02; test with test branch + test card.
5. Contract tests per REQ-PAY-022/023 before enabling either provider for customers.

## 12. Final Status

**BLOCKED_PENDING_PROVIDER_VERIFICATION**

- **Stripe (AE):** READY (configuration + credentials only) — preserved unchanged.
- **AssanPay (PK):** redirect/cashier lifecycle + PKR amounts verified; **API
  authentication, webhook contract, refund API, base URL, status vocabulary, and
  3DS remain UNVERIFIED** — required before adapter implementation
  (REQ-PAY-022/013/014/001/011).
- **xPay (PK):** REPLACED / NOT ACTIVE (historical evidence preserved).

No application code, configuration, dependency, or database changes were made.
