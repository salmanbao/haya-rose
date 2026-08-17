# Stripe Provider Verification (UAE / AED)

**Status:** VERIFIED for the approved V1 integration model — Stripe **PaymentIntents
API** via the bundled Medusa `@medusajs/payment-stripe@2.19.0` provider, confirmed
against official Stripe documentation, installed Medusa 2.19.0 source, and a live
**test-mode run (2026-08-18, sandbox verification COMPLETE)**: session creation →
client confirmation (pm_card_visa) → deferred authorization → manual capture →
refund, plus the signed webhook pipeline (`payment_intent.succeeded` →
captured; `payment_intent.payment_failed` → no state change). Remaining items
are production configuration/credential steps, not capability gaps.

**Verification date:** 2026-08-16
**Verifier:** implementation agent (documentation-only task; no code changed)
**Approved selection:** BD-P-02 (UAE payment provider = Stripe)

---

## 1. Provider Identity

- **Name:** Stripe.
- **Official documentation:** `https://docs.stripe.com` (Payment Intents API,
  webhooks, supported currencies, UAE availability).
- **Integration model used by Medusa 2.19.0 (verified in installed source):**
  **PaymentIntent model** — server creates a PaymentIntent, passes its
  `client_secret` to the client; the client confirms (handling 3DS/SCA); the server
  observes completion via webhooks and/or `paymentIntents.retrieve`. This is exactly
  how the bundled `@medusajs/payment-stripe` provider implements `IPaymentProvider`.

## 2. Documentation Sources Used

| Source | URL | What was verified |
| --- | --- | --- |
| Stripe — Supported currencies | `https://docs.stripe.com/currencies` | AED is a supported currency for card payments |
| Stripe — Payment Intents API | `https://docs.stripe.com/payments/payment-intents` | Create/confirm model; client secret; webhook monitoring; idempotency-key best practice; metadata; no double charges |
| Stripe — Webhooks | `https://docs.stripe.com/webhooks` | Raw-body requirement for signature verification |
| Stripe — Webhook signatures | `https://docs.stripe.com/webhooks/signature` | `Stripe-Signature` header; `constructEvent(requestBody, signatureHeader, signingSecret)` |
| Stripe Help — UAE availability | `https://support.stripe.com/questions/which-payments-methods-and-products-are-available-in-the-uae` | UAE payment methods: Visa, Mastercard, Apple Pay, Google Pay, Link |
| Installed `@medusajs/payment-stripe@2.19.0` (bundled in `@medusajs/medusa`) | `node_modules/…/payment-stripe/dist/core/stripe-base.js` | Full IPaymentProvider implementation: initiate/authorize/capture/cancel/refund/getPaymentStatus/getWebhookActionAndData; idempotency-key passthrough; webhook signature + event mapping |

