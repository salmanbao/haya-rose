# Business Decision Questionnaire

**For:** Product owner review and approval
**Source:** `consolidated-decision-register.md` (119 business decisions)
normalized to `business-decision-dependency-graph.md` (89 canonical, 17
questions here).
**Status: RESOLVED — all 40 user decisions answered and APPROVED by the
product owner (2026-08-16).** See `consolidated-decision-register.md` for the
final status of every canonical decision. This questionnaire retains the
original options/recommendations for traceability; the selected options are
recorded inline below.
**Rule:** nothing was implemented from this document; provider contract
verification and numeric tax rates remain outstanding implementation gates
(not business decisions).

**How to use this document**

1. Answer the **17 foundational questions** (full format) first. Each answer
   auto-determines the DERIVED decisions listed under it — you do not answer
   those twice.
2. Then tick the **quick decisions** (Part B — 23 compact rows, ~1 minute
   each; mostly P1, two P2 with safe defaults).
3. P2/P3 decisions are listed for reference only — they can wait; defaults
   are shown but changing them later will not require rework.
4. Provider contract details (endpoints, payloads, webhooks, signatures,
   retries) are **verification tasks, not decisions** — not asked here.

**Status legend:** every answer you give becomes `APPROVED`. Decisions you do
not touch stay `RECOMMENDED_NOT_APPROVED` or `DERIVED`/`DEFERRED`.

---

# PART A — Foundational decisions (answer all 17)

13 strict-P0 decisions (must be answered before any commerce implementation)
plus 4 coupled Orders/Returns policy questions (BD-O-02 cancellation,
BD-R-01 return window, BD-R-02/04 approval/inspection, BD-R-03 eligibility)
that are P1 in blocking terms but bundled here because they couple to the
P0 cluster (COD, refund policy) and asking them together avoids re-asking
later.

---

## BD-M-01 — Market selection: how is the customer's market determined?

**✅ APPROVED — Option A (hybrid): URL country-code paths (`/pk`, `/ae`)
are canonical; geolocation *suggests* the market on first visit; an explicit
market selector is the manual override. The confirmed customer market choice
is authoritative; raw browser geolocation is never authoritative.**

### Question

When a customer first visits the storefront, what is the authoritative
source that determines whether they are shopping in Pakistan or the UAE?

### Why this matters

This is the root of the dependency tree: it sets the region, currency (PKR /
AED), pricing, tax, payment providers, shipping options, and SEO structure.
Every downstream decision assumes an answer here (dependency graph §3.1).

### Options

#### Option A — URL country code (e.g., `/pk/...`, `/ae/...`)

Description: The market is derived from the URL path; unknown codes redirect
to a default region; an explicit selector can override.
Impact: Two storefront entry points; clean per-market SEO; region resolved
server-side (REQ-MP-022).
Advantages: SEO-first per AGENTS.md §18; deterministic; indexable; matches
the starter's existing middleware.
Disadvantages: Requires per-market default-region policy; cross-border
shoppers must switch explicitly.

#### Option B — Explicit country selector + persisted preference

Description: Customer picks a market; choice stored in a cookie/profile.
Impact: Better UX for cross-border; URL stays country-less, complicating
per-market SEO/canonicalization.
Advantages: Simpler URLs; persisted preference.
Disadvantages: Conflicts with per-market SEO canonicalization (AGENTS.md
§18); needs cookie/account persistence.

#### Option C — Shipping address / profile / IP geolocation

Description: Market inferred from address entry or geolocation.
Impact: Most accurate per order; poor for anonymous browsing and SEO;
proxy-unreliable for IP.
Advantages: Accuracy at checkout.
Disadvantages: Non-deterministic; bad SEO; needs login or address entry.

### Recommended

**Option A — URL country code**, with an explicit selector as an override.

**Status: APPROVED (2026-08-16)** — see the ✅ marker at the top of this section for the selected option.

### Affected decisions

- DERIVED: BD-M-09 default region per market; BD-C-04 market/currency
  switching; BD-C-05 guest email (via BD-G-01); BD-C-07 guest conversion.
- Depends on it: BD-M-02, BD-M-04, BD-P-01/02/03, BD-S-01, BD-I-01,
  BD-G-01, BD-O-01.

### Affected requirements

REQ-MP-001, REQ-MP-007, REQ-MP-008, REQ-MP-022, REQ-MP-023, REQ-MP-033,
REQ-CC-004, REQ-PAY-003.

### My decision

[ ] Option A  [ ] Option B  [ ] Option C  [ ] Other: __________

---

## BD-M-02 — Tax model: what tax rates apply in Pakistan and the UAE?

**✅ APPROVED (policy) — Option A: standard per-market tax rates configured
as Medusa tax regions. Numeric PK GST and AE VAT values remain outstanding
user input (zero-rate interim placeholder; changing rates does not rewrite
historical orders — REQ-MP-030).**

### Question

What tax configuration applies to orders in each market (rates, and whether
prices are shown tax-inclusive or tax-exclusive)?

### Why this matters

Determines order totals, pricing display, tax regions configuration, and the
tax component of refunds (BD-R-05). Cannot be guessed (AGENTS.md §5) — tax
rates are a legal/business decision per market.

### Options

#### Option A — Standard rates per market (values supplied by you)

Description: You provide the applicable PK and AE tax rates (and any
registration/zero-rating rules); Medusa tax regions are configured per
market; display mode chosen in BD-M-03.
Impact: Correct totals and refunds; requires your rate values.
Advantages: Accurate; Medusa-native (tax region config).
Disadvantages: You must supply the rates; legal verification needed.

#### Option B — Zero-rate / no tax initially

