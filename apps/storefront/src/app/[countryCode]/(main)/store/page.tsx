import { Metadata } from "next"

import {
  parseAvailability,
  parseGender,
  parseMinMaxPrice,
  parsePage,
  parseQuery,
  shouldNoindexStorePage,
} from "@lib/util/store-filter-params"
import { parseOptionValueIds } from "@lib/util/product-option-filters"
import { getBaseURL } from "@lib/util/env"
import { buildCanonicalUrl } from "@lib/seo/canonical"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import StoreTemplate from "@modules/store/templates"

type StorePageSearchParams = Record<string, string | string[] | undefined> & {
  sortBy?: SortOptions
  page?: string
  optionValueIds?: string | string[]
}

type Params = {
  searchParams: Promise<StorePageSearchParams>
  params: Promise<{
    countryCode: string
  }>
}

export async function generateMetadata(props: Params): Promise<Metadata> {
  const params = await props.params
  const searchParams = await props.searchParams
  const metadata: Metadata = {
    title: "Store",
    description: "Explore all of our products.",
  }
  metadata.alternates = {
    canonical: buildCanonicalUrl({
      baseUrl: getBaseURL(),
      countryCode: params.countryCode,
      path: ["store"],
      params: searchParams,
    }),
  }
  if (shouldNoindexStorePage(searchParams)) {
    metadata.robots = { index: false, follow: false }
  }
  return metadata
}

export default async function StorePage(props: Params) {
  const params = await props.params
  const searchParams = await props.searchParams
  const { sortBy, page } = searchParams
  const optionValueIds = parseOptionValueIds(searchParams)
  const q = parseQuery(searchParams)
  const gender = parseGender(searchParams)
  const availability = parseAvailability(searchParams)
  const { minPrice, maxPrice } = parseMinMaxPrice(searchParams)
  const pageNumber = parsePage(page)

  return (
    <StoreTemplate
      sortBy={sortBy}
      page={String(pageNumber)}
      countryCode={params.countryCode}
      optionValueIds={optionValueIds}
      q={q}
      gender={gender}
      availability={availability}
      minPrice={minPrice}
      maxPrice={maxPrice}
    />
  )
}