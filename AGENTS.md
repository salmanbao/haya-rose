# AGENTS.md — Baby Clothing E-Commerce Platform

Authoritative engineering contract for AI coding agents working in this repository. Read fully before making any change. This is a **greenfield monorepo**: no application code exists yet. Do not implement business features unless explicitly instructed.

## 1. What This Project Is

A production-oriented baby clothing e-commerce platform serving **Pakistan** and the **UAE**, built on **Medusa v2.x** with the recommended **Next.js Medusa storefront starter**. Markets, currencies, and locales: Pakistan (PKR) and UAE (AED). Product domain: baby clothing for Girls, Boys, and Unisex. Real production platform — not a demo or prototype.

## 2. Specification Authority Hierarchy

Authority order for requirements, highest first:

1. Explicit user instruction for the current task
2. Approved project specifications
3. Approved architecture documents
4. Approved ADRs
5. `AGENTS.md`
6. Official documentation for the installed Medusa version
7. Existing implementation
8. Official third-party provider documentation
9. Agent inference

- Higher-priority requirements override lower-priority information.
- Do not silently resolve conflicts between authoritative sources.
- If two authoritative requirements conflict, STOP and report the conflict; do not pick a winner on your own.
- Never choose a business rule simply because it is common industry practice.
- For **technical implementation verification** (not requirement authority), §27 defines the verification order: installed source/types → official documentation for the exact installed version → Context7 documentation for the relevant version → agent inference. Context7 is a development-time verification tool, never a runtime component.
- Existing implementation is evidence of current behavior, not automatically an authoritative specification. Existing behavior must not override an approved requirement or a verified platform contract.

## 3. Architecture Baseline (fixed, do not replace without authorization)

```
Customers → Next.js storefront (Vercel) → Medusa v2 backend (VPS)
                                              ├── PostgreSQL
                                              ├── Redis
                                              └── Cloudflare R2 (product media)
Pakistan: payment provider not yet selected + TCS shipping
UAE:      payment provider not yet selected + Aramex shipping
```

**Payment architecture:** regional provider integration boundaries are required.
- Pakistan: payment provider **not yet selected**.
- UAE: payment provider **not yet selected**.

**Shipping:** TCS = Pakistan, Aramex = UAE.

The agent must not implement a payment provider until the exact provider is selected and its official documentation has been verified. Do not create fake production adapters. Test doubles are allowed only in isolated tests.

