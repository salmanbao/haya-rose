import { getBaseURL } from "@lib/util/env"
import { listCategories } from "@lib/data/categories"
import { listCollections } from "@lib/data/collections"
import { listProducts } from "@lib/data/products"
import { listRegions } from "@lib/data/regions"
import { buildSitemapEntries, flattenCategoryPaths } from "@lib/seo/sitemap"
import type { MetadataRoute } from "next"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseURL().replace(/\/+$/, "")

  const regions = await listRegions()

  const countryCodes = Array.from(
    new Set(
      regions?.flatMap((region) =>
        region.countries?.map((country) => country.iso_2).filter(Boolean)
      )
    )
  ) as string[]

  if (countryCodes.length === 0) {
    return []
  }

  const categories = await listCategories()
  const categoryPaths = flattenCategoryPaths(categories ?? [])

  const { collections } = await listCollections({ fields: "handle" })
  const collectionHandles = collections
    .map((collection) => collection.handle)
    .filter(Boolean) as string[]

  const { products } = await listProducts({
    countryCode: countryCodes[0],
    queryParams: { limit: 100, fields: "handle" },
  }).then(({ response }) => response)
  const productHandles = products
    .map((product) => product.handle)
    .filter(Boolean) as string[]

  const entries = buildSitemapEntries({
    baseUrl,
    countryCodes,
    categoryPaths,
    collectionHandles,
    productHandles,
  })

  return entries.map((url) => ({ url }))
}