Description: Configure tax regions with 0% rates for both markets.
Impact: Simplest start; totals exclude tax; refunds exclude tax.
Advantages: Unblocks implementation; no legal rate input.
Disadvantages: Incorrect once real rates apply; display/refund math must be
re-visited (rate change does not rewrite historical orders — REQ-MP-030,
so low rework).

#### Option C — Per-market inclusive/exclusive mix (PK inclusive, AE exclusive, etc.)

Description: Different display mode per market.
Impact: Matches local convention if it differs; more config.
Advantages: Market-correct.
Disadvantages: More config; must be explicitly specified per market.

### Recommended

**Option A** (rates supplied by you) with **Option B as a temporary
implementation default** if rates are not yet known — zero-rate regions can
be updated without affecting historical orders.

**Status: APPROVED (2026-08-16)** — see the ✅ marker at the top of this section for the selected option.

### Affected decisions

- DERIVED: BD-M-03 (display), BD-S-16 (shipping tax), tax portion of
  BD-R-05.
- Depends on: BD-M-01.

### Affected requirements

REQ-MP-020, REQ-MP-029, REQ-CC-011, REQ-CC-012, B-CC-12, REQ-RET-017.

### My decision

[ ] Option A (rates: PK = ___, AE = ___)  [ ] Option B  [ ] Option C
[ ] Other: __________

---

## BD-M-04 — Discounts: can multiple promotions stack?

**✅ APPROVED — Option A: single active promotion per cart (no stacking);
native `updateCartPromotionsWorkflow` behavior.**

### Question

When a cart is eligible for more than one promotion (coupon, automatic
discount), which apply, and in what order?

### Why this matters

Determines promotion configuration, cart totals, and how discounts are
re-allocated on refunds (BD-R-05 → discount recalc). AGENTS.md forbids
inventing this (B-MP-04, B-CC-11).

### Options

#### Option A — Single active promotion (no stacking)

Description: One promotion (code or automatic) applies per cart; applying a
new one replaces the previous (native `updateCartPromotionsWorkflow`
behavior).
Impact: Simplest; predictable totals; simplest refund allocation.
Advantages: Low complexity; native support; deterministic.
Disadvantages: No multi-discount offers.

#### Option B — Stacked with priority order

Description: Multiple promotions apply in a defined priority (e.g.,
percentage first, then fixed amount), bounded by a cap.
Impact: Richer offers; needs promotion-priority configuration and
verification of native rule support.
Advantages: Competitive offers.
Disadvantages: More config; refund discount re-allocation is more complex
(BD-R-05); priority must be defined.

#### Option C — Stacked percentage-only / fixed-only

Description: Multiple promotions of the same application type stack; mixed
types do not.
Impact: Middle ground.
Advantages: Bounded complexity.
Disadvantages: Still needs priority + refund recalc rules.

### Recommended

**Option A — single active promotion** for V1.

**Status: APPROVED (2026-08-16)** — see the ✅ marker at the top of this section for the selected option.

### Affected decisions

- DERIVED: BD-M-05 (minimum order value), discount-recalc component of
  BD-R-05.
- Depends on: BD-M-01.

### Affected requirements

REQ-MP-021, REQ-CC-010, B-CC-11, B-RET-11.

### My decision

[ ] Option A  [ ] Option B  [ ] Option C  [ ] Other: __________

---

## BD-M-08 — Cross-currency refunds: may a refund ever be issued in a
different currency than the order?

**✅ APPROVED — Option A: cross-currency refunds refused; refunds always in
the order's original currency (PKR/AED).**

### Question

Orders are in PKR or AED. If a refund must be issued, may it ever be in the
other currency?

### Why this matters

AGENTS.md §10 forbids silent conversion; the default in all specs is to
refuse cross-currency refunds (B-MP-09, B-PAY-09, REQ-ORD-021, REQ-RET-023).
This confirms the policy explicitly.

### Options

#### Option A — Refuse cross-currency refunds (refund in order currency only)

Description: Refunds are always in the order's original currency; a
cross-currency refund is rejected/blocked.
Impact: No conversion anywhere; simplest and safest.
Advantages: Complies with AGENTS.md §10; no FX risk.
Disadvantages: None for the stated business (two fixed markets).

#### Option B — Allow conversion with an explicit approved rate source

Description: Refund issued in the other currency at an approved rate.
Impact: Requires an FX rate source, rate policy, and accounting rules.
Advantages: Flexibility.
Disadvantages: Violates the no-conversion principle unless explicitly
authorized; adds FX complexity.

### Recommended

**Option A — refuse cross-currency refunds** (aligns with every spec's
default).

**Status: APPROVED (2026-08-16)** — see the ✅ marker at the top of this section for the selected option.

### Affected decisions

BD-R-05 (refund policy), BD-P-08 (partial refunds).

### Affected requirements

REQ-MP-002, REQ-MP-011, REQ-MP-031, REQ-PAY-002, REQ-ORD-021, REQ-RET-023.

### My decision

[ ] Option A  [ ] Option B  [ ] Other: __________

---

## BD-P-01 — Pakistan payment provider

**✅ APPROVED (selection) — AssanPay Pakistan (PKR). This REPLACES the
earlier xPay selection (provider replacement requested before
implementation). Contract verification (PKR support, sandbox, refunds,
webhooks, signatures) is PROVIDER_VERIFICATION_REQUIRED against official
AssanPay documentation before implementation — the selection is approved,
the integration is not. See
`docs/architecture/provider-verification/assanpay-verification.md`.**

### Question

Which payment provider processes Pakistan (PKR) payments?

### Why this matters

Gates all PK payment flows (REQ-PAY-022). Provider capabilities (partial
capture, refunds, COD support, webhooks) are verified against official docs
after selection — you are choosing the provider, not its API details.

### Options

#### Option A — Card provider (e.g., Stripe, if available in PK)

