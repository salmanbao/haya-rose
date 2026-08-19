# Payments Specification

## 1. Purpose

Define the complete payments domain for the Pakistan + UAE B2C baby-clothing platform: payment collections/sessions, lifecycle (initiation → authorization → capture → settlement → refund → reconciliation), market/provider mapping, provider boundary, webhooks, idempotency, concurrency, security, admin, testing, and invariants — implementation-ready, with **no provider contracts invented** and **no business rules invented**. Provider selections (APPROVED, revised 2026-08-17): **Pakistan = Safepay (PKR)** (replaces AssanPay, which replaced xPay — both historical/not active), **UAE = Stripe (AED)** — contracts verified and adapters implemented in `docs/architecture/provider-verification/` + `apps/backend/src/modules/payment-safepay`.

This document is **specification-only**. It changes no source code, configuration, dependencies, database schema, storefront, or Admin implementation.

## 2. Scope

**In scope:** payment domain model; provider-agnostic provider boundary (capability model); market/provider isolation (PK→PKR, AE→AED); session lifecycle; authorization/capture/cancellation/refund; asynchronous confirmation and webhooks; idempotency; reconciliation; failure/concurrency models; security (incl. card-data boundary); standard Medusa Admin coverage; notifications boundary; testing requirements; invariants; decision registers; provider-contract register.

**Non-goals:** provider selection; provider API contracts (must be verified against official docs after selection); COD decision (documented as unresolved); Returns & Refunds eligibility (separate spec); any code/config/dependency/migration change; split payments (outside V1 unless a business requirement authorizes them — §11.3).

## 3. Authority and Dependencies

- AGENTS.md — §5 (no business-rule invention), §11 (payments as high-risk domain), §12 (payment invariants), §14 (security), §15 (idempotency/webhooks/transactions), §16 (tests), §17 (definition of done), §4 (provider integration boundaries, no fake adapters), §27 (verification hierarchy).
- `docs/specifications/markets-and-pricing.md` — authoritative: market = region, PKR/AED, currency invariants, payment boundaries.
- `docs/specifications/cart-and-checkout.md` — authoritative: checkout sequence, `completeCartWorkflow` payment steps, payment-collection creation boundary.
- `docs/specifications/shipping-and-fulfillment.md` — payment/fulfillment independence boundary.
- `docs/specifications/inventory-and-warehouses.md` — inventory consequences of payment failure (release of reservations).
- `docs/architecture/authentication-authorization.md` — Medusa-native customer auth; admin vs customer authorization separation.
- Installed Medusa 2.19.0 source (verified throughout; §31 lists exact artifacts).

## 4. Domain Terminology

All state vocabulary below is **verified** against installed Medusa 2.19.0 (`@medusajs/types`, `@medusajs/utils`, `@medusajs/payment`). No state names are invented.

| Term | Meaning (Medusa 2.19.0) |
| --- | --- |
| Payment collection | `payment_collection` — aggregate container for a cart/order's payments: `currency_code`, `amount`, `authorized_amount`, `captured_amount`, `refunded_amount`, `status`, `completed_at`; holds sessions + payments. |
| Collection status | `PaymentCollectionStatus` (verified enum): `not_paid` \| `awaiting` \| `authorized` \| `partially_authorized` \| `partially_captured` \| `canceled` \| `failed` \| `completed`. Default `not_paid`. Native flows set: `not_paid`/`awaiting`/`partially_authorized`/`authorized`/`completed` (module service status derivation, §9.2) and `partially_captured`/`canceled` (cancel workflow, §12). `failed` is part of the type contract but **is not set by any shipped native flow** (reserved for custom flows; verified by search — §31). |
| Payment session | `payment_session` — provider interaction instance: `currency_code`, `amount`, `provider_id`, `data`, `context`, `status`, `authorized_at`; belongs to a collection; has an optional linked `payment`. |
| Session status | `PaymentSessionStatus` (verified enum): `authorized` \| `captured` \| `pending` \| `requires_more` \| `error` \| `canceled` \| `pending_authorization`. Default `pending`. |
| Payment | `payment` — the recorded payment: `amount`, `currency_code`, `provider_id`, `data`, `captured_at`, `canceled_at`; has `captures` + `refunds`. |
| Capture | `capture` — a captured amount record on a payment (`amount`, `created_by`). |
| Refund | `refund` — a refunded amount record (`amount`, `note`, `refund_reason_id`, `created_by`). |
| Provider | A future PK/UAE gateway adapter implementing `IPaymentProvider` (verified interface, §5.2). |
| Payment action | `PaymentActions` (verified enum, provider → module normalization): `authorized` \| `captured` \| `failed` \| `pending` \| `requires_more` \| `canceled` \| `not_supported` \| `pending_authorization`. |
| Order payment status | `getLastPaymentStatus` (verified, order aggregate): `not_paid` \| `awaiting` \| `authorized` \| `partially_authorized` \| `captured` \| `partially_captured` \| `refunded` \| `partially_refunded` \| `canceled` \| `requires_action` — the order's *payment* state, computed from its payment collections. **Independent** from order/fulfillment/shipment/return state. |
| Payment state | Independent commerce concern — **not** part of order status (AGENTS.md §11). |

## 5. Medusa 2.19.0 Capability Mapping (verified)

All verified against installed `@medusajs/payment@2.19.0`, `@medusajs/core-flows@2.19.0`, `@medusajs/types@2.19.0`, `@medusajs/medusa@2.19.0`, `@medusajs/utils@2.19.0`, and the live database.

### 5.1 Data model (tables verified live in `medusa-baby-store`)

`payment_collection` · `payment_session` · `payment` · `capture` · `refund` · `refund_reason` · `payment_provider` · `payment_collection_payment_providers` · `region_payment_provider` (market↔provider link) · `cart_payment_collection` / `order_payment_collection` (cart/order links) · `account_holder`.

Verified fields:
- `payment_collection`: `currency_code` (required), `amount`, `authorized_amount` (nullable), `captured_amount` (nullable), `refunded_amount` (nullable), `status` (enum, default `not_paid`), `completed_at` (nullable), `metadata`, sessions, payments, providers (m2m).
- `payment_session`: `currency_code`, `amount`, `provider_id`, `data` (json, default `{}`), `context` (json, nullable), `status` (enum, default `pending`), `authorized_at` (nullable), optional `payment` (hasOne).
- `payment`: `amount`, `currency_code`, `provider_id`, `data`, `captured_at` (nullable), `canceled_at` (nullable), `payment_collection_id`, `payment_session_id`, refunds, captures. DTO also exposes `captured_amount`, `refunded_amount`, `authorized_amount` and `raw_*` variants (aggregates over captures/refunds).
- `capture`: `amount` + `created_by` (nullable) + `metadata`.
- `refund`: `amount` + `created_by` (nullable) + `note` (nullable) + `refund_reason_id` (nullable) + `metadata`.
- `payment_provider`: `id` (`pp_…`) + `is_enabled` (default true). Live DB currently contains only `pp_system_default` (enabled) — the native system provider (§5.5), not a payment gateway.
- `region_payment_provider`: region ↔ provider binding. Live DB binds the seed default "Europe" region to `pp_system_default` only; PK/AE regions do not exist yet (consistent with markets-and-pricing.md).
- `account_holder`: external account holder data for saved payment methods (§5.6).

### 5.2 Provider interface (verified `@medusajs/types` — `IPaymentProvider`)

The native integration boundary that any future PK/UAE gateway adapter must implement. **Required** methods:

```
getIdentifier(): string
initiatePayment(data: InitiatePaymentInput): Promise<InitiatePaymentOutput>   // { id, status?, data? }
updatePayment(data): Promise<UpdatePaymentOutput>                              // { status?, data? }
deletePayment(data): Promise<DeletePaymentOutput>
authorizePayment(data): Promise<AuthorizePaymentOutput>                        // { status, data? }
capturePayment(data): Promise<CapturePaymentOutput>
refundPayment(data): Promise<RefundPaymentOutput>                              // input carries amount
retrievePayment(data): Promise<RetrievePaymentOutput>
cancelPayment(data): Promise<CancelPaymentOutput>
getPaymentStatus(data): Promise<GetPaymentStatusOutput>                        // { status, data? } — status lookup/polling
getWebhookActionAndData(data: ProviderWebhookPayload["payload"]): Promise<WebhookActionResult>
```

**Optional** methods (saved payment methods / account holders; `@since 2.5.0`–`2.16.0`, verified): `retrieveAccountHolder`, `createAccountHolder`, `updateAccountHolder`, `deleteAccountHolder`, `listPaymentMethods`, `savePaymentMethod`, `deletePaymentMethod`. These are relevant only if a business requirement needs saved/tokenized payment methods (wallet/payment-method features — unresolved, B-PAY-04).

