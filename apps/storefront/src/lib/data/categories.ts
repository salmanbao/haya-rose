import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"
import { getCacheOptions } from "./cookies"
import { findCategoryInTree, pathMatchesChain } from "@lib/util/category-path"

const CATEGORY_FIELDS =
  "*category_children, *products, *parent_category, *parent_category.parent_category"

export const listCategories = async (query?: Record<string, unknown>) => {
  const next = {
    ...(await getCacheOptions("categories")),
  }

  const limit = query?.limit || 100

  return sdk.client
    .fetch<{ product_categories: HttpTypes.StoreProductCategory[] }>(
      "/store/product-categories",
      {
        query: {
          fields: CATEGORY_FIELDS,
          include_descendants_tree: true,
          limit,
          ...query,
        },
        next,
        cache: "force-cache",
      }
    )
    .then(({ product_categories }) => product_categories)
}

export const getCategoryByHandle = async (categoryPath: string[]): Promise<
  | {
      category: HttpTypes.StoreProductCategory
      chain: HttpTypes.StoreProductCategory[]
    }
  | undefined
> => {
  const next = {
    ...(await getCacheOptions("categories")),
  }

  const categories = await sdk.client
    .fetch<{ product_categories: HttpTypes.StoreProductCategory[] }>(
      "/store/product-categories",
      {
        query: {
          fields: CATEGORY_FIELDS,
          include_descendants_tree: true,
        },
        next,
        cache: "force-cache",
      }
    )
    .then(({ product_categories }) => product_categories)

  const handle = categoryPath[categoryPath.length - 1]
  const found = findCategoryInTree(categories ?? [], handle)

  if (!found || !pathMatchesChain(categoryPath, found.chain)) {
    return undefined
  }

  return found
}
