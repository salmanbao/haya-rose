import { HttpTypes } from "@medusajs/types"

type CategoryNode = HttpTypes.StoreProductCategory

export type CategoryPath = string[]

export const flattenCategoryPaths = (
  categories: CategoryNode[],
  prefix: string[] = []
): CategoryPath[] => {
  return categories.flatMap((category) => {
    const path = [...prefix, category.handle]
    const children = flattenCategoryPaths(category.category_children ?? [], path)
    return [path, ...children]
  })
}

export const resolveCategoryPath = (
  categories: CategoryNode[],
  handle: string,
  prefixNames: string[] = [],
  prefixHandles: string[] = []
): { names: string[]; handles: string[] } | null => {
  for (const category of categories) {
    const names = [...prefixNames, category.name]
    const handles = [...prefixHandles, category.handle]

    if (category.handle === handle) {
      return { names, handles }
    }

    const found = resolveCategoryPath(
      category.category_children ?? [],
      handle,
      names,
      handles
    )
    if (found) {
      return found
    }
  }

  return null
}

export const buildSitemapEntries = ({
  baseUrl,
  countryCodes,
  categoryPaths,
  collectionHandles,
  productHandles,
}: {
  baseUrl: string
  countryCodes: string[]
  categoryPaths: CategoryPath[]
  collectionHandles: string[]
  productHandles: string[]
}): string[] => {
  const root = baseUrl.replace(/\/+$/, "")

  return countryCodes.flatMap((countryCode) => {
    const base = `${root}/${countryCode}`

    return [
      base,
      ...categoryPaths.map((path) => `${base}/categories/${path.join("/")}`),
      ...collectionHandles.map((handle) => `${base}/collections/${handle}`),
      ...productHandles.map((handle) => `${base}/products/${handle}`),
    ]
  })
}
