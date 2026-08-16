/**
 * Market routing decisions for the storefront middleware (BD-M-01 / BD-M-09).
 *
 * Approved policy (BD-M-01): the URL country code is the canonical market
 * determinant; browser geolocation may only *suggest* a market (never
 * authoritative); an explicit selector is the manual override; the confirmed
 * customer market choice is the authoritative commerce input. When the
 * location is undetermined, the storefront routes to the market selector
 * (BD-M-09) instead of silently defaulting to a region.
 *
 * This module is a pure decision function: it never performs geolocation and
 * never picks a country from headers. The middleware maps the result to an
 * actual redirect.
 */

export type MarketRoutingDecision =
  | { action: "serve" }
  | { action: "redirect-selector" }

export function resolveMarketRouting({
  pathname,
  knownCountries,
}: {
  pathname: string
  knownCountries: ReadonlySet<string>
}): MarketRoutingDecision {
  const firstSegment = pathname.split("/")[1]?.toLowerCase() ?? ""

  if (!firstSegment) {
    // Root path (or empty) renders the market selector page.
    return { action: "serve" }
  }

  if (knownCountries.has(firstSegment)) {
    // Canonical market URL — serve as-is.
    return { action: "serve" }
  }

  // No country code (or an unknown one): let the customer pick their market.
  return { action: "redirect-selector" }
}
