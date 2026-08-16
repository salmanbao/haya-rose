import { HttpTypes } from "@medusajs/types"

/**
 * Market selection helpers (BD-M-01 / BD-M-09).
 *
 * Markets are configuration, not hardcoded commerce logic: the storefront
 * derives them from the Medusa regions the backend exposes, filtered by the
 * enabled market set (`NEXT_PUBLIC_ENABLED_MARKETS`, default "pk,ae").
 * Geolocation-derived countries are used only as a *suggestion* — the
 * customer always confirms the market explicitly.
 */

export type StorefrontMarket = {
  countryCode: string
  regionId: string
  regionName: string
  currencyCode: string
  countryName: string
}

/** Enabled market country codes, from env (comma-separated) or the default. */
export function enabledMarketCodes(
  raw = process.env.NEXT_PUBLIC_ENABLED_MARKETS
): string[] {
  if (!raw) {
    return ["pk", "ae"]
  }
  return raw
    .split(",")
    .map((code) => code.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Maps backend regions to storefront markets, keeping only enabled markets.
 * Each market is the first region country that matches an enabled code.
 */
export function marketsFromRegions(
  regions: HttpTypes.StoreRegion[],
  enabledCodes: string[]
): StorefrontMarket[] {
  const enabled = new Set(enabledCodes)
  const markets: StorefrontMarket[] = []

  for (const region of regions) {
    for (const country of region.countries ?? []) {
      const code = country.iso_2?.toLowerCase()
      if (!code || !enabled.has(code)) {
        continue
      }
      markets.push({
        countryCode: code,
        regionId: region.id,
        regionName: region.name,
        currencyCode: region.currency_code,
        countryName: country.display_name ?? country.name ?? code.toUpperCase(),
      })
      break
    }
  }

  return markets.sort((a, b) => a.countryCode.localeCompare(b.countryCode))
}

/**
 * Returns the suggested market for a geo-detected country, or null when the
 * country is not an enabled market (or is unknown). Suggestion only — never
 * authoritative.
 */
export function marketSuggestion(
  geoCountry: string | undefined,
  enabledCodes: string[]
): string | null {
  const code = geoCountry?.trim().toLowerCase()
  if (!code) {
    return null
  }
  return enabledCodes.includes(code) ? code : null
}
