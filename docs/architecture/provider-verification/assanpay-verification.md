# AssanPay Provider Verification (Pakistan / PKR)

**Status:** PARTIALLY VERIFIED — the redirect/cashier payment lifecycle is
verified against official documentation; **API authentication, webhook contract,
refund API, API base URL, full status vocabulary, and 3DS remain UNVERIFIED/TBD**
(blocking full implementation).

**Verification date:** 2026-08-16
**Verifier:** implementation agent (documentation-only task; no code changed)
**Approved selection:** BD-P-01 (Pakistan payment provider = **AssanPay**,
replacing the earlier xPay selection — provider replacement requested before
implementation).

---

## 1. Provider Identity

- **Name:** AssanPay.
- **Operator:** **DEVTECTS (Private) Limited**, Karachi, Pakistan ("AssanPay is a
  digital payment gateway, powered by DEVTECTS (Private) Limited" — official site
  footer; docs footer: "Product of Devtects").
- **What it is (verified, official description):** "a leading online payment
  gateway in Pakistan … credit card payment processing, payment link creation, and
  integration with websites or e-commerce platforms" — supports cards, mobile
  wallets, and bank transfers.
- **Websites:** `https://assanpay.com` (also `assanpay.pk`) · developer docs
  `https://docs.assanpay.com` · merchant portal `https://merchant.assanpay.com` ·
  portal `https://portal.assanpay.com`.
- **Market focus:** Pakistan; PKR. Regulatory claim (vendor statement, not
  independently audited): "fully aligned with State Bank of Pakistan EMI
  regulations".
- **Ambiguity check:** the authoritative identity (assanpay.com / docs.assanpay.com
  / merchant.assanpay.com / Devtects) is consistent across official sources. No
  conflicting "AssanPay" provider was found in authoritative sources; unrelated
  similarly-named products (e.g., Nexi "XPay", "Asan Pay" search noise) are not
  this provider.

## 2. Documentation Sources Used (verified)

| Source | URL | Authority | Content verified |
| --- | --- | --- | --- |
| AssanPay Docs — API Documentation (Integration Manual) | `https://docs.assanpay.com/documentation` | Official AssanPay developer docs | Endpoints, request/response bodies, redirect model, status inquiry, errors, keys (retrieved from the docs SPA bundle; content is official) |
| AssanPay Docs — WordPress Guide | `https://docs.assanpay.com/wordpress` | Official | API Key/Secret generation per branch, Webhook URL config, payment-method config (easypaisa/jazzcash/card), test mode, security tips |
| AssanPay Docs — Shopify Guide | `https://docs.assanpay.com/shopify` | Official | Webhook auto-configuration, checkout flow, test credentials, go-live checklist (incl. refund verification) |
| AssanPay — official website | `https://assanpay.com/payment-gateway-features/` | Official company site | Identity (Devtects), payment methods, portal refunds/settlements/reconciliation, SBP EMI claim, merchant onboarding |
| XStak/xPay docs | — | NOT used for AssanPay | xPay is historical/replaced (see `xpay-verification.md`) |

