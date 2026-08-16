import {
  enabledMarketCodes,
  marketSuggestion,
  marketsFromRegions,
} from "./market-selection"
import { HttpTypes } from "@medusajs/types"

const region = (overrides: Partial<HttpTypes.StoreRegion>): HttpTypes.StoreRegion =>
  ({
    id: "reg_1",
    name: "Pakistan",
    currency_code: "pkr",
    countries: [
      {
        id: "reg_1_pk",
        iso_2: "pk",
        iso_3: "pak",
        num_code: "586",
        name: "Pakistan",
        display_name: "Pakistan",
      },
    ],
    ...overrides,
  }) as HttpTypes.StoreRegion

describe("enabledMarketCodes", () => {
  const original = process.env.NEXT_PUBLIC_ENABLED_MARKETS

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_ENABLED_MARKETS
    } else {
      process.env.NEXT_PUBLIC_ENABLED_MARKETS = original
    }
  })

  it("defaults to pk and ae when unset", () => {
    delete process.env.NEXT_PUBLIC_ENABLED_MARKETS
    expect(enabledMarketCodes()).toEqual(["pk", "ae"])
  })

  it("parses a comma-separated env list, lowercased and trimmed", () => {
    process.env.NEXT_PUBLIC_ENABLED_MARKETS = "PK, ae"
    expect(enabledMarketCodes()).toEqual(["pk", "ae"])
  })
})

describe("marketsFromRegions", () => {
  it("maps each enabled market to its region data", () => {
    const regions = [
      region({ id: "reg_pk", currency_code: "pkr" }),
      region({
        id: "reg_ae",
        name: "United Arab Emirates",
        currency_code: "aed",
        countries: [
          {
            id: "reg_ae_ae",
            iso_2: "ae",
            iso_3: "are",
            num_code: "784",
            name: "United Arab Emirates",
            display_name: "United Arab Emirates",
          },
        ],
      }),
    ]
    const markets = marketsFromRegions(regions, ["pk", "ae"])
    expect(markets).toHaveLength(2)
    const pk = markets.find((m) => m.countryCode === "pk")
    const ae = markets.find((m) => m.countryCode === "ae")
    expect(pk).toMatchObject({
      countryCode: "pk",
      regionId: "reg_pk",
      currencyCode: "pkr",
    })
    expect(ae).toMatchObject({ countryCode: "ae", regionId: "reg_ae" })
  })

  it("skips regions for markets that are not enabled", () => {
    const regions = [
      region({ id: "reg_pk" }),
      region({
        id: "reg_dk",
        name: "Europe",
        currency_code: "eur",
        countries: [
          {
            id: "reg_dk_dk",
            iso_2: "dk",
            iso_3: "dnk",
            num_code: "208",
            name: "Denmark",
            display_name: "Denmark",
          },
        ],
      }),
    ]
    const markets = marketsFromRegions(regions, ["pk", "ae"])
    expect(markets.map((m) => m.countryCode)).toEqual(["pk"])
  })

  it("returns an empty list when no regions match", () => {
    expect(marketsFromRegions([], ["pk", "ae"])).toEqual([])
  })
})

describe("marketSuggestion", () => {
  it("suggests a market when the geo country matches an enabled market", () => {
    expect(marketSuggestion("pk", ["pk", "ae"])).toBe("pk")
    expect(marketSuggestion("AE", ["pk", "ae"])).toBe("ae")
  })

  it("returns null when the geo country is not an enabled market", () => {
    expect(marketSuggestion("us", ["pk", "ae"])).toBeNull()
    expect(marketSuggestion("gb", ["pk", "ae"])).toBeNull()
  })

  it("returns null when geo country is unavailable", () => {
    expect(marketSuggestion(undefined, ["pk", "ae"])).toBeNull()
    expect(marketSuggestion("", ["pk", "ae"])).toBeNull()
  })
})
