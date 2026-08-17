import { NextRequest, NextResponse } from "next/server"

import { completeGoogleCallback } from "@lib/data/customer"
import { enabledMarketCodes } from "@lib/util/market-selection"

export const dynamic = "force-dynamic"

const accountPath = () => `/${enabledMarketCodes()[0]}/account`

/**
 * Google OAuth callback (BD-AUTH-03).
 *
 * Google redirects here with `code`/`state` after the customer authenticates.
 * The backend validates the code (verified native flow) and returns a token;
 * a brand-new Google identity gets an actorless token, so the storefront
 * creates the customer and refreshes the token to bind the actor.
 */
export async function GET(request: NextRequest) {
  const query = Object.fromEntries(request.nextUrl.searchParams.entries())

  if (query.error) {
    return NextResponse.redirect(
      new URL(accountPath(), process.env.NEXT_PUBLIC_SITE_URL ?? "/")
    )
  }

  const redirectPath = await completeGoogleCallback(query)

  if (!redirectPath) {
    return NextResponse.redirect(
      new URL(accountPath(), process.env.NEXT_PUBLIC_SITE_URL ?? "/")
    )
  }

  return NextResponse.redirect(
    new URL(redirectPath, process.env.NEXT_PUBLIC_SITE_URL ?? "/")
  )
}