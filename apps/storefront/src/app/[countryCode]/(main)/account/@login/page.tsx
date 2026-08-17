import { Metadata } from "next"

import { sdk } from "@lib/config"
import LoginTemplate from "@modules/account/templates/login-template"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Medusa Store account.",
}

export const dynamic = "force-dynamic"

export default async function Login() {
  // The backend is authoritative for which auth providers are registered
  // (BD-AUTH-03): the Google option only appears when the backend registered
  // the google provider (AUTH_GOOGLE_ENABLED + credentials). A missing
  // backend must not crash the page — default to email/password only.
  let googleEnabled = false
  try {
    const { providers } = await sdk.auth.listProviders("customer")
    googleEnabled = providers.some((provider) => provider.id === "google")
  } catch {}

  return <LoginTemplate googleEnabled={googleEnabled} />
}