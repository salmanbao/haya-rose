import { parseOptionValueIds } from "./product-option-filters"

describe("parseOptionValueIds", () => {
  it("parses a URLSearchParams with repeated optionValueIds and dedupes", () => {
    const params = new URLSearchParams()
    params.append("optionValueIds", "a")
    params.append("optionValueIds", "b")
    params.append("optionValueIds", "a")
    expect(parseOptionValueIds(params)).toEqual(["a", "b"])
  })

  it("ignores empty values in URLSearchParams", () => {
    const params = new URLSearchParams()
    params.append("optionValueIds", "a")
    params.append("optionValueIds", "")
    expect(parseOptionValueIds(params)).toEqual(["a"])
  })

  it("parses a comma-separated string record value", () => {
    expect(parseOptionValueIds({ optionValueIds: "a,b,c" })).toEqual([
      "a",
      "b",
      "c",
    ])
  })

  it("parses an array record value and dedupes", () => {
    expect(parseOptionValueIds({ optionValueIds: ["a", "b", "a"] })).toEqual([
      "a",
      "b",
    ])
  })

  it("returns an empty array for an empty string record value", () => {
    expect(parseOptionValueIds({ optionValueIds: "" })).toEqual([])
  })

  it("returns an empty array when the record value is undefined", () => {
    expect(parseOptionValueIds({})).toEqual([])
  })

  it("returns an empty array when the record value is not a string or array", () => {
    expect(
      parseOptionValueIds({
        optionValueIds: 42 as unknown as string,
      })
    ).toEqual([])
  })
})