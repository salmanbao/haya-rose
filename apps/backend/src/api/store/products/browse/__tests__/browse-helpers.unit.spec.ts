import {
  filterByAvailability,
  filterByMetadata,
  filterByPrice,
  minVariantPrice,
  productAvailability,
  relevanceScore,
  sortProducts,
  type BrowseProductLike,
} from "../helpers"

const makeProduct = (overrides: Partial<BrowseProductLike> = {}): BrowseProductLike => {
  const { metadata, ...rest } = overrides
  return {
    id: "prod_test",
    title: "Test Product",
    description: "A test product description.",
    handle: "test-product",
    metadata: {
      gender: "unisex",
      brand: "Baby Store",
      season: "all-season",
      ...(metadata ?? {}),
    },
    material: "100% cotton",
    created_at: "2026-01-01T00:00:00.000Z",
    variants: [
      {
        id: "variant_1",
        manage_inventory: true,
        allow_backorder: false,
        inventory_quantity: 5,
        calculated_price: {
          calculated_amount: 2500,
          currency_code: "pkr",
        },
      },
    ],
    ...rest,
  }
}

const makeVariant = (overrides: Record<string, unknown> = {}) => ({
  id: "variant_x",
  manage_inventory: true,
  allow_backorder: false,
  inventory_quantity: 5,
  calculated_price: {
    calculated_amount: 2500,
    currency_code: "pkr",
  },
  ...overrides,
})

describe("minVariantPrice", () => {
  it("returns the lowest calculated amount across variants", () => {
    const product = makeProduct({
      variants: [
        makeVariant({ calculated_price: { calculated_amount: 5000, currency_code: "pkr" } }),
        makeVariant({ id: "variant_2", calculated_price: { calculated_amount: 3000, currency_code: "pkr" } }),
      ],
    })
    expect(minVariantPrice(product)).toBe(3000)
  })

  it("returns null when no variant has a calculated price", () => {
    const product = makeProduct({ variants: [makeVariant({ calculated_price: null })] })
    expect(minVariantPrice(product)).toBeNull()
  })

  it("returns null when the product has no variants", () => {
    expect(minVariantPrice(makeProduct({ variants: [] }))).toBeNull()
  })
})

describe("filterByPrice", () => {
  it("keeps products whose lowest variant price is within the range", () => {
    const tee = makeProduct({ id: "prod_tee", title: "Tee" })
    const dress = makeProduct({
      id: "prod_dress",
      title: "Dress",
      variants: [makeVariant({ calculated_price: { calculated_amount: 4500, currency_code: "pkr" } })],
    })
    const result = filterByPrice([tee, dress], 2400, 2900)
    expect(result.map((p) => p.id)).toEqual(["prod_tee"])
  })

  it("applies only the lower bound when max is undefined", () => {
    const tee = makeProduct({ id: "prod_tee", title: "Tee" })
    const dress = makeProduct({
      id: "prod_dress",
      title: "Dress",
      variants: [makeVariant({ calculated_price: { calculated_amount: 4500, currency_code: "pkr" } })],
    })
    expect(filterByPrice([tee, dress], 4000).map((p) => p.id)).toEqual(["prod_dress"])
  })

  it("applies only the upper bound when min is undefined", () => {
    const tee = makeProduct({ id: "prod_tee", title: "Tee" })
    const dress = makeProduct({
      id: "prod_dress",
      title: "Dress",
      variants: [makeVariant({ calculated_price: { calculated_amount: 4500, currency_code: "pkr" } })],
    })
    expect(filterByPrice([tee, dress], undefined, 3000).map((p) => p.id)).toEqual(["prod_tee"])
  })

  it("excludes products without a price in the currency when a range is given", () => {
    const noPrice = makeProduct({ id: "prod_noprice", variants: [] })
    const tee = makeProduct({ id: "prod_tee", title: "Tee" })
    expect(filterByPrice([noPrice, tee], 1000, 5000).map((p) => p.id)).toEqual(["prod_tee"])
  })

  it("keeps products without a price when no range is given", () => {
    const noPrice = makeProduct({ id: "prod_noprice", variants: [] })
    expect(filterByPrice([noPrice], undefined, undefined).map((p) => p.id)).toEqual(["prod_noprice"])
  })

  it("treats the bounds as inclusive", () => {
    const exact = makeProduct({ id: "prod_exact" })
    expect(filterByPrice([exact], 2500, 2500).map((p) => p.id)).toEqual(["prod_exact"])
  })
})