Description: Standard online card payments via a provider supporting PKR.
Impact: Full payment module integration; webhooks; refunds.
Advantages: Mature; well-documented.
Disadvantages: Availability of the exact provider in Pakistan (PKR) must be
verified — do not assume.

#### Option B — Local PK provider (e.g., JazzCash / Easypaisa / bank gateway)

Description: Pakistan-specific payment methods (wallets, bank transfer,
installments) via a local gateway.
Impact: Local-market fit; provider contract UNVERIFIED.
Advantages: Market-appropriate; may support COD-adjacent flows.
Disadvantages: Contract must be verified from official docs; integration
effort.

#### Option C — No provider yet; keep payments unconfigured

Description: Defer provider selection; do not implement payment flows.
Impact: Checkout cannot complete payments; implementation blocked on
payments.
Advantages: None.
Disadvantages: Blocks the payments domain and full checkout.

### Recommended

**Option B — a local PK provider**, selected after verifying official
documentation (sandbox, PKR, refunds, webhooks). If you have a preferred
provider, name it; capability verification happens later, not here.

**Status: APPROVED (2026-08-16)** — see the ✅ marker at the top of this section for the selected option.

### Affected decisions

- DERIVED: BD-P-04 (methods), BD-P-07 (partial capture), BD-P-12 (fraud).
- Depends on: BD-M-01. Interacts with BD-P-03 (COD).

### Affected requirements

REQ-PAY-001, REQ-PAY-003, REQ-PAY-022, REQ-PAY-026.

### My decision

[ ] Option A (name: ___)  [ ] Option B (name: ___)  [ ] Option C
[ ] Other: __________

---

## BD-P-02 — UAE payment provider

**✅ APPROVED (selection) — Stripe (AED). Contract verification (AED
support, refunds, webhooks, signatures) is PROVIDER_VERIFICATION_REQUIRED
against official Stripe documentation before implementation — the selection
is approved, the integration is not.**

### Question

Which payment provider processes UAE (AED) payments?

### Why this matters

Gates all AE payment flows (REQ-PAY-023). Same rules as BD-P-01 — you choose
the provider; API details are verified later.

### Options

#### Option A — Card provider available in UAE (e.g., Stripe/Checkout.com/Adyen)

Description: Standard online card payments in AED.
Impact: Full payment module integration.
Advantages: Mature; well-documented; AED support likely.
Disadvantages: Provider availability in UAE must be verified.

#### Option B — Local/regional UAE provider

Description: UAE-specific gateway (e.g., local acquirers, card + wallets).
Impact: Market fit; contract UNVERIFIED.
Advantages: Local methods.
Disadvantages: Contract verification effort.

#### Option C — No provider yet

Description: Defer; payment flows unconfigured.
Impact: Blocks AE payments.
Advantages: None.
Disadvantages: Blocks checkout.

### Recommended

**Option A — a card provider verified to support AED**, or **Option B** if
you have a UAE-specific preference. Name your choice; contract verification
follows selection.

**Status: APPROVED (2026-08-16)** — see the ✅ marker at the top of this section for the selected option.

### Affected decisions

- DERIVED: BD-P-04, BD-P-07, BD-P-12.
- Depends on: BD-M-01.

### Affected requirements

REQ-PAY-001, REQ-PAY-003, REQ-PAY-023, REQ-PAY-026.

### My decision

[ ] Option A (name: ___)  [ ] Option B (name: ___)  [ ] Option C
[ ] Other: __________

---

## BD-P-03 — Cash on Delivery (COD)

**✅ APPROVED — Option A: no COD in V1. All orders paid online at checkout
(AssanPay PK, Stripe AE).**

### Question

Will the platform offer Cash on Delivery, and in which markets?

### Why this matters

COD is the most cross-cutting unresolved decision (B-PAY-03, B-MP-12,
B-CC-14, B-SHIP-06, B-ORD-12): it changes payment states (order exists while
unpaid), cancellation-after-payment rules (BD-O-03), fulfillment gating
(BD-S-19), and refund flows (BD-R-05). It also affects whether the Medusa
system provider (`pp_system_default`) is used for offline/order states.

### Options

#### Option A — No COD in V1 (online payment only)

Description: All orders paid online at checkout.
Impact: Standard payment lifecycle; simplest.
Advantages: No offline payment states; no COD refund complexity; aligns with
provider-based flow.
Disadvantages: Excludes customers who prefer COD (common in PK).

#### Option B — COD in Pakistan only

Description: COD offered for PK orders; online payment required for AE.
Impact: PK orders may exist with payment pending until delivery; requires
an offline-payment representation (system provider or custom offline flow —
a technical decision after this choice).
Advantages: Market-appropriate for PK.
Disadvantages: COD order states, cancellation, fulfillment gate, and refunds
(which are manual) must be defined; the Medusa representation must be
designed.

#### Option C — COD in both markets

Description: COD offered in PK and AE.
Impact: Same as B, both markets.
Advantages: Maximum reach.
Disadvantages: Same complexity, both markets; AE COD feasibility must be
verified with the AE provider/fulfillment.

### Recommended

**Option A — no COD in V1.** If COD is essential for the PK market, choose
**Option B** and accept the offline-order-state design work.

**Status: APPROVED (2026-08-16)** — see the ✅ marker at the top of this section for the selected option.

### Affected decisions

- DERIVED: BD-O-03 (cancel after payment), BD-S-19 (fulfillment gate),
  COD-refund component of BD-R-05.
- Depends on: BD-P-01, BD-P-02.

### Affected requirements

REQ-PAY-003, REQ-PAY-012, REQ-ORD-011, REQ-ORD-015, REQ-SHIP-024,
REQ-RET-019, B-PAY-03.

### My decision

[ ] Option A  [ ] Option B  [ ] Option C  [ ] Other: __________

---

## BD-S-01 — Shipping rate model

