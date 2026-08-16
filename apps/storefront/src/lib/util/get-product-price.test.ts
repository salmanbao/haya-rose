import { getPricesForVariant, getProductPrice } from "./get-product-price"
import { HttpTypes } from "@medusajs/types"

const normalize = (value: string) => value.replace(/\s+/g, " ")

type CalculatedVariant = Omit<HttpTypes.StoreProductVariant, "calculated_price"> & {
  calculated_price: {
    id: string
    calculated_amount: number
    original_amount: number
    original_amount_with_tax: number | null
    original_amount_without_tax: number | null
    currency_code: string
    calculated_price: {
      id: string | null
      price_list_id: string | null
      price_list_type: string
      min_quantity: number | null
      max_quantity: number | null
    }
  }
}

const calculatedPrice = (
  amount: number,
  priceListType = "default",
  original = amount
): CalculatedVariant["calculated_price"] => ({
  id: "price_1",
  calculated_amount: amount,
  original_amount: original,
  original_amount_with_tax: original,
  original_amount_without_tax: original,
  currency_code: "pkr",
  calculated_price: {
    id: null,
    price_list_id: null,
    price_list_type: priceListType,
    min_quantity: null,
    max_quantity: null,
  },
})

const variant = (overrides: {
  id?: string
  sku?: string
  calculated_price?: Partial<CalculatedVariant["calculated_price"]>
} = {}): CalculatedVariant =>
  ({
    id: overrides.id ?? "variant_1",
    sku: overrides.sku ?? "SKU-1",
    calculated_price: {
      ...calculatedPrice(2500, "sale", 3000),
      ...overrides.calculated_price,
    },
  } as unknown as CalculatedVariant)

describe("getPricesForVariant", () => {
  it("returns formatted prices in major units", () => {
    const prices = getPricesForVariant(variant())!

    expect(prices.calculated_price_number).toBe(2500)
    expect(normalize(prices.calculated_price)).toBe("PKR 2,500")
    expect(prices.original_price_number).toBe(3000)
    expect(normalize(prices.original_price)).toBe("PKR 3,000")
    expect(prices.currency_code).toBe("pkr")
    expect(prices.price_type).toBe("sale")
    expect(prices.percentage_diff).toBe("17")
  })

  it("returns null when the variant has no calculated price", () => {
    expect(
      getPricesForVariant({
        id: "variant_1",
      } as unknown as Parameters<typeof getPricesForVariant>[0])
    ).toBeNull()
  })
})

describe("getProductPrice", () => {
  it("throws when no product is provided", () => {
    expect(() =>
      getProductPrice({ product: undefined as unknown as HttpTypes.StoreProduct })
    ).toThrow("No product provided")
  })

  it("returns null prices when the product has no variants", () => {
    const prices = getProductPrice({
      product: { id: "prod_1" } as HttpTypes.StoreProduct,
    })
    expect(prices.cheapestPrice).toBeNull()
    expect(prices.variantPrice).toBeNull()
  })

  it("selects the cheapest variant price", () => {
    const product = {
      id: "prod_1",
      variants: [
        variant({
          id: "variant_expensive",
          sku: "SKU-EXP",
          calculated_price: { calculated_amount: 3000, original_amount: 3000 },
        }),
        variant({
          id: "variant_cheap",
          sku: "SKU-CHEAP",
          calculated_price: { calculated_amount: 2200, original_amount: 2200 },
        }),
      ],
    } as HttpTypes.StoreProduct

    const prices = getProductPrice({ product })
    expect(prices.cheapestPrice?.calculated_price_number).toBe(2200)
  })

  it("resolves the variant price by id", () => {
    const product = {
      id: "prod_1",
      variants: [variant()],
    } as HttpTypes.StoreProduct

    const prices = getProductPrice({ product, variantId: "variant_1" })
    expect(prices.variantPrice?.calculated_price_number).toBe(2500)
  })

  it("resolves the variant price by sku", () => {
    const product = {
      id: "prod_1",
      variants: [variant()],
    } as HttpTypes.StoreProduct

    const prices = getProductPrice({ product, variantId: "SKU-1" })
    expect(prices.variantPrice?.calculated_price_number).toBe(2500)
  })

  it("returns null variant price when the variant is not found", () => {
    const product = {
      id: "prod_1",
      variants: [variant()],
    } as HttpTypes.StoreProduct

    const prices = getProductPrice({ product, variantId: "missing" })
    expect(prices.variantPrice).toBeNull()
  })
})