**Context7 status:** Context7 MCP was **not invocable in this environment** (empty
`.agents/mcp.json`). Verification was performed against **official AssanPay
documentation** (rank #2 in AGENTS.md §27.3) and the **installed Medusa 2.19.0
source** (rank #1). No Context7 content was used.

## 3. Account / Environment

| Item | Finding | Status |
| --- | --- | --- |
| Official API documentation | docs.assanpay.com — Integration Manual (API + WordPress + Shopify guides) | VERIFIED |
| Merchant onboarding | Verified merchant account via AssanPay (official site: "Merchant Onboarding … verified merchant account") | VERIFIED |
| Merchant portal | `https://merchant.assanpay.com` — Dashboard (Merchant ID), Branches, API key generation | VERIFIED |
| Branches (test/live) | API keys generated **per branch** (Branches → Rotate API Key); branch approval by AssanPay representative | VERIFIED |
| API keys | **API Key + Secret Key**, shown once after generation; rotation invalidates previous keys; "Never share your API & Secret Key publicly" | VERIFIED |
| Merchant ID | Unique per merchant; found in the Merchant Portal Dashboard; used in API paths | VERIFIED |
| Sandbox/test | Test mode documented; test card **4111 1111 1111 1111, Expiry 12/25, CVV 123**; test branch keys | VERIFIED |
| Production | Go-live checklist (test mode → webhooks → live credentials → E2E → refunds → notifications); live branch keys | VERIFIED (process) |
| API base URL | Endpoints documented as **relative paths** (`/payment-request/`, `/payment/all-inquiry/`); payment page host `merchant.assanpay.com` (completeLink) — **explicit API base URL NOT documented** | **UNVERIFIED/TBD** |
| API versioning | None documented (no version segment) | UNVERIFIED |
| HTTP authentication for API calls | API Key/Secret Key exist, but **no Authorization header / Bearer / key-header mechanism is documented for `/payment-request/` or `/payment/all-inquiry/`** | **UNVERIFIED/TBD — HARD GATE** |
| Support | support@assanpay.com; Karachi office | VERIFIED |

## 4. Currency — PKR

- **PKR is the transaction currency** (official docs: `currency` not in the body —
  the payment request is PKR-denominated; `amount` field only; no currency field
  documented → PKR implied by the platform).
- **Amount representation (HARD REQUIREMENT — VERIFIED):** "Payment amount
  natural numbers or float with two decimal number" → **amounts are in MAJOR
  UNITS (whole PKR) with up to 2 decimal places — NOT paisa.** This resolves the
  amount-unit question for AssanPay.
- Minimum/maximum amounts: **not documented** (BD-P-10 deferred).
- Settlement: daily, weekly, or custom schedule (official site) — PKR.

## 5. Payment Creation (verified)

- **Model: Redirect / Cashier model** — "Initiates a payment request by generating
  a unique payment link. The merchant sends order details and receives a
  manage-payments URL to share with users for completing the payment."
- **Endpoint:** `POST /payment-request/{merchantId}` (merchantId from the Merchant
  Portal Dashboard).
- **Request body (verified):**
  - `amount` (String, required) — natural number or float with two decimals
  - `order_id` (String, optional) — unique order reference; **≤ 20 characters,
    no special characters**
  - `store_name` (String, required) — name of the store
  - `link` (String, optional) — return URL, **must be https://**; redirect after
    payment success/failure
- **Example body:** `{ amount: 10, order_id: 12340, store_name: "Your store",
  link: "https://www.google.com" }`
- **Response (200, verified):**
  ```json
  {
    "status": true,
    "message": "Payment request created successfully",
    "data": {
      "id": "ddc6b617-3126-4866-9782-c68f535034b6",
      "transactionId": "T202512181151100kr4f",
      "amount": 10,
      "status": "pending",
      "link": "/pay/{id}",
      "metadata": { "return_url": "yourUrl.com" },
      "merchant_transaction_id": "12340",
      "completeLink": "https://merchant.assanpay.com/aik-qr/{id}",
      "order_id": "12340"
    }
  }
  ```
  - **Note (official):** "Focus on the `completeLink` parameter in the response
    body for redirecting the user to the payment page."
  - Identifier roles: `transactionId` = AssanPay-assigned transaction id;
    `merchant_transaction_id` / `order_id` = merchant reference; `id` = payment
    request uuid; `completeLink` = hosted payment page URL.
- **Duplicate order_id (verified):** 200 `{ success: true, message: "Order Id
  already exists", data: { statusCode: 200 } }` — server-side uniqueness on
  `order_id` gives **create-time duplicate detection**.
- **Errors (verified):** 400 `{ statusText: "error", status: 400, message:
  "Argument 'amount' is missing." }`; 400/500 `{ statusText: "fail", status: 400,
  message: "Transaction not Created" }`; 500 internal error.
- **Customer payment:** customer is redirected to the AssanPay-hosted payment page
  (`completeLink`), completes payment (cards/wallets/bank transfer), then is
  redirected back to `link` (return URL) on success/failure. Card data is handled
  on the AssanPay side (hosted page), not the merchant server (REQ-PAY-018
  aligned; AssanPay PCI status not independently verified).

## 6. Payment Lifecycle

| Capability | Finding | Status |
| --- | --- | --- |
| Payment initiation | `POST /payment-request/{merchantId}` → `completeLink` | VERIFIED_SUPPORTED |
| Authorization | Async: payment completed on hosted page; Medusa-side authorization via status inquiry/webhook (deferred-authorization path — matches Medusa `pending_authorization`) | VERIFIED_SUPPORTED (flow); provider authorization status vocabulary UNVERIFIED |
| Capture | **No separate capture endpoint documented** — hosted-page payment is auto-captured | PROVIDER_DOC_UNCLEAR (confirm with AssanPay) |
| Partial capture | Not documented | PROVIDER_DOC_UNCLEAR / NOT_REQUIRED_FOR_V1 |
| Cancellation / void | **No void/cancel API documented**; session expiry seconds configurable | PROVIDER_DOC_UNCLEAR |
| Payment status retrieval | `GET /payment/all-inquiry/…` (see §7) | VERIFIED_SUPPORTED |
| Payment expiration | "Session expiry seconds" setting documented | VERIFIED (setting exists); exact semantics UNVERIFIED |
| Asynchronous payment | Redirect model is asynchronous by design; webhook notifications exist | VERIFIED_SUPPORTED (webhook details UNVERIFIED) |

## 7. Status Inquiry (verified)

- **Endpoint:** `GET /payment/all-inquiry/{merchantId}?transactionId={orderId}`
  ("Replace transactionId with the actual order ID in the URL").
- Parameters: `merchantId` (required), `transactionId` (required — the order ID of
  the payment). No request body.
- Responses: 200 "Payment status retrieved successfully"; 404 "Payment Data Not
  Found".
- **Full status vocabulary (beyond `pending` / success-failure redirect context):
  NOT enumerated in the docs — UNVERIFIED/TBD.** Mapping to
  `PaymentSessionStatus` requires the complete vocabulary.

## 8. Refunds

| Item | Finding | Status |
| --- | --- | --- |
| Refunds exist | Business Portal: "initiate swift refunds"; Shopify go-live checklist: "Refund process verified" | VERIFIED (portal-based) |
| Refund API endpoint | **No refund API endpoint documented in the Integration Manual** | **UNVERIFIED/TBD — HARD GATE for Medusa `refundPayment`** |
| Full/partial refunds | Not documented at API level | UNVERIFIED/TBD |
| Refund currency | PKR (order currency); cross-currency refunds refused per BD-M-08 | VERIFIED (policy) / refund mechanics UNVERIFIED |
| Refund status / failure | Not documented | UNVERIFIED/TBD |

**Medusa compatibility:** Medusa's native `refundPaymentWorkflow` + refund ≤
captured guard remain authoritative. If AssanPay exposes no refund API, the
approved refund policy (BD-R-05: full-value refund to original payment method)
requires either a confirmed AssanPay API or a verified manual/portal procedure —
must be resolved before refund implementation (REQ-PAY-011).

## 9. Webhooks / Callbacks — HARD GATE

| Item | Finding | Status |
| --- | --- | --- |
| Webhook mechanism exists | "Webhook URL for receiving payment notifications"; Shopify app: "Webhooks are automatically configured … notify your store about payment status changes" | VERIFIED (exists) |
| Event types (payment success/failed/pending/refunded/…) | Not documented | **UNVERIFIED/TBD** |
| Payload shape | Not documented | **UNVERIFIED/TBD** |
| Signature verification / signing algorithm / header / secret | Not documented (API Key/Secret Key exist but no webhook signature scheme described) | **UNVERIFIED/TBD — BLOCKING** |
| Raw body requirement / timestamp / replay protection | Not documented | **UNVERIFIED/TBD** |
| Duplicate events / retry / ordering / event id | Not documented | **UNVERIFIED/TBD** |

**Medusa mapping:** the native pipeline (`POST /hooks/payment/:provider` →
`payment.webhook_received` → shipped subscriber → `processPaymentWorkflow`) is
ready; provider-side signature verification + event→`PaymentActions` mapping live
in the adapter's `getWebhookActionAndData`. **Cannot be implemented until the
AssanPay webhook contract is verified** (REQ-PAY-013/014). No custom webhook route
is created.

## 10. Idempotency

- **Create-time (VERIFIED):** `order_id` server-side uniqueness → duplicate
  `order_id` is rejected ("Order Id already exists"), making create retries safe.
- **Formal idempotency key:** not documented.
- Medusa's own idempotency (per-session creation, captured/refunded sums under row
  lock, `idempotency_key` passthrough where supported) remains authoritative.
- **Rule preserved:** status inquiry before retry (REQ-PAY-015).

## 11. Security

| Item | Finding | Status |
| --- | --- | --- |
| Server-side credentials | API Key + Secret Key per branch, Merchant ID — server-side; "Never share your API & Secret Key publicly" | VERIFIED (guidance) |
| Webhook signature | Not documented | **UNVERIFIED/TBD — BLOCKING** |
| Card-data handling | Hosted payment page — card data handled by AssanPay, not the merchant server | VERIFIED (design); PCI status UNVERIFIED |
| 3DS / SCA | Not documented | **UNVERIFIED/TBD** |
| TLS | `link` return URL "must be in https://" (docs) | VERIFIED (partial) |
| Client-side secrets | No server secret is documented to be required in client-side JavaScript | PASS (no conflict found; re-verify at implementation) |

## 12. Payment Methods (verified)

- Official site: **Visa, Mastercard, Easypaisa, JazzCash, bank transfers, payment
  links**, web3 payments (mentioned).
- WordPress guide: payment methods configurable — "easypaisa, jazzcash, and card"
  or all methods (leave blank).
- V1 scope per BD-P-04: card + provider-default; method set confirmed at
  implementation (PROVIDER_VERIFICATION_REQUIRED for exact availability).

## 13. Open Items (blocking or gating)

| # | Item | Type | Blocks |
| --- | --- | --- | --- |
| 1 | **HTTP API authentication** (how API Key/Secret Key/Merchant ID are presented on the API) | PROVIDER_VERIFICATION_REQUIRED — HARD | every adapter API call |
| 2 | **Webhook contract** (event types, payload, signature verification, replay) | PROVIDER_VERIFICATION_REQUIRED — HARD | REQ-PAY-013/014; `getWebhookActionAndData` |
| 3 | **Refund API availability** | PROVIDER_VERIFICATION_REQUIRED — HARD | REQ-PAY-011; `refundPayment` |
| 4 | **API base URL** (endpoints documented as relative paths) | PROVIDER_VERIFICATION_REQUIRED — HARD | environment config |
| 5 | **Status vocabulary** (full values from `/payment/all-inquiry/`) | PROVIDER_VERIFICATION_REQUIRED | status mapping |
| 6 | **3DS behavior** | PROVIDER_VERIFICATION_REQUIRED | customer auth flow |
| 7 | Capture/cancel semantics (no capture/void API documented) | PROVIDER_VERIFICATION_REQUIRED | `capturePayment`/`cancelPayment` mapping |
| 8 | Test-branch credentials for contract tests | PROVIDER_VERIFICATION_REQUIRED | contract tests |
| 9 | Min/max amounts, rate limits, refund limits | PROVIDER_VERIFICATION_REQUIRED (BD-P-10 deferred) | limits config |

**Nothing here changes the approved architecture.** AssanPay remains behind the
Medusa `IPaymentProvider` boundary; the redirect model maps to Medusa's
`pending_authorization`/deferred-authorization flow; no adapter is implemented.

## 14. Verification Record

```
Provider: AssanPay (DEVTECTS Private Limited), Pakistan — PKR, redirect/cashier model
Sources: official AssanPay docs (docs.assanpay.com Integration Manual + WordPress +
  Shopify guides, retrieved from the official docs SPA) + official site (assanpay.com)
Context7: NOT invocable in this environment (empty .agents/mcp.json)
Medusa side: installed 2.19.0 IPaymentProvider + native webhook pipeline (verified separately)
Compatibility: redirect lifecycle (create/completeLink/status inquiry/duplicate
  order_id/errors/PKR major units) VERIFIED; API auth, webhook contract, refund API,
  base URL, status vocabulary, 3DS UNVERIFIED/TBD
Replacement: AssanPay replaces xPay (HISTORICAL — xpay-verification.md)
Implementation boundary: documentation only; no code/config/dependency changes
```
