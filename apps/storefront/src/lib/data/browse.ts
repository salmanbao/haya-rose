"use server"

import { sdk } from "@lib/config"
import {
  AvailabilityFilter,
  GenderFilter,
} from "@lib/util/store-filter-params"
import { HttpTypes } from "@medusajs/types"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { getAuthHeaders, getCacheOptions } from "./cookies"
import { getRegion } from "./regions"

export type BrowseProductsParams = {
  countryCode: string
  q?: string
  handle?: string | string[]
  id?: string | string[]
  gender?: GenderFilter
  availability?: AvailabilityFilter
  minPrice?: number
  maxPrice?: number
  categoryId?: string
  collectionId?: string
  optionValueIds?: string[]
  sortBy?: SortOptions
  page?: number
  limit?: number
}

/**
 * Server-side browsing through the backend browse route: filtering, sorting
 * and counts are backend-authoritative (AGENTS.md §11) — the storefront never
 * downloads the catalog to filter in the browser.
 */
export const browseProducts = async ({
  countryCode,
  q,
  handle,
  id,
  gender,
  availability,
  minPrice,
  maxPrice,
  categoryId,
  collectionId,
  optionValueIds,
  sortBy,
  page = 1,
  limit = 12,
}: BrowseProductsParams): Promise<{
  products: HttpTypes.StoreProduct[]
  count: number
  nextPage: number | null
}> => {
  const region = await getRegion(countryCode)

  if (!region) {
    return { products: [], count: 0, nextPage: null }
  }

  const offset = (page - 1) * limit
  const optionFilters = Array.from(
    new Set((optionValueIds ?? []).filter(Boolean))
  )

  const query: Record<string, string | number | string[]> = {
    region_id: region.id,
    offset,
    limit,
  }

  if (q) query.q = q
  if (handle) query.handle = handle
  if (id) query.id = id
  if (gender) query.gender = gender
  if (availability) query.availability = availability
  if (minPrice !== undefined) query.min_price = minPrice
  if (maxPrice !== undefined) query.max_price = maxPrice
  if (categoryId) query.category_id = categoryId
  if (collectionId) query.collection_id = collectionId
  if (optionFilters.length) query.option_value_id = optionFilters
  if (sortBy && sortBy !== "created_at") query.sort_by = sortBy

  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("products")),
  }

  const { products, count } = await sdk.client.fetch<{
    products: HttpTypes.StoreProduct[]
    count: number
  }>(`/store/products/browse`, {
    method: "GET",
    query,
    headers,
    next,
    cache: "force-cache",
  })

  const nextPage = count > offset + limit ? page + 1 : null

  return { products, count, nextPage }
}

/**
 * PDP lookup: fetches a single product by handle through the browse route so
 * availability and calculated prices are resolved for the market's sales
 * channel (the standard store products route cannot compute availability
 * under the multi-channel publishable key — verified against 2.19.0).
 */
export const getProductByHandle = async (
  countryCode: string,
  handle: string
): Promise<HttpTypes.StoreProduct | null> => {
  const { products } = await browseProducts({
    countryCode,
    handle,
    limit: 1,
  })
  return products[0] ?? null
}