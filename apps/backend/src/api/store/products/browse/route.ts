import type {
  MedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  ProductStatus,
  QueryContext,
  getTotalVariantAvailability,
  getVariantAvailability,
} from "@medusajs/framework/utils"

import {
  bestSellingCounts,
  filterByAvailability,
  filterByMaterial,
  filterByMetadata,
  filterByPrice,
  sortProducts,
  type BrowseProductLike,
} from "./helpers"
import { BrowseProductsParamsSchema } from "./validators"

const DEFAULT_STORE_PRODUCT_FIELDS = [
  "id",
  "title",
  "subtitle",
  "description",
  "handle",
  "status",
  "is_giftcard",
  "discountable",
  "thumbnail",
  "collection_id",
  "type_id",
  "weight",
  "length",
  "height",
  "width",
  "hs_code",
  "origin_country",
  "mid_code",
  "material",
  "created_at",
  "updated_at",
  "type.*",
  "collection.*",
  "options.*",
  "options.values.*",
  "tags.*",
  "images.*",
  "variants.*",
  "variants.options.*",
  "variants.calculated_price.*",
  "categories.*",
  "metadata",
] as const

/**
 * Field list mirrors the core store route's default selection. The graph
 * query engine requires the parsed shape (concrete fields plus a `<relation>.*`
 * entry per expanded relation) — star-prefixed entries (e.g. `*variants`) must
 * not be used, as they break relation expansion for pivot relations such as
 * `variants.options`.
 */
const EXPANDED_STORE_PRODUCT_FIELDS = [...DEFAULT_STORE_PRODUCT_FIELDS]

/**
 * Maximum number of candidate products fetched from the product module per
 * request. Browse filters that cannot be pushed into the module query
 * (metadata, price range, availability) are applied server-side in this route,
 * so candidate fetching is bounded to keep requests predictable. Counts are
 * exact up to this cap; catalogs exceeding it need a search provider (the
 * project defers that decision; see ADR-0003).
 */
const MAX_CANDIDATE_PRODUCTS = 1000

