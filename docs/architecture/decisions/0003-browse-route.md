# ADR-0003 — Backend Browse Route for Search, Filtering, and Sorting

Status: ACCEPTED (implemented 2026-08-16)

## Context

AGENTS.md §11 requires search, filtering, and sorting to happen at the
backend/search layer — never by downloading the catalog into the browser and
filtering client-side. The Medusa starter storefront shipped with
`listProductsWithSort` / `sortProducts`, which fetch all products with the
store API and filter/sort them in React. That violates the §11 boundary and
cannot scale (full-catalog downloads, no exact counts for filter
combinations, prices/availability resolved outside the backend request path).

The installed Medusa 2.19.0 store products API supports native filtering by
category, tag, collection, option values, `q`, and sorting by
created_at/title/price (multi-channel price sort is not available
store-side). It does NOT support server-side filtering by product metadata
(gender, brand, season), by price range, or by availability — those are
business requirements for this project (browse by gender/age/price/stock).

Constraints that shaped the design:

- No business rules may be invented (§5); rules documented here were
  requested in AGENTS.md §8/§9 or are required for correctness.
- No search provider (Elasticsearch/OpenSearch) without demonstrated need
  (§11); the project defers that decision.
- Backend-authoritative pricing/inventory (§13): prices come from the
  pricing module context, availability from inventory levels.
- Field selection must use the graph query engine's parsed shape; verified
  against installed 2.19.0 behavior (see below).

## Decision

A custom store API route `GET /store/products/browse` (custom route in the
backend application, not a Medusa module) provides server-side
search/filter/sort with exact counts:

1. **Validation** (zod): `q`, `gender`, `brand`, `season`, `material`,
   `category_id`, `tag_id`, `option_value_id`, `min_price`, `max_price`,
   `availability` (`all`/`in_stock`/`out_of_stock`), `sort_by`
   (`created_at`/`title`/`price_asc`/`price_desc`/`best_selling`/
   `relevance`), `offset` (0..1000), `limit` (1..100). Unknown fields are
   rejected. Publishable API key required (global store middleware).
2. **Sales channel scoping** replicates the core store middleware
   `applyMaybeLinkFilterIfNecessary` (verified in installed source): a
   single channel → no filter; multiple channels → product `id` filter from
   `product_sales_channel` links. A key with no channels is rejected.
3. **Module-pushed filters**: `status = published` only, category, tag,
   option value, `q` (passed through the module's native `q` semantics —
   title/description/SKU matching — see Consequences).
4. **Server-side filters** (not pushable into the module query):
   metadata `gender`/`brand`/`season`, `material`, price range (min of
   variant calculated prices in the region currency), availability
   (min quantity across linked inventory items; `manage_inventory=false`
   variants count as available).
5. **Pricing**: calculated prices resolved through `QueryContext`
   (region currency + optional country code). Unauthenticated requests
   have no customer-group prices — documented limitation, consistent with
   the core store API.
6. **Availability**: `getVariantAvailability` (single channel) or
   `getTotalVariantAvailability` (multi-channel) from
   `@medusajs/framework/utils` — the framework's own helpers, with their
   tag-based cache invalidation.
7. **Best-selling** counts: order items of non-cancelled orders, aggregated
   per variant, summed per product (module query, not a custom table).
8. **Sorting**: created_at (default), title, price asc/desc (unpriced last),
   best_selling (unsold last), relevance (title prefix → title substring →
   description substring, case-insensitive; without `q`, relevance falls
   back to created_at). Ties break by created_at desc.
9. **Pagination**: `offset`/`limit` slicing with exact `count` of the
   filtered set. Candidate fetching is capped at `MAX_CANDIDATE_PRODUCTS`
   (1000): metadata/price/availability filtering is in-memory over the
   candidate set, so counts are exact up to that cap. Catalogs exceeding it
   require a search provider (deferred).
10. **Response shape** mirrors the core store products list (product + full
    variants incl. option values, calculated prices, categories, tags) plus
    `inventory_quantity` per variant and `status`; `metadata` is stripped
    (internal metadata is not customer-facing).

### Verified framework behavior (Medusa 2.19.0)

- The graph query engine requires the parsed field shape: concrete fields
  plus a `<relation>.*` entry per expanded relation. Star-prefixed entries
  (`*variants`) silently break relation expansion for pivot relations such
  as `variants.options` — verified against the core route and the installed
  framework source (`get-query-config.js`).
- `sales_channel_id` is not a product filter property; channel scoping must
  go through the `product_sales_channel` link (verified in core
  middlewares.js).
- `req.publishable_key_context` (typed `MedusaStoreRequest`) carries the
  key's sales channel ids on custom store routes (verified).
- `q` on the core route uses `query.index` (search engine). This route
  passes `q` to `query.graph` as a variant text filter instead — see
  Consequences.

## Alternatives

- **Fix the starter's client-side filtering**: rejected — keeps the §11
  violation and cannot provide exact counts or backend-authoritative
  price/availability filtering.
- **Filter/sort in a custom module workflow**: rejected — no workflow
  state; a custom route with the framework query API is the minimal
  extension boundary.
- **Custom search provider (Elasticsearch/OpenSearch)**: rejected for V1 —
  no demonstrated need; revisit when the catalog exceeds the candidate cap.
- **Query the product module service directly**: rejected — would re-implement
  graph relation expansion, calculated prices, and channel scoping that the
  framework query API already provides.

## Consequences

- Filtering, sorting, and counts are backend-authoritative; the storefront
  will call this route for search/filter/sort pages (§11 satisfied).
- `q` uses the module's text filter semantics (variant title/description/SKU
  matching), not a search provider's relevance ranking. The 1000-candidate
  cap bounds in-memory filtering cost.
- Prices are region-currency based; multi-currency integrity holds (§10).
  `best_selling` is defined as order-item quantity across non-cancelled
  orders — exact definition recorded here, not invented later.
- The route is storefront-internal (no SEO/indexing impact); filter/search
  page indexing policy is governed by ADR-0002/SEO gap-analysis.
- Remaining gaps documented in `docs/architecture/gap-analysis.md`: search
  provider decision, customer-group pricing for authenticated requests,
  `visibility`-based filtering.