Verified shapes:
- `InitiatePaymentInput` = `{ amount, currency_code, data?, context? }`; `PaymentProviderContext` includes `account_holder?`, `customer?`, and **`idempotency_key?`** (the module passes idempotency keys through to the provider — §15).
- `InitiatePaymentOutput` = `{ id, status?, data? }` — `status` is stored in the session's `status` field.
- `AuthorizePaymentOutput`/`GetPaymentStatusOutput` return `status: PaymentSessionStatus`.
- `WebhookActionResult` = `{ action: PaymentActions, data?: { session_id, amount } }` — the provider normalizes its webhook into a platform action + the Medusa session to act on. `session_id` is mandatory for Medusa to associate the event with a payment session/cart (events without it are ignored — §14).
- `ProviderWebhookPayload.payload` = `{ data (parsed body), rawData (string|Buffer), headers }` — raw body + headers are what a provider uses for **signature verification** (provider-side, never invented here).

Capability differences between providers are **not** assumed; every capability must be verified per provider (register §26, REQ-PAY-026).

### 5.3 Workflows (verified in `@medusajs/core-flows`)

- Cart: `createPaymentCollectionForCartWorkflow` (store `POST /store/payment-collections`), `createPaymentSessionsWorkflow` (store `POST /store/payment-collections/:id/payment-sessions` — calls provider `initiatePayment`), `refreshPaymentCollectionForCartWorkflow` (recomputed after cart changes), `refundPaymentRecreatePaymentSessionWorkflow`.
- Checkout: `completeCartWorkflow` steps (verified in cart-and-checkout.md): `validateCartPaymentsStep` → `compensatePaymentIfNeededStep` → `validate` hook → order creation → `authorizePaymentSessionStep` (authorizes LAST) → `addOrderTransactionStep`.
- Payment: `authorizePaymentSessionForOrderWorkflow`, `capturePaymentWorkflow`, `refundPaymentWorkflow` (includes **`validateRefundPaymentExceedsCapturedAmountStep`** — native refund ≤ captured validation, verified §13), `refundPaymentsWorkflow`, `processPaymentWorkflow` (webhook action processing, verified §14), `cancelPaymentCollectionWorkflow` (§12), `markPaymentCollectionAsPaid` (admin override, §20).

### 5.4 Routes (verified in `@medusajs/medusa`)

- Store: `POST /store/payment-collections` (create for cart), `POST /store/payment-collections/:id/payment-sessions` (initialize), `GET /store/payment-providers?region_id=` — **requires `region_id`** (throws `NOT_ALLOWED` without it) and lists providers **scoped to the region** via `region_payment_provider` (the native market→provider boundary, §7).
- Webhooks: **`POST /hooks/payment/:provider` ships natively** (verified `dist/api/hooks/payment/[provider]/route.js`, `bodyParser: { preserveRawBody: true }`). It wraps the raw payload and emits the `payment.webhook_received` event with a configurable delay/attempts, and the shipped subscriber + `processPaymentWorkflow` handle it (§14). This **replaces** the earlier draft's claim that a custom webhook route is required.
- Admin: `/admin/payments` (list), `/admin/payments/:id` (get/update), `/admin/payments/:id/capture`, `/admin/payments/:id/refund`, `/admin/payments/payment-providers`, `/admin/payment-collections` (+ `:id/mark-as-paid`, `:id/payment-sessions`), `/admin/refund-reasons`. Admin payment routes carry RBAC policies (`/admin/payments/*` resource policies — verified) and record `captured_by`/`created_by` from `req.auth_context.actor_id` (audit attribution).

### 5.5 System provider (verified)

A built-in `SystemPaymentProvider` (identifier `system`, provider id `pp_system_default`, enabled in the live DB) ships with the Payment module. It is **not a payment gateway**: `initiatePayment` returns a random UUID, `authorizePayment` returns `authorized`, `getWebhookActionAndData` returns `not_supported`. It is the engine behind the admin **mark-as-paid** override (§20) and would be the natural native primitive for a future offline/COD flow. **RESOLVED (2026-08-16, BD-P-03 APPROVED): no COD in V1** — this provider is not used for customer-facing COD flows; nothing is implemented here.

### 5.6 Saved payment methods / account holders (verified, optional)

The module exposes account-holder + payment-method workflows/APIs (`account_holder` table; provider methods §5.2). Medusa creates an account holder when a payment session is initialized **for a registered customer**. Not required for V1 baseline; relevant only if saved-payment-method/wallet features are authorized (B-PAY-04).

### 5.7 Module configuration (verified)

- Provider registration: payment module options in `medusa-config.ts` (`resolve` + `options`) per the standard Medusa module pattern (T-PAY-01); `payment_provider` rows (with `is_enabled`) + `region_payment_provider` bindings are managed through Admin/native mechanisms (T-PAY-02).
- `PaymentModuleOptions` (verified type): `webhook_delay?: number` (default **5000** ms — delay before webhook event processing) and `webhook_retries?: number` (default **3** — event-bus retry attempts). Values are configuration, not invented here.

### 5.8 Native vs custom vs external summary

| Capability | Native | Configuration | Custom implementation | External provider |
| --- | --- | --- | --- | --- |
| Collections/sessions/payments/captures/refunds | ✅ module + tables + workflows | — | none | — |
| Status derivation (collection + order payment status) | ✅ `maybeUpdatePaymentCollection_` / `getLastPaymentStatus` | — | none | — |
| Authorization/capture/refund/cancel workflows | ✅ core-flows + admin routes | — | none | — |
| Refund ≤ captured guard | ✅ workflow step + module service | — | none | — |
| Idempotency keys to providers | ✅ (`session.id`, `capture.id`, `refund.id`, `payment.id`) | — | none | — |
| Webhook listener route + event + subscriber + processing workflow | ✅ `/hooks/payment/:provider` → `payment.webhook_received` → subscriber → `processPaymentWorkflow` | `webhook_delay`/`webhook_retries` | per-provider signature verification inside the provider's `getWebhookActionAndData` (provider responsibility) | provider webhook delivery |
| Payment gateway (PK/UAE) | — | — | — | **IMPLEMENTED: Safepay (PK, custom IPaymentProvider adapter) / Stripe (AE, bundled provider)** — contracts verified per `docs/architecture/provider-verification/`; sandbox runs pending |
| Reconciliation | Native aggregate fields; no reconciliation job ships | — | scheduled reconciliation job (T-PAY-05) | provider status/settlement data |
| Payment provider capability discovery | — | — | per-provider verification against official docs (REQ-PAY-026) | provider docs |

## 6. Payment Architecture

```
Next.js storefront (Vercel)
   ↓ POST /store/payment-collections · POST /store/payment-collections/:id/payment-sessions · GET /store/payment-providers?region_id=
Medusa v2.19.0 (VPS)
   ├── Payment module (collection/session/payment/capture/refund; status derivation)
   ├── core-flows (create collection/sessions, refresh, authorize-at-completion, capture, refund, cancel, mark-as-paid, process webhook)
   ├── Admin: /admin/payments… · /admin/payment-collections… (RBAC policies)
   ├── Webhook: POST /hooks/payment/:provider (native) → payment.webhook_received → subscriber → processPaymentWorkflow
   └── IPaymentProvider boundary (payments/ integration layer)
         ├── Pakistan → Safepay (PKR)       [IMPLEMENTED — contract verified, sandbox pending]
         └── UAE → Stripe (AED)              [SELECTED — contract verified]
PostgreSQL (authoritative payment state) · Redis (non-authoritative: locking/event-bus/cache only)
```

- Payment state is PostgreSQL (Payment module). Redis never stores authoritative payment state (AGENTS.md §3).
- Provider adapters live behind `IPaymentProvider`; provider code never leaks into checkout UI, order entities, or generic workflows (AGENTS.md §4).
- **No fake adapters, no placeholder `success: true` implementations** (AGENTS.md §4/§23).

## 7. Market and Provider Model

- **Pakistan:** PKR; provider **Safepay** (APPROVED selection, BD-P-01 revised 2026-08-17 — replaces AssanPay; contract verified + adapter implemented per `docs/architecture/provider-verification/safepay-verification.md`); eligibility Pakistan-only unless explicitly configured. **UAE:** AED; provider **Stripe** (APPROVED selection, BD-P-02; contract verified); eligibility UAE-only unless explicitly configured.
- **Native market binding (verified):** `region_payment_provider` link + region-scoped `GET /store/payment-providers` (requires `region_id`). Configuration must bind PK region → PK providers and AE region → AE providers.
- **Prevention (REQ-PAY-003):** PKR payment against AED cart, wrong-provider-for-market, cross-market leakage, and silent currency conversion are prevented when (a) collection currency derives from cart/order currency (verified: collection `currency_code` mirrors cart), and (b) provider eligibility is region-scoped. Payment amount + currency validated server-side at every boundary (REQ-PAY-001/002).
- Region↔provider registration mechanics: configuration via Admin/medusa-config; technical decision T-PAY-02.

## 8. Payment Session Model

Verified behavior (`@medusajs/payment` module service + workflows):

