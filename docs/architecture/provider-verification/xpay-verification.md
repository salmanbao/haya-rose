# xPay (XStak — XPay Fusion) Provider Verification

> ## ⚠️ HISTORICAL / REPLACED — NOT ACTIVE
>
> **xPay is NO LONGER the approved Pakistan payment provider.**
>
> - **Status: REPLACED BY ASSANPAY** (2026-08-16) — provider replacement
>   requested before implementation. See
>   `docs/architecture/provider-verification/assanpay-verification.md` for the
>   current Pakistan provider verification.
> - This document is preserved as **historical verification evidence only**.
>   It must not be cited as the active Pakistan provider contract.
> - The approved Pakistan provider is **AssanPay (PKR)**; the UAE provider
>   remains **Stripe (AED)** (unchanged).

**Historical verification status (at time of replacement):** PARTIALLY VERIFIED —
core payment lifecycle verified against official documentation; **webhook
contract, production environment details, amount unit, and 3DS behavior remained
UNVERIFIED/TBD** (blocking full implementation at the time of replacement).

**Verification date:** 2026-08-16
**Verifier:** implementation agent (documentation-only task; no code changed)
**Approved selection:** BD-P-01 (Pakistan payment provider = xPay)

---

## 1. Provider Identity

- **Name:** XPay, by **XStak Inc.** (product name **XPay Fusion**).
- **What it is (verified, official description):** "XPay Fusion is a PCI DSS-compliant
  payment solution to collect payments from your customers on your webapp without them
  having to redirect to a third-party payment page" — an **embedded** payment solution
  (secure iframe card form rendered by an XPay JS SDK).
- **Market focus:** Pakistan (PKR). XStak is a Pakistani retail-technology company
  ("Omnichannel Retail Operating System").
- **DO NOT CONFUSE with:** Nexi Group "XPay Global" (European) — a different product
  and API family. This verification covers **XPay by XStak** only.

## 2. Documentation Sources Used (verified)

| Source | URL | Authority | Content verified |
| --- | --- | --- | --- |
| Postman Documenter (official) | `https://docs.xpay.xstak.com/` | Official XStak API docs (Postman collection "XPay", publishedId `2s93Jxr1gh`, owner `21124817`, publish date 2024-04-25) | Full endpoint inventory + request/response bodies + e2e integration guide + HMAC auth description (collection JSON retrieved and parsed) |
| XStak Knowledge Base — Payment API Documentation | `https://knowledgebase.xstak.com/xpay/payment-api-documentation` | Official XStak | Points to the Notion developer docs |
| XStak Knowledge Base — FAQs (Fusion API clients) | `https://knowledgebase.xstak.com/xpay/faqs-fusion-api-clients` | Official XStak | `x-signature` = SHA-256 HMAC using API HMAC Key; staging base URL; `pi_client_secret` usage; test MID guidance |
| XStak Notion — XPay Developer & API Docs | `https://xpay-subscription.notion.site/XPay-Developer-API-Docs-8d7ecdb3096c4a69a12cc8c88c7c6f0e` | Official XStak | Product index: XPay Fusion API, XPay Subscriptions API, Mobile SDKs (React Native/Kotlin/Flutter/Swift), WooCommerce plugin |
| Official demo implementation (stage branch) | `https://github.com/XStakCommerce/xpay-element-public-demo/blob/stage/server.js` | Official XStak reference code | Create-Payment-Intent server flow: headers, payload, signature, response fields |
| Stripe/other | — | NOT used for xPay | — |

**Context7 status:** Context7 MCP was not invocable in this environment (empty
`.agents/mcp.json`). Verification was performed against **official xPay/XStak
documentation** and the **installed Medusa 2.19.0 source** (both higher in the
AGENTS.md §27 hierarchy). No Context7 content was used.

## 3. Account / Environment

