import {
  parseAvailability,
  parseGender,
  parseMinMaxPrice,
  parsePage,
  parseQuery,
  shouldNoindexStorePage,
} from "./store-filter-params"

describe("parseQuery", () => {
  it("returns the q value as a trimmed string", () => {
    expect(parseQuery({ q: "  cotton  " })).toBe("cotton")
  })

  it("returns undefined for an empty q", () => {
    expect(parseQuery({ q: "" })).toBeUndefined()
    expect(parseQuery({ q: "   " })).toBeUndefined()
  })

  it("returns undefined when q is absent", () => {
    expect(parseQuery({})).toBeUndefined()
  })

  it("ignores a non-string q", () => {
    expect(parseQuery({ q: ["a", "b"] })).toBeUndefined()
  })
})

describe("parseGender", () => {
  it("accepts girls, boys and unisex", () => {
    expect(parseGender({ gender: "girls" })).toBe("girls")
    expect(parseGender({ gender: "boys" })).toBe("boys")
    expect(parseGender({ gender: "unisex" })).toBe("unisex")
  })

  it("returns undefined for an unknown gender", () => {
    expect(parseGender({ gender: "toddler" })).toBeUndefined()
    expect(parseGender({ gender: "" })).toBeUndefined()
    expect(parseGender({})).toBeUndefined()
  })
})

describe("parseAvailability", () => {
  it("accepts in_stock and out_of_stock", () => {
    expect(parseAvailability({ availability: "in_stock" })).toBe("in_stock")
    expect(parseAvailability({ availability: "out_of_stock" })).toBe(
      "out_of_stock"
    )
  })

  it("maps all and unknown values to undefined", () => {
    expect(parseAvailability({ availability: "all" })).toBeUndefined()
    expect(parseAvailability({ availability: "x" })).toBeUndefined()
    expect(parseAvailability({})).toBeUndefined()
  })
})

describe("parseMinMaxPrice", () => {
  it("parses positive integers", () => {
    expect(parseMinMaxPrice({ min_price: "1000", max_price: "3000" })).toEqual({
      minPrice: 1000,
      maxPrice: 3000,
    })
  })

  it("drops zero, negative, non-numeric and float values", () => {
    expect(parseMinMaxPrice({ min_price: "0" })).toEqual({})
    expect(parseMinMaxPrice({ min_price: "-5" })).toEqual({})
    expect(parseMinMaxPrice({ min_price: "abc" })).toEqual({})
    expect(parseMinMaxPrice({ min_price: "12.5" })).toEqual({})
    expect(parseMinMaxPrice({ min_price: "12.9" })).toEqual({})
  })

  it("returns only the valid bound when the other is missing", () => {
    expect(parseMinMaxPrice({ min_price: "500" })).toEqual({ minPrice: 500 })
    expect(parseMinMaxPrice({ max_price: "900" })).toEqual({ maxPrice: 900 })
  })

  it("drops the pair when min exceeds max", () => {
    expect(parseMinMaxPrice({ min_price: "3000", max_price: "1000" })).toEqual(
      {}
    )
  })
})

describe("parsePage", () => {
  it("parses positive integers", () => {
    expect(parsePage("2")).toBe(2)
    expect(parsePage("1")).toBe(1)
  })

  it("falls back to 1 for invalid input", () => {
    expect(parsePage("0")).toBe(1)
    expect(parsePage("-1")).toBe(1)
    expect(parsePage("abc")).toBe(1)
    expect(parsePage(undefined)).toBe(1)
  })
})

describe("shouldNoindexStorePage", () => {
  it("indexes a clean store listing", () => {
    expect(shouldNoindexStorePage({})).toBe(false)
    expect(shouldNoindexStorePage({ page: "2" })).toBe(false)
  })

  it("noindexes when any filter or sort param is present", () => {
    expect(shouldNoindexStorePage({ q: "dress" })).toBe(true)
    expect(shouldNoindexStorePage({ gender: "girls" })).toBe(true)
    expect(shouldNoindexStorePage({ availability: "in_stock" })).toBe(true)
    expect(shouldNoindexStorePage({ min_price: "500" })).toBe(true)
    expect(shouldNoindexStorePage({ max_price: "900" })).toBe(true)
    expect(shouldNoindexStorePage({ sortBy: "price_asc" })).toBe(true)
    expect(shouldNoindexStorePage({ optionValueIds: "a,b" })).toBe(true)
  })
})