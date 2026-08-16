import { resolveMarketRouting } from "./market-routing"

describe("resolveMarketRouting", () => {
  const knownCountries = new Set(["pk", "ae", "dk"])

  it("serves when the URL already carries a known country code (canonical)", () => {
    expect(
      resolveMarketRouting({ pathname: "/pk/store", knownCountries })
    ).toEqual({ action: "serve" })
    expect(
      resolveMarketRouting({ pathname: "/ae/products/tee", knownCountries })
    ).toEqual({ action: "serve" })
  })

  it("serves the root path so the market selector page renders", () => {
    expect(resolveMarketRouting({ pathname: "/", knownCountries })).toEqual({
      action: "serve",
    })
  })

  it("redirects to the market selector when the path has no country code", () => {
    expect(resolveMarketRouting({ pathname: "/store", knownCountries })).toEqual(
      { action: "redirect-selector" }
    )
    expect(resolveMarketRouting({ pathname: "/cart", knownCountries })).toEqual(
      { action: "redirect-selector" }
    )
  })

  it("redirects to the market selector for an unknown country code", () => {
    expect(resolveMarketRouting({ pathname: "/xx/store", knownCountries })).toEqual(
      { action: "redirect-selector" }
    )
  })

  it("treats country codes case-insensitively", () => {
    expect(resolveMarketRouting({ pathname: "/PK/store", knownCountries })).toEqual(
      { action: "serve" }
    )
  })

  it("never uses geolocation to pick a country in the routing decision", () => {
    // BD-M-01: geolocation suggests only; it must never redirect.
    const decision = resolveMarketRouting({ pathname: "/", knownCountries })
    expect(decision.action).not.toBe("redirect-country")
  })

  it("returns serve for an empty pathname (root)", () => {
    expect(resolveMarketRouting({ pathname: "", knownCountries })).toEqual({
      action: "serve",
    })
  })
})
