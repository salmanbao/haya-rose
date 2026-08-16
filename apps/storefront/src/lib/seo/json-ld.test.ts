import { HttpTypes } from "@medusajs/types"
import {
  breadcrumbJsonLd,
  organizationJsonLd,
  productJsonLd,
} from "./json-ld"

const region = {
  id: "reg_pk",
  currency_code: "pkr",
} as HttpTypes.StoreRegion

type VariantOverrides = {
  id?: string
  sku?: string
  manage_inventory?: boolean
  allow_backorder?: boolean
  inventory_quantity?: number | null
  calculated_price?: {
    calculated_amount: number
    original_amount?: number
    currency_code?: string
    calculated_price?: { price_list_type?: string }
  }
}

const variant = (overrides: VariantOverrides = {}): HttpTypes.StoreProductVariant =>
  ({
    id: "variant_1",
    sku: "SKU-1",
    manage_inventory: true,
    allow_backorder: false,
    inventory_quantity: 5,
    calculated_price: {
      calculated_amount: 2500,
      original_amount: 2500,
      currency_code: "pkr",
      calculated_price: { price_list_type: "default" },
    },
    ...overrides,
  }) as HttpTypes.StoreProductVariant

const product = (overrides: Partial<HttpTypes.StoreProduct> = {}) =>
  ({
    id: "prod_1",
    title: "Baby Cotton T-Shirt",
    description: "Soft cotton t-shirt.",
    thumbnail: "https://cdn.example.com/t-shirt.jpg",
    variants: [variant()],
    ...overrides,
  }) as HttpTypes.StoreProduct

describe("productJsonLd", () => {
  it("builds a Product entity with offers from the calculated price", () => {
    const jsonLd = productJsonLd({
      product: product(),
      region,
      baseUrl: "https://store.example.com",
      countryCode: "pk",
      handle: "baby-cotton-t-shirt",
    })

    expect(jsonLd).toEqual(
      expect.objectContaining({
        "@context": "https://schema.org",
        "@type": "Product",
        name: "Baby Cotton T-Shirt",
        description: "Soft cotton t-shirt.",
        image: "https://cdn.example.com/t-shirt.jpg",
        sku: "SKU-1",
      })
    )

    expect(jsonLd!.offers).toEqual({
      "@type": "Offer",
      price: "2500",
      priceCurrency: "PKR",
      availability: "InStock",
      url: "https://store.example.com/pk/products/baby-cotton-t-shirt",
    })
  })

  it("derives availability from the same logic the UI uses", () => {
    const outOfStock = productJsonLd({
      product: product({
        variants: [variant({ inventory_quantity: 0 })],
      }),
      region,
      baseUrl: "https://store.example.com",
      countryCode: "pk",
      handle: "baby-cotton-t-shirt",
    })

    expect((outOfStock!.offers as { availability: string }).availability).toBe(
      "OutOfStock"
    )

    const unmanaged = productJsonLd({
      product: product({
        variants: [variant({ manage_inventory: false })],
      }),
      region,
      baseUrl: "https://store.example.com",
      countryCode: "pk",
      handle: "baby-cotton-t-shirt",
    })

    expect((unmanaged!.offers as { availability: string }).availability).toBe(
      "InStock"
    )
  })

  it("prefers the selected variant's price and sku", () => {
    const jsonLd = productJsonLd({
      product: product({
        variants: [
          variant({
            id: "variant_1",
            sku: "SKU-1",
            calculated_price: { calculated_amount: 2500 },
          }),
          variant({
            id: "variant_2",
            sku: "SKU-2",
            calculated_price: { calculated_amount: 3000 },
          }),
        ],
      }),
      region,
      baseUrl: "https://store.example.com",
      countryCode: "pk",
      handle: "baby-cotton-t-shirt",
      selectedVariantId: "variant_2",
    })

    expect(jsonLd!.sku).toBe("SKU-2")
    expect((jsonLd!.offers as { price: string }).price).toBe("3000")
  })

  it("uses the cheapest variant when none is selected", () => {
    const jsonLd = productJsonLd({
      product: product({
        variants: [
          variant({
            id: "variant_1",
            sku: "SKU-1",
            calculated_price: { calculated_amount: 3000 },
          }),
          variant({
            id: "variant_2",
            sku: "SKU-2",
            calculated_price: { calculated_amount: 2200 },
          }),
        ],
      }),
      region,
      baseUrl: "https://store.example.com",
      countryCode: "pk",
      handle: "baby-cotton-t-shirt",
    })

    expect(jsonLd!.sku).toBe("SKU-2")
    expect((jsonLd!.offers as { price: string }).price).toBe("2200")
  })

  it("omits offers when no variant has a calculated price", () => {
    const jsonLd = productJsonLd({
      product: product({
        variants: [variant({ calculated_price: undefined })],
      }),
      region,
      baseUrl: "https://store.example.com",
      countryCode: "pk",
      handle: "baby-cotton-t-shirt",
    })

    expect(jsonLd).not.toHaveProperty("offers")
  })

  it("returns null for a product without variants", () => {
    const jsonLd = productJsonLd({
      product: product({ variants: [] }),
      region,
      baseUrl: "https://store.example.com",
      countryCode: "pk",
      handle: "baby-cotton-t-shirt",
    })

    expect(jsonLd).toBeNull()
  })
})

describe("breadcrumbJsonLd", () => {
  it("builds an ItemList with sequential positions", () => {
    const jsonLd = breadcrumbJsonLd([
      { name: "Baby Clothing", url: "https://store.example.com/pk/categories/baby-clothing" },
      { name: "Boys", url: "https://store.example.com/pk/categories/baby-clothing/boys" },
      { name: "T-Shirts", url: "https://store.example.com/pk/categories/baby-clothing/boys/boys-t-shirts" },
    ])

    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Baby Clothing", item: "https://store.example.com/pk/categories/baby-clothing" },
        { "@type": "ListItem", position: 2, name: "Boys", item: "https://store.example.com/pk/categories/baby-clothing/boys" },
        { "@type": "ListItem", position: 3, name: "T-Shirts", item: "https://store.example.com/pk/categories/baby-clothing/boys/boys-t-shirts" },
      ],
    })
  })

  it("returns null when there are no items", () => {
    expect(breadcrumbJsonLd([])).toBeNull()
  })
})

describe("organizationJsonLd", () => {
  it("builds an Organization from the site config", () => {
    const jsonLd = organizationJsonLd({
      name: "Baby Store",
      url: "https://store.example.com",
    })

    expect(jsonLd).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Baby Store",
      url: "https://store.example.com",
    })
  })
})