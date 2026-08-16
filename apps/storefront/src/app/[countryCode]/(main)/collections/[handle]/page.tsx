import { Metadata } from "next"
import { notFound } from "next/navigation"

import { getCollectionByHandle, listCollections } from "@lib/data/collections"
import { listRegions } from "@lib/data/regions"
import { getBaseURL } from "@lib/util/env"
import { buildCanonicalUrl } from "@lib/seo/canonical"
import { StoreCollection, StoreRegion } from "@medusajs/types"
import CollectionTemplate from "@modules/collections/templates"
import {
  parseAvailability,
  parseGender,
  parseMinMaxPrice,
  parsePage,
  parseQuery,
  shouldNoindexStorePage,
} from "@lib/util/store-filter-params"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import { parseOptionValueIds } from "@lib/util/product-option-filters"

type Props = {
  params: Promise<{ handle: string; countryCode: string }>
  searchParams: Promise<
    Record<string, string | string[] | undefined> & {
      page?: string
      sortBy?: SortOptions
      optionValueIds?: string | string[]
    }
  >
}

export const PRODUCT_LIMIT = 12

export async function generateStaticParams() {
  const { collections } = await listCollections({
    fields: "*products",
  })

  if (!collections) {
    return []
  }

  const countryCodes = await listRegions().then(
    (regions: StoreRegion[]) =>
      regions
        ?.map((r) => r.countries?.map((c) => c.iso_2))
        .flat()
        .filter(Boolean) as string[]
  )

  const collectionHandles = collections.map(
    (collection: StoreCollection) => collection.handle
  )

  const staticParams = countryCodes
    ?.map((countryCode: string) =>
      collectionHandles.map((handle: string | undefined) => ({
        countryCode,
        handle,
      }))
    )
    .flat()

  return staticParams
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const searchParams = await props.searchParams
  const collection = await getCollectionByHandle(params.handle)

  if (!collection) {
    notFound()
  }

  const metadata: Metadata = {
    title: collection.title,
    description: `${collection.title} collection`,
    alternates: {
      canonical: buildCanonicalUrl({
        baseUrl: getBaseURL(),
        countryCode: params.countryCode,
        path: ["collections", params.handle],
        params: searchParams,
      }),
    },
  }
  if (shouldNoindexStorePage(searchParams)) {
    metadata.robots = { index: false, follow: false }
  }
  return metadata
}

export default async function CollectionPage(props: Props) {
  const searchParams = await props.searchParams
  const params = await props.params
  const { sortBy, page } = searchParams
  const optionValueIds = parseOptionValueIds(searchParams)
  const q = parseQuery(searchParams)
  const gender = parseGender(searchParams)
  const availability = parseAvailability(searchParams)
  const { minPrice, maxPrice } = parseMinMaxPrice(searchParams)
  const pageNumber = parsePage(page)

  const collection = await getCollectionByHandle(params.handle).then(
    (collection) => collection
  )

  if (!collection) {
    notFound()
  }

  return (
    <CollectionTemplate
      collection={collection}
      page={String(pageNumber)}
      sortBy={sortBy}
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
