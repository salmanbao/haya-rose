import { Metadata } from "next"
import { notFound } from "next/navigation"

import { getCategoryByHandle, listCategories } from "@lib/data/categories"
import { listRegions } from "@lib/data/regions"
import { getBaseURL } from "@lib/util/env"
import { buildCanonicalUrl } from "@lib/seo/canonical"
import { breadcrumbJsonLd } from "@lib/seo/json-ld"
import { getSiteConfig } from "@lib/seo/site-config"
import { flattenCategoryPaths } from "@lib/seo/sitemap"
import { StoreRegion } from "@medusajs/types"
import CategoryTemplate from "@modules/categories/templates"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { parseOptionValueIds } from "@lib/util/product-option-filters"

const siteConfig = getSiteConfig()

type Props = {
  params: Promise<{ category: string[]; countryCode: string }>
  searchParams: Promise<
    Record<string, string | string[] | undefined> & {
      sortBy?: SortOptions
      page?: string
      optionValueIds?: string | string[]
    }
  >
}

export async function generateStaticParams() {
  const product_categories = await listCategories()

  if (!product_categories) {
    return []
  }

  const countryCodes = await listRegions().then((regions: StoreRegion[]) =>
    regions?.map((r) => r.countries?.map((c) => c.iso_2)).flat()
  )

  const categoryPaths = flattenCategoryPaths(product_categories)

  const staticParams = countryCodes
    ?.map((countryCode: string | undefined) =>
      categoryPaths.map((path: string[]) => ({
        countryCode,
        category: path,
      }))
    )
    .flat()

  return staticParams
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const searchParams = await props.searchParams
  try {
    const productCategory = await getCategoryByHandle(params.category)

    if (!productCategory) {
      notFound()
    }

    const canonicalPath = productCategory.chain.map((category) => category.handle)

    return {
      title: productCategory.category.name,
      description: productCategory.category.description ?? undefined,
      alternates: {
        canonical: buildCanonicalUrl({
          baseUrl: getBaseURL(),
          countryCode: params.countryCode,
          path: ["categories", ...canonicalPath],
          params: searchParams,
        }),
      },
    }
  } catch {
    notFound()
  }
}

export default async function CategoryPage(props: Props) {
  const searchParams = await props.searchParams
  const params = await props.params
  const { sortBy, page } = searchParams
  const optionValueIds = parseOptionValueIds(searchParams)

  const productCategory = await getCategoryByHandle(params.category)

  if (!productCategory) {
    notFound()
  }

  const chain = productCategory.chain

  const breadcrumbItems = [
    {
      name: siteConfig.name,
      url: `${getBaseURL().replace(/\/+$/, "")}/${params.countryCode}`,
    },
    ...chain.map((category, index) => {
      const handles = chain.slice(0, index + 1).map((c) => c.handle)
      return {
        name: category.name,
        url: `${getBaseURL().replace(/\/+$/, "")}/${params.countryCode}/categories/${handles.join("/")}`,
      }
    }),
  ]

  const breadcrumbJsonLdValue = breadcrumbJsonLd(breadcrumbItems)

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLdValue) }}
      />
      <CategoryTemplate
        category={productCategory.category}
        sortBy={sortBy}
        page={page}
        countryCode={params.countryCode}
        optionValueIds={optionValueIds}
      />
    </>
  )
}
