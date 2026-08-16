import { browseProducts } from "@lib/data/browse"
import { getRegion } from "@lib/data/regions"
import {
  AvailabilityFilter,
  GenderFilter,
} from "@lib/util/store-filter-params"
import { OptionValueIds } from "@lib/util/product-option-filters"
import ProductPreview from "@modules/products/components/product-preview"
import { Pagination } from "@modules/store/components/pagination"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

const PRODUCT_LIMIT = 12

export default async function PaginatedProducts({
  sortBy,
  page,
  collectionId,
  categoryId,
  countryCode,
  optionValueIds,
  q,
  gender,
  availability,
  minPrice,
  maxPrice,
}: {
  sortBy?: SortOptions
  page: number
  collectionId?: string
  categoryId?: string
  countryCode: string
  optionValueIds?: OptionValueIds
  q?: string
  gender?: GenderFilter
  availability?: AvailabilityFilter
  minPrice?: number
  maxPrice?: number
}) {
  const { products, count } = await browseProducts({
    page,
    limit: PRODUCT_LIMIT,
    sortBy,
    countryCode,
    collectionId,
    categoryId,
    optionValueIds,
    q,
    gender,
    availability,
    minPrice,
    maxPrice,
  })

  const region = await getRegion(countryCode)

  if (!region) {
    return null
  }

  const totalPages = Math.ceil(count / PRODUCT_LIMIT)

  if (products.length === 0) {
    return (
      <p
        className="text-ui-fg-muted txt-compact-medium py-8"
        data-testid="no-products-message"
      >
        No products match your filters.
      </p>
    )
  }

  return (
    <>
      <ul
        className="grid grid-cols-2 w-full small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-8"
        data-testid="products-list"
      >
        {products.map((p) => {
          return (
            <li key={p.id}>
              <ProductPreview product={p} region={region} />
            </li>
          )
        })}
      </ul>
      {totalPages > 1 && (
        <Pagination
          data-testid="product-pagination"
          page={page}
          totalPages={totalPages}
        />
      )}
    </>
  )
}