| Item | Finding | Status |
| --- | --- | --- |
| Official API documentation | Postman Documenter + Knowledge Base + Notion (see §2) | VERIFIED |
| Sandbox/staging | **Staging confirmed:** base URL `https://xstak-pay-stg.xstak.com` (create-intent endpoint `…/public/v1/payment/intent`); stage client SDK `@xstak/xpay-element-stage-v4`; sample repo `stage` branch; test MIDs attached by default | VERIFIED |
| Production availability | Product is live for merchants (XStak retail platform) | VERIFIED (exists) |
| Production base URL | Not published in the sources inspected | **UNVERIFIED/TBD** |
| Authentication | Headers: `x-api-key` (secret key), `x-account-id` (account ID), `x-signature` (HMAC-SHA256 of the JSON payload using the API HMAC key), `Content-Type: application/json` | VERIFIED |
| Credentials (names only) | `x-api-key` (SECRET_KEY), `x-account-id` (ACCOUNT_ID), HMAC secret (`HMAC_SECRET`), publishable key (`publishableKey` for the client SDK) | VERIFIED (names; values are secrets) |
| API versioning | `/public/v1/…` and `/public/v2/…` path segments | VERIFIED |
| Merchant/account requirements | Merchant account + gateway/MID credentials (XPay attaches default test MIDs; merchants may supply their own gateway credentials) | VERIFIED (FAQ) |
| PCI | "PCI DSS-compliant" (official description); card data entered in a secure iframe via the SDK, not on the merchant server | VERIFIED (vendor statement; PCI evidence not independently audited here) |

## 4. Endpoint Inventory (verified from official Postman collection)

Base: `{{base_url}}` (staging = `https://xstak-pay-stg.xstak.com`).

### XPay Fusion — Payment Flow
| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/public/v1/payment/intent` | Create Payment Intent |
| POST | `/public/v1/payment/intent/capture?pi_client_secret=…` | Capture an authorized amount (full, or partial when `amount` provided) |
| GET | `/public/v1/payment/intent/details/:pi_id` | Retrieve Payment Intent |
| PUT | `/public/v1/payment/intent/:pi_id` | Update Payment Intent |
| DELETE | `/public/v1/payment/Intent/:pi_id` | Delete Payment Intent (collection uses capital "Intent" — confirm exact casing with xPay) |
| GET | `/public/v1/payment/intent?offset=&limit=` | List payment intents |
| POST | `/public/v1/payment/intent/void?pi_client_secret=…` | Void an authorized transaction |

### XPay Fusion — Refund
| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/public/v1/refund` | Create a refund |
| PUT | `/public/v1/refund/:refund_id` | Update a refund |
| GET | `/public/v1/refund/:refund_id` | Retrieve a refund |

### XPay Fusion — Tokenization (saved methods; **NOT required for V1** — B-PAY-04)
`POST /public/v2/payment/intent/tokenized/payment` · `GET /public/v1/token/:token` ·
`DELETE /public/v1/token/:token` · `GET /public/v1/token` (max 5 tokens per
email/phone; token returned via webhook).

### Other (not V1)
BIN lookup (`/public/v1/bin/config/…`) · Custom payment link
(`POST /public/v1/payment/link`) · Subscriptions (products/plans/subscriptions/
invoices — a separate XPay product, out of scope).

## 5. Payment Creation (verified)

- **Mechanism:** server creates a Payment Intent; client completes payment with the
  XPay embedded element (secure iframe) using the returned `pi_client_secret` +
  `encryptionKey`.
- **Request:** `POST /public/v1/payment/intent`
- **Payload (verified from Postman collection + official demo):**
  - `amount` (number) — **unit (whole PKR vs minor units) UNVERIFIED — must confirm**
  - `currency` — e.g. `"PKR"` (verified example; PKR explicitly used)
  - `payment_method_types` — e.g. `"card"`
  - `customer` — `name`, `email`, `phone` (required); `vip_customer`/`previous_customer` optional
  - `shipping` — optional object (`address1`, `city`, `country`, `zip`, `province`, `shipping_method`)
  - `billingAddress` — optional object
  - `product` — optional object (`product_category`, `product_name`, `no_of_items`)
  - `gateway_instance_id` — optional; routes through a specific gateway instance
  - `metadata` — key-value; **`order_reference`** recommended for the merchant
    cart/order reference (official docs recommend passing the cart id before order creation)
- **Headers:** `x-api-key`, `x-account-id`, `x-signature` (HMAC-SHA256 of the exact
  JSON payload string), `Content-Type: application/json`
- **Response:** `data.encryptionKey` and `data.pi_client_secret` (returned to the
  client for the SDK confirm step)