export async function GET(
  req: MedusaStoreRequest,
  res: MedusaResponse
) {
  const parsed = BrowseProductsParamsSchema.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      parsed.error.issues.map((issue) => issue.message).join(", ")
    )
  }
  const params = parsed.data

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const salesChannelIds = req.publishable_key_context?.sales_channel_ids ?? []
  if (!salesChannelIds.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Publishable key needs to have a sales channel configured"
    )
  }

  const region = await fetchRegion(req, params.region_id)
  if (!region) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Region with id ${params.region_id} not found when populating the pricing context`
    )
  }

  const filters: Record<string, unknown> = {
    status: ProductStatus.PUBLISHED,
  }
  const scopedFilters = await applySalesChannelScopes(query, salesChannelIds)
  if (scopedFilters === "none") {
    return res.json({
      products: [],
      count: 0,
      offset: params.offset,
      limit: params.limit,
    })
  }
  Object.assign(filters, scopedFilters)
  if (params.q) {
    filters.q = params.q
  }
  if (params.handle) {
    filters.handle = params.handle
  }
  if (params.id) {
    filters.id = params.id
  }
  if (params.category_id) {
    filters.categories = {
      id: params.category_id,
      is_internal: false,
      is_active: true,
    }
  }
  if (params.collection_id) {
    filters.collection = { id: params.collection_id }
  }
  if (params.tag_id) {
    filters.tags = { id: params.tag_id }
  }
  if (params.option_value_id) {
    filters.option_value_id = params.option_value_id
  }

  const { data: products = [] } = await query.graph(
    {
      entity: "product",
      fields: [...EXPANDED_STORE_PRODUCT_FIELDS],
      filters,
      pagination: {
        skip: 0,
        take: MAX_CANDIDATE_PRODUCTS,
      },
      context: {
        variants: {
          calculated_price: QueryContext({
            region_id: params.region_id,
            currency_code: region.currency_code,
            ...(params.country_code ? { country_code: params.country_code } : {}),
          }),
        },
      },
    },
    {
      cache: {
        enable: true,
      },
    }
  )

  const browsable = products as BrowseProductLike[]

  const metadataFiltered = filterByMetadata(browsable, {
    gender: params.gender,
    brand: params.brand,
    season: params.season,
  })
  const materialFiltered = filterByMaterial(metadataFiltered, params.material)

  const priced = filterByPrice(
    materialFiltered,
    params.min_price,
    params.max_price
  )

  const variantIds = priced
    .flatMap((product) => product.variants)
    .map((variant) => variant.id)
  if (variantIds.length) {
    const availability = await resolveVariantAvailability(
      query,
      variantIds,
      salesChannelIds
    )
    for (const product of priced) {
      for (const variant of product.variants) {
        if (variant.manage_inventory) {
          variant.inventory_quantity =
            availability[variant.id]?.availability ?? 0
        }
      }
    }
  }

  const availabilityFiltered = filterByAvailability(
    priced,
    params.availability
  )

  let counts: Record<string, number> | undefined
  if (params.sort_by === "best_selling") {
    counts = await resolveBestSellingCounts(req)
  }

  const sorted = sortProducts(availabilityFiltered, params.sort_by, {
    q: params.q,
    counts,
  })

  const offset = params.offset
  const limit = params.limit
  const page = sorted.slice(offset, offset + limit)

  const sanitized = page.map(stripInternalMetadata)

  res.json({
    products: sanitized,
    count: sorted.length,
    offset,
    limit,
  })
}

/**
 * Replicates the core store products middleware `applyMaybeLinkFilterIfNecessary`
 * (verified against @medusajs/medusa 2.19.0). `sales_channel_id` is not a
 * product module property: when the system has a single sales channel the
 * filter is dropped; with multiple channels the ids are resolved through the
 * `product_sales_channel` link module and applied as a product `id` filter.
 * Returns "none" when the scoped channels have no products at all.
 */
async function applySalesChannelScopes(
  query: any,
  salesChannelIds: string[]
): Promise<Record<string, unknown> | "none"> {
  const { data: channels, metadata } = await query.graph({
    entity: "sales_channels",
    fields: ["id"],
    pagination: { skip: 0, take: 1 },
  })
  const salesChannelCount = metadata?.count ?? channels.length
  if (!(salesChannelCount > 1)) {
    return {}
  }
  const { data: links } = await query.graph({
    entity: "product_sales_channel",
    fields: ["product_id"],
    filters: { sales_channel_id: salesChannelIds },
  })
  if (!links.length) {
    return "none"
  }
  return { id: links.map((link: any) => link.product_id) }
}

async function fetchRegion(
  req: MedusaRequest,
  regionId: string
): Promise<{ id: string; currency_code: string } | null> {
  const regionModule = req.scope.resolve(Modules.REGION)
  const [region] = await regionModule.listRegions(
    { id: regionId },
    { take: 1 }
  )
  if (!region) {
    return null
  }
  return { id: region.id, currency_code: region.currency_code }
}

async function resolveVariantAvailability(
  query: any,
  variantIds: string[],
  salesChannelIds: string[]
): Promise<Record<string, { availability: number | null }>> {
  if (salesChannelIds.length === 1) {
    return getVariantAvailability(query, {
      variant_ids: variantIds,
      sales_channel_id: salesChannelIds[0],
    })
  }
  return getTotalVariantAvailability(query, { variant_ids: variantIds })
}

async function resolveBestSellingCounts(
  req: MedusaRequest
): Promise<Record<string, number>> {
  const orderModule = req.scope.resolve(Modules.ORDER)
  const orders = await orderModule.listOrders(
    {},
    { relations: ["items"], take: null }
  )
  const items = orders
    .filter((order: any) => order.status !== "cancelled")
    .flatMap((order: any) => order.items ?? [])
  return bestSellingCounts(items)
}

const stripInternalMetadata = (product: BrowseProductLike) => {
  const { metadata, ...rest } = product
  return rest
}