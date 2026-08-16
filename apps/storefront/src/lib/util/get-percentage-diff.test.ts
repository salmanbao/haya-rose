import { getPercentageDiff } from "./get-percentage-diff"

describe("getPercentageDiff", () => {
  it("returns the rounded percentage decrease", () => {
    expect(getPercentageDiff(100, 80)).toBe("20")
  })

  it("returns 0 for equal amounts", () => {
    expect(getPercentageDiff(2500, 2500)).toBe("0")
  })

  it("returns 100 when the calculated amount is zero", () => {
    expect(getPercentageDiff(100, 0)).toBe("100")
  })

  it("rounds to a whole number string", () => {
    expect(getPercentageDiff(3000, 2500)).toBe("17")
  })
})