- **Client:** `npm i @xstak/xpay-element-stage-v4` (STAGE package; production package
  name UNVERIFIED); `<XPay xpay={{ publishableKey, accountId, hmacSecret }}>` +
  `PaymentElement` + `xpay.confirmPayment("card", pi_client_secret, {name}, encryptionKey)`.
  Card data is entered in an XPay-hosted iframe — never on the merchant server
  (aligns with REQ-PAY-018).
- **Asynchronous vs synchronous:** payment completion happens client-side via the SDK;
  the merchant server is notified by webhook (mechanism exists — see §8).
- **Payment methods:** `"card"` in the API docs; XStak release notes mention
  Easypaisa/JazzCash/PayPak integrations in their mobile SDK — server-API method
  availability **UNVERIFIED/TBD**.

## 6. Authorization / Capture (verified endpoints; semantics partly inferred)

| Capability | Finding | Status |
| --- | --- | --- |
| Authorize only | Payment Intent is created and authorized; funds held until capture (capture endpoint exists separately) | SUPPORTED (endpoint verified; exact authorization semantics UNVERIFIED) |
| Separate capture | `POST /public/v1/payment/intent/capture` | SUPPORTED |
| Partial capture | Capture with explicit `amount` ("only add an amount if you need to capture partial amount") | SUPPORTED |
| Multiple captures | Not documented | UNVERIFIED/TBD |
| Capture cancellation / void | `POST /public/v1/payment/intent/void` (void authorized transaction) | SUPPORTED (endpoint verified) |
| Authorization expiration | Not documented | UNVERIFIED/TBD |

## 7. Refunds (verified endpoints; status semantics partly inferred)

| Item | Finding | Status |
| --- | --- | --- |
| Full refund | `POST /public/v1/refund` with `payment_intent_id`, `refunded_amount`, `reason` | SUPPORTED |
| Partial refund | Explicit `refunded_amount` | SUPPORTED |
| Multiple refunds per payment | Not documented (multiple refund records allowed?) | UNVERIFIED/TBD |
| Refund limits (e.g., ≤ captured) | Not documented server-side; Medusa enforces refund ≤ captured natively (REQ-PAY-011) | MEDUSA-DEFINED |
| Refund currency | Refund issued against the Payment Intent (PKR) — no conversion documented | PKR (order currency) |
| Refund status/retrieval | `GET /public/v1/refund/:refund_id`, `PUT /public/v1/refund/:refund_id` | SUPPORTED (endpoints verified) |
| Refund webhook / async refund events | Not documented in the collection | **UNVERIFIED/TBD** |
| Refund failure behavior | Not documented | **UNVERIFIED/TBD** |

## 8. Webhooks / Callbacks

| Item | Finding | Status |
| --- | --- | --- |
| Webhook mechanism exists | Confirmed indirectly: tokens "returned in the webhook"; subscription-canceled webhook; Shopify app config references a "Webhook Secret" | VERIFIED (exists) |
| Webhook event catalog (payment succeeded/failed/captured/refunded/… ) | Not documented in the Postman collection or knowledge base pages inspected | **UNVERIFIED/TBD** |
| Webhook delivery mechanism / endpoint configuration | Not documented | **UNVERIFIED/TBD** |
| Signature verification method for webhooks | "Webhook Secret" referenced (Shopify) but verification algorithm not documented | **UNVERIFIED/TBD** |
| Replay/duplicate/ordering guarantees | Not documented | **UNVERIFIED/TBD** |

**Impact:** REQ-PAY-013/014 (webhook signature, idempotency, replay protection,
out-of-order handling) **cannot be implemented** until the xPay webhook contract is
verified. Medusa's native pipeline (`POST /hooks/payment/:provider` →
`payment.webhook_received` → provider `getWebhookActionAndData`) is ready, but the
provider-side signature verification + event→`PaymentActions` mapping need the
official webhook spec.

## 9. Idempotency

- No idempotency-key header is documented for xPay.
- `x-signature` (HMAC over the payload) authenticates requests but is not an
  idempotency mechanism.
- **Status: UNVERIFIED/TBD** — whether create/capture/void/refund are safely
  retryable must be confirmed with xPay. Medusa's own guards (per-session creation,
  captured/refunded sums under row lock, `idempotency_key` passthrough where the
  provider supports it) remain authoritative regardless (REQ-PAY-015: determine
  provider state via `GET /public/v1/payment/intent/details/:pi_id` before retry).

## 10. Errors / Limits / Compliance