**✅ APPROVED — Option C (hybrid): flat shipping rates for V1; migrate to
carrier-calculated (TCS/Aramex) once their rate contracts are verified.**

### Question

How are shipping charges calculated in each market (flat fee, free over a
threshold, provider-calculated)?

### Why this matters

Determines shipping option configuration (`price_type` FLAT vs CALCULATED),
order totals, and free-shipping thresholds. Provider rate engines (TCS /
Aramex) are UNVERIFIED; a calculated model depends on their rate APIs.

### Options

#### Option A — Flat rates per market/order value

Description: Fixed shipping price per market (possibly with free-shipping
threshold, BD-S-02).
Impact: Native FLAT shipping options; deterministic totals.
Advantages: Simple; no provider rate API needed; predictable.
Disadvantages: May not match actual carrier costs; needs periodic review.

#### Option B — Provider-calculated rates (TCS/Aramex)

Description: Rates fetched from the carrier at checkout.
Impact: Accurate per address/weight; requires carrier rate API (UNVERIFIED)
and CALCULATED options.
Advantages: Accurate; scales with carrier pricing.
Disadvantages: Depends on UNVERIFIED provider rate endpoints; slower
checkout; more integration.

#### Option C — Hybrid (flat per market now; calculated later)

Description: Start flat; migrate to calculated when carrier contracts are
verified.
Impact: Implementation now, improvement later (options are config-driven).
Advantages: Unblocks shipping now; low rework.
Disadvantages: None significant.

### Recommended

**Option C — hybrid: flat rates for V1, calculated when TCS/Aramex rate
contracts are verified.**

**Status: APPROVED (2026-08-16)** — see the ✅ marker at the top of this section for the selected option.

### Affected decisions

- DERIVED: BD-S-02 (free-shipping threshold), BD-S-03 (service levels),
  BD-S-12 (surcharges).
- Depends on: BD-M-01.

### Affected requirements

REQ-MP-028, REQ-SHIP-005, REQ-SHIP-006, REQ-SHIP-024, REQ-CC-012.

### My decision

[ ] Option A  [ ] Option B  [ ] Option C  [ ] Other: __________

---

## BD-I-01 — Warehouse allocation: how is an order assigned to a warehouse?

**✅ APPROVED — Option A: same-market location (PK orders → PK warehouses
via TCS; AE orders → AE warehouses via Aramex).**

### Question

When an order's items could be fulfilled from more than one warehouse, how
is the source location chosen?

### Why this matters

Medusa has no automatic allocator (INV §17); the platform must choose a
strategy that feeds `location_ids` into reservation/fulfillment. This drives
split-fulfillment behavior (BD-I-05) and cross-market availability (BD-I-04).

### Options

#### Option A — Same-market location (PK orders → PK warehouses; AE → AE)

Description: Restrict each market's sales channel to its own market's
locations.
Impact: TCS/Aramex economics; simplest routing.
Advantages: Lower cost/speed; simple rule; aligns with market/provider
boundaries.
Disadvantages: Requires locations per market; single-region stock coverage.

#### Option B — Highest available stock

Description: Fulfill from the location with the most available inventory.
Advantages: Balances stock.
Disadvantages: May cross markets (cost/lead-time); needs availability data
at allocation time.

#### Option C — Priority order / manual admin selection

Description: Locations ranked; admin may override.
Advantages: Control.
Disadvantages: Ops burden.

### Recommended

**Option A — same-market location** (region-scoped), per the inventory
spec's recommendation (§17/§30).

**Status: APPROVED (2026-08-16)** — see the ✅ marker at the top of this section for the selected option.

### Affected decisions

- DERIVED: BD-I-04 (cross-market availability), BD-I-05 (split fulfillment).
- Depends on: BD-M-01. Feeds T-SHIP-14.

### Affected requirements

REQ-INV-003, REQ-INV-020, REQ-INV-014, REQ-SHIP-009, REQ-SHIP-026,
REQ-ORD-014.

### My decision

[ ] Option A  [ ] Option B  [ ] Option C  [ ] Other: __________

---

## BD-I-02 — Backorders

**✅ APPROVED — Option A: no backorders in V1; items must be in stock;
native reservation validation at completion.**

### Question

May products be sold when stock is unavailable (backorder), and under what
rules?

### Why this matters

Determines whether `reservation_item.allow_backorder` is ever used, whether
a per-variant backorder flag is built (custom work, INV §18), checkout
behavior, payment timing (charge now vs on ship), and cancellation rules.
AGENTS.md forbids inventing this (B-INV-02, B-CC-09).

### Options

#### Option A — No backorders in V1

Description: Items must be in stock (available ≥ quantity) to be purchased;
out-of-stock variants cannot be added to cart beyond availability.
Impact: No custom backorder flag; native reservation validation at
completion.
Advantages: Simplest; no custom variant flag; no charge-on-ship complexity.
Disadvantages: Lost sales when stock runs out.

#### Option B — Backorders on selected variants

Description: Chosen variants allow backorder up to a per-variant/per-order
limit; payment charged at checkout; ETA displayed (no promise).
Impact: Custom variant backorder flag + `allow_backorder` feeding;
mixed-cart rules.
Advantages: Captures demand.
Disadvantages: Custom implementation; cancellation/refund rules for
backordered items needed; notification on arrival.

#### Option C — Backorders with charge-on-ship

Description: Like B, but payment captured when stock arrives.
Impact: Adds payment-timing complexity (authorize now, capture later;
interacts with BD-P-05).
Advantages: Better customer cash flow.
Disadvantages: Significantly more payment/state complexity.

### Recommended

**Option A — no backorders in V1.** If backorders are required, choose
**Option B** (charge at checkout) — Option C is discouraged for V1.

**Status: APPROVED (2026-08-16)** — see the ✅ marker at the top of this section for the selected option.

### Affected decisions

