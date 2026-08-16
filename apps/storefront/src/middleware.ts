import { HttpTypes } from "@medusajs/types"
import { NextRequest, NextResponse } from "next/server"

import { resolveMarketRouting } from "@lib/util/market-routing"

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
const PUBLISHABLE_API_KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY

const regionMapCache = {
  regionMap: new Map<string, HttpTypes.StoreRegion>(),
  regionMapUpdated: Date.now(),
}

async function getRegionMap(cacheId: string) {
  const { regionMap, regionMapUpdated } = regionMapCache

  if (!BACKEND_URL) {
    throw new Error(
      "Middleware.ts: Error fetching regions. Did you set up regions in your Medusa Admin and define a NEXT_PUBLIC_MEDUSA_BACKEND_URL environment variable."
    )
  }

  if (
    !regionMap.keys().next().value ||
    regionMapUpdated < Date.now() - 3600 * 1000
  ) {
    // Fetch regions from Medusa. We can't use the JS client here because middleware is running on Edge and the client needs a Node environment.
    const response = await fetch(`${BACKEND_URL}/store/regions`, {
      method: "GET",
      headers: {
        "x-publishable-api-key": PUBLISHABLE_API_KEY!,
      },
      next: {
        revalidate: 3600,
        tags: [`regions-${cacheId}`],
      },
      cache: "force-cache",
    })

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`)
    }

    const json = await response.json()

    const { regions } = json

    if (!regions?.length) {
      return new Map<string, HttpTypes.StoreRegion>()
    }

    // Create a map of country codes to regions.
    regions.forEach((region: HttpTypes.StoreRegion) => {
      region.countries?.forEach((c) => {
        regionMapCache.regionMap.set(c.iso_2 ?? "", region)
      })
    })

    regionMapCache.regionMapUpdated = Date.now()
  }

  return regionMapCache.regionMap
}

/**
 * Middleware to handle market (region) routing.
 *
 * BD-M-01 (APPROVED): the URL country code is the canonical market
 * determinant. Geolocation is NEVER authoritative — it may only suggest the
 * market on the selector page (see `src/app/page.tsx`), and the customer
 * always confirms explicitly. When the location is undetermined, the
 * storefront routes to the market selector instead of silently defaulting to
 * a region (BD-M-09). IP geolocation headers are therefore not used here to
 * choose or redirect a country.
 */
export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.includes(".")) {
    return NextResponse.next()
  }

  const cacheIdCookie = request.cookies.get("_medusa_cache_id")
  const cacheId = cacheIdCookie?.value || crypto.randomUUID()

  const regionMap = await getRegionMap(cacheId)
  const knownCountries = new Set(regionMap.keys())

  const decision = resolveMarketRouting({
    pathname: request.nextUrl.pathname,
    knownCountries,
  })

  if (decision.action === "redirect-selector") {
    // No canonical country in the URL: send the customer to the market
    // selector so they can pick their market explicitly.
    const queryString = request.nextUrl.search || ""
    const redirectUrl = `${request.nextUrl.origin}/${queryString}`
    return NextResponse.redirect(redirectUrl, 307)
  }

  // Canonical market URL (or root selector page): serve.
  if (!cacheIdCookie) {
    const response = NextResponse.next()
    response.cookies.set("_medusa_cache_id", cacheId, {
      maxAge: 60 * 60 * 24,
    })
    return response
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|images|assets|png|svg|jpg|jpeg|gif|webp).*)",
  ],
}
