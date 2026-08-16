import { getBaseURL } from "@lib/util/env"
import { getSiteConfig } from "@lib/seo/site-config"
import { Metadata } from "next"
import "styles/globals.css"

const siteConfig = getSiteConfig()

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: {
    type: "website",
    title: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" data-mode="light">
      <body>
        <main className="relative">{props.children}</main>
      </body>
    </html>
  )
}
