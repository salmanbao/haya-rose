import { z } from "@medusajs/framework/zod"

export const SORT_BY_VALUES = [
  "created_at",
  "title",
  "price_asc",
  "price_desc",
  "best_selling",
  "relevance",
] as const

export const AVAILABILITY_VALUES = ["all", "in_stock", "out_of_stock"] as const

export const stringOrArray = z.union([z.string(), z.array(z.string())])

export const BrowseProductsParamsSchema = z
  .object({
    region_id: z.string(),
    country_code: z.string().optional(),
    q: z.string().optional(),
    handle: stringOrArray.optional(),
    id: stringOrArray.optional(),
    category_id: stringOrArray.optional(),
    collection_id: stringOrArray.optional(),
    tag_id: stringOrArray.optional(),
    option_value_id: stringOrArray.optional(),
    gender: z.string().optional(),
    brand: z.string().optional(),
    season: z.string().optional(),
    material: z.string().optional(),
    min_price: z.coerce.number().int().nonnegative().optional(),
    max_price: z.coerce.number().int().nonnegative().optional(),
    availability: z.enum(AVAILABILITY_VALUES).default("all"),
    sort_by: z.enum(SORT_BY_VALUES).default("created_at"),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().nonnegative().default(0),
  })
  .refine(
    (params) =>
      params.min_price === undefined ||
      params.max_price === undefined ||
      params.min_price <= params.max_price,
    {
      message: "min_price cannot be greater than max_price",
      path: ["min_price"],
    }
  )

export type BrowseProductsParams = z.infer<typeof BrowseProductsParamsSchema>
export type SortBy = (typeof SORT_BY_VALUES)[number]
export type Availability = (typeof AVAILABILITY_VALUES)[number]