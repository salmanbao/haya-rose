# Medusa Capability Matrix

Every classification below is based on the **installed Medusa 2.19.0**
(inspected packages, database tables, live API) — not on assumptions.

Classification vocabulary:

- **Native** — provided by Medusa core modules; no work needed.
- **Configuration** — native capability that only needs config/admin setup.
- **Extension** — built using Medusa extension points (workflows, API routes,
  subscribers, admin, module links).
- **Custom implementation** — new custom module/entity/workflow/service.
- **External integration** — third-party provider behind an integration boundary.
- **Unknown** — requires verification against the installed version.

## Domain Matrix (section 16)

| Domain | Native Medusa capability | Configuration | Extension | Custom implementation | External provider |
| --- | --- | --- | --- | --- | --- |
| Catalog | product module: products, variants, options, categories, collections, tags, images, metadata (verified: tables + `/store/products`, `/store/product-categories`) | **DONE (2026-08-16):** starter seed replaced by baby-clothing catalog via `seed-catalog.ts` (taxonomy AGENTS.md §8, 4 demo products/30 variants, tags/collection, levels) | product-related custom fields via metadata/options; custom routes if needed | none expected | media via file module (below) |
| Pricing | pricing module: prices, `price_list` + rules, currencies, regions, calculated prices (`calculated_price` verified on storefront), customer-group price lists (native) | PKR/AED price setup per market | price-selection extensions only if non-standard | none expected | none |
| Markets | region, sales-channel, currency modules (verified) | create PK/UAE regions, countries, sales channels, default currency | none | none | none |
| Inventory | inventory module: inventory items, levels, reservations, stock locations (verified tables) | warehouses/locations, levels, thresholds via Admin | none | none | none |
| Payments | payment module + sessions/auth/capture/refund models (verified tables) | none (baseline) | provider integration boundary | none | Stripe provider installed (NOT enabled); providers SELECTED (AssanPay PK — replaces earlier xPay —, Stripe AE) — AssanPay contract verification in progress, Stripe verified; NOT implemented |
| Fulfillment | fulfillment module: shipping options, profiles, rates, fulfillment, tracking models (verified tables) | shipping options per market | — | — | TCS/Aramex = future external integration; manual provider available |
| Customers | customer module: customers, addresses, groups (verified tables) | none | none | none | none |
| Promotions | promotion module: promotions, campaigns, budgets, rules (verified tables); coupon codes native | create promotions in Admin | none | none | none |
| Returns | return/return_item/return_reason + return workflows (verified tables) | return reasons/eligibility config | eligibility rules as workflows/steps | business rules per spec | — |
| Refunds | refund/refund_reason/capture + payment refund workflows (verified tables) | refund reasons | idempotency/eligibility enforcement | business rules per spec | — |
| Media | file module: `file-local` (default) + `file-s3` provider (verified: `endpoint?` option, BucketOwnerEnforced note) | **R2 = configuration only**: `file` module with `resolve: "@medusajs/file-s3"` + endpoint/credentials | none required | none required | Cloudflare R2 (approved target) |
| Authentication | Medusa-native customer auth: email/password ENABLED (verified: customer + admin login flows); `@medusajs/auth-google` provider INSTALLED (options verified in installed source: `clientId`, `clientSecret`, `callbackUrl`) | configure Google provider via medusa-config auth module (future) | none | none | Google OAuth (provider registration + Google Cloud OAuth client) |

## Customization Boundary Map (section 6)

| Requirement | Native Medusa capability | Customization required? | Expected extension point |
| --- | --- | --- | --- |
| Product catalog | Native (product module) | No | **DONE** — baby-clothing catalog seeded via `seed-catalog.ts`; real products via Admin later |
| Categories | Native (product categories) | No | Admin |
| Variants | Native (product variants) | No | Admin |
| Colors/sizes | Native (product options → variant options) | No | Admin; nothing custom |
| Markets | Native (region/sales-channel) | No (configuration) | Admin config |
| PKR/AED | Native (currency module) | No (configuration) | Admin pricing per region |
| Inventory | Native (inventory module) | No | Admin |
| Multiple warehouses | Native (stock locations + reservations) | No | Admin config |
| Wishlist | Not native | **Yes — custom** | custom module (`src/modules`) + API routes + workflows + link to customer/product |
| Reviews | Not native | **Yes — custom** | custom module + workflows + admin UI extension |
| Returns | Native (return models/workflows) | Business rules only | workflows/steps + Admin reasons config |
| Refunds | Native (refund/capture workflows) | Business rules only (eligibility, idempotency) | workflows |
| Coupons | Native (promotions with code) | No | Admin |
| Bundles | Not native (no bundle concept in 2.19) | **Yes — custom** | custom module/extension; must preserve component inventory/order accounting (approach unknown → verify) |
| Recommendations | Not native | **Yes — custom** | custom module (simple, no AI) |
| Recently viewed | Not native | **Yes — custom** | custom module/service + storefront |
| Abandoned cart | Not native | **Yes — custom** | workflows/subscribers/jobs + notification; requires business rules |
| TCS | Not integrated | **Yes — external integration** | fulfillment provider behind `shipping/` boundary (provider not selected) |
| Aramex | Not integrated | **Yes — external integration** | fulfillment provider behind `shipping/` boundary (provider not selected) |
| Pakistan payment provider | Payment module native; provider absent | **Yes — external integration** | payment provider behind `payments/` boundary (provider not selected) |
| UAE payment provider | Payment module native; provider absent | **Yes — external integration** | payment provider behind `payments/` boundary (provider not selected) |
| R2 media | Native (`file-s3` S3-compatible provider) | No (configuration) | `medusa-config.ts` file module |
| Google authentication | Native provider installed (`@medusajs/auth-google`; options verified in installed source: `clientId`, `clientSecret`, `callbackUrl`) | Yes — configuration (provider registration + Google Cloud OAuth client + callback URL) | medusa-config auth module provider config | — | Google (OAuth client) |
| Email/password authentication | Native, ENABLED (verified) | No | none | — | — |
| Notifications | notification module native (local/logger; sendgrid installed) | Providers (email/SMS/WhatsApp) = external integration; consent rules = business spec | notification providers behind `notifications/` boundary |
| Search / filtering / sorting | Store API native filters (category, tag, collection, option values, `q`) + sorting; **NOT native:** metadata (gender/brand/season), price range, availability filters (product module has no such filterable props) | none | **DONE (2026-08-16):** custom store route `GET /store/products/browse` (ADR-0003) — module-pushed filters + server-side metadata/price/availability filtering, exact counts up to 1000-candidate cap; availability via framework `getVariantAvailability`/`getTotalVariantAvailability`; best_selling from order items | none expected (search provider deferred) | none |
| SEO | Storefront Metadata API (site-wide metadata, canonicalization, robots.txt, sitemap, JSON-LD — Phase 6, 2026-08-16; see ADR-0002) | Storefront work | Next.js metadata/JSON-LD/slugs (no backend change) |

## Not Provided Natively (requires custom work — none implemented)

Wishlist, reviews, bundles-as-products, recommendations, recently viewed,
abandoned-cart classification, TCS/Aramex providers, PK/UAE payment providers,
email/SMS/WhatsApp providers, per-market tax rules beyond region config,
audit logging, order-tracking UI polish.