- **Medusa v2.x** is the commerce engine. Never recreate Medusa functionality in custom code when Medusa provides it.
- **Standard Medusa Admin** initially. No custom admin app. The Medusa Admin keeps its **native authentication/authorization** (§26).
- **Customer authentication: Medusa-native** (email/password + Google OAuth via Medusa's auth module — §26). No alternative authentication framework is used. The Medusa Admin keeps its native authentication.
- Frontend: **Next.js App Router**, Server Components by default, Client Components only where interactivity requires it. No client-only rendering of SEO-critical content. No duplicating Medusa business logic in the frontend.
- PostgreSQL is the source of truth for persistent commerce state. Redis is only for caching/sessions/rate-limiting/temporary state — never authoritative commerce data.
- No Elasticsearch/OpenSearch, Kafka, microservices, service mesh, or second primary database without explicit authorization.

## 4. Agent Operating Mode

You are an **implementation agent**, not the architect.

- Inspect before modifying; understand before implementing.
- Follow existing architecture and Medusa v2 conventions. Do not copy Medusa v1 patterns.
- Do not invent Medusa APIs. Verify against the **installed** version: inspect `package.json`, lockfiles, installed types/source, official docs. When docs disagree with the installed version, the installed version wins.
- Do not implement features beyond the current task, even if listed in this file (future requirements exist to keep the architecture from blocking them, not to authorize implementation now).
- Do not introduce technologies or dependencies without approval. Check whether Medusa/Next.js already provides the capability first.
- **Medusa-first:** before creating a custom module, entity, workflow, service, endpoint, or persistence layer, inspect the installed Medusa version and determine whether the requirement can be implemented using native Medusa capabilities. Prefer: Medusa native capability → Medusa extension/customization → custom module → custom infrastructure. Only move down the hierarchy when the higher-level capability cannot satisfy the requirement.
- Do not recreate product management, cart logic, pricing, inventory, orders, fulfillment, payment abstractions, customer management, regions/markets, or promotions when Medusa already provides the required capability.
- Material architectural changes (database tech, replacing Medusa/Next.js/PostgreSQL/Redis/R2/Vercel, payments/shipping architecture, microservices, search clusters, auth architecture) require explicit authorization. If one seems necessary: STOP and report (current architecture, problem, why insufficient, proposed change, files affected, migration/testing implications) and wait.
- Per-provider logic must live behind integration boundaries (payments/, shipping/, notifications/, media/). Never leak provider-specific code into checkout UI, order entities, or generic services.
- The specific PK/UAE payment gateways are **not yet chosen**. Do not implement fake gateway adapters or invent provider APIs. Establish integration boundaries only. When a real provider is selected, verify its official docs (auth, payment creation, status lookup, webhook signature, refunds, currencies, sandbox) before coding.

## 5. Business-Rule Non-Invention

**Technical implementation inference is allowed:** you may make reasonable implementation decisions where they do not change business behavior (naming, structure, internal APIs, caching strategy).

**Business-rule inference is forbidden:** you must never invent business rules. Examples of business rules that must not be invented:

- return windows;
- refund eligibility;
- return shipping responsibility;
- whether sale products are returnable;
- COD refund behavior;
- cancellation windows;
- discount stacking;
- review eligibility;
- inventory overselling;
- tax rules;
- payment retry behavior;
- notification consent;
- order status transitions.

When a missing business rule materially affects implementation: STOP and report:

```
Missing business rule:
Why it is required:
Possible options:
Recommended option:
Impact:
```

Wait for authorization.

## 6. First Action Before Any Implementation

Inspect: `package.json`, lockfiles, `tsconfig*`, `next.config.*`, `medusa-config.*`, `.env.example`, source tree, tests, docs, DB/Redis/storage config. Determine exact versions of Medusa, Next.js, TypeScript, package manager, lint/format config, test framework. Do not assume what the repo can tell you.

## 7. Repository Structure

Follow Medusa starter conventions — do not reorganize for style. Keep clear separation: storefront / commerce backend / custom Medusa modules / integrations / shared utilities / tests / docs / infrastructure. Custom functionality goes into the appropriate Medusa extension/module/service/workflow boundary, not a parallel architecture.

## 8. Product & Category Model

- Product model stays simple. Colors and sizes are **product variants** (one product, e.g. "Baby Cotton T-Shirt" with variants 0-3M/White, 0-3M/Blue, …, each with own SKU/barcode/price/inventory/availability). Never create separate products per color.
- Attributes: title, description, gender, category, age range, brand, material, season, care instructions, country of origin, tags, images, SEO metadata.
- Categories come from the **commerce backend**, never hardcoded in the storefront. Initial hierarchy: `Baby Clothing → Girls (Dresses, Tops, Bottoms, Sets, Sleepwear, Outerwear)` and `→ Boys (Shirts, T-Shirts, Bottoms, Sets, Sleepwear, Outerwear)`. Storefront must render any hierarchy without code changes.
- **Category taxonomy and the gender attribute are separate concepts.** Do not add `Unisex` as a category on your own. A product can belong to a category such as `Baby Clothing → Tops` while having `gender = Unisex`. The gender attribute must not dictate category membership unless a future business specification explicitly requires that behavior.
- Keep the hierarchy above as the current **approved initial taxonomy** — do not invent a final category hierarchy. If future business requirements require a separate `Unisex` taxonomy branch, that requires an explicit specification update. Do not create a category merely to make the Unisex example convenient.
- **No custom persistence for product attributes without justification.** Before creating a custom database entity/table/field for any product attribute, determine whether the requirement can be represented using: Medusa native product fields; product variants; product options; categories; collections; tags; metadata; existing Medusa extension mechanisms. Do not create custom persistence simply because the business requirements mention an attribute.
- Bundles must preserve component products, quantities, inventory, pricing, availability, and order representation — never bypass inventory/order accounting.
- Related products are configured in the catalog layer; never hardcode product IDs in React components.

## 9. V1 Feature Scope

In scope: search, filtering, sorting, wishlist (authenticated, server-side), reviews/ratings, coupons/discounts, guest checkout, customer accounts (email/password + Google), order tracking, returns, refunds, abandoned cart, recommendations (simple, no AI), recently viewed, related products, inventory + multiple warehouses + backorders + low-stock notifications, email/SMS/WhatsApp notifications, bundles, variants, size/color variants, multi-language, multi-currency.

**Explicitly excluded from V1** (do not implement unless explicitly requested): gift cards, loyalty program, referral program.

Storefront pages at minimum: Home, category/product listing, product detail, search, filtered results, cart, checkout, login, registration, customer account, orders, order detail, order tracking, wishlist, returns, refund/issue flows.

## 10. Multi-Market, Multi-Currency, Multi-Language

- No Pakistan-only or UAE-only logic hardcoded into generic commerce components. Isolate per-market behavior (currency, gateways, shipping provider, tax, notifications) behind configuration/integration boundaries.
- Currency is commerce configuration, not frontend formatting. Carts, orders, payments, refunds, reporting must preserve currency. Never convert currency silently or in frontend logic; conversion needs an explicit source/rule.
- Centralized i18n strategy; no scattered strings in components. Localize product content and SEO metadata appropriately (no hardcoded conditional rendering).
- Handle per-market locale: phone number formatting, address formatting, tax — do not assume all customers use the same address format.
- The initial language set is **not finalized**. Do not assume English, Urdu, Arabic, or any other language is required unless specified. Build the localization architecture so supported locales are configurable. Do not implement translations that have not been requested. Product localization and storefront localization are separate concerns. SEO metadata must respect the configured locale set.

## 11. High-Risk Domains (treat as such)

### Payments
- Integration boundary per market. Never trust browser-supplied payment status; server-side verification is mandatory. Webhook handlers must be idempotent. Never store raw card data. Handle: initiation, confirmation, async callbacks/webhooks with signature verification, idempotency, retries, duplicates, failed/expired/partial payments, reconciliation, refunds, currency/amount validation.

### Shipping
- TCS (Pakistan) and Aramex (UAE) behind isolated boundaries. Support rate calculation, shipment creation, labels, tracking number/status, cancellation, delivery status, exceptions. Verify actual provider API contracts before implementation; do not invent endpoints. Shipping status never trusted from the client.

### Inventory
- Multiple warehouses, reservations, atomic deductions/restoration, low-stock thresholds, backorders, race-condition protection. Never do read/subtract/write without concurrency protection. Consider races in simultaneous checkout, duplicate callbacks, cancellation, refund, return, fulfillment. Use Medusa's inventory capabilities.

### Orders
- Order state, payment state, fulfillment state, shipment state, return state, and refund state are **independent commerce concerns** that may progress independently — do not force all commerce state into one linear enum. Example: an order may be `fulfilled` + `partially returned` + `partially refunded` at the same time.
- State vocabulary (cart, checkout, payment pending, paid, processing, fulfilled, shipped, delivered, returned, refunded, cancelled) maps to the appropriate concern, not a single order lifecycle.
- Every state change must be a validated transition through Medusa workflows/services — never arbitrary mutation from controllers; invalid transitions fail safely. Follow Medusa's native concepts and workflows wherever possible.

### Returns & Refunds
- Define eligibility, request, approval/rejection, return shipment, inspection, refund eligibility, partial/full refund, cancellation, auditability. Clients can never set an order to refunded. Refunds are idempotent — never process the same refund twice.

### Customer Auth
- Email/password + Google via **Medusa's native auth module** (§26). No plaintext passwords, no custom cryptography when a trusted library/Medusa capability exists. Enforce authorization server-side; a customer can never access another customer's orders, addresses, payment info, returns, refunds, or personal data (IDOR). Better Auth is not used.

### Wishlist / Reviews / Discounts
- Wishlist belongs to authenticated customer, dedupes, handles deleted products, never cross-customer.
- Reviews: rating + text + customer/product association + moderation + timestamps + abuse prevention. Validate rating range server-side; verified-purchase-only is enforced server-side.
- Discounts validated server-side: eligibility, dates, usage limits, customer/product/category restrictions, minimum order value, currency, stacking.

### Abandoned Cart / Recently Viewed
- Abandoned cart: distinguish active vs completed vs expired vs abandoned by explicit server-side rules — never classify a cart as abandoned merely because the browser closed. Abandoned-cart notifications respect customer consent.
- Recently viewed: keep it fast, no heavy per-view DB writes, handle anonymous users gracefully, merge on login if the architecture supports it.

### Search / Filtering / Sorting
- Support search, category, gender, age range, size, color, price, availability, brand, material, season; sort by relevance, newest, price asc/desc, best selling. Filtering happens at the backend/search layer — never by downloading the catalog into the browser. Start with the simplest backend-supported search; no Elasticsearch without demonstrated need.

### Product Media (Cloudflare R2)
- **Medusa-first storage:** use Medusa's native file service/storage provider architecture first. Do not create a custom media abstraction merely because R2 is being used — verify whether Medusa's supported storage/file architecture already provides the required abstraction. Custom media abstractions are permitted only if the native Medusa architecture cannot satisfy the approved requirement.
- Conceptually: `Catalog → Medusa-supported media/file abstraction → Cloudflare R2`. The abstraction (whether native Medusa or approved custom) keeps S3/Cloudinary migration possible without touching catalog logic.
- Never store image binaries in PostgreSQL. The database/catalog retains only appropriate media references/metadata.
- Do not assume the R2 object URL itself is necessarily the customer-facing delivery URL.
- Never store production images in Git or in database records. Validate MIME type and size; never trust user-provided extensions; safe filenames/keys; no path traversal.

## 12. Commerce Invariants

Absolute correctness requirements. Translate each invariant into tests when the corresponding functionality is implemented.

### Payments
- Refunded amount ≤ captured amount.
- A refund cannot exceed the refundable amount.
- A duplicate refund request must produce at most one financial effect.
- A payment cannot be marked successful solely from client-side state.

### Inventory
- Available inventory must not become negative unless explicit backorder/overselling rules permit it.
- Reserved inventory must not exceed the allowed inventory boundary.
- Inventory restoration must be idempotent.
- Cancellation must not restore inventory twice.
- Return processing must not restore inventory twice.
- Fulfillment must not deduct inventory twice.

### Orders
- Order ownership must always be validated server-side.
- Order state changes must be valid for the current state.
- A client must never directly mutate authoritative order/payment/refund/fulfillment state.

### Discounts
- Discounts cannot produce invalid negative totals.
- A discount cannot exceed the amount it is legally allowed to discount.
- Discount eligibility must be evaluated server-side.

## 13. Cart, Checkout, and Price Integrity

Backend is authoritative for: price, variant, inventory, discount, shipping, tax, currency, final total. Never accept frontend-provided prices/discounts/totals. Client selects product/variant → backend resolves price, validates availability, computes discounts/shipping/tax → authoritative transaction. Handle expired carts, changed prices, unavailable inventory, invalid discounts, payment/shipping failure.

## 14. Security (mandatory)

- Protect against: auth bypass, authorization bypass, IDOR, SQL injection, XSS, CSRF, unsafe redirects, file upload attacks, credential/secret leakage, webhook spoofing, price/discount/inventory/payment-status manipulation, race conditions, rate abuse.
- Never trust client-provided: price, discount, inventory, payment status, order ownership, refund status, shipping status, permissions.
- Secrets come from env/deployment secret manager. Maintain `.env.example` with names only. Never commit API keys, passwords, tokens, private keys, DB/Cloudflare/payment credentials. Never expose server-only secrets to the Next.js client.
- Rate-limit auth, password ops, reviews, coupon validation, payment initiation, webhooks, abuse-prone search. All protected endpoints enforce authorization server-side — never rely on hidden UI.
- File uploads: validate MIME, size, extension, content, storage key; never execute uploaded files.
- Never cache personalized data (cart, checkout, account, order, payment, wishlist) publicly. Cached product/category pages must not leak customer-specific data, stale prices, wrong inventory/locale/currency.
- **Admin authorization:** administrative operations must be authorized server-side. Do not assume every authenticated admin user can perform every sensitive operation. Sensitive operations — refunds, price changes, inventory adjustments, customer-data access, order cancellation — follow the platform's authorization model. Never rely on frontend button visibility for authorization. Do not create custom RBAC infrastructure unless explicitly required.

## 15. Transactions, Idempotency, Webhooks, Validation

- Multi-entity changes (order+payment, inventory+order, refund+payment, return+inventory) need proper transaction boundaries — sequential writes are not atomic.
- Idempotency mandatory for retriable operations: payments, webhooks, refunds, order creation, fulfillment, shipping creation, notifications, external callbacks.
- Every webhook: authentication, signature verification, payload validation, idempotency, replay/duplicate protection, out-of-order handling, retries, failure handling, logging. Never trust arbitrary payloads or assume delivery order.
- Validate external input at boundaries (HTTP, query/path params, forms, webhooks, payment/shipping responses, uploads, env vars, external API responses). TypeScript types do not validate runtime data — use runtime validation where appropriate.
- Errors: predictable, safe, observable. Never expose stack traces/DB errors/secrets to customers. No silent `catch {}` without a documented reason.
- Logging: structured, with request/order/customer/payment/shipment/provider context. Never log passwords, tokens, card data, secrets, keys.
- **Medusa data ownership:** Medusa-managed commerce data must remain owned by Medusa's supported data model and workflows. Custom application data must have an explicit ownership boundary. Do not directly manipulate Medusa-managed database tables to bypass workflows. Do not perform raw SQL mutations against Medusa commerce state when a supported Medusa service/workflow/module API exists. Direct database access may be used for: diagnostics; read-only reporting where appropriate; migrations through supported mechanisms; explicitly approved custom module data. Never bypass transactional commerce workflows merely because direct database mutation is easier.

## 16. Testing (strict TDD)

- **Every behavior-changing task requires tests:** understand → write test → confirm it fails → minimal implementation → test passes → refactor → regression suite. Tests verify behavior, not coverage.
- Narrow exemptions only: documentation-only changes; formatting-only changes; purely mechanical changes with no behavioral impact. You cannot classify a behavior-changing feature as "trivial" to avoid writing tests.
- Testing pyramid: unit / integration / API / workflow / E2E. Use real integration tests for DB, Redis, Medusa workflows, provider contracts; mock only when the external system is unavailable, isolation is the goal, or determinism is required. No mock-driven development.
- A feature is **not complete** if: tests missing or not verifying the requirement, only happy paths covered, error paths missing, concurrency risks ignored, integration untested, or TypeScript/lint/build fails, or existing tests regress.
- Tests must verify behavior and business invariants (see Commerce Invariants), not merely increase coverage numbers.
- Cover edge cases in high-risk workflows: empty/invalid input, duplicates, duplicate webhooks, expiry, unauthorized access, wrong customer/currency, invalid amount, out-of-stock, concurrent checkout, payment/refund/shipping failure, external timeouts/retries, partial failure.
- E2E coverage for critical flows: browse, search, filter, product selection, add to cart, guest + customer checkout, payment flow, order creation/tracking, return, refund, wishlist (sandbox providers allowed).
- Deterministic test fixtures/factories; tests never depend on production or stray local DB data; proper setup/cleanup/migrations.
- Integration contract tests for third parties: request construction, auth, response parsing, error handling, timeouts, retries, webhook validation, idempotency.
- Migrations must be migration-safe; never edit production schema manually; consider existing data on delete/rename.

## 17. Definition of Done & Quality Bar

A feature is complete only when ALL apply: architecture inspected, Medusa capability verified, tests written first, implementation done, happy/failure/authorization/validation paths tested, idempotency and concurrency considered, integration behavior tested, TypeScript passes, lint passes, unit/integration/E2E tests pass where applicable, build passes, docs updated, no unrelated files changed, no secrets introduced, no unauthorized architecture change. **The UI rendering is not completion.**

- Code quality: simple, explicit, small functions, cohesive modules, strong types, predictable behavior. Avoid premature abstractions, speculative config, duplicated business rules, giant services/components.
- TypeScript strict. No `any` to silence errors, no unsafe assertions; validate unknown external data at boundaries.
- Never invent API request/response shapes. Verify Medusa APIs against the installed version and third-party APIs against current official docs.
- Dependency discipline: check Medusa/Next.js existing capability before installing anything; consider maintenance, security, bundle impact.
- **Dependency version discipline:** do not upgrade, downgrade, replace, or pin dependencies unless explicitly authorized or required to resolve a verified compatibility/security issue. Dependency version changes must be reported. Do not perform opportunistic upgrades while implementing unrelated features. This is particularly important because the project explicitly targets Medusa v2.
- **Medusa version lock:** the project targets the Medusa v2 version selected during initialization. Do not migrate to another Medusa major/minor release merely because newer documentation or examples exist. If a dependency/version change is required because of security, compatibility, or an unavoidable platform limitation, report:
    ```
    Current version:
    Proposed version:
    Reason:
    Compatibility impact:
    Migration impact:
    Tests required:
    ```
    and wait for authorization unless the current task explicitly authorizes the change.
- **Dependency installation protocol:** before adding any dependency: (1) search the repository for an existing solution; (2) inspect `package.json`; (3) inspect the lockfile; (4) check Medusa capability; (5) check Next.js capability; (6) check existing project utilities; (7) determine whether a dependency is actually necessary. Do not add packages for convenience when an existing project capability is sufficient. Any newly added dependency must be reported with:
    ```
    Package:
    Purpose:
    Why existing dependencies/platform capabilities are insufficient:
    Security/maintenance considerations:
    ```
- Preserve backward compatibility with existing customers/orders/carts/products/integrations.
- Use stable business identifiers (order, payment, shipment, return, refund, customer, product, variant, warehouse); don't expose DB internals unnecessarily.
- Change scope: only files needed for the task. No unrelated reformatting, upgrades, renames, or "cleanup."

## 18. Notifications, Background Work, Observability, SEO

- Email/SMS/WhatsApp behind provider boundaries. Notification failure must not roll back the underlying order/payment operation. Notifications are never the source of truth for business transactions.
- **Communication consent:** transactional notifications and marketing/promotional communications are different categories. For email, SMS, and WhatsApp, respect the project's consent requirements. Marketing and abandoned-cart communications must not be sent merely because a customer has a phone number or email address. Transactional notifications required to fulfill an order are distinct from marketing communications. Do not invent legal/compliance requirements; if the project requires a specific consent policy, it must be explicitly specified.
- Background jobs may be used for: notifications; external synchronization; retries where appropriate; non-critical long-running work; reconciliation; other explicitly asynchronous operations.
- Transactional operations that require atomic request-time correctness must not be moved into asynchronous jobs merely for convenience.
- Do not move authoritative order/payment/inventory mutations into asynchronous processing unless the approved architecture explicitly requires it and correctness is preserved.
- Observability: API/payment/webhook/shipping/inventory/DB/job/notification failures, slow requests. Use existing platform capabilities first; no expensive stack without a requirement.
- SEO is first-class, not polish: SEO-friendly slugs (e.g. `/baby-clothing/girls/dresses`, `/products/baby-cotton-dress`), canonical URLs, title/description, Open Graph, robots.txt, XML sitemap, JSON-LD (Product, Breadcrumb, Organization), localized metadata, heading hierarchy, semantic HTML, alt text, optimized images, server-rendered indexable content. No DB IDs as public URLs. Slugs changes affect SEO — treat carefully.
- **Filter/query parameter indexing:** search and filtering query parameters (`?page=2`, `?color=blue`, `?size=6-12m`, `?sort=price-desc`, `?gender=boys`) require an explicit canonicalization/indexing strategy. Do not automatically make every filter combination indexable; prevent uncontrolled generation of indexable URLs from arbitrary query parameter combinations. Canonical URLs, robots directives, pagination behavior, and sitemap inclusion must be deliberate.
- **Structured data integrity:** derive product identity from authoritative catalog data; SKU from authoritative variant/catalog data; price from authoritative commerce pricing; currency from the active market/currency context; availability from authoritative inventory state. Never hardcode price/currency/availability in structured data; structured data must not claim availability or pricing that differs from the rendered authoritative commerce state. Do not invent unsupported schema properties.

## 19. Audit Logging

- Sensitive administrative/business actions should have an auditable record where appropriate: refunds; manual inventory adjustments; price changes; order cancellation; payment status overrides; shipping status overrides; customer account changes; administrative permission changes.
- Administrative overrides must never silently alter authoritative commerce state.
- The exact audit implementation must follow Medusa capabilities and the project's approved architecture. Do not create a custom audit subsystem prematurely if Medusa already provides a suitable mechanism.

## 20. Performance, Accessibility, UX

- Avoid unnecessary client JS, N+1 requests, unbounded queries, full-catalog downloads, huge images, repeated identical requests, blocking ops on request paths. Use pagination, caching, revalidation, Redis, indexes. Measure before optimizing.
- Clear states for loading/empty/success/failure/retry/out-of-stock/payment pending-failed/order processing/shipment/return/refund pending. No silent failures.
- Semantic HTML, keyboard nav, visible focus, labels, accessible form errors, alt text, contrast, screen-reader compatibility. ARIA only when needed, never to patch invalid HTML.
- Mobile-first responsive across mobile/tablet/desktop (market is mobile-heavy).

## 21. Architecture Decision Records & Docs

- Keep `docs/` (architecture, modules, api, database, integrations, testing, infrastructure, decisions). ADR format: Context / Decision / Alternatives / Consequences.
- ADR required for: database changes, major infrastructure, payment/shipping/auth/storage architecture, significant Medusa customization, new external service, major frontend architecture change. Not for trivia.
- Docs must describe what actually exists — never document unbuilt functionality.

## 22. Development Order (guidance, not authorization)

Repo is greenfield. Establish a stable foundation first; do not implement every feature at once. Dependency-aware general order: repo/tooling → Medusa + Next.js foundation → PostgreSQL/Redis/local development foundation → markets/currencies/regions configuration → inventory/locations/warehouses foundation → media/storage foundation (R2) → catalog/products/categories/collections/variants → storefront foundation → SEO foundation → browsing/search/filter/sorting → customer authentication → cart/checkout foundation → payment integration boundaries → selected payment providers → shipping integration boundaries → TCS/Aramex integrations → orders/fulfillment/tracking → returns/refunds → wishlist → reviews → coupons/discounts → recommendations/related products → recently viewed → abandoned cart → notifications → localization expansion → security hardening → performance → complete E2E/regression → production readiness. This remains guidance, not authorization to implement all features; the exact implementation order must still respect actual Medusa module dependencies discovered after repository initialization.

## 23. Task Execution Template & Reporting

For every non-trivial behavior-changing task, follow this full sequence — never skip directly from requirement to implementation:

```
UNDERSTAND
↓
LOCATE SPECIFICATION
↓
INSPECT EXISTING IMPLEMENTATION
↓
IDENTIFY MEDUSA CAPABILITIES
↓
IDENTIFY AFFECTED MODULES
↓
IDENTIFY DATA CHANGES
↓
IDENTIFY API CHANGES
↓
IDENTIFY SECURITY/AUTHORIZATION REQUIREMENTS
↓
IDENTIFY FAILURE/EDGE CASES
↓
WRITE TESTS
↓
CONFIRM TESTS FAIL
↓
IMPLEMENT MINIMAL CHANGE
↓
RUN TARGETED TESTS
↓
RUN REGRESSION TESTS
↓
TYPECHECK
↓
LINT
↓
BUILD
↓
REVIEW DIFF
↓
CHECK ARCHITECTURE DRIFT
↓
UPDATE DOCUMENTATION
↓
REPORT
```

**Architecture drift** (relevant to the CHECK ARCHITECTURE DRIFT step) includes, but is not limited to:
- introducing a new architectural layer;
- bypassing Medusa capabilities;
- introducing another primary database;
- introducing a new external service;
- introducing a message broker;
- introducing Elasticsearch/OpenSearch;
- changing data ownership;
- changing payment/shipping integration boundaries;
- moving authoritative business logic into the frontend;
- changing authentication architecture;
- changing deployment topology;
- changing the role of Redis;
- creating a parallel commerce engine;
- replacing a Medusa workflow with custom logic without justification.

Architecture drift must be reported even if the implementation technically works. If architecture drift is required to satisfy a verified requirement: STOP and request explicit authorization.

**No placeholder production logic:** never fake production implementations. Forbidden examples: `return { success: true };` for an unimplemented payment provider; `order.status = 'paid';` because the real gateway has not been integrated; `shipment.trackingNumber = 'TEST123';` in production logic. Mocks/fakes are allowed only inside explicitly isolated tests/dev fixtures. Production code must not pretend that an external operation succeeded.

**Completion report format:**
```
Implemented: ...
Tests: ...
Verification: TypeScript/Lint/Unit/Integration/E2E/Build: PASS or FAIL
Files changed: ...
Architecture changes: ...
```
Never claim PASS for a check not actually run; never hide failing tests.

**Failure protocol:** if implementation cannot be completed safely, STOP. No invented behavior, no placeholder logic that looks complete. Report: Problem / Evidence / Impact / Required decision / Recommended solution. Wait for instruction when the decision affects architecture or business correctness.

## 24. Priority When Requirements Conflict

1. Security → 2. Data integrity → 3. Payment correctness → 4. Order correctness → 5. Inventory correctness → 6. Authorization → 7. Functional correctness → 8. Reliability → 9. SEO → 10. Performance → 11. UX polish → 12. Developer convenience.

Never sacrifice payment/order/inventory correctness for UI convenience.

## 25. Final Rule

**Do not guess when correctness matters.** Inspect, verify, test — then implement. Medusa APIs, payment APIs, shipping APIs, webhook contracts, database behavior, auth behavior, and security-sensitive operations must be verified, never assumed. Keep the implementation as simple as the business requirements allow; Medusa already provides the commerce foundation — use it.

## 26. Authentication & Authorization Architecture (approved)

### 26.1 Approved technology
- **Medusa-native authentication** is the approved customer authentication architecture: email/password (enabled in the baseline) + Google OAuth (provider installed; configuration pending). Medusa's auth module is the authoritative authentication integration for customer accounts.
- **Better Auth: NOT USED.** A previous proposal to adopt Better Auth was reviewed and rejected (historical note in `docs/architecture/gap-analysis.md`). No alternative authentication framework may be introduced without explicit architecture authorization.
- Medusa is the source of truth for customer identity AND customer/commerce data (customers, addresses, carts, orders, payments, inventory, fulfillment).
- The **Medusa Admin keeps its native authentication/authorization** (§3). Customer authentication and Admin authentication are separate domains; a customer session never grants Admin access.
- Reference: `docs/architecture/authentication-authorization.md`.

### 26.2 One source of truth — no competing auth systems
- Exactly one authoritative customer authentication mechanism: Medusa's auth module.
- Do not run Medusa customer auth + another framework + separate Next.js auth as independent systems.
- Do not create authentication persistence outside Medusa's native architecture (no custom auth tables; no auth database outside the Medusa PostgreSQL database).
- No custom cryptography; never manually recreate OAuth.
- Customer authorization is enforced server-side through Medusa's mechanisms and explicit ownership checks (§26.3).

### 26.3 Identity integrity invariants (mandatory)
- A customer must never access another customer's Medusa resources.
- Customer authorization must be enforced server-side.
- Customer identity must never come from an arbitrary browser-provided customer ID.
- Session identity must be verified server-side.
- Medusa customer identity must be derived from Medusa's authenticated auth identity.
- Order ownership must always be checked server-side.
- Wishlist ownership must always be checked server-side.
- Review ownership must always be checked server-side.
- Return/refund ownership must always be checked server-side.
- Customer addresses must be scoped to the authenticated customer.
- Authentication state must never be inferred solely from frontend state.

### 26.4 Storefront authentication handling
- Customer authentication flows through the Medusa auth API (e.g., `/auth/customer/{provider}`) via the Medusa JS SDK; the storefront persists the session server-side (httpOnly cookie) and sends it with store API requests.
- Never trust client-provided auth state; never store Medusa credentials in the browser beyond the intended session cookie.
- Verify exact flows (login, token/session, logout, refresh, password reset, email verification) against installed Medusa 2.19.0 before implementation (§27).

### 26.5 Admin security
- Administrative authorization is independent from customer authorization. "Customer authenticated" never implies "admin authorized".
- Never expose admin functionality through storefront authentication.
- Sensitive administrative operations (refunds, inventory adjustments, price changes, customer-data access, order cancellation, fulfillment/shipping changes, payment overrides, administrative configuration) follow Medusa's supported Admin authorization model, enforced server-side.

### 26.6 Auth provider configuration discipline
- Email/password is ENABLED in the baseline (verified). Google OAuth requires configuring the installed `@medusajs/auth-google` provider; its options are `clientId`, `clientSecret`, `callbackUrl` (verified in installed source). Verify all configuration against installed Medusa 2.19.0 and official docs (§27); do not invent option names.
- No new authentication dependencies may be introduced without explicit architecture authorization.

### 26.7 Database ownership
- No authentication database outside Medusa. Do NOT create custom authentication tables (no auth users/sessions/accounts/verification tables outside Medusa's native schema).
- Authentication persistence follows Medusa's native architecture within the Medusa PostgreSQL database.

## 27. Medusa Documentation Verification (Context7)

### 27.1 Context7 MCP is a development-time tool
- Context7 MCP is an approved DEVELOPMENT-TIME documentation verification mechanism for coding agents. It is NOT a runtime dependency, production service, application API, database, backend service, or authentication service. It must never appear in the production architecture.
- Purpose: verify Medusa 2.19.0 APIs and Medusa Admin extension APIs before writing code.

### 27.2 Mandatory verification rule
- Before implementing Medusa-specific functionality, the coding agent MUST verify the relevant API against the INSTALLED Medusa version using the available Context7 MCP documentation where applicable — including: Medusa modules; workflows; workflow steps; API routes; API middleware; authentication; authorization; data models; product APIs; product categories; inventory; pricing; carts; checkout; payments; fulfillment; returns; refunds; promotions; customer APIs; Admin APIs; Admin extensions; Admin UI components; Admin SDK; module registration; module links; storage providers.
- The installed package version remains authoritative for compatibility. Context7 documentation must NOT be blindly trusted if it conflicts with the actual installed Medusa 2.19.0 implementation. If Context7 exposes documentation for a different Medusa version, do not apply it.

### 27.3 Technical verification hierarchy
1. Explicit project specification
2. Approved architecture decision
3. Installed source/types/API contracts
4. Official documentation for the exact installed version
5. Context7 documentation for the relevant version
6. Agent inference

This hierarchy governs technical implementation verification and complements (does not replace) the authority hierarchy in §2.

### 27.4 Verification record
- For every implementation task involving Medusa, before coding, produce a short internal verification record (never paste into production code):

```
Medusa version:
Relevant package/module:
Relevant API:
Context7 verification:
Installed source/type verification:
Compatibility result:
Implementation boundary:
```

- Never assume an API exists because it appears in an old Medusa tutorial, a v1 example, a random GitHub repository, an outdated Stack Overflow answer, or an LLM-generated example.

### 27.5 Medusa Admin extension requirement
- The project uses the standard Medusa Admin initially; custom Admin UI functionality comes later.
- When implementing custom Medusa Admin functionality the agent MUST: identify the exact installed Medusa Admin version; inspect the installed Admin SDK/types/source; verify the Admin extension mechanism through official documentation; use Context7 MCP to verify relevant Admin extension APIs where available; implement using the supported Medusa Admin extension architecture; avoid replacing the Medusa Admin; avoid creating a separate custom admin application unless explicitly authorized.
- Custom Admin functionality remains an extension of the standard Medusa Admin. Do not build a parallel React admin dashboard.
