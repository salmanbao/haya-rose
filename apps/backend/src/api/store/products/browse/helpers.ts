import type {
  Availability,
  SortBy,
} from "./validators"

export interface BrowseVariantLike {
  id: string
  manage_inventory?: boolean
  allow_backorder?: boolean
  inventory_quantity?: number
  calculated_price?: {
    calculated_amount: number
    currency_code: string
  } | null
}

export interface BrowseProductLike {
  id: string
  title: string
  description?: string | null
  handle?: string | null
  metadata?: Record<string, unknown> | null
  material?: string | null
  created_at: string | Date
  variants: BrowseVariantLike[]
}

export interface MetadataFilters {
  gender?: string
  brand?: string
  season?: string
}

/**
 * Returns the lowest calculated price among a product's variants, or null
 * when no variant has a calculated price for the queried context.
 */
export const minVariantPrice = (product: BrowseProductLike): number | null => {
  const prices = product.variants
    .map((variant) => variant.calculated_price?.calculated_amount)
    .filter((amount): amount is number => typeof amount === "number")
  if (!prices.length) {
    return null
  }
  return Math.min(...prices)
}

/**
 * Keeps products whose lowest variant price is within [min, max].
 * Bounds are inclusive. Products without a price in the queried context are
 * excluded whenever a bound is present, since no price can be compared.
 */
export const filterByPrice = (
  products: BrowseProductLike[],
  min?: number,
  max?: number
): BrowseProductLike[] => {
  if (min === undefined && max === undefined) {
    return products
  }
  return products.filter((product) => {
    const price = minVariantPrice(product)
    if (price === null) {
      return false
    }
    if (min !== undefined && price < min) {
      return false
    }
    if (max !== undefined && price > max) {
      return false
    }
    return true
  })
}

/**
 * Classifies a product as in stock when at least one variant is available,
 * mirroring the storefront availability semantics (unmanaged inventory and
 * backorder-allowed variants are always available).
 */
export const productAvailability = (
  product: BrowseProductLike
): "in_stock" | "out_of_stock" => {
  const hasAvailableVariant = product.variants.some((variant) => {
    if (!variant.manage_inventory) {
      return true
    }
    if (variant.allow_backorder) {
      return true
    }
    return (variant.inventory_quantity ?? 0) > 0
  })
  return hasAvailableVariant ? "in_stock" : "out_of_stock"
}

export const filterByAvailability = (
  products: BrowseProductLike[],
  availability: Availability
): BrowseProductLike[] => {
  if (availability === "all") {
    return products
  }
  return products.filter(
    (product) => productAvailability(product) === availability
  )
}

/**
 * Keeps products matching every given metadata filter (string equality on the
 * product metadata JSON). Products missing a filtered key are excluded.
 */
export const filterByMetadata = (
  products: BrowseProductLike[],
  filters: MetadataFilters
): BrowseProductLike[] => {
  const entries = Object.entries(filters).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined && entry[1] !== ""
  )
  if (!entries.length) {
    return products
  }
  return products.filter((product) => {
    const metadata = product.metadata ?? {}
    return entries.every(
      ([key, value]) => metadata[key] === value
    )
  })
}

export const filterByMaterial = (
  products: BrowseProductLike[],
  material?: string
): BrowseProductLike[] => {
  if (!material) {
    return products
  }
  return products.filter((product) => product.material === material)
}

/**
 * Simple deterministic relevance score for a text query: title prefix match
 * (0), title substring (1), description substring (2), otherwise 3.
 * Comparisons are case insensitive.
 */
export const relevanceScore = (
  product: BrowseProductLike,
  q: string
): number => {
  const query = q.toLowerCase()
  const title = (product.title ?? "").toLowerCase()
  const description = (product.description ?? "").toLowerCase()
  if (title.startsWith(query)) {
    return 0
  }
  if (title.includes(query)) {
    return 1
  }
  if (description.includes(query)) {
    return 2
  }
  return 3
}

export interface SortContext {
  q?: string
  counts?: Record<string, number>
}

const createdAtTime = (product: BrowseProductLike): number => {
  const value = product.created_at
  if (typeof value === "string") {
    return Date.parse(value)
  }
  return value.getTime()
}

const byCreatedAtDesc = (a: BrowseProductLike, b: BrowseProductLike) =>
  createdAtTime(b) - createdAtTime(a)

/**
 * Orders products deterministically. Unpriced products always sort after
 * priced products for price sorts; unsold products sort after sold products
 * for best_selling. Ties break by created_at descending.
 */
export const sortProducts = (
  products: BrowseProductLike[],
  sortBy: SortBy,
  context: SortContext
): BrowseProductLike[] => {
  const sorted = [...products]

  switch (sortBy) {
    case "title":
      sorted.sort((a, b) => {
        const byTitle = a.title.localeCompare(b.title)
        return byTitle !== 0 ? byTitle : byCreatedAtDesc(a, b)
      })
      break
    case "price_asc":
      sorted.sort((a, b) => {
        const priceA = minVariantPrice(a)
        const priceB = minVariantPrice(b)
        if (priceA === null && priceB === null) {
          return byCreatedAtDesc(a, b)
        }
        if (priceA === null) {
          return 1
        }
        if (priceB === null) {
          return -1
        }
        return priceA !== priceB ? priceA - priceB : byCreatedAtDesc(a, b)
      })
      break
    case "price_desc":
      sorted.sort((a, b) => {
        const priceA = minVariantPrice(a)
        const priceB = minVariantPrice(b)
        if (priceA === null && priceB === null) {
          return byCreatedAtDesc(a, b)
        }
        if (priceA === null) {
          return 1
        }
        if (priceB === null) {
          return -1
        }
        return priceA !== priceB ? priceB - priceA : byCreatedAtDesc(a, b)
      })
      break
    case "best_selling":
      sorted.sort((a, b) => {
        const salesA = context.counts?.[a.id] ?? 0
        const salesB = context.counts?.[b.id] ?? 0
        return salesA !== salesB ? salesB - salesA : byCreatedAtDesc(a, b)
      })
      break
    case "relevance": {
      const { q } = context
      if (!q) {
        sorted.sort(byCreatedAtDesc)
        break
      }
      sorted.sort((a, b) => {
        const byScore = relevanceScore(a, q) - relevanceScore(b, q)
        return byScore !== 0 ? byScore : byCreatedAtDesc(a, b)
      })
      break
    }
    case "created_at":
    default:
      sorted.sort(byCreatedAtDesc)
      break
  }

  return sorted
}

export interface OrderItemCountLike {
  product_id?: string | null
  quantity: number | string
}

/**
 * Aggregates sold quantities per product from order line items. Callers pass
 * only items from orders that qualify as sales (e.g. non-cancelled orders).
 */
export const bestSellingCounts = (
  items: OrderItemCountLike[]
): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const item of items) {
    if (!item.product_id) {
      continue
    }
    counts[item.product_id] =
      (counts[item.product_id] ?? 0) + Number(item.quantity)
  }
  return counts
}