describe("productAvailability", () => {
  it("is available when a variant has inventory", () => {
    expect(productAvailability(makeProduct())).toBe("in_stock")
  })

  it("is available when a variant does not manage inventory", () => {
    const product = makeProduct({
      variants: [makeVariant({ manage_inventory: false, inventory_quantity: 0 })],
    })
    expect(productAvailability(product)).toBe("in_stock")
  })

  it("is available when a variant allows backorder", () => {
    const product = makeProduct({
      variants: [makeVariant({ allow_backorder: true, inventory_quantity: 0 })],
    })
    expect(productAvailability(product)).toBe("in_stock")
  })

  it("is out of stock when all managed variants have zero inventory", () => {
    const product = makeProduct({
      variants: [
        makeVariant({ id: "variant_1", inventory_quantity: 0 }),
        makeVariant({ id: "variant_2", inventory_quantity: 0 }),
      ],
    })
    expect(productAvailability(product)).toBe("out_of_stock")
  })

  it("is out of stock when a product has no variants", () => {
    expect(productAvailability(makeProduct({ variants: [] }))).toBe("out_of_stock")
  })
})

describe("filterByAvailability", () => {
  it("keeps everything for 'all'", () => {
    const inStock = makeProduct({ id: "prod_in" })
    const outOfStock = makeProduct({ id: "prod_out", variants: [makeVariant({ inventory_quantity: 0 })] })
    expect(filterByAvailability([inStock, outOfStock], "all").map((p) => p.id)).toEqual([
      "prod_in",
      "prod_out",
    ])
  })

  it("keeps only in-stock products for 'in_stock'", () => {
    const inStock = makeProduct({ id: "prod_in" })
    const outOfStock = makeProduct({ id: "prod_out", variants: [makeVariant({ inventory_quantity: 0 })] })
    expect(filterByAvailability([inStock, outOfStock], "in_stock").map((p) => p.id)).toEqual(["prod_in"])
  })

  it("keeps only out-of-stock products for 'out_of_stock'", () => {
    const inStock = makeProduct({ id: "prod_in" })
    const outOfStock = makeProduct({ id: "prod_out", variants: [makeVariant({ inventory_quantity: 0 })] })
    expect(filterByAvailability([inStock, outOfStock], "out_of_stock").map((p) => p.id)).toEqual([
      "prod_out",
    ])
  })
})

describe("filterByMetadata", () => {
  const girls = makeProduct({ id: "prod_girls", metadata: { gender: "girls" } })
  const unisex = makeProduct({ id: "prod_unisex", metadata: { gender: "unisex" } })

  it("filters by gender", () => {
    expect(filterByMetadata([girls, unisex], { gender: "girls" }).map((p) => p.id)).toEqual([
      "prod_girls",
    ])
  })

  it("filters by brand", () => {
    const other = makeProduct({ id: "prod_other", metadata: { brand: "Other Brand" } })
    expect(filterByMetadata([girls, other], { brand: "Baby Store" }).map((p) => p.id)).toEqual([
      "prod_girls",
    ])
  })

  it("filters by season", () => {
    const winter = makeProduct({ id: "prod_winter", metadata: { season: "winter" } })
    expect(filterByMetadata([girls, winter], { season: "all-season" }).map((p) => p.id)).toEqual([
      "prod_girls",
    ])
  })

  it("excludes products missing the metadata key when filtering on it", () => {
    const noMetadata = makeProduct({ id: "prod_none", metadata: {} })
    expect(filterByMetadata([girls, noMetadata], { gender: "girls" }).map((p) => p.id)).toEqual([
      "prod_girls",
    ])
  })

  it("keeps everything when no metadata filters are given", () => {
    expect(filterByMetadata([girls, unisex], {}).map((p) => p.id)).toEqual(["prod_girls", "prod_unisex"])
  })
})

describe("relevanceScore", () => {
  const base = makeProduct()

  it("scores a title prefix match as most relevant", () => {
    const titleMatch = makeProduct({ id: "prod_title", title: "Baby Sleepsuit" })
    const descMatch = makeProduct({
      id: "prod_desc",
      title: "Unisex Onesie",
      description: "A soft baby sleepsuit for newborns.",
    })
    expect(relevanceScore(titleMatch, "baby")).toBeLessThan(relevanceScore(descMatch, "baby"))
  })

  it("scores a title substring match above a description-only match", () => {
    const titleMatch = makeProduct({ id: "prod_title", title: "Sleepy Baby Blanket" })
    const descMatch = makeProduct({
      id: "prod_desc",
      title: "Unisex Onesie",
      description: "A soft baby sleepsuit for newborns.",
    })
    expect(relevanceScore(titleMatch, "baby")).toBeLessThan(relevanceScore(descMatch, "baby"))
  })

  it("is case insensitive", () => {
    expect(relevanceScore(makeProduct({ title: "Baby Sleepsuit" }), "BABY")).toBe(
      relevanceScore(makeProduct({ title: "Baby Sleepsuit" }), "baby")
    )
  })

  it("scores non-matching titles lowest", () => {
    const descOnly = makeProduct({
      id: "prod_desc",
      title: "Unrelated Title",
      description: "Contains the word baby somewhere.",
    })
    const unrelated = makeProduct({ id: "prod_unrelated", title: "Completely Different" })
    expect(relevanceScore(descOnly, "baby")).toBeLessThan(relevanceScore(unrelated, "baby"))
  })

  it("returns a high score when the query appears in neither title nor description", () => {
    expect(relevanceScore(makeProduct({ title: "Unrelated", description: "Nothing here" }), "zzz")).toBe(
      relevanceScore(makeProduct({ title: "Unrelated", description: "Nothing here" }), "zzz")
    )
  })
})