| Item | Finding | Status |
| --- | --- | --- |
| Error response shape | `{"error": true, "message": "…"}` (verified from FAQ "Invalid credentials" example) | VERIFIED (partial) |
| Decline/validation/duplicate behaviors | Not documented in inspected sources | **UNVERIFIED/TBD** |
| Timeout behavior | Not documented | **UNVERIFIED/TBD** |
| Min/max transaction amounts | Not documented | **UNVERIFIED/TBD** (BD-P-10 deferred) |
| Rate limits | Not documented | **UNVERIFIED/TBD** |
| 3DS / SCA | Not documented | **UNVERIFIED/TBD** |
| Supported currencies | PKR (verified); other currencies not documented | PKR VERIFIED |
| COD | Not applicable — COD disabled (BD-P-03) | N/A |
| Recurring/subscriptions | Separate XPay Subscriptions product — **out of V1 scope** | NOT_REQUIRED_FOR_V1 |

## 11. Security Findings

1. **HMAC secret exposure risk (verify before implementation):** the client SDK
   `<XPay>` provider receives `hmacSecret` as a prop in the official example. The
   server demo uses a separate `HMAC_SECRET` server-side only. **Confirm that the
   client-side value is a publishable/derived key distinct from the server HMAC
   secret.** The server HMAC secret must never reach the browser (AGENTS.md §14/§19,
   REQ-PAY-016). If the SDK genuinely requires the server HMAC secret client-side,
   that is a **provider architecture conflict** — STOP and report.
2. **Webhook authentication:** webhook signature mechanism UNVERIFIED — mandatory
   before enabling the native hooks route for xPay (REQ-PAY-013).
3. **Card data:** XPay iframe model keeps card data off the merchant server
   (PCI-aligned, REQ-PAY-018) — consistent with the approved architecture.
4. **Amount/currency:** backend-authoritative amount/currency must be passed from
   Medusa (REQ-PAY-001/002); the amount **unit** must be confirmed (whole PKR vs
   paisa) before sending amounts.

## 12. Required Environment Variables / Secrets (names only)

`XPAY_API_KEY` (secret key) · `XPAY_ACCOUNT_ID` · `XPAY_HMAC_SECRET` · `XPAY_PUBLISHABLE_KEY` ·
`XPAY_BASE_URL` (staging/production) · `XPAY_WEBHOOK_SECRET` (once webhook contract
verified). Server-side only; never exposed to the browser except the publishable key.

## 13. Verification Record

```
Provider: XPay by XStak Inc. — XPay Fusion (Pakistan, PKR)
Sources: official Postman Documenter collection (retrieved + parsed),
  XStak knowledge base (API docs + Fusion FAQ), XStak Notion developer docs,
  official XStakCommerce demo repo (stage branch)
Context7: NOT invocable in this environment (empty .agents/mcp.json)
Medusa side: installed 2.19.0 IPaymentProvider + native webhook pipeline (verified separately)
Compatibility: core lifecycle (create/capture/partial-capture/void/refund/retrieve)
  verified; webhook contract + production env + amount unit + 3DS UNVERIFIED/TBD
Implementation boundary: documentation only; no code/config/dependency changes
```

## 14. Open Items (blocking or gating)

| # | Item | Type | Blocks |
| --- | --- | --- | --- |
| 1 | xPay **webhook contract**: event catalog, delivery, signature verification, replay/idempotency | PROVIDER_VERIFICATION_REQUIRED | REQ-PAY-013/014, adapter `getWebhookActionAndData` |
| 2 | **Production base URL** + production SDK package name | PROVIDER_VERIFICATION_REQUIRED | environment config |
| 3 | **Amount unit** (whole PKR vs minor units) | PROVIDER_VERIFICATION_REQUIRED | amount mapping |
| 4 | **Client SDK hmacSecret** key separation | SECURITY VERIFICATION REQUIRED | REQ-PAY-016 |
| 5 | 3DS behavior, decline/error catalog, rate limits, refund status/webhook | PROVIDER_VERIFICATION_REQUIRED | error-path tests |
| 6 | xPay sandbox/test credentials for contract tests | PROVIDER_VERIFICATION_REQUIRED | contract tests |

**Nothing here changes the approved architecture.** xPay remains behind the Medusa
`IPaymentProvider` boundary; no adapter is implemented.