- DERIVED: BD-I-08 (reservation timing stays native), low-stock notification
  trigger (BD-I-03).
- Depends on: BD-P-03 (COD payment timing).

### Affected requirements

REQ-INV-004, REQ-INV-005, REQ-INV-019, REQ-CC-007, REQ-CC-015, B-CC-09.

### My decision

[ ] Option A  [ ] Option B  [ ] Option C  [ ] Other: __________

---

## BD-G-01 — Guest customers: what can a guest do without an account?

**✅ APPROVED — Option A: guest checkout with order-number+email lookup;
guests may view/track; returns require account creation and order
association (BD-O-15).**

### Question

May customers check out without creating an account, and what can they do
with their order afterwards (lookup, tracking, cancellation, returns)?

### Why this matters

This is the cross-domain decision the audit flagged (Finding G-1): guest
checkout is supported (REQ-CC-018) but returns currently require an
authenticated customer (REQ-RET-002). This question defines the guest
lifecycle end-to-end and unlocks BD-O-01 (order lookup security).

### Options

#### Option A — Guest checkout + order lookup by order number + email; returns require account creation

Description: Guests complete checkout with email; order lookup uses
order-number + email (or a secure token); guest may track and view; to
return or refund, the guest must create an account and link the order
(BD-O-15).
Impact: Balances convenience and security; returns gated behind identity
verification.
Advantages: Guest-friendly; avoids exposing orders by ID alone; aligns with
REQ-RET-002.
Disadvantages: Slight friction at return time; order lookup requires a
secure token design (T-ORD-09).

#### Option B — Guest checkout only; order access requires account creation immediately

Description: Guests may check out, but order access (view/track/cancel/
return) requires creating an account before or right after purchase.
Impact: Simplest security model; all order features authenticated.
Advantages: Strongest ownership enforcement; no guest token design.
Disadvantages: Higher checkout/registration friction.

#### Option C — Full guest access incl. returns by order token

Description: Guests can also request returns using a secure order token
without creating an account.
Impact: Maximum convenience; requires a guest-return path and token-based
authorization (custom, beyond REQ-RET-002's current auth requirement —
would require revising that requirement).
Advantages: Best UX.
Disadvantages: More custom authorization surface; contradicts the current
RET REQ-RET-002 requirement (would need a spec change).

### Recommended

**Option A — guest checkout with order-number+email lookup; returns after
account association.**

**Status: APPROVED (2026-08-16)** — see the ✅ marker at the top of this section for the selected option.

### Affected decisions

- DERIVED: BD-C-05 (guest email required — yes under A), BD-C-07 (conversion
  before checkout — not required under A), BD-O-15 (account association),
  BD-O-13 (retention — guest data).
- Depends on: BD-M-01. Interacts with BD-O-01.

### Affected requirements

REQ-CC-001, REQ-CC-018, REQ-CC-019, REQ-ORD-006, REQ-ORD-008, REQ-ORD-033,
REQ-RET-002, B-ORD-01, B-ORD-19, audit G-1.

### My decision

[ ] Option A  [ ] Option B  [ ] Option C  [ ] Other: __________

---

## BD-O-01 — Order lookup: how may a customer retrieve a single order?

**✅ APPROVED — Option A: authenticated-customer-only order retrieval with
server-side ownership; guests use the order-number+email path (BD-G-01), not
raw order IDs.**

### Question

The native `GET /store/orders/:id` is unauthenticated and ID-addressed
(verified — security gap A-2). What access policy should the storefront
expose for viewing an order?

### Why this matters

Directly determines the T-ORD-09 hardening (server-side ownership). The
mandatory security part is non-negotiable (no ID-only exposure; ownership
server-side); you are choosing the *policy*.

### Options

#### Option A — Authenticated customers only (no guest lookup by ID)

Description: Order retrieval requires the customer's session; ownership is
verified server-side; guest order lookup handled via the BD-G-01 mechanism
(order number + email), not raw order IDs.
Impact: Closes the gap; simplest enforcement.
Advantages: Strongest; minimal custom surface.
Disadvantages: Guests need the email+number path.

#### Option B — Authenticated customers + secure guest token lookup

Description: Authenticated access as A; guests retrieve via a short-lived,
order-bound token delivered by email.
Impact: Guest-friendly; custom token mechanism.
Advantages: Convenient.
Disadvantages: Token lifecycle (issue, expiry, revocation) must be built.

#### Option C — Order ID + email verification (no token)

Description: Order lookup requires order ID + the order's email address
(verification code or exact match).
Impact: Guest lookup without token infrastructure.
Advantages: Simpler than tokens; still gated.
Disadvantages: Email match is weaker than a token; still needs rate limiting
(enumeration protection).

### Recommended

**Option A** (authenticated only) combined with the BD-G-01 **Option A**
order-number+email lookup for guests.

**Status: APPROVED (2026-08-16)** — see the ✅ marker at the top of this section for the selected option.

### Affected decisions

T-ORD-09 (enforcement), BD-O-06 (order modification), BD-O-15 (account
association).

### Affected requirements

REQ-ORD-006, REQ-ORD-007, REQ-ORD-008, REQ-ORD-028, B-ORD-01, T-ORD-09,
audit A-2.

### My decision

[ ] Option A  [ ] Option B  [ ] Option C  [ ] Other: __________

---

## BD-R-05 — Refund policy (foundational)

**✅ APPROVED — Option A: full-value refund to the original payment method
after receipt + inspection; no restocking fee; shipping fees not refunded on
returns (refunded only on full cancellation per BD-O-02).**

### Question

When a return is accepted, how is the refund calculated and delivered?

### Why this matters

This one decision collapses seven register items (B-RET-10/11/13/14/15/16/17)
plus three cross-spec aliases (B-PAY-08, B-SHIP-23, B-PAY-10). Its answer
determines: refund timing, refund method, refund basis, partial refunds,
restocking fees, tax refunds, discount re-allocation, and shipping-fee
refunds. You answer it once here.