describe("sortProducts", () => {
  const sleepsuit = makeProduct({
    id: "prod_sleepsuit",
    title: "Unisex Cotton Sleepsuit",
    created_at: "2026-01-03T00:00:00.000Z",
    variants: [makeVariant({ calculated_price: { calculated_amount: 2200, currency_code: "pkr" } })],
  })
  const tee = makeProduct({
    id: "prod_tee",
    title: "Baby Cotton T-Shirt",
    created_at: "2026-01-01T00:00:00.000Z",
    variants: [makeVariant({ calculated_price: { calculated_amount: 2500, currency_code: "pkr" } })],
  })
  const dress = makeProduct({
    id: "prod_dress",
    title: "Girls' Cotton Dress",
    created_at: "2026-01-02T00:00:00.000Z",
    variants: [makeVariant({ calculated_price: { calculated_amount: 4500, currency_code: "pkr" } })],
  })

  it("sorts by created_at descending by default", () => {
    expect(sortProducts([tee, dress, sleepsuit], "created_at", {}).map((p) => p.id)).toEqual([
      "prod_sleepsuit",
      "prod_dress",
      "prod_tee",
    ])
  })

  it("sorts by title ascending", () => {
    expect(sortProducts([tee, dress, sleepsuit], "title", {}).map((p) => p.id)).toEqual([
      "prod_tee",
      "prod_dress",
      "prod_sleepsuit",
    ])
  })

  it("sorts by price ascending using the lowest variant price", () => {
    expect(sortProducts([tee, dress, sleepsuit], "price_asc", {}).map((p) => p.id)).toEqual([
      "prod_sleepsuit",
      "prod_tee",
      "prod_dress",
    ])
  })

  it("sorts by price descending", () => {
    expect(sortProducts([tee, dress, sleepsuit], "price_desc", {}).map((p) => p.id)).toEqual([
      "prod_dress",
      "prod_tee",
      "prod_sleepsuit",
    ])
  })

  it("sorts unpriced products after priced products for price sorts", () => {
    const noPrice = makeProduct({ id: "prod_noprice", variants: [] })
    expect(sortProducts([noPrice, tee], "price_asc", {}).map((p) => p.id)).toEqual(["prod_tee", "prod_noprice"])
  })

  it("sorts by best selling quantity descending, ties by created_at descending", () => {
    const counts = { prod_tee: 2, prod_dress: 5 }
    expect(sortProducts([tee, dress, sleepsuit], "best_selling", { counts }).map((p) => p.id)).toEqual([
      "prod_dress",
      "prod_tee",
      "prod_sleepsuit",
    ])
  })

  it("orders unsold products after sold products for best_selling", () => {
    const counts = { prod_tee: 3 }
    expect(sortProducts([tee, dress, sleepsuit], "best_selling", { counts }).map((p) => p.id)).toEqual([
      "prod_tee",
      "prod_sleepsuit",
      "prod_dress",
    ])
  })

  it("sorts by relevance with a query, title matches first", () => {
    const titleMatch = makeProduct({
      id: "prod_title",
      title: "Baby Sleepsuit",
      created_at: "2026-01-01T00:00:00.000Z",
    })
    const descMatch = makeProduct({
      id: "prod_desc",
      title: "Unisex Onesie",
      description: "A soft baby sleepsuit.",
      created_at: "2026-01-02T00:00:00.000Z",
    })
    expect(sortProducts([descMatch, titleMatch], "relevance", { q: "sleepsuit" }).map((p) => p.id)).toEqual([
      "prod_title",
      "prod_desc",
    ])
  })

  it("falls back to created_at descending for relevance without a query", () => {
    expect(sortProducts([tee, dress], "relevance", {}).map((p) => p.id)).toEqual(["prod_dress", "prod_tee"])
  })

  it("breaks price ties by created_at descending", () => {
    const tee2 = makeProduct({
      id: "prod_tee2",
      title: "Second Tee",
      created_at: "2026-01-05T00:00:00.000Z",
    })
    expect(sortProducts([tee, tee2], "price_asc", {}).map((p) => p.id)).toEqual(["prod_tee2", "prod_tee"])
  })
})