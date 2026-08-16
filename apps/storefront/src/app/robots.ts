import { getBaseURL } from "@lib/util/env"
import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${getBaseURL().replace(/\/+$/, "")}/sitemap.xml`,
  }
}
