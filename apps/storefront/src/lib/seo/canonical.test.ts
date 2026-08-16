import { buildCanonicalUrl } from "./canonical"

describe("buildCanonicalUrl", () => {
  it("builds an absolute URL for a product path, stripping variant params", () => {
    expect(
      buildCanonicalUrl({
        baseUrl: "https://store.example.com",
        countryCode: "pk",
        path: ["products", "baby-cotton-t-shirt"],
        params: { v_id: "variant_1" },
      })
    ).toBe("https://store.example.com/pk/products/baby-cotton-t-shirt")
  })

  it("strips sort and option-value filter params from category paths", () => {
    expect(
      buildCanonicalUrl({
        baseUrl: "https://store.example.com",
        countryCode: "pk",
        path: ["categories", "boys-t-shirts"],
        params: { sortBy: "price-desc", optionValueIds: "a,b" },
      })
    ).toBe("https://store.example.com/pk/categories/boys-t-shirts")
  })

  it("keeps pagination params for pages after the first", () => {
    expect(
      buildCanonicalUrl({
        baseUrl: "https://store.example.com",
        countryCode: "pk",
        path: ["categories", "boys-t-shirts"],
        params: { page: "2", optionValueIds: "a" },
      })
    ).toBe("https://store.example.com/pk/categories/boys-t-shirts?page=2")
  })

  it("strips an explicit page 1 param", () => {
    expect(
      buildCanonicalUrl({
        baseUrl: "https://store.example.com",
        countryCode: "pk",
        path: ["categories", "boys-t-shirts"],
        params: { page: "1" },
      })
    ).toBe("https://store.example.com/pk/categories/boys-t-shirts")
  })

  it("preserves nested category paths", () => {
    expect(
      buildCanonicalUrl({
        baseUrl: "https://store.example.com",
        countryCode: "ae",
        path: ["categories", "baby-clothing", "girls", "girls-dresses"],
        params: {},
      })
    ).toBe(
      "https://store.example.com/ae/categories/baby-clothing/girls/girls-dresses"
    )
  })

  it("normalizes a trailing slash on the base URL", () => {
    expect(
      buildCanonicalUrl({
        baseUrl: "https://store.example.com/",
        countryCode: "pk",
        path: [],
        params: {},
      })
    ).toBe("https://store.example.com/pk")
  })

  it("handles URLSearchParams input", () => {
    const params = new URLSearchParams()
    params.append("v_id", "variant_1")
    expect(
      buildCanonicalUrl({
        baseUrl: "https://store.example.com",
        countryCode: "pk",
        path: ["products", "baby-cotton-t-shirt"],
        params,
      })
    ).toBe("https://store.example.com/pk/products/baby-cotton-t-shirt")
  })

  it("ignores non-numeric page values", () => {
    expect(
      buildCanonicalUrl({
        baseUrl: "https://store.example.com",
        countryCode: "pk",
        path: ["categories", "boys-t-shirts"],
        params: { page: "abc" },
      })
    ).toBe("https://store.example.com/pk/categories/boys-t-shirts")
  })
})