### Options

#### Option A — Refund to original payment method, full item value, after receipt, no restocking fee

Description: Refund = full paid price of received items (incl. tax and
discount as originally applied); issued to the original payment method after
the return is received/inspected; no restocking fee; shipping fees not
refunded (except cancelled-order case per BD-O-02).
Impact: Simple, customer-friendly; native refund workflow; deterministic
math.
Advantages: Minimal policy surface; easy to implement and test.
Disadvantages: Customer pays return shipping (see BD-S-09); merchant absorbs
shipping on cancelled orders.

#### Option B — Refund after receipt, original method, but prorated/excluding some fees

Description: Like A, but shipping-fee refund depends on return reason
(defective vs change-of-mind), and restocking fee applies to change-of-mind
returns.
Impact: More nuanced; requires reason-based rules.
Advantages: Protects margins.
Disadvantages: More rules; more test cases.

#### Option C — Store credit instead of original method

Description: Refund issued as store credit (credit line) rather than to the
original payment method.
Impact: Uses Medusa credit lines; different refund flow.
Advantages: Retains revenue.
Disadvantages: Different accounting; customer friction; provider refund
capability unused.

### Recommended

**Option A** for V1: full-value refund to the original payment method after
receipt, no restocking fee, shipping fees not refunded on returns (refunded
only on full cancellation — see BD-O-02).

**Status: APPROVED (2026-08-16)** — see the ✅ marker at the top of this section for the selected option.

### Affected decisions

- DERIVED (all from this one answer): BD-P-08 (partial refunds — allowed,
  prorated by received quantity), BD-S-18 (shipping-fee refund — none on
  returns), tax refund (included in item refund), discount re-allocation
  (proportional), BD-R-06 (return cancellation window), BD-I-06 (disposition:
  restock sellable, discard damaged).
- Depends on: BD-R-02 (approval), BD-M-02 (tax), BD-M-04 (discounts),
  BD-P-01/02 (provider refund capability).

### Affected requirements

REQ-RET-017, REQ-RET-018, REQ-RET-019, REQ-RET-020, REQ-RET-021,
REQ-RET-023, REQ-RET-024, B-RET-10/11/13/14/15/16/17, B-PAY-08, B-SHIP-23,
B-PAY-10, REQ-PAY-011.

### My decision

[ ] Option A  [ ] Option B  [ ] Option C  [ ] Other: __________

---

## BD-R-01 — Return window

**✅ APPROVED — Option B: 14 days after delivery.**

### Question

Within how many days of delivery may a customer request a return?

### Why this matters

The eligibility gate for the entire returns domain (REQ-RET-010); interacts
with BD-R-03 (eligibility) and delivery confirmation (BD-S-03).

### Options

#### Option A — 7 days after delivery

Description: Returns accepted within 7 days of delivery confirmation.
Advantages: Tight; typical for apparel.
Disadvantages: Short for baby-clothing gifting.

#### Option B — 14 days after delivery

Description: Returns accepted within 14 days.
Advantages: Reasonable balance.
Disadvantages: None significant.

#### Option C — 30 days after delivery

Description: Returns accepted within 30 days.
Advantages: Customer-friendly.
Disadvantages: Longer liability window.

### Recommended

**Option B — 14 days** (moderate; adjust freely).

**Status: APPROVED (2026-08-16)** — see the ✅ marker at the top of this section for the selected option.

### Affected decisions

BD-R-02 (approval), BD-R-03 (eligibility), BD-R-08 (attempt limits).

### Affected requirements

REQ-RET-001, REQ-RET-004, REQ-RET-010, B-RET-01.

### My decision

[ ] Option A (7d)  [ ] Option B (14d)  [ ] Option C (30d)  [ ] Other: ___

---

## BD-R-02/04 — Return process: approval, inspection, rejection

**✅ APPROVED — Option A: auto-accept within window; inspect on receipt;
reject (dismiss) only for condition (per BD-R-03 eligibility).**

### Question

Must a return request be explicitly approved/rejected by staff before it
proceeds, and how are received items inspected?

### Why this matters

Medusa has no native "approved" return status; approval/rejection is layered
policy (RET §13). This determines staff workload, the storefront return
states, and rejection communication (B-RET-02/08/20).

### Options

#### Option A — Auto-accept within window; inspect on receipt; reject only for condition

Description: Eligible requests are accepted automatically; staff inspect
returned items on receipt; items failing inspection (worn/damaged per
BD-R-03/04 rules) are dismissed (native `dismiss`).
Impact: Low friction; native receive/dismiss flows.
Advantages: Minimal staff steps; matches native workflows.
Disadvantages: Fraud/abuse exposure; inspection still required at receipt.

#### Option B — Staff approval before return shipment

Description: Request requires admin approval before the customer ships the
item back.
Impact: Manual gate; more control.
Advantages: Prevents unwanted returns.
Disadvantages: Staff workload; slower; needs an approval UI/workflow layer.

#### Option C — Hybrid: auto-accept below a threshold, approval above

Description: Small returns auto-accepted; large/expensive returns approved
manually.
Impact: Middle ground.
Advantages: Balances friction and control.
Disadvantages: Threshold rule needed; more complex.

### Recommended

**Option A — auto-accept + inspect on receipt** (with dismissal for
non-compliant items per the BD-R-03 eligibility rules).

**Status: APPROVED (2026-08-16)** — see the ✅ marker at the top of this section for the selected option.

### Affected decisions

BD-R-04 (inspection criteria — derived: sellable condition; damaged →
dismissed), BD-R-06 (return cancellation window), T-RET-01 (hardening).

### Affected requirements