**Context7 status:** Context7 MCP was not invocable in this environment (empty
`.agents/mcp.json`). Verification used installed Medusa 2.19.0 source (rank #1 in
AGENTS.md §27.3) and official Stripe documentation (rank #2).

## 3. Account / Environment

| Item | Finding | Status |
| --- | --- | --- |
| Test/sandbox | Stripe test mode + test keys (`sk_test_…`, `pk_test_…`) | VERIFIED |
| Production | Stripe production mode (`sk_live_…`, `pk_live_…`) | VERIFIED |
| API authentication | Secret key (Bearer) server-side; publishable key client-side | VERIFIED |
| API version | Stripe API versioning; bundled provider uses the Stripe Node SDK | VERIFIED (SDK-managed) |
| Account requirements | UAE merchant account via Stripe (Stripe supports UAE businesses) | VERIFIED (Stripe UAE availability) |

## 4. Currency — AED

- **AED is a supported Stripe currency for card payments** (docs.stripe.com/currencies).
- Amounts are submitted in **minor units** (fils; 2 decimal places); the bundled
  provider converts via `getSmallestUnit(amount, currency_code)` (verified source).
- Settlement currency = AED for AED PaymentIntents (no conversion introduced by the
  platform — cross-currency refunds remain refused per BD-M-08).
- UAE payment methods (Stripe-supported, per official help page): **Visa,
  Mastercard, Apple Pay, Google Pay, Link**. V1 approved baseline: **card
  (+ provider-default methods)** (BD-P-04) — enabling Apple Pay/Google Pay/Link is a
  configuration choice at implementation, not an architecture change.

## 5. Payment Lifecycle (PaymentIntent model)

| Item | Finding | Status |
| --- | --- | --- |
| Payment creation | `POST /v1/payment_intents` (server) with `amount` (minor units), `currency`, `metadata` (incl. `session_id` for Medusa correlation) | VERIFIED |
| Client confirmation | Client uses `client_secret` with Stripe.js / Payment Element; `requires_action` (3DS/SCA) handled automatically | VERIFIED |
| Authorization | PaymentIntent authorized when amount is confirmed and capturable (`amount_capturable`); Medusa `authorizePayment` retrieves status | VERIFIED |
| Separate capture | Manual capture (`capture_method: manual`) → `POST /v1/payment_intents/:id/capture`; Medusa `capturePayment` implements this | VERIFIED |
| Partial capture | Supported (capture up to `amount_capturable`); Medusa `capturePayment` accepts an amount | VERIFIED (native mechanism + provider) |
| Cancellation | `POST /v1/payment_intents/:id/cancel`; Medusa `cancelPayment`/`deletePayment` implement it (idempotent if already canceled) | VERIFIED |
| Payment expiration | PaymentIntents without confirmation eventually expire; session expiry driven by cart refresh in Medusa | VERIFIED (Stripe behavior; Medusa B-PAY-06 IMPLEMENTATION_DEFINED) |
| 3DS/SCA | PaymentIntents API handles SCA/3DS automatically (`requires_action`) | VERIFIED |

## 6. Refunds

| Item | Finding | Status |
| --- | --- | --- |
| Full refund | `POST /v1/refunds` with `payment_intent` | VERIFIED |
| Partial refund | Refunds accept an explicit `amount` | VERIFIED |
| Multiple partial refunds | Supported (multiple refunds per PaymentIntent until fully refunded) | VERIFIED |
| Refund currency | Refund is issued in the PaymentIntent currency (AED) — no conversion | VERIFIED |
| Asynchronous refunds | Refund processing is asynchronous; status via webhook/retrieve | VERIFIED |
| Refund failure | Refund object has `status` (e.g., `failed`); Medusa deletes its refund record and rethrows when the provider call fails | VERIFIED |
| Refund ≤ captured | Medusa enforces natively (`validateRefundPaymentExceedsCapturedAmountStep`) | MEDUSA-DEFINED |

## 7. Webhooks

| Item | Finding | Status |
| --- | --- | --- |
| Endpoint | Stripe webhook endpoint (configurable URL + enabled events in Dashboard) | VERIFIED |
| Signature verification | `Stripe-Signature` header; HMAC-SHA256; `constructEvent(rawBody, signatureHeader, signingSecret)`; timestamp tolerance; **raw request body required** | VERIFIED |
| Relevant events | `payment_intent.created`, `.processing`, `.canceled`, `.payment_failed`, `.requires_action`, `.amount_capturable_updated`, `.partially_funded`, `.succeeded`; refund events | VERIFIED (bundled provider mapping) |
| Replay/duplicate | Signature includes timestamp (tolerance window); events delivered with retries; Medusa guards duplicates/out-of-order via the native pipeline | VERIFIED |
| Mapping to Medusa | Provider `getWebhookActionAndData` returns `PaymentActions` + `session_id`/`amount`; events without `metadata.session_id` are ignored | VERIFIED (installed source) |

## 8. Idempotency

- Stripe `Idempotency-Key` header: same key + same parameters → same result, no
  duplicate charges/refunds (official best practice; bundled provider passes
  `context.idempotency_key` as the Stripe idempotency key on create/capture/cancel/
  refund — verified source).
- Medusa passes its own keys: `session.id` (initiate), `capture.id` (capture),
  `refund.id` (refund), `payment.id` (cancel) — verified.
- Retry semantics: Stripe returns the original object for a replayed key; provider
  `executeWithRetry` (3 attempts, exponential backoff + jitter) for transient
  failures (verified source). REQ-PAY-015 (retrieve before retry) still applies.

## 9. Errors / Limits

| Item | Finding | Status |
| --- | --- | --- |
| Card declines | Typed Stripe errors (`card_declined`, `insufficient_funds`, …) with codes | VERIFIED |
| Authentication failures | `authentication_required` / 3DS flow via PaymentIntent | VERIFIED |
| Validation/API errors | Typed API errors; Medusa maps to `INVALID_DATA`/provider errors | VERIFIED |
| Rate limits | Stripe rate limits on API requests; bounded retry with backoff | VERIFIED |
| Min/max amounts | Stripe minimum charge amounts per currency (AED min. applies) | VERIFIED (general); exact V1 values per BD-P-10 deferred |

## 10. Security

- Server-side secret key only; publishable key client-side (REQ-PAY-016).
- Webhook signature verification mandatory; raw body preserved by the native hooks
  route (`bodyParser: { preserveRawBody: true }` — verified).
- Card data via Stripe Elements/iframes — never on the merchant server
  (REQ-PAY-018).
- Metadata must not contain PII (official Stripe guidance); Medusa stores only
  provider `data` (session id correlation).

## 11. Required Environment Variables / Secrets (names only)

`STRIPE_SECRET_KEY` (server) · `STRIPE_PUBLISHABLE_KEY` (storefront) ·
`STRIPE_WEBHOOK_SECRET` (signing secret for `/hooks/payment/stripe`).

## 12. Verification Record

```
Provider: Stripe (UAE, AED) — PaymentIntents model
Sources: official Stripe docs (currencies, payment-intents, webhooks, signatures,
  UAE availability) + installed @medusajs/payment-stripe@2.19.0 source
Context7: NOT invocable in this environment (empty .agents/mcp.json)
Medusa side: installed 2.19.0 IPaymentProvider + native webhook pipeline
  (verified separately); bundled Stripe provider implements the full contract
Compatibility: full lifecycle verified (create/authorize/capture/partial capture/
  cancel/refund/partial refund/webhook signature/event mapping/idempotency)
Implementation boundary: documentation only; no code/config/dependency changes
```

## 13. Open Items (non-blocking configuration / verification)

| # | Item | Type |
| --- | --- | --- |
| 1 | UAE Stripe account + API keys for **production** (test-mode keys verified 2026-08-18) | PROVIDER_VERIFICATION_REQUIRED (credentials) |
| 2 | Enable webhook endpoint + subscribe required events in the Stripe Dashboard (production) — receiving pipeline verified via signed payloads at `POST /hooks/payment/stripe_stripe` (payment_intent.succeeded → captured; payment_intent.payment_failed → ignored, no state change) | CONFIGURATION at implementation |
| 3 | Payment methods to enable for V1 (card default; Apple Pay/Google Pay/Link optional per BD-P-04) | CONFIGURATION (method set per BD-P-04) |
| 4 | Stripe Radar/fraud rules (BD-P-12) | PROVIDER_VERIFICATION_REQUIRED |
| 5 | Confirm `capture_method` (manual deferred capture vs automatic) per T-PAY-03 | IMPLEMENTATION_DEFINED (manual capture verified in test mode) |

**Test-mode notes (2026-08-18):** live decline-card simulation was NOT
available — this Stripe account rejects raw card numbers via the API
("Sending credit card numbers directly to the Stripe API is generally
unsafe") and the prebuilt declined test payment-method ids return
`resource_missing` (SANDBOX_LIMITATION). The failure path is covered by the
signed `payment_intent.payment_failed` webhook test (ignored → no state
change) and by unit tests of the bundled provider's status mapping
(`last_payment_error` → ERROR).

**Nothing here changes the approved architecture.** Stripe integration is a
configuration + bundled-provider task; the adapter boundary is already fully
implemented by `@medusajs/payment-stripe`.
