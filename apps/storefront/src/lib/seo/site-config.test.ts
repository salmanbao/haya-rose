import { getSiteConfig } from "./site-config"

const ORIGINAL_NAME = process.env.NEXT_PUBLIC_SITE_NAME
const ORIGINAL_DESCRIPTION = process.env.NEXT_PUBLIC_SITE_DESCRIPTION
const ORIGINAL_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL

afterEach(() => {
  if (ORIGINAL_NAME === undefined) delete process.env.NEXT_PUBLIC_SITE_NAME
  else process.env.NEXT_PUBLIC_SITE_NAME = ORIGINAL_NAME

  if (ORIGINAL_DESCRIPTION === undefined)
    delete process.env.NEXT_PUBLIC_SITE_DESCRIPTION
  else process.env.NEXT_PUBLIC_SITE_DESCRIPTION = ORIGINAL_DESCRIPTION

  if (ORIGINAL_BASE_URL === undefined) delete process.env.NEXT_PUBLIC_BASE_URL
  else process.env.NEXT_PUBLIC_BASE_URL = ORIGINAL_BASE_URL
})

describe("getSiteConfig", () => {
  it("returns documented defaults when nothing is configured", () => {
    delete process.env.NEXT_PUBLIC_SITE_NAME
    delete process.env.NEXT_PUBLIC_SITE_DESCRIPTION
    delete process.env.NEXT_PUBLIC_BASE_URL

    const config = getSiteConfig()
    expect(config.name).toBe("Medusa Store")
    expect(config.description.length).toBeGreaterThan(0)
    expect(config.url).toBe("https://localhost:8000")
  })

  it("prefers configured environment values", () => {
    process.env.NEXT_PUBLIC_SITE_NAME = "Baby Store"
    process.env.NEXT_PUBLIC_SITE_DESCRIPTION = "Baby clothing store."
    process.env.NEXT_PUBLIC_BASE_URL = "https://store.example.com"

    const config = getSiteConfig()
    expect(config.name).toBe("Baby Store")
    expect(config.description).toBe("Baby clothing store.")
    expect(config.url).toBe("https://store.example.com")
  })
})