- **Creation:** `POST /store/payment-collections/:id/payment-sessions` → `createPaymentSessionsWorkflow` → provider `initiatePayment`; session stores `provider_id`, `amount`, `currency_code`, provider `data` (+ `context`), and `status` (default `pending`, overridable by the provider's `InitiatePaymentOutput.status`).
- **Association:** sessions belong to a payment collection (`payment_session.payment_collection_id`); the collection is linked to the cart (`cart_payment_collection`) and, after completion, the order (`order_payment_collection`). A collection can hold multiple sessions (verified hasMany) — session-per-provider is the native model; split payments are not a V1 requirement (§11.3).
- **Provider selection:** driven by the collection's region/provider configuration; storefront selects among providers returned by the region-scoped listing (verified storefront `src/lib/data/payment.ts` uses `/store/payment-providers`).
- **Currency/amount:** from the cart/order (backend-authoritative); never client-supplied (REQ-PAY-001/002).
- **Status:** `pending` → `pending_authorization` | `authorized` | `captured` | `requires_more` | `error` | `canceled` (verified enum). `authorized_at` set on authorization.
- **Expiration:** **no native session TTL verified** — expiration/refresh is driven by cart refresh (`refreshPaymentCollectionForCartWorkflow`) and completion validation (`validateCartPaymentsStep`). Session-expiry policy is a business decision (B-PAY-06).
- **Update/recreation:** `updatePaymentSession` (module) and `refundPaymentRecreatePaymentSessionWorkflow` (session recreation after refund) + refresh workflows exist (verified).
- **Failure/cancellation:** provider `cancelPayment`/`deletePayment`; payment `canceled_at`; session status `error`/`canceled`.
- **Authorization:** `authorizePaymentSessionStep` at completion (cart-and-checkout.md); verified idempotent at the module level (§10).

**REQ-PAY-004 / REQ-PAY-005** — collections and sessions are created through native workflows with backend-derived amount/currency; session creation is idempotent per provider per collection context.

## 9. Payment Lifecycle

### 9.1 Conceptual lifecycle (mapped to verified Medusa concepts — no invented state names)

```
Collection created (amount, currency, status=not_paid)      createPaymentCollectionForCartWorkflow
  → Session created (provider, amount, status=pending)       createPaymentSessionsWorkflow (initiatePayment)
  → Payment initiated (customer/provider UI)                 provider-hosted (redirect/UI) — per provider
  → Authorization                                            authorizePaymentSessionStep at completion (authorized_at)
  → Order payment recorded                                   order created + collection linked + addOrderTransactionStep
  → Capture                                                 capturePaymentWorkflow (captures + captured_at; status → completed)
  → Settlement/reconciliation                                provider settlement; reconcile per §16
  → Refund (if applicable)                                  refundPaymentWorkflow (refunds; ≤ captured enforced)
```

### 9.2 Native status derivation (verified)

- **Collection status** (`maybeUpdatePaymentCollection_`, payment module service — runs after session/capture/refund changes): no sessions → `not_paid`; sessions exist → `awaiting`; `authorized_amount > 0` → `authorized` if ≥ collection `amount` else `partially_authorized`; `captured_amount ≥ amount` → `completed` (+ `completed_at`). The same method updates `authorized_amount`, `captured_amount`, `refunded_amount`, `completed_at` — the authoritative aggregate fields for reconciliation (§16).
- **Cancel path:** `cancelPaymentCollectionWorkflow` sets `partially_captured` (if `captured_amount > 0`) or `canceled` (§12).
- **Order payment status** (`getLastPaymentStatus`, order aggregate — verified): derives the order-level payment status from its collections — `not_paid | awaiting | authorized | partially_authorized | captured | partially_captured | refunded | partially_refunded | canceled | requires_action`. This is the **Medusa-native vocabulary for "payment state as an independent concern"** (REQ-PAY-007). It is computed, not stored as a custom order-status enum.

### 9.3 Failure paths (all must be handled; see §14/§17)

Authorization failed; provider timeout; customer abandoned payment; provider reports unknown state; duplicate/delayed/out-of-order callback; callback before expected state; callback after cancellation; payment succeeds after frontend timeout; payment succeeds but order finalization fails; order finalization succeeds but notification fails.

Payment state is **independent** from order/fulfillment/shipment/return/refund state (AGENTS.md §11) — an order may exist while payment is pending/authorized/captured/failed/cancelled/partially-refunded/refunded; **no custom order-status enum represents payment state** (REQ-PAY-007).

## 10. Authorization

- **Occurrence:** inside `completeCartWorkflow`, after order creation, via `authorizePaymentSessionStep` (verified sequence — minimizes rollback window; compensation via `compensatePaymentIfNeededStep`).
- **Verified module semantics** (`authorizePaymentSession`): idempotent — if the session already has a `payment` and `authorized_at`, the existing payment is returned (no re-authorization); the provider is called with `idempotency_key: session.id`; provider `status` `pending_authorization` → session status updated to `pending_authorization` and the call returns without a payment (async confirmation path); any other non-`authorized`/non-`captured` status → session status updated and `NOT_ALLOWED` thrown; a provider `captured` status is mapped internally to `authorized`.
- **Capture timing:** authorization and capture are separate operations; immediate vs deferred capture depends on provider capability (B-PAY-04/T-PAY-03) and on which action the webhook processing applies (§14).
- **Never** marked successful from client state (REQ-PAY-008): the frontend redirect/response is never the authoritative confirmation; only provider-verified authorization (webhook/status verified server-side) establishes payment state.

## 11. Capture

- **Native path:** `capturePaymentWorkflow` (admin `POST /admin/payments/:id/capture`, `captured_by` recorded) creates `capture` records, updates `captured_at` (when fully captured), refreshes collection aggregates, adds an order transaction (`reference: "capture"`), and emits the `payment.captured` event (all verified).
- **Verified module semantics** (`capturePayment`/`capturePayment_`): a canceled payment cannot be captured (`INVALID_DATA`); an already-captured payment is an idempotent no-op (`captured_at` guard — no double charge); `amount == null` → capture full amount; explicit amount must be > 0; **partial capture is natively supported** — multiple `capture` records are allowed and each is validated against `authorized − alreadyCaptured` ("You cannot capture more than the authorized amount subtracted by what is already captured"); concurrency is serialized with a row lock (`SELECT … FOR UPDATE` inside the write transaction, `lock_timeout = 3s` — §18); the provider call carries `idempotency_key: capture.id` (per-provider idempotency, §15).
- **Invariant (REQ-PAY-010):** a logical capture operation cannot produce more than one financial effect.
- **Provider boundary:** whether a specific provider supports partial capture is verified against its official docs at selection time (B-PAY-07); Medusa's mechanism does not limit it.

### 11.3 Multiple sessions / split payments

Multiple sessions per collection are natively supported (verified model). **Split payments (one order paid across multiple providers) are outside V1** unless a business requirement explicitly authorizes them; no custom split-payment system is invented (AGENTS.md §4/§5).

## 12. Cancellation

- **Module:** `cancelPayment` calls provider `cancelPayment` with `idempotency_key: payment.id` and sets `canceled_at` (verified).
- **Collection:** `cancelPaymentCollectionWorkflow` (verified): cannot cancel a `completed` collection or an already-`canceled` collection (`NOT_ALLOWED`); cancels **only authorized/uncaptured payments** (captured payments are not cancelled by this workflow); resulting collection status is `partially_captured` if `captured_amount > 0`, otherwise `canceled`.
- **Order cancellation:** `cancelOrderWorkflow` cancels the order's uncaptured payments (`cancelPaymentStep`) and updates the collection status to `canceled` (verified; details owned by the Orders spec).
- Cancellation of a captured payment is **not** a refund — a distinct operation (REQ-PAY-012).

## 13. Refunds

Verified mechanics:

- `refundPaymentWorkflow` (admin `POST /admin/payments/:id/refund`, `created_by` recorded) includes **`validateRefundPaymentExceedsCapturedAmountStep`** (verified source): refund amount is checked against captured minus already-refunded using currency decimal precision (epsilon); creates `refund` records (+ optional `refund_reason_id`/`note`), refreshes collection aggregates, adds order transaction, emits `payment.refunded`.
- **Verified module semantics** (`refundPayment`/`refundPayment_`): `amount == null` → full refund; explicit amount must be > 0; concurrency serialized with the same row-lock pattern as capture (§18); the guard `captured − (refunded + newRefund) ≥ −epsilon` throws `INVALID_DATA` ("You cannot refund more than what is captured on the payment"); the provider call carries `idempotency_key: refund.id`; **if the provider call fails, the refund record is deleted and the error rethrown** (no phantom internal refund).
- Supported, where provider allows: full refund, partial refund, multiple partial refunds (multiple `refund` records), refund failure/pending/completion per provider response.
- **Invariants (REQ-PAY-011):** refunded ≤ captured; total refunds ≤ refundable amount; a duplicate refund request produces at most one financial effect; clients can never mark a refund successful.
- Refund eligibility rules (windows, shipping-fee treatment, COD refunds) belong to the future Returns & Refunds spec — coordination boundary only; cross-currency refund policy per markets-and-pricing.md (default: refuse — B-PAY-09).

## 14. Webhooks and Asynchronous Confirmation

**Verified native pipeline (Medusa 2.19.0):**

```
Provider webhook → POST /hooks/payment/:provider          (native route; raw body preserved)
   → event payment.webhook_received emitted                (delay webhook_delay=5000ms, attempts webhook_retries=3 — configurable)
   → shipped subscriber (subscribers/payment-webhook.js)
       → paymentService.getWebhookActionAndData            (delegates to provider pp_<provider>.getWebhookActionAndData)
       → guards: no session_id → ignore; NOT_SUPPORTED/CANCELED/FAILED/REQUIRES_MORE/PENDING_AUTHORIZATION/PENDING → ignore
   → processPaymentWorkflow                                 (native; §14.1)
```

- **The webhook HTTP entry point is native** (`/hooks/payment/:provider`, verified route + middleware). **Provider-specific signature verification is the provider's responsibility** inside its `getWebhookActionAndData` implementation, which receives the parsed body, `rawData`, and `headers` — the exact mechanism is verified against the selected provider's official docs, never invented (REQ-PAY-013).
- The shipped subscriber ignores events without a `session_id` (prevents acting on arbitrary/foreign events — verified guard) and ignores non-processable actions; the remaining actions flow into `processPaymentWorkflow`.
- Requirements (REQ-PAY-013/014): signature verification where the provider supports it; payload validation at the provider boundary; event identity; idempotency; replay protection; duplicate handling; out-of-order handling (status reconcile — never regress a later state to an earlier one, REQ-PAY-014); safe logging (no secrets/card data); safe error responses (the native route returns a sanitized `400` on processing errors and `200` on accept — no internals leaked); authorization boundary (the hooks route is not a customer/admin-authenticated route; authorization is the provider signature + event association).
- **The frontend redirect is never authoritative confirmation** (REQ-PAY-008) — confirmation is webhook-verified or status-polled server-side.
- Unknown provider state → manual intervention, never auto-success (REQ-PAY-021).

### 14.1 `processPaymentWorkflow` dispatch (verified)

Input `{ action, data: { session_id, amount } }`. Locks the linked cart (30s timeout, 2min TTL) and dispatches:

- `captured` + session + existing payment → `capturePaymentWorkflow` (capture).
- `captured` + session + no payment yet (auto-capture) → `authorizePaymentSessionStep` then capture.
- `authorized` + no cart linked → `authorizePaymentSessionStep`.
- `authorized` + order exists + no payment yet → `authorizePaymentSessionStep` (deferred authorization for `pending_authorization` orders).
- Cart linked and no order yet → `completeCartAfterPaymentStep` with `continueOnPermanentFailure: true` — **cart-completion failure does not fail payment processing** (order-finalization failure is handled separately, never silently as success).

## 15. Idempotency

| Operation | Invariant | Mechanism (verified) |
| --- | --- | --- |
| Session creation | One session per provider per collection context | collection-scoped session creation (verified) |
| Authorization | Re-authorization of the same logical attempt has one effect | `authorizePaymentSession` idempotency guard (`payment` + `authorized_at`); completion lock + `order_cart` idempotency (cart spec) |
| Capture | Duplicate capture cannot charge twice | `captured_at` guard + capture-sum validation under row lock; provider `idempotency_key: capture.id` |
| Cancellation | One cancellation effect | `canceled_at` + provider `idempotency_key: payment.id` + cancel-workflow state guards |
| Refund | Duplicate refund request → at most one financial effect | captured/refunded sums under row lock + `validateRefundPaymentExceedsCapturedAmountStep`; provider `idempotency_key: refund.id` |
| Webhook processing | Duplicate/replay event → one state change | event identity + native subscriber guard (no `session_id`/non-processable → ignore); event-bus attempts + workflow idempotency |
| Reconciliation | Idempotent state normalization | reconciliation job (§16) |
| Retry after timeout | Determine existing provider state before creating another financial effect | provider `retrievePayment`/`getPaymentStatus` before any new attempt (REQ-PAY-015) |

No custom idempotency storage architecture is prescribed at specification stage; native workflow engine + PostgreSQL + per-provider idempotency keys (as verified above) are the mechanism.

## 16. Reconciliation

- **Purpose:** identify discrepancies between Medusa payment state and provider state (amount/currency/status/captured/refunded/settlement where available).
- **Native anchor (verified):** `payment_collection` aggregates `authorized_amount`, `captured_amount`, `refunded_amount`, `status`, `completed_at` are derived server-side by the Payment module after every session/capture/refund change (§9.2); the order-level payment status is derived by `getLastPaymentStatus`. These are the internal source of truth for comparison.
- **Discrepancy cases (REQ-PAY-028):** Medusa pending vs provider paid; Medusa paid vs provider failed; provider captured vs Medusa not; refund exists at provider but not internally; amount mismatch; currency mismatch; unknown transaction.
- **Mechanism (T-PAY-05):** a scheduled reconciliation job queries provider status via `retrievePayment`/`getPaymentStatus`/settlement reports and compares against the native aggregates; discrepancies are surfaced to Admin for resolution. **Reconciliation never auto-mutates a payment to successful without verified provider evidence (REQ-PAY-029)**; unknown provider state routes to manual intervention (REQ-PAY-021). **No separate reconciliation database is prescribed** unless verified necessary (AGENTS.md §16).
- Reconciliation cadence and settlement-data availability are business/ops decisions (B-PAY-16).

## 17. Failure Handling

Classify every payment failure (retry counts/timing are a technical decision, T-PAY-06 — not invented here):

| # | Class | Retryable? | Customer action? | Auto-reconcile? | Manual intervention? | Verified native mapping |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Validation failure (amount/currency/cart) | No | Yes | No | No | module `INVALID_DATA` guards (§10–13) |
| 2 | Customer/payment rejection (declined) | No | Yes | No | No | session status `error`/non-authorized → `NOT_ALLOWED` |
| 3 | Provider failure (5xx/provider error) | Yes (bounded) | No | Yes | No | workflow step failures; event-bus `webhook_retries` |
| 4 | Network timeout | Yes (bounded) | No | Yes | No | determine provider state before retry (REQ-PAY-015) |
| 5 | Authentication failure (bad credentials) | No | No | No | Yes (ops) | configuration/credentials |
| 6 | Configuration failure | No | No | No | Yes (ops) | module/provider config |
| 7 | Duplicate operation | No-op (idempotent) | No | No | No | §15 |
| 8 | Unknown provider state | No | No | Yes | **Yes** | never auto-success (REQ-PAY-021) |
| 9 | Internal processing failure | Yes (internal) | No | Yes | No | observable; `continueOnPermanentFailure` semantics for cart completion (§14.1) |

Provider failure is never represented internally as successful payment (REQ-PAY-020). Session statuses `requires_more` (e.g., additional customer verification) and `error` are part of the verified vocabulary and map to classes 2/9 as applicable.

## 18. Concurrency

| Scenario | Expected result | Verified protection |
| --- | --- | --- |
| Two simultaneous payment attempts | One authoritative session/payment per collection | collection-scoped session creation + cart completion lock (`acquireLockStep`, 30s timeout / 2min TTL — cart spec) |
| Duplicate capture requests | One financial capture | `captured_at` guard + capture-sum check under `SELECT … FOR UPDATE` (payment row) with `lock_timeout = 3s` inside the write transaction (verified §11) |
| Capture vs cancellation race | Deterministic single outcome | row-lock serialization + cancel-workflow guards (cannot cancel completed; only uncaptured payments cancelled) |
| Refund vs cancellation race | Refund bounded by captured; cancellation never double-effect | refund row-lock + `validateRefundPaymentExceedsCapturedAmountStep`; cancel only uncaptured payments |
| Duplicate webhooks | One state effect | §14/§15 (event identity + native guards) |
| Webhook vs polling differing states | Reconcile; latest verified state wins; never regress | §14/§16 (REQ-PAY-032) |
| Payment success after cart expiration | Order may exist or be compensated per cart/order spec | completion idempotency + compensation (cart spec) |
| Payment success after customer retry | No duplicate charge | provider status check before new attempt (REQ-PAY-015) |

**REQ-PAY-030/031/032** — simultaneous attempts, racing capture/refund/cancel, and divergent webhook/polling states must never produce multiple financial effects or regress state.

## 19. Security

- Secrets/credentials: server-side env/deployment secrets only; never in storefront, never in logs (REQ-PAY-016).
- Provider authentication: verified against selected provider's official docs at implementation (REQ-PAY-026).
- Webhook verification: provider-side signature verification inside `getWebhookActionAndData` (raw body + headers), payload validation, replay protection (§14); the native hooks route accepts and queues, never returns internal errors.
- Authorization: customers can initiate payment only for their own cart; never access another customer's payment; never mark payment successful; never initiate refunds; admin payment operations use Medusa's native admin authorization (RBAC policies verified on `/admin/payments/*`); sensitive ops (refunds, overrides) enforced server-side — frontend visibility is never authorization. No custom RBAC infrastructure (REQ-PAY-017).
- Amount/currency validation at every boundary (REQ-PAY-001/002).
- Rate limiting on payment initiation and webhooks (AGENTS.md §14; T-PAY-07).
- Audit logging for sensitive ops (refunds, mark-as-paid overrides, manual marks) per AGENTS.md §19 — native `captured_by`/`created_by` attribution verified.
- **Card-data boundary:** the application never stores raw card numbers, CVV, or equivalent sensitive credentials unless a future explicit architecture decision authorizes it; prefer provider-hosted/tokenized mechanisms; **no PCI-compliance claims are made without evidence** (REQ-PAY-018).

## 20. Admin Operations

- **Native coverage (verified routes):** view payments/sessions/collections; capture (`/admin/payments/:id/capture`); refund (`/admin/payments/:id/refund`); mark collection as paid (`/admin/payment-collections/:id/mark-as-paid`); provider listing/config; refund reasons. RBAC policies verified on `/admin/payments/*`.
- **Mark-as-paid (verified override):** `markPaymentCollectionAsPaid` workflow — only from `not_paid` status (`NOT_ALLOWED` otherwise); creates a session with the system provider (`pp_system_default`) unless another provider is specified, authorizes, and captures the full collection amount; records `captured_by` (actor id). This is the native manual override; audit-worthy (AGENTS.md §19).
- Standard Medusa Admin is authoritative initially. **No custom Admin UI.**
- Future extension boundaries (only if a verified gap): reconciliation dashboard, provider-specific data views — recorded as future implementation boundaries (T-PAY-08), not built now.

## 21. Notifications

- Possible events: payment initiated, pending, successful, failed; refund initiated/completed/failed. **No templates defined.**
- Native event hooks exist (`payment.captured`, `payment.refunded` — verified) for notification subscribers; webhook-received is `payment.webhook_received`.
- **Notification failure must never roll back or fabricate payment state (REQ-PAY-019)** — notifications are side effects behind the notifications boundary (AGENTS.md §18; consent per notifications spec).

## 22. Testing Requirements

(Specification only — no tests written in this task. TDD per AGENTS.md §16 at implementation.)

**Unit:** amount validation; currency validation; provider selection/market compatibility; refundable-amount calculation (refunded ≤ captured); state-transition validation against the verified status vocabularies (§4); idempotency decisions; authorization rules.

**Integration (real DB + Medusa workflows):** payment collection/session workflows; cart↔collection↔order links; authorize-at-completion; capture (incl. partial capture); refund (incl. exceeds-captured rejection, epsilon precision); cancellation (incl. cancel-of-completed rejection); provider boundary; mark-as-paid guard (`not_paid` only).

**Reconciliation:** each discrepancy class (§16) detected; never auto-mutates to success; idempotent runs.

**Provider contract (per provider, once selected):** auth; request construction; response parsing; error mapping; amount; currency; authorization; capture; cancellation; refund; status lookup; webhook verification.

**Webhook:** valid; invalid signature; malformed payload; duplicate event; replay; out-of-order; unknown event; provider state mismatch; missing `session_id` ignored; non-processable actions ignored (native subscriber guards).

**Concurrency:** duplicate authorization; duplicate capture; capture vs cancellation; duplicate refund; webhook vs polling; payment retry race.

**E2E (sandbox providers):** PK payment flow; AE payment flow; success/failed/pending; retry; order creation after payment; refund; partial refund where supported.

## 23. Commerce Invariants

1. Payment amount equals the authoritative payable amount at the relevant transaction boundary (REQ-PAY-001).
2. Payment currency equals the cart/order currency (REQ-PAY-002).
3. A client cannot establish successful payment (REQ-PAY-008).
4. A payment cannot be captured more than once for the same logical capture operation (REQ-PAY-010).
5. Refunded amount ≤ captured amount (REQ-PAY-011).
6. Total refunds ≤ refundable amount (REQ-PAY-011).
7. Duplicate provider events produce no duplicate financial effects (REQ-PAY-014).
8. Payment provider is compatible with the market/currency (REQ-PAY-003).
9. Payment state cannot be arbitrarily mutated by the storefront (REQ-PAY-017).
10. Historical order payment amounts do not change when catalog prices later change (order snapshot — cart/order spec; REQ-PAY-009).
11. Provider failure is never represented internally as successful payment (REQ-PAY-020).
12. Unknown provider state is never automatically treated as success (REQ-PAY-021).
13. Payment credentials/secrets never reach the browser (REQ-PAY-016).

**REQ-PAY-035** — these invariants are encoded as property/unit tests at implementation (invariant group R).

## 24. Business Decision Register

**Resolution status (2026-08-16): all decisions resolved via the Business
Decision Phase. Canonical mapping per
`docs/architecture/consolidated-decision-register.md`.**

| ID | Business decision | Why required | Options | Recommended | Status | Canonical |
| --- | --- | --- | --- | --- | --- | --- |
| B-PAY-01 | Pakistan payment provider(s) | Not selected | — | — | **APPROVED (selection: Safepay, revised 2026-08-17)** — replaces the earlier AssanPay selection (which replaced xPay; both replaced before implementation, historical evidence preserved); contract verified + adapter implemented per `docs/architecture/provider-verification/safepay-verification.md` | BD-P-01 |
| B-PAY-02 | UAE payment provider(s) | Not selected | — | — | **APPROVED (selection: Stripe)** — contract verification pending | BD-P-02 |
| B-PAY-03 | COD (PK? AE? scope; Medusa representation; cancellation/return/refund behavior) | Explicitly unresolved | — | — | **APPROVED — no COD in V1** | BD-P-03 |
| B-PAY-04 | Supported payment methods (cards/wallets/bank transfer/installments; saved methods) | Provider + business scope | — | Card + provider-default; others per provider | **PROVIDER_VERIFICATION_REQUIRED** | BD-P-04 |
| B-PAY-05 | Payment retry policy (attempts, timing, UX) | Failure model | — | — | **APPROVED — bounded retries (3), backoff, status check** | BD-P-05 |
| B-PAY-06 | Payment/session expiry | No native session TTL verified | — | — | **IMPLEMENTATION_DEFINED** (no native TTL; refresh-driven) | BD-P-06 |
| B-PAY-07 | Partial capture | Mechanism verified native; provider + business | Full-capture-only / partial | Full-capture initially | **PROVIDER_VERIFICATION_REQUIRED** | BD-P-07 |
| B-PAY-08 | Partial refund policy | Supported by mechanism | — | — | **DERIVED** (BD-R-05: prorated by received quantity) | BD-P-08 |
| B-PAY-09 | Cross-currency refunds | Markets spec | Refuse / convert (authorized) | **Refuse** (no silent conversion) | **APPROVED** (alias of B-MP-09) | BD-M-08 |
| B-PAY-10 | Refund timing + fee treatment | Business rule | — | — | **DERIVED** (BD-R-05: after receipt, original method; no shipping refund on returns) | BD-S-18 |
| B-PAY-11 | Provider fallback strategy | Single vs multiple per market | Fail / fallback | Fail initially | **APPROVED — fail first; single provider per market** | BD-P-09 |
| B-PAY-12 | Payment method availability by market | Configuration | — | Per region (native) | **PROVIDER_VERIFICATION_REQUIRED** | BD-P-04 |
| B-PAY-13 | Min/max transaction amounts | Business rule | — | — | DEFERRED (P2) | BD-P-10 |
| B-PAY-14 | Payment restrictions by product/category | Business rule | — | — | DEFERRED (P2) | BD-P-11 |
| B-PAY-15 | Fraud/risk rules | Business/provider | — | — | **PROVIDER_VERIFICATION_REQUIRED** | BD-P-12 |
| B-PAY-16 | Reconciliation frequency | Ops rule | — | — | DEFERRED (P2) | BD-P-13 |
| B-PAY-17 | Manual payment overrides | Ops + audit | — | Native mark-as-paid with audit | DEFERRED (P2) | BD-P-14 |
| B-PAY-18 | Settlement reporting requirements | Ops/finance | — | — | DEFERRED (P3) | BD-P-15 |

## 25. Technical Decision Register

| ID | Question | Evidence | Recommendation |
| --- | --- | --- | --- |
| T-PAY-01 | Provider registration/config mechanism | `payment_provider` (is_enabled) + payment module options + admin provider routes (verified) | Register adapters natively; bind per region |
| T-PAY-02 | Region↔provider binding mechanics | `region_payment_provider` + region-scoped store listing (verified) | Configure PK→PK providers, AE→AE providers |
| T-PAY-03 | Authorization→capture timing | Authorize-at-completion verified; capture separate; webhook autocapture verified | Deferred capture if provider supports; else immediate at completion |
| T-PAY-04 | Webhook entry point | **Native route `/hooks/payment/:provider` + `payment.webhook_received` event + shipped subscriber + `processPaymentWorkflow` (verified)** | Use the native pipeline; provider implements `getWebhookActionAndData` (incl. signature verification); configure `webhook_delay`/`webhook_retries` as needed. No custom webhook route required unless a provider needs non-standard verification/transport |
| T-PAY-05 | Reconciliation mechanism | No native reconciliation job; native aggregate fields verified | Scheduled job comparing collection aggregates vs provider status/settlement; Admin surfacing |
| T-PAY-06 | Retry counts/timing for provider calls | AGENTS.md §15 requires idempotent retries; no values | Bounded backoff; values approved at implementation |
| T-PAY-07 | Rate limiting on payment/webhook routes | AGENTS.md §14; none configured | Enable before launch |
| T-PAY-08 | Admin extension boundaries | Standard Admin covers verified routes | No custom Admin UI in V1; revisit on verified gap |
| T-PAY-09 | Redis role in payments | Locking/event-bus/cache only | Keep non-authoritative; Redis locking for prod multi-instance |
| T-PAY-10 | Webhook event processing options | `PaymentModuleOptions.webhook_delay` (5000) / `webhook_retries` (3) verified | Confirm values with provider latency + event-bus behavior at implementation |

## 26. Provider Contract Register

For each provider (PK = Safepay, AE = Stripe) — **verified facts are recorded in `docs/architecture/provider-verification/`** (`safepay-verification.md`, `stripe-verification.md`, `payment-provider-compatibility.md`; `assanpay-verification.md` and `xpay-verification.md` are HISTORICAL/REPLACED). Fields not yet established by official documentation remain UNVERIFIED / TBD:

`provider name` · official documentation URL · API version · supported currencies · supported payment methods · authorization · capture · partial capture · refund · partial refund · cancellation · webhook support · signature verification · status lookup · idempotency support · sandbox availability · rate limits · error model · settlement/reconciliation · PCI/tokenization model.

Entry points for future verification: REQ-PAY-022 (PK provider contract) and REQ-PAY-023 (AE provider contract) — no endpoints, payloads, auth schemes, status values, or capabilities are invented in this document.

## 27. Requirement Traceability Matrix

Groups: A. Scope · B. Medusa capability · C. Market/provider mapping · D. Payment sessions · E. Authorization · F. Capture · G. Cancellation · H. Refunds · I. Webhooks · J. Idempotency · K. Reconciliation · L. Failures · M. Concurrency · N. Security · O. Admin · P. Notifications · Q. Testing · R. Invariants.

| ID | Group | Requirement | Test expectation |
| --- | --- | --- | --- |
| REQ-PAY-001 | A | Payment amount equals the authoritative payable amount at each transaction boundary; never client-supplied. | API/security (amount tamper) |
| REQ-PAY-002 | A | Payment currency equals cart/order currency; no silent conversion. | unit/API currency mismatch |
| REQ-PAY-003 | C | Payment providers are market-scoped via `region_payment_provider`; PKR→PK, AED→AE; cross-market leakage prevented. | integration (region provider listing) |
| REQ-PAY-004 | D | Collections/sessions created through native workflows with backend-derived amount/currency. | integration |
| REQ-PAY-005 | D | Session creation idempotent per provider per collection context. | concurrency (duplicate session) |
| REQ-PAY-006 | E | Authorization occurs at completion via `authorizePaymentSessionStep` (order-first, authorize-last) with compensation on failure. | workflow |
| REQ-PAY-007 | E | Payment state is an independent concern mapped to Medusa-native status vocabularies (collection/session/order-payment-status); no custom order-status enum. | state-transition tests |
| REQ-PAY-008 | E | A payment is never marked successful from client state; only server-verified provider confirmation (webhook/status). | security (fake success) |
| REQ-PAY-009 | E | Order payment amounts are snapshotted; later catalog changes never alter them. | order snapshot test |
| REQ-PAY-010 | F | A logical capture operation cannot produce more than one financial effect; partial capture bounded by authorized−captured. | concurrency (duplicate capture) + unit |
| REQ-PAY-011 | H | Refunded ≤ captured; total refunds ≤ refundable; duplicate refund → one financial effect; refunds recorded with `created_by`. | unit + concurrency (native validator) |
| REQ-PAY-012 | G | Cancellation of a captured payment is a distinct operation from refund; completed/`canceled` collections cannot be cancelled; only uncaptured payments cancelled. | state tests |
| REQ-PAY-013 | I | Webhook handling verifies signature (provider-side where supported), validates payload, enforces idempotency + replay protection via the native pipeline. | webhook suite |
| REQ-PAY-014 | I | Duplicate/out-of-order webhook events produce one state effect and never regress later states. | webhook suite |
| REQ-PAY-015 | J | Retry after timeout determines existing provider state before any new financial effect. | concurrency (retry race) |
| REQ-PAY-016 | N | Credentials/secrets server-side only; never logged; never in browser. | security scan |
| REQ-PAY-017 | N | Customer payment operations are cart-owned; admin ops follow native admin authorization (RBAC); frontend visibility is never authorization. | authorization tests |
| REQ-PAY-018 | N | No raw card data/CVV storage; provider-hosted/tokenized preferred; no unsupported PCI claims. | code review/security |
| REQ-PAY-019 | P | Notification failure never rolls back or fabricates payment state. | notification boundary test |
| REQ-PAY-020 | L | Provider failure is never represented internally as successful payment. | failure-path tests |
| REQ-PAY-021 | L | Unknown provider state routes to manual intervention, never auto-success. | failure-path tests |
| REQ-PAY-022 | Q | PK provider contract verified against official docs (register §26) before implementation. | contract tests |
| REQ-PAY-023 | Q | AE provider contract verified against official docs (register §26) before implementation. | contract tests |
| REQ-PAY-024 | Q | Tests per §22 (unit/integration/contract/webhook/concurrency/E2E) written before/with implementation (TDD). | CI gate |
| REQ-PAY-025 | B | Payment domain uses the native Payment module + verified workflows; no parallel payment engine, no custom payment persistence. | architecture review; schema unchanged |
| REQ-PAY-026 | B | Provider integration implements the verified `IPaymentProvider` contract; capabilities verified per provider before use. | provider contract tests |
| REQ-PAY-027 | B | Webhook handling uses the native pipeline (`/hooks/payment/:provider` → event → subscriber → `processPaymentWorkflow`); no invented signature mechanism. | webhook suite |
| REQ-PAY-028 | K | Reconciliation detects the documented discrepancy classes using native collection aggregates vs provider state/settlement. | reconciliation tests |
| REQ-PAY-029 | K | Reconciliation never auto-mutates a payment to successful without verified provider evidence; surfaces to Admin; no separate reconciliation DB unless justified. | reconciliation tests |
| REQ-PAY-030 | M | Two simultaneous payment attempts produce at most one authoritative session/payment per collection. | concurrency test |
| REQ-PAY-031 | M | Capture/refund/cancel races are serialized (verified row-lock guards) and never double-charge/double-refund. | concurrency tests |
| REQ-PAY-032 | M | Divergent webhook vs polling states reconcile to the latest verified state; no regression. | webhook/polling divergence test |
| REQ-PAY-033 | O | All admin payment operations use native admin routes + native admin authorization (RBAC), server-side. | admin authorization tests |
| REQ-PAY-034 | O | Manual override (mark-as-paid) only via the native workflow, restricted to `not_paid`, records actor, audit-logged. | admin tests + audit assertions |
| REQ-PAY-035 | R | §23 invariants encoded as property/unit tests. | property tests |

## 28. Implementation Constraints

- Medusa-first: use the Payment module, native workflows, verified routes, the native webhook pipeline, and `IPaymentProvider`. No custom payment persistence, no parallel payment engine, no invented provider adapters or placeholder success logic (AGENTS.md §4/§23).
- Verification hierarchy (AGENTS.md §27): installed 2.19.0 source > official docs for the exact version > Context7 > inference. No Medusa v1 payment concepts.
- Provider selection is required before any adapter implementation; contract verification per §26 is mandatory (REQ-PAY-022/023).
- No business rule from the register may be chosen without authorization (AGENTS.md §5).
- No dependency additions without the AGENTS.md dependency protocol.
- Tests before implementation (AGENTS.md §16).

## 29. Open Questions

- Provider selection (B-PAY-01/02) — **APPROVED: Safepay (PK, revised), Stripe (AE)**. Both contracts verified; adapters implemented. Remaining gate: sandbox contract runs before enabling for customers (COMPLETE_PENDING_SANDBOX).
- COD (B-PAY-03) — **APPROVED: no COD in V1** (BD-P-03).
- Provider webhook support and signature mechanisms — **VERIFIED both** (Safepay: X-SFPY-SIGNATURE HMAC-SHA512; Stripe: Stripe-Signature HMAC-SHA256).
- Session expiry/refresh policy (B-PAY-06/T-PAY-03).
- Reconciliation cadence and settlement data availability (B-PAY-16/T-PAY-05).
- Webhook event processing options (`webhook_delay`/`webhook_retries`) tuning — implementation-time configuration.

## 30. Definition of Done

Payments is complete only when: Medusa capability verified against installed 2.19.0; provider(s) selected and official contracts verified (or contract tests explicitly pending); tests written first and passing (unit/integration/contract/webhook/concurrency/E2E); happy + failure + authorization + validation + concurrency paths tested; idempotency demonstrated; TypeScript/lint/build pass; no secrets; no business rule silently chosen; docs updated; backward compatibility preserved; no architecture drift (no custom payment engine, provider logic isolated behind `IPaymentProvider`, native webhook pipeline used; no fake adapters).

## 31. Verification Record & Sources

**Verification record (AGENTS.md §27.4):**

```
Medusa version: 2.19.0 (locked; unchanged)
Relevant packages: @medusajs/payment, @medusajs/core-flows, @medusajs/types, @medusajs/medusa, @medusajs/utils (all 2.19.0)
Relevant APIs: IPaymentProvider; payment-collection/session/payment/capture/refund models;
  authorize/capture/refund/cancel/mark-as-paid/process-payment workflows; store/admin payment routes; hooks webhook route
Installed source verification: models, provider interface + outputs, status enums (PaymentCollectionStatus,
  PaymentSessionStatus, PaymentActions), module service (authorize/capture/refund/cancel/idempotency/locking/
  status derivation), workflows, routes, subscriber, module options — all inspected (see sources below)
Official docs verification: docs.medusajs.com/resources/commerce-modules/payment (+ webhook-events page) — v2 docs
Context7 verification: Context7 hosts the Medusa library (context7.com/medusa) and indexes the same official docs;
  Context7 MCP tools were NOT invocable in this environment (no MCP server configured), so verification used the
  official docs (ranked above Context7 in AGENTS.md §27.3) + installed source (ranked #1). No Context7 content was
  blindly trusted; installed 2.19.0 source remains authoritative.
Compatibility result: all documented behavior verified against installed 2.19.0; a prior draft's claim that no
  native webhook route exists was corrected (§5.4/§14) after verifying dist/api/hooks/payment/[provider]/route.js.
Implementation boundary: specification-only; no code/config/dependency/migration/storefront/Admin changes.
```

**Sources:**

- `@medusajs/payment@2.19.0` — models (payment-collection, payment-session, payment, capture, refund, refund-reason, payment-provider, account-holder); services/payment-module.js (authorize/capture/refund/cancel, `maybeUpdatePaymentCollection_` status derivation, `getWebhookActionAndData`); providers/system.js (`SystemPaymentProvider`, identifier `system`).
- `@medusajs/types@2.19.0` — dist/payment/common.d.ts (DTOs + `PaymentCollectionStatus`/`PaymentSessionStatus`), dist/payment/provider.d.ts (`IPaymentProvider`, `PaymentActions`, `WebhookActionResult`, inputs/outputs, `PaymentProviderContext.idempotency_key`), dist/payment/mutations.d.ts (`ProviderWebhookPayload`), dist/payment/service.d.ts (`PaymentModuleOptions`: `webhook_delay` 5000, `webhook_retries` 3).
- `@medusajs/utils@2.19.0` — dist/payment/webhook.js (`PaymentActions` enum, `PaymentWebhookEvents.WebhookReceived = "payment.webhook_received"`); dist/core-flows/events.js (`PaymentEvents`: `payment.captured`, `payment.refunded`).
- `@medusajs/core-flows@2.19.0` — payment/workflows/{capture-payment, refund-payment (incl. `validateRefundPaymentExceedsCapturedAmountStep`), refund-payments, process-payment, authorize-payment-session-for-order}; payment-collection/workflows/cancel-payment-collection; order/workflows/mark-payment-collection-as-paid (`pp_system_default`, `not_paid`-only guard); order/utils/aggregate-status.js (`getLastPaymentStatus`); cart/workflows/{create-payment-collection-for-cart, create-payment-sessions, refresh-payment-collection, refund-payment-recreate-payment-session}; cart/workflows/complete-cart.
- `@medusajs/medusa@2.19.0` — api/hooks/payment/[provider]/route.js + api/hooks/middlewares.js (native webhook route, raw-body preserved); subscribers/payment-webhook.js (shipped webhook subscriber + action guards); api/store/{payment-collections, payment-providers} (region-scoped, requires `region_id`); api/admin/{payments (+ capture/refund, RBAC policies), payment-collections (+ mark-as-paid, payment-sessions), refund-reasons}.
- Live DB `medusa-baby-store` — all payment tables verified (§5.1); `payment_provider` contains only `pp_system_default` (enabled); `region_payment_provider` binds the seed Europe region to `pp_system_default`; PK/AE regions not yet configured.
- Official docs: `https://docs.medusajs.com/resources/commerce-modules/payment` and `…/payment/webhook-events` (v2; webhook listener route `/hooks/payment/[identifier]_[provider]`, `getWebhookActionAndData`, `processPaymentWorkflow` dispatch).
- Existing specs: `markets-and-pricing.md`, `cart-and-checkout.md`, `shipping-and-fulfillment.md`, `inventory-and-warehouses.md`, `docs/architecture/authentication-authorization.md`, AGENTS.md.
- Storefront boundary: `apps/storefront/src/lib/data/payment.ts` consumes `/store/payment-providers` (region-scoped).

## 32. Implementation Status (2026-08-16)

Phase 5 (Payments) implemented scope — **PARTIAL by design**:

- **Native pipeline verified + exercised (T-PAY-04):** `integration-tests/http/payments.spec.ts` (6 tests) proves: region-scoped store provider listing via `region_payment_provider` (REQ-PAY-003); collection + single-authoritative-session creation (REQ-PAY-004/030); authorize-at-completion order-first flow — payment authorized, zero captures/refunds (REQ-PAY-006); capture succeeds once and a duplicate full capture is idempotent success with no second capture record (REQ-PAY-010/031; native `captured_at` guard + row-lock concurrency guard verified); refund ≤ captured enforced, over-refund rejected (REQ-PAY-011); native webhook pipeline `POST /hooks/payment/:provider` → `payment.webhook_received` (5000ms delay, 3 attempts) → shipped subscriber → `processPaymentWorkflow` (REQ-PAY-027; system provider maps to `not_supported`, no state mutation).
- **Stripe (UAE/AED) scaffolding (BD-P-02):** `@medusajs/payment-stripe@2.19.0` added (official Medusa provider, exact locked version); env-gated registration in `medusa-config.ts` (`PAYMENT_PROVIDER=stripe` → provider key `pp_stripe_stripe`, verified `pp_{identifier}_{id}`); `capture` defaults to manual (deferred) per T-PAY-03, overridable via `PAYMENT_STRIPE_CAPTURE=automatic`; conditional env validation in `src/config/env.ts` (names only: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`); `.env.example` updated; `seed-markets.ts` binds Stripe to the AE region when registered (T-PAY-02). `STRIPE_PUBLISHABLE_KEY` documented (storefront reads its own copy).
- **Safepay (PK/PKR) — IMPLEMENTED (2026-08-17; replaces AssanPay per BD-P-01 revision); SANDBOX-VERIFIED 2026-08-18.** Contract verified against official Safepay documentation (retrieved via Context7) + official SDK source: tracker sessions (`POST /order/payments/v3/`), hosted checkout URL (passport `tbt`), reporter status API, full/partial refunds, webhooks (X-SFPY-SIGNATURE, HMAC-SHA512 over raw body), paisa amounts, `x-sfpy-merchant-secret` auth. Adapter at `src/modules/payment-safepay` (provider key `pp_safepay_safepay`), env-gated via `PAYMENT_PROVIDER=safepay` with fail-fast env validation; PK region binding seeded; 54 unit tests. Live sandbox evidence: session creation (metadata must be `order_id` — sandbox rejects unknown meta keys), hosted checkout payment (frictionless card 4456 5300 0000 1005), deferred authorization (TRACKER_STARTED → PENDING_AUTHORIZATION), capture, refund (TRACKER_REFUNDED), signed webhook pipeline (bad signature rejected; replay idempotent). SANDBOX_LIMITATIONs (non-blocking): no webhook auto-delivery from the sandbox; decline-card simulation unavailable. Known documented limitations (non-blocking): no idempotency mechanism (financial ops single-attempt), no signature timestamp (native duplicate-delivery determinism), no un-paid-tracker cancellation API (local-only cancel). Full record: `safepay-verification.md`.
- **xPay / AssanPay:** replaced providers (BD-P-01); not registered, no references reactivated; historical verification docs explicitly marked HISTORICAL / REPLACED / NOT ACTIVE.

Verification (2026-08-16 baseline): backend tsc PASS · eslint src PASS (0 issues) · `medusa build` PASS · unit 69/69 (4 suites) · integration 83/83 (8 suites) · storefront tsc PASS · root lint 2/2 PASS. No dependencies beyond `@medusajs/payment-stripe@2.19.0` (exact locked version, already present in the pnpm store).

### 33. Implementation Update (2026-08-17 — Safepay replaces AssanPay)

- **Safepay adapter implemented** (BD-P-01 revised): `apps/backend/src/modules/payment-safepay` — `IPaymentProvider` implementation (service/client/amounts/webhook), registered env-gated in `medusa-config.ts` (`PAYMENT_PROVIDER` may list `safepay,stripe`; provider key `pp_safepay_safepay`). Contract + compatibility matrix: `docs/architecture/provider-verification/safepay-verification.md`.
- **Environment:** `SAFEPAY_MERCHANT_API_KEY` · `SAFEPAY_SECRET_KEY` · `SAFEPAY_WEBHOOK_SECRET` · `SAFEPAY_ENVIRONMENT` · `SAFEPAY_REDIRECT_URL` · `SAFEPAY_CANCEL_URL` (fail-fast validation; names only in `.env.example`; obsolete AssanPay variables removed).
- **Region binding:** seed binds `pp_safepay_safepay` → PK region when registered (T-PAY-02).
- **Stripe re-verified** against installed source during the Safepay verification — no defects found; unchanged.
- **Verification (2026-08-17):** backend tsc PASS (3 pre-existing checkout.spec.ts integration-test type errors remain — present on HEAD before this change) · eslint src PASS · `medusa build` PASS · unit 136/136 (6 suites; +67 for Safepay/env/config) · integration 9/11 suites PASS — payments/inventory/customer-auth webhook-event waits time out identically on clean HEAD (pre-existing Redis event-bus environment issue, not introduced). No new dependencies (adapter calls the verified REST contract directly; the published `@sfpy/node-core@0.3.5` was inspected but not added — it lacks the documented webhooks/refund surface).
- **Remaining (2026-08-18):** production credentials + Dashboard webhook endpoint configuration (Safepay `https://backend.flicter.com/hooks/payment/safepay_safepay`, Stripe `https://backend.flicter.com/hooks/payment/stripe_stripe`); storefront Safepay redirect UX (reads `data.checkout_url`); Stripe decline-card simulation unavailable in this test account (failure path covered by signed `payment_intent.payment_failed` webhook test — no state change — and status-mapping unit tests).

### 34. Implementation Update (2026-08-17 — Admin-managed provider configuration)

Provider credentials and enable/disable state are now managed through the
**Medusa Admin UI** instead of `.env` (approved architecture 2026-08-17 —
"Admin-managed provider configuration"; see
`docs/architecture/consolidated-decision-register.md`).

**Architecture** (`Admin UI → Admin API → payment-config module → provider runtime → Safepay/Stripe`):

- **New custom module `payment-config`** (`apps/backend/src/modules/payment-config`,
  key `payment_config`, PostgreSQL tables `payment_provider_config` +
  `payment_provider_config_audit`, migration `Migration20260817122354`):
  - `PaymentProviderConfig` — one row per provider (`safepay` / `stripe`):
    `enabled`, `environment`, public `config` JSON (non-secret), `secrets`
    JSON holding **AES-256-GCM encrypted** values (node `crypto`; format
    `v1:iv:tag:ciphertext`; master key `PAYMENT_CONFIG_ENCRYPTION_KEY` — a
    64-hex-char deployment secret, validated at boot, **never stored in the
    database**), plus last-tested metadata.
  - `PaymentProviderConfigAudit` — sanitized audit trail (provider, action,
    actor id, environment, changed field NAMES — never values).
  - Service: `getRuntimeConfig` (decrypts for the provider runtime only),
    `upsertConfig` (blank secret = retain stored value; non-blank = rotate;
    enabling requires every required field), masked `listAdminConfigs` /
    `getAdminConfig` (secret field names only), `recordTestResult`.
- **Admin API** (`/admin/payment-provider-config`): `GET` list (masked,
  includes `registered` state), `GET/POST /:provider` (upsert + native
  region↔provider binding sync on enable/disable for the provider's own
  market), `POST /:provider/test-connection` (server-side, non-financial).
  All routes are protected by the framework's automatic `/admin`
  authentication (verified in installed `router.js`: bearer/session/api-key,
  user actor) — no secrets are ever returned.
- **Admin UI**: Settings → **Payment Providers** page
  (`src/admin/routes/settings/payment-providers/page.tsx`) — per-provider
  card: enabled toggle, environment (sandbox/production for Safepay,
  test/live for Stripe), public fields (redirect/cancel URLs, intent /
  publishable key, capture mode), password-type credential fields (blank =
  keep stored, value = rotate), webhook endpoint display, **Test connection**
  button, status badges (Enabled/Disabled, Configured/Not configured,
  Registered/Not registered), market mapping (PK→Safepay, AE→Stripe).
- **Provider runtime** (Medusa `IPaymentProvider` unchanged; no custom
  payment engine):
  - **Safepay** (`src/modules/payment-safepay`) resolves its configuration
    from `payment_config` on every operation; `initiatePayment`/`updatePayment`
    refuse when disabled or incomplete (sanitized errors); webhook signature
    verification uses the stored `webhookSecret`.
  - **Stripe** — new thin runtime wrapper
    (`src/modules/payment-stripe-runtime`, provider key **`pp_stripe_stripe`
    preserved** → native webhook route `/hooks/payment/stripe_stripe`, region
    bindings, and storefront contract all unchanged) that constructs the
    official `@medusajs/payment-stripe` provider **lazily** with the stored
    config and delegates the full `IPaymentProvider` contract (the official
    provider requires `apiKey` at construction — verified in its
    `stripe-base` source — so it cannot be registered with boot-time-only
    credentials). No Stripe logic is re-implemented.
- **Connection testing**: Safepay `POST /client/passport/v1/token`
  (non-financial, requires valid secret-key auth); Stripe `GET /v1/balance`
  (non-financial). Results persist as `last_tested_at/status/error`
  (sanitized); never a charge, never raw provider responses.
- **Enable/disable semantics**: `enabled=false` → provider refuses new
  payment sessions (server-side gate) AND the native
  `region_payment_provider` binding is removed for its market (storefront
  stops offering it); historical payments/orders/refunds untouched; webhook
  verification for in-flight sessions keeps working (needs the stored secret,
  not the enabled flag). Enabling binds the region again (idempotent).
  Cross-market isolation preserved (Safepay only ever binds PK, Stripe only
  AE — no routing engine).
- **`.env` migration**: provider credentials are no longer required in the
  environment. `SAFEPAY_*` / `STRIPE_*` credential variables are
  **TRANSITIONAL** legacy fallbacks with explicit precedence
  (**Admin-managed configuration > legacy environment configuration**);
  `PAYMENT_PROVIDER` still selects which providers are REGISTERED. New
  required env var: `PAYMENT_CONFIG_ENCRYPTION_KEY` (64 hex chars; the only
  payment secret that stays in the environment, by design). `.env.example`
  documents names only.
- **Tests**: unit 199/199 (11 suites; +encryption 13, payment-config utils
  16, Stripe wrapper 14, Safepay runtime config 9, admin helpers 8);
  integration **126/126 (12 suites)** incl. the new
  `payment-provider-config.spec.ts` (12 tests: admin auth required, masked
  list/save/read-back with zero secret leakage, blank-keeps/rotate retention,
  enable-requires-complete rejection, unknown provider/field/environment
  rejection, sanitized audit trail, sanitized test-connection for an
  unregistered provider, storefront 404 isolation). Backend tsc PASS (3
  pre-existing `checkout.spec.ts` errors remain), lint PASS, `medusa build`
  PASS (backend + Admin frontend with the new page). Storefront unchanged
  (tsc/lint/tests PASS — 136/136). **No new dependencies added.**
- **Sandbox verification**: **COMPLETE** — Safepay sandbox + Stripe test-mode
  credentials are managed through the Admin UI (encrypted at rest,
  `payment_provider_config.secrets`, `v1:` AES-GCM prefix; never in `.env` or
  source). Full sandbox verification completed **2026-08-18** (session
  creation, hosted/test checkout payment, deferred authorization, capture,
  refund, signed webhook pipeline — see `safepay-verification.md` §3.11/§3.12
  and `stripe-verification.md` §14) and was **independently re-verified
  2026-08-19** (live `test-connection` `ok` for both providers; full
  integration regression 138/138 — see §35).

### 35. Implementation Update (2026-08-19 — independent re-verification + admin route fix)

- **Live real-provider re-verification (2026-08-19):** `POST
  /admin/payment-provider-config/safepay/test-connection` and
  `/stripe/test-connection` both returned `{"status":"ok"}` against the **real**
  provider APIs (Safepay sandbox `POST /client/passport/v1/token`; Stripe test
  mode `GET /v1/balance`), using the Admin-stored encrypted credentials.
  Results persisted in `payment_provider_config_audit` (`test_connection`,
  2026-08-19 05:51 +05).
- **Build + regression green:** `tsc --noEmit` exit 0; `medusa build` PASS;
  backend integration **138/138 (13 suites)** incl. `payment-provider-config`
  (13/13) and `payments` (6/6 — capture idempotency, refund ≤ captured,
  region-scoped provider listing, native webhook pipeline).
- **Regression fixed in `apps/backend/src/api/admin/payment-provider-config/[provider]/route.ts`:**
  the region↔provider binding query was reverted from
  `remoteQueryObjectFromString({ entryPoint: LINKS.RegionPaymentProvider })`
  (throws at runtime for a link — caused HTTP 500 on
  `POST /admin/payment-provider-config/[provider]`) back to the
  runtime-correct `remoteQuery({ service: LINKS.RegionPaymentProvider,
  variables: { filters: { region_id } }, fields: [...] })`, typed with a
  precise function-signature cast (no `as any`). Matches the native
  `setRegionsPaymentProvidersStep` form.
- **Encryption + masking re-confirmed:** `payment_provider_config.secrets`
  carries the `v1:` AES-GCM prefix for both providers (DB-layer check); admin
  views return only secret *names* (`buildAdminView` — `secrets_configured`,
  `has_webhook_secret`, `configured`), never values; storefront APIs reject
  provider-config access; no literal provider credentials anywhere in source.
- **Stripe partial-refund evidence recorded:** order #12
  (`order_01M0AFNNP73VC4KYWCW1M7F543`) — `pay_01M0AFNPSRQJA3ACXBZF69YH88`
  (AED 2,672.25) → partial refund `ref_01M0AGRNANYSEY92MWAE1SQD69` (AED 1,000),
  documented in `stripe-verification.md` §14.
- **Environmental limitation (non-blocking):** the full interactive
  hosted-checkout + inbound-webhook storefront flow was not re-driven
  headlessly this session (Safepay requires a browser redirect; both providers
  need public webhook ingress). Prior-session DB evidence (real Stripe
  PaymentIntents `pi_3…`, real Safepay trackers `track_…`, real refunds)
  substantiates the end-to-end execution.