REQ-RET-002, REQ-RET-009, REQ-RET-012, REQ-RET-031, B-RET-02, B-RET-08,
B-RET-20.

### My decision

[ ] Option A  [ ] Option B  [ ] Option C  [ ] Other: __________

---

## BD-R-03 — Return eligibility: which items may be returned?

**✅ APPROVED — Option B: hygiene items (undergarments, opened/soiled) and
non-sellable condition excluded; sale items remain returnable.**

### Question

Beyond the window, which products/conditions are excluded from returns
(sale items, hygiene items, worn items)?

### Why this matters

Defines non-returnable product rules and inspection outcomes (B-RET-03/04/
05/06). For baby clothing, hygiene items (undergarments, opened packages)
are typically non-returnable.

### Options

#### Option A — All items returnable; condition must be sellable

Description: Every product is returnable within the window if unused, with
tags, in sellable condition; sale items included.
Advantages: Simple; customer-friendly.
Disadvantages: Hygiene risk for undergarments.

#### Option B — Exclude hygiene items and non-sellable-condition items

Description: Undergarments and opened/soiled items are non-returnable;
sale items returnable (full-price policy applies).
Advantages: Safe for baby clothing; standard practice.
Disadvantages: Slightly more rules.

#### Option C — Exclude hygiene + final-sale items

Description: Like B, plus items marked final-sale (a subset of sale items)
are non-returnable.
Advantages: Maximum control.
Disadvantages: More catalog configuration; sale-item UX clarity needed.

### Recommended

**Option B** — exclude hygiene items and non-sellable condition; sale items
remain returnable.

**Status: APPROVED (2026-08-16)** — see the ✅ marker at the top of this section for the selected option.

### Affected decisions

BD-R-04 (inspection outcomes), BD-I-06 (disposition of non-restockable
items).

### Affected requirements

REQ-RET-004, REQ-RET-010, B-RET-03, B-RET-04, B-RET-05, B-RET-06.

### My decision

[ ] Option A  [ ] Option B  [ ] Option C  [ ] Other: __________

---

## BD-O-02 — Order cancellation policy

**✅ APPROVED — Option A: cancel before fulfillment only, any payment
state; full-order refund of captured payment; no cancellation after
fulfillment begins; no partial cancellation in V1.**

### Question

May customers cancel orders, and under what conditions (before/after
payment, before/after fulfillment)?

### Why this matters

Determines `cancelOrderWorkflow` usage, refund-on-cancel behavior (native:
refund captured, cancel uncaptured), inventory restoration, and shipment
cancellation (BD-S-08). Cannot be invented (B-ORD-02..05).

### Options

#### Option A — Cancel before fulfillment only, any payment state

Description: Customer may cancel while the order is unfulfilled; captured
payments are refunded (full order), uncaptured cancelled; no cancellation
after fulfillment begins.
Impact: Uses native cancel workflow fully; simplest; no partial cancellation.
Advantages: Clean; inventory restored; refund defined.
Disadvantages: No cancellation once items ship.

#### Option B — Cancel before fulfillment + refundable window after shipment (per BD-S-08)

Description: Like A, plus a short post-shipment cancellation window where
possible (subject to carrier capability).
Impact: Adds shipment-cancellation coordination with TCS/Aramex (UNVERIFIED).
Advantages: More flexibility.
Disadvantages: Depends on carrier cancellation capability; more states.

#### Option C — No customer cancellation (admin-only)

Description: Customers cannot cancel; admin may cancel per BD-O-11.
Impact: Simplest operations; stricter.
Advantages: Minimal exposure.
Disadvantages: Poor customer experience.

### Recommended

**Option A — cancel before fulfillment only**, full-order (no partial
cancellation in V1; partial cancellation is BD-O-05, P1).

**Status: APPROVED (2026-08-16)** — see the ✅ marker at the top of this section for the selected option.

### Affected decisions

- DERIVED: BD-O-03 (cancel after payment — allowed under A, refunds full),
  BD-O-04 (cancel after fulfillment — not allowed under A), BD-S-08
  (shipment cancellation window — N/A under A), BD-O-05 (partial
  cancellation — P1, default none).
- Depends on: BD-P-03 (COD states), BD-S-19.

### Affected requirements

REQ-ORD-010, REQ-ORD-015, REQ-ORD-016, REQ-ORD-030, B-ORD-02, B-ORD-03,
B-ORD-04, B-ORD-05, REQ-PAY-012.

### My decision

[ ] Option A  [ ] Option B  [ ] Option C  [ ] Other: __________

---

# PART B — P1 quick decisions (tick each; ~1 minute each)

These are required before their domain is built, but each has a safe default.
**Status: all 23 APPROVED by the product owner (2026-08-16) with the
recommended defaults** — no overrides. (Two rows — BD-I-03, BD-P-09 — are
P2 in the dependency graph but included here because their defaults are
safe and cheap to confirm now.)

