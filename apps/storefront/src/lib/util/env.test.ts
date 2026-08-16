import { getBaseURL } from "./env"

const ORIGINAL = process.env.NEXT_PUBLIC_BASE_URL

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.NEXT_PUBLIC_BASE_URL
  } else {
    process.env.NEXT_PUBLIC_BASE_URL = ORIGINAL
  }
})

describe("getBaseURL", () => {
  it("returns the configured base URL when set", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://store.example.com"
    expect(getBaseURL()).toBe("https://store.example.com")
  })

  it("returns the default local URL when not configured", () => {
    delete process.env.NEXT_PUBLIC_BASE_URL
    expect(getBaseURL()).toBe("https://localhost:8000")
  })
})