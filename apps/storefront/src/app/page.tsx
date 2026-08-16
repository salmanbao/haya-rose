import { headers } from "next/headers"
import Link from "next/link"
import ReactCountryFlag from "react-country-flag"

import { listRegions } from "@lib/data/regions"
import {
  enabledMarketCodes,
  marketSuggestion,
  marketsFromRegions,
} from "@lib/util/market-selection"
import { getSiteConfig } from "@lib/seo/site-config"

export const metadata = {
  title: "Select your market",
  description: "Choose the market you want to shop from.",
}

/**
 * Market selection landing page (BD-M-01 / BD-M-09).
 *
 * Served at `/` when the URL carries no canonical country code. The customer
 * explicitly chooses their market; geolocation headers may only highlight a
 * suggestion — they never redirect and never make the choice for the
 * customer. Market data is derived from the backend regions, filtered by the
 * enabled market set (`NEXT_PUBLIC_ENABLED_MARKETS`).
 */
export default async function MarketSelectionPage() {
  const siteConfig = getSiteConfig()
  const regions = await listRegions()
  const markets = marketsFromRegions(regions, enabledMarketCodes())

  // Geolocation headers (Vercel/Cloudflare) — suggestion only, never
  // authoritative per BD-M-01. Absent in local dev.
  const headerStore = await headers()
  const geoCountry =
    headerStore.get("x-vercel-ip-country")?.toLowerCase() ||
    headerStore.get("cf-ipcountry")?.toLowerCase() ||
    undefined
  const suggestion = marketSuggestion(geoCountry, enabledMarketCodes())

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl text-center">
        <h1 className="text-2xl font-semibold text-neutral-900">
          {siteConfig.name}
        </h1>
        <p className="mt-2 text-neutral-600">Select your market to continue</p>

        {suggestion && (
          <div className="mt-6 rounded-rounded border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
            Based on your location, you appear to be in{" "}
            {suggestion === "pk" ? "Pakistan" : "the UAE"}.
            <br />
            <span className="text-neutral-500">
              You can choose either market — this is just a suggestion.
            </span>
          </div>
        )}

        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {markets.map((market) => (
            <li key={market.countryCode}>
              <Link
                href={`/${market.countryCode}`}
                className="flex items-center justify-between rounded-rounded border border-neutral-200 p-5 transition-colors hover:border-neutral-400 hover:bg-neutral-50"
              >
                <span className="flex items-center gap-x-3">
                  <ReactCountryFlag
                    svg
                    countryCode={market.countryCode.toUpperCase()}
                    style={{ width: "24px", height: "24px" }}
                  />
                  <span className="text-left">
                    <span className="block text-sm font-medium text-neutral-900">
                      {market.countryName}
                    </span>
                    <span className="block text-xs uppercase text-neutral-500">
                      {market.currencyCode}
                    </span>
                  </span>
                </span>
                <span className="text-neutral-400">&rarr;</span>
              </Link>
            </li>
          ))}
        </ul>

        {markets.length === 0 && (
          <p className="mt-8 text-sm text-neutral-500">
            No markets are available right now.
          </p>
        )}
      </div>
    </main>
  )
}
