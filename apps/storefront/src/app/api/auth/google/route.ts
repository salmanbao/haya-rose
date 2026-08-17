import { NextResponse } from "next/server"

import { sdk } from "@lib/config"
import { setAuthToken } from "@lib/data/cookies"
import { enabledMarketCodes } from "@lib/util/market-selection"

export const dynamic = "force-dynamic"

const accountPath = () =>
  `/${enabledMarketCodes()[0]}/account`

/**
 * Starts Google OAuth sign-in (BD-AUTH-03).
 *
 * POST /auth/customer/google returns `{ location }` — the Google authorize
 * URL (verified in the installed auth-google provider). The customer is
 * redirected there; Google redirects back to the configured callback URL
 * (`/api/auth/callback/google`).
 */
export async function GET() {
  let result: Awaited<ReturnType<typeof sdk.auth.login>>

  try {
    result = await sdk.auth.login("customer", "google", {})
  } catch {
    return NextResponse.redirect(
      new URL(accountPath(), process.env.NEXT_PUBLIC_SITE_URL ?? "/")
    )
  }

  if (typeof result === "object" && "location" in result) {
    return NextResponse.redirect(result.location)
  }

  // A string token means the customer was already authenticated with Google.
  if (typeof result === "string") {
    await setAuthToken(result)
    return NextResponse.redirect(
      new URL(accountPath(), process.env.NEXT_PUBLIC_SITE_URL ?? "/")
    )
  }

  return NextResponse.redirect(
    new URL(accountPath(), process.env.NEXT_PUBLIC_SITE_URL ?? "/")
  )
}