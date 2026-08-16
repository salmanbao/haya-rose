import { isEmpty, isArray, isObject } from "./isEmpty"

describe("isEmpty", () => {
  it.each([null, undefined])("returns true for %s", (input) => {
    expect(isEmpty(input)).toBe(true)
  })

  it("returns true for empty and whitespace strings", () => {
    expect(isEmpty("")).toBe(true)
    expect(isEmpty("   ")).toBe(true)
  })

  it("returns true for empty arrays and objects", () => {
    expect(isEmpty([])).toBe(true)
    expect(isEmpty({})).toBe(true)
  })

  it("returns false for populated values", () => {
    expect(isEmpty("abc")).toBe(false)
    expect(isEmpty([1])).toBe(false)
    expect(isEmpty({ a: 1 })).toBe(false)
    expect(isEmpty(0)).toBe(false)
    expect(isEmpty(false)).toBe(false)
  })
})

describe("isArray / isObject", () => {
  it("detects arrays", () => {
    expect(isArray([])).toBe(true)
    expect(isArray({})).toBe(false)
  })

  it("detects objects", () => {
    expect(isObject({})).toBe(true)
    expect(isObject([])).toBe(true)
    expect(isObject(null)).toBe(false)
  })
})