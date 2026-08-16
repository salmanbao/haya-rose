import {
  LOW_STOCK_THRESHOLD_KEY,
  getLowStockThreshold,
  isAtOrBelowLowStockThreshold,
} from "../low-stock"

describe("low-stock threshold helper (BD-I-03)", () => {
  describe("getLowStockThreshold", () => {
    it("returns the numeric threshold from level metadata", () => {
      const threshold = getLowStockThreshold({
        metadata: { [LOW_STOCK_THRESHOLD_KEY]: 10 },
      } as any)
      expect(threshold).toBe(10)
    })

    it("returns undefined when metadata is absent", () => {
      expect(getLowStockThreshold({} as any)).toBeUndefined()
      expect(getLowStockThreshold({ metadata: null } as any)).toBeUndefined()
    })

    it("returns undefined when the threshold key is missing", () => {
      expect(
        getLowStockThreshold({ metadata: { other: "value" } } as any)
      ).toBeUndefined()
    })

    it("returns undefined for non-finite, negative, or non-numeric values", () => {
      expect(
        getLowStockThreshold({ metadata: { [LOW_STOCK_THRESHOLD_KEY]: -1 } } as any)
      ).toBeUndefined()
      expect(
        getLowStockThreshold({
          metadata: { [LOW_STOCK_THRESHOLD_KEY]: "ten" },
        } as any)
      ).toBeUndefined()
      expect(
        getLowStockThreshold({
          metadata: { [LOW_STOCK_THRESHOLD_KEY]: NaN },
        } as any)
      ).toBeUndefined()
      expect(
        getLowStockThreshold({
          metadata: { [LOW_STOCK_THRESHOLD_KEY]: Infinity },
        } as any)
      ).toBeUndefined()
    })

    it("accepts a zero threshold", () => {
      expect(
        getLowStockThreshold({
          metadata: { [LOW_STOCK_THRESHOLD_KEY]: 0 },
        } as any)
      ).toBe(0)
    })
  })

  describe("isAtOrBelowLowStockThreshold", () => {
    it("is true when available quantity is below the threshold", () => {
      const level = {
        available_quantity: 4,
        metadata: { [LOW_STOCK_THRESHOLD_KEY]: 10 },
      }
      expect(isAtOrBelowLowStockThreshold(level as any)).toBe(true)
    })

    it("is true when available quantity equals the threshold", () => {
      const level = {
        available_quantity: 10,
        metadata: { [LOW_STOCK_THRESHOLD_KEY]: 10 },
      }
      expect(isAtOrBelowLowStockThreshold(level as any)).toBe(true)
    })

    it("is false when available quantity is above the threshold", () => {
      const level = {
        available_quantity: 11,
        metadata: { [LOW_STOCK_THRESHOLD_KEY]: 10 },
      }
      expect(isAtOrBelowLowStockThreshold(level as any)).toBe(false)
    })

    it("is false when no threshold is configured", () => {
      const level = { available_quantity: 0, metadata: null }
      expect(isAtOrBelowLowStockThreshold(level as any)).toBe(false)
    })

    it("handles BigNumber-ish quantity values (strings/objects)", () => {
      const level = {
        available_quantity: "3",
        metadata: { [LOW_STOCK_THRESHOLD_KEY]: 5 },
      }
      expect(isAtOrBelowLowStockThreshold(level as any)).toBe(true)
    })
  })
})
