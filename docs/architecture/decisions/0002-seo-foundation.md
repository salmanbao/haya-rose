# ADR-0002 — SEO Foundation: Canonicalization, Sitemap, and Structured Data Policy

Status: ACCEPTED (implemented 2026-08-16)

## Context

AGENTS.md §18 requires SEO as first-class behavior: SEO-friendly slugs,
canonical URLs, title/description, Open Graph, robots.txt, XML sitemap,
JSON-LD (Product, Breadcrumb, Organization), localized metadata, and
deliberate filter/query-parameter indexing policy. The starter shipped only
per-page metadata stubs, a hardcoded `lang="en"` root layout, and an unused
`next-sitemap` configuration pointing at an unset `NEXT_PUBLIC_VERCEL_URL`.
There were no robots.txt, sitemap, canonical, or structured-data
implementations.

Constraints that shaped the design:

- Structured data must be derived from authoritative sources: price from
  commerce pricing, availability from inventory state, SKU from variants.
  No hardcoded prices/availability, no invented schema properties.
- The market/locale set is not finalized (§10): no hreflang, no hardcoded
  multi-language behavior; locale configuration must remain configurable.
- No business rules may be invented (§5); placeholders are demo content.
- No new dependencies without approval (§17): implement with Next.js
  Metadata API (`MetadataRoute`, `generateMetadata`, `alternates.canonical`).

## Decision

1. **Metadata**: root layout defines title default + template (`%s | <name>`),
   description, Open Graph, robots (index/follow). Brand/description are
   env-overridable placeholders (`NEXT_PUBLIC_SITE_NAME`, default
   "Medusa Store"; `NEXT_PUBLIC_SITE_DESCRIPTION`). `lang="en"` stays
   hardcoded until the language set is finalized.
2. **Canonical policy** (`buildCanonicalUrl`): absolute URLs built from
   `getBaseURL()`; all filter params (`v_id`, `sortBy`, `optionValueIds`)
   are stripped; `page=N` kept only when N>1; `page=1` stripped. Category
   pages canonicalize to the full hierarchy path (e.g.
   `/pk/categories/baby-clothing/girls/girls-dresses`) so flat leaf URLs
   consolidate to one canonical form.
3. **Category URL resolution**: nested hierarchy paths resolve; wrong
   ancestor chains 404; flat leaf URLs remain valid (legacy/nav links).
   Implemented with the store API's `include_descendants_tree=true`.
   Verified against installed Medusa 2.19.0: nested tree nodes do NOT get
   `parent_category` populated, and `parent_category.parent_category`
   expands at most one level — so chains are resolved from the tree, never
   from `parent_category` links.
4. **robots.txt + sitemap**: Next.js `MetadataRoute` (no next-sitemap
   dependency). robots allows all and references the sitemap. The sitemap is
   fully data-driven: every region country code × (home, full category
   paths, collections, products), clean URLs only. Production must set
   `NEXT_PUBLIC_SITE_URL` for the public origin.
5. **JSON-LD**: Organization on the home page; Product + BreadcrumbList on
   product pages; BreadcrumbList on category pages. Product offers use
   `String(calculated_amount)` (major units, no rounding), the region
   currency uppercased, availability from the same `isVariantAvailable`
   util as the UI, and `sku` from the selected/cheapest priced variant.
   Offer `url` points at the canonical product URL. `priceValidUntil`,
   `itemCondition`, and `brand` are intentionally omitted (not invented).
6. **Null-safety**: JSON-LD scripts render only when the value is non-null;
   breadcrumb lists always start with Home (site name).

## Alternatives

- **next-sitemap + manual JSON-LD components**: rejected — adds a
  dependency the platform already covers via Next.js MetadataRoute, and the
  starter's next-sitemap config was unconfigured dead weight.
- **Use `parent_category` fields for breadcrumbs/chains**: rejected after
  verification — the installed API does not return the full ancestor chain.
- **Render JSON-LD via client components**: rejected — SEO-critical content
  must be server-rendered and indexable (§3).

## Consequences

- Indexable URLs are deliberate: 3-level category paths + product pages;
  filter combinations collapse to canonical pages.
- Catalog changes propagate to the sitemap automatically (data-driven).
- Flat leaf category URLs still work but canonicalize to deep URLs —
  internal links should use deep URLs going forward (nav update is part of
  the browsing phase).
- Remaining SEO work is business-gated: hreflang/locales (§10), filter
  noindex policy, backorder schema distinction, B-MP-08 canonical
  consolidation, production base URL. Documented in gap-analysis §SEO
  Foundation.
