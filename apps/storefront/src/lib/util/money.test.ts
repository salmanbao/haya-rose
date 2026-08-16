import { convertToLocale } from "./money"

const normalize = (value: string) => value.replace(/\s+/g, " ")

describe("convertToLocale", () => {
  it("formats PKR amounts in major units without division", () => {
    expect(normalize(convertToLocale({ amount: 2500, currency_code: "pkr" }))).toBe(
      "PKR 2,500"
    )
  })

  it("formats AED amounts in major units without division", () => {
    expect(normalize(convertToLocale({ amount: 45, currency_code: "aed" }))).toBe(
      "AED 45.00"
    )
  })

  it("formats EUR amounts with the currency symbol", () => {
    expect(convertToLocale({ amount: 12, currency_code: "eur" })).toBe(
      "€12.00"
    )
  })

  it("formats decimal amounts", () => {
    expect(convertToLocale({ amount: 19.99, currency_code: "usd" })).toBe(
      "$19.99"
    )
  })

  it("respects custom fraction digits", () => {
    expect(
      normalize(
        convertToLocale({
          amount: 2500,
          currency_code: "pkr",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        })
      )
    ).toBe("PKR 2,500")
  })

  it("falls back to a plain number string when the currency code is empty", () => {
    expect(convertToLocale({ amount: 2500, currency_code: "" })).toBe("2500")
  })

  it("falls back to a plain number string when the currency code is whitespace", () => {
    expect(convertToLocale({ amount: 2500, currency_code: "   " })).toBe(
      "2500"
    )
  })
})