| ID | Decision | Recommended default | Your decision |
| --- | --- | --- | --- |
| BD-M-03 | Tax display mode (per BD-M-02) | **Exclusive** (tax added at checkout) — per-market allowed | ✅ **APPROVED** |
| BD-M-06 | Price rounding | **Standard half-up to 2 decimals** (native) | ✅ **APPROVED** |
| BD-M-07 | Sale pricing rules | **Seasonal sale price lists created by Admin**; no auto-scheduling | ✅ **APPROVED** |
| BD-C-01 | Cart expiration / guest cart lifetime | **30-day guest cart lifetime**; no reservation impact (native) | ✅ **APPROVED** |
| BD-C-04 | Market/currency switch on existing cart | **Reject switch; customer starts a new cart** (simplest; aligns with BD-M-01 A) | ✅ **APPROVED** |
| BD-C-06 | Address field requirements PK vs UAE | **Per-market required fields** (country, city, address, phone; postal per market); country must match region | ✅ **APPROVED** |
| BD-C-07 | Guest cart conversion before checkout | **Not required** (guests complete; convert on login) — per BD-G-01 A | ✅ **APPROVED** |
| BD-I-04 | Cross-market location availability | **Implicit via sales-channel links** (locations serve their market's channel) | ✅ **APPROVED** |
| BD-I-05 | Split fulfillment | **Allowed** (native support verified) with same-market rule | ✅ **APPROVED** |
| BD-I-03 | Low-stock thresholds/recipient | **Threshold per level; merchant email recipient**; channels later | ✅ **APPROVED** |
| BD-P-05 | Payment retry policy | **Bounded retries (3) with backoff; status check before retry** (native guidance) | ✅ **APPROVED** |
| BD-P-09 | Payment provider fallback | **Fail first — single provider per market**; no fallback in V1 | ✅ **APPROVED** |
| BD-S-02 | Free-shipping threshold | **None in V1** (if rates flat) — or PKR/AED threshold you set | ✅ **APPROVED** |
| BD-S-11 | International shipping PK↔AE | **Not supported in V1** (per-market fulfillment only) | ✅ **APPROVED** |
| BD-S-19 | Fulfillment payment gate | **No gate** (native does not gate; align with BD-P-03 decision) | ✅ **APPROVED** |
| BD-S-09 | Return shipping responsibility | **Customer pays return shipping** (merchant pays only for defective per BD-R-03/05) | ✅ **APPROVED** |
| BD-O-06 | Order modification | **None by customer in V1** (admin-only via native order edits) | ✅ **APPROVED** |
| BD-O-07 | Address change after order | **Immutable** (snapshot preserved; changes via admin only) | ✅ **APPROVED** |
| BD-O-11 | Admin override policy | **Native admin + RBAC + audit** (cancel, refunds, fulfillment) | ✅ **APPROVED** |
| BD-O-13 | Data retention/archival/anonymization | **Retain per legal minimum; anonymize on request; no auto-delete in V1** (policy later) | ✅ **APPROVED** |
| BD-O-18 | Claims/exchanges | **Not offered in V1** (native primitives exist; no customer flows) | ✅ **APPROVED** |
| BD-R-06 | Return cancellation window | **Customer may cancel return request until shipped** | ✅ **APPROVED** |
| BD-R-07 | Return shipment mandatory | **Required before receipt** (per BD-S-09 customer-paid) | ✅ **APPROVED** |

---

# PART C — Deferred / derived / verification (for reference — no answers needed)

## DERIVED (auto-determined by your answers)

BD-M-09 (default region, from BD-M-01) · BD-C-08 (checkout retry, from
BD-P-05) · BD-P-04 (payment methods, from BD-P-01/02) · BD-P-08 (partial
refund, from BD-R-05) · BD-S-16 (shipping tax, from BD-M-02/03) ·
BD-S-18 (shipping-fee refund, from BD-R-05) · BD-I-06 (disposition, from
BD-R-05) · BD-I-08 (reservation timing — native) · BD-O-10 (customer-visible
statuses — native state model) · BD-O-16 (completion semantics — native).

## MEDUSA_DEFINED (no decision needed)

Reservation at completion · refund ≤ captured · refund currency = order
currency · computed payment/fulfillment statuses · ReturnStatus vocabulary ·
idempotency mechanisms · partial capture/refund mechanism (provider-
dependent).

## PROVIDER_VERIFICATION (verification tasks after provider selection, not
decisions)

BD-P-04 method set · BD-P-07 partial capture · BD-P-12 fraud rules ·
BD-S-03 service levels · BD-S-05 insurance · BD-S-06 package limits ·
BD-S-10 return shipping provider · BD-S-13 address correction · plus all
contract details (endpoints, payloads, webhooks, signatures, retries).

## P2/P3 — defer (changing later requires no rework)

BD-M-05 min order · BD-I-07 cart pre-check · BD-C-02/03 cart restore/merge ·
BD-P-06 session expiry (implementation) · BD-P-10/11/13/14/15 (amounts,
restrictions, reconciliation, overrides, reporting) · BD-S-04 estimates ·
BD-S-07 failed delivery · BD-S-12 surcharges · BD-S-14/15/17 retry/
fallback/exceptions · BD-S-20 manual fulfillment · BD-S-21 exception
notifications · BD-O-08 order number · BD-O-09 invoices · BD-O-12 retention
· BD-O-14 notifications · BD-O-17 drafts · BD-R-08 attempt limits · BD-M-10
wholesale (exclude — V1 is B2C only, preserved from architecture).

---

# PART D — Security requirements (non-negotiable, not a question)

The following remain mandatory regardless of any business answer
(AGENTS.md §14/§26.3, audit §6):

- Server-side authorization; never frontend-only.
- Customer ownership checks on carts, orders, returns, refunds, addresses.
- No client-controlled customer ID, order ownership, refund amount, payment
  status, or return shipping cost.
- `GET /store/orders/:id` and `POST /store/returns` are hardened per the
  policy chosen above (BD-O-01, BD-G-01, BD-R-02) — the enforcement
  mechanism is technical (T-ORD-09, T-RET-01/02), not a business choice.

---

## Summary of what you must answer

**17 foundational questions (Part A)** → then **23 quick ticks (Part B)**.
Everything else is derived, Medusa-defined, provider verification, or
deferred. Total user decisions: **40** (17 foundational + 23 quick
P1/P2-with-safe-default ticks, down from 119 register entries and 89
canonical decisions).

**RESOLVED (2026-08-16): all 40 answered and APPROVED by the product
owner.** Outstanding items are implementation gates, not decisions: PK GST
numeric rate, AE VAT numeric rate, and provider contract verification
(AssanPay, Stripe; TCS/Aramex at shipping implementation).
