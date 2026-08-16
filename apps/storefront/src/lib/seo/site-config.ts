import { getBaseURL } from "@lib/util/env"

export const getSiteConfig = () => ({
  name: process.env.NEXT_PUBLIC_SITE_NAME || "Medusa Store",
  description:
    process.env.NEXT_PUBLIC_SITE_DESCRIPTION ||
    "A performant frontend ecommerce starter template with Next.js 15 and Medusa.",
  url: getBaseURL(),
})
