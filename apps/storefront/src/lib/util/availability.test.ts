import { HttpTypes } from "@medusajs/types"
import { isVariantAvailable } from "./availability"

const variant = (overrides: Partial<HttpTypes.StoreProductVariant> = {}) =>
  ({
    id: "variant_1",
    ...overrides,
  }) as HttpTypes.StoreProductVariant

describe("isVariantAvailable", () => {
  it("returns false when there is no variant", () => {
    expect(isVariantAvailable(undefined)).toBe(false)
    expect(isVariantAvailable(null)).toBe(false)
  })

  it("returns true when inventory is not managed", () => {
    expect(isVariantAvailable(variant({ manage_inventory: false }))).toBe(true)
  })

  it("returns true when backorders are allowed", () => {
    expect(
      isVariantAvailable(variant({ manage_inventory: true, allow_backorder: true }))
    ).toBe(true)
  })

  it("returns true when inventory is in stock", () => {
    expect(
      isVariantAvailable(variant({ manage_inventory: true, inventory_quantity: 5 }))
    ).toBe(true)
  })

  it("returns false when inventory is zero", () => {
    expect(
      isVariantAvailable(variant({ manage_inventory: true, inventory_quantity: 0 }))
    ).toBe(false)
  })

  it("returns false when inventory quantity is missing", () => {
    expect(
      isVariantAvailable(variant({ manage_inventory: true, inventory_quantity: undefined }))
    ).toBe(false)
  })
})