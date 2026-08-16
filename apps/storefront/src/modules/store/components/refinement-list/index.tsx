"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { FormEvent, useCallback, useMemo, useRef } from "react"

import {
  parseAvailability,
  parseGender,
  parseMinMaxPrice,
  parseQuery,
} from "@lib/util/store-filter-params"
import {
  OPTION_VALUE_QUERY_KEY,
  parseOptionValueIds,
} from "@lib/util/product-option-filters"
import FilterRadioGroup from "@modules/common/components/filter-radio-group"
import { Text } from "@modules/common/components/ui"
import OptionsPicker from "./options-picker"
import SortProducts, { SortOptions } from "./sort-products"

type RefinementListProps = {
  sortBy: SortOptions
  hideOptionsPicker?: boolean
  "data-testid"?: string
}

const toRecord = (params: URLSearchParams): Record<string, string> =>
  Object.fromEntries(params.entries())

const RefinementList = ({
  sortBy,
  hideOptionsPicker = false,
  "data-testid": dataTestId,
}: RefinementListProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateQueryParams = useCallback(
    (updater: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString())
      updater(params)

      params.delete("page")

      const queryString = params.toString()
      const currentQuery = searchParams.toString()
      const nextPath = queryString ? `${pathname}?${queryString}` : pathname
      const currentPath = currentQuery
        ? `${pathname}?${currentQuery}`
        : pathname

      if (nextPath !== currentPath) {
        router.push(nextPath)
      }
    },
    [pathname, router, searchParams]
  )

  const setQueryParams = (name: string, value: string) =>
    updateQueryParams((params) => params.set(name, value))

  const params = useMemo(() => toRecord(searchParams), [searchParams])

  const q = parseQuery(params)
  const gender = parseGender(params)
  const availability = parseAvailability(params)
  const { minPrice, maxPrice } = parseMinMaxPrice(params)

  const selectedOptionValueIds = useMemo(
    () => parseOptionValueIds(searchParams),
    [searchParams]
  )

  const setOptionValueIds = (valueIds: string[]) =>
    updateQueryParams((params) => {
      params.delete(OPTION_VALUE_QUERY_KEY)
      valueIds.forEach((valueId) =>
        params.append(OPTION_VALUE_QUERY_KEY, valueId)
      )
    })

  const toggleFilter = (name: string, value: string, active: string | undefined) =>
    updateQueryParams((params) => {
      if (active === value) {
        params.delete(name)
      } else {
        params.set(name, value)
      }
    })

  const searchInputRef = useRef<HTMLInputElement>(null)
  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = searchInputRef.current?.value.trim() ?? ""
    updateQueryParams((params) => {
      if (value) {
        params.set("q", value)
      } else {
        params.delete("q")
      }
    })
  }

  const minPriceRef = useRef<HTMLInputElement>(null)
  const maxPriceRef = useRef<HTMLInputElement>(null)
  const handlePrice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const min = minPriceRef.current?.value.trim() ?? ""
    const max = maxPriceRef.current?.value.trim() ?? ""
    updateQueryParams((params) => {
      if (min) {
        params.set("min_price", min)
      } else {
        params.delete("min_price")
      }
      if (max) {
        params.set("max_price", max)
      } else {
        params.delete("max_price")
      }
    })
  }

  return (
    <div className="flex flex-col gap-12 py-4 mb-8 small:px-0 pl-6 small:min-w-[250px] small:ml-[1.675rem]">
      <form onSubmit={handleSearch} data-testid="search-form">
        <Text className="txt-compact-small-plus text-ui-fg-muted mb-2">
          Search
        </Text>
        <input
          ref={searchInputRef}
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search products"
          className="pt-2 pb-2 px-4 w-full text-ui-fg-base bg-ui-bg-field border rounded-md focus:outline-none focus:shadow-borders-interactive-with-active border-ui-border-base"
          data-testid="search-input"
        />
      </form>

      <SortProducts
        sortBy={sortBy}
        setQueryParams={setQueryParams}
        showRelevance={Boolean(q)}
        data-testid={dataTestId}
      />

      <FilterRadioGroup
        title="Gender"
        items={[
          { value: "girls", label: "Girls" },
          { value: "boys", label: "Boys" },
          { value: "unisex", label: "Unisex" },
        ]}
        value={gender ?? ""}
        handleChange={(value) =>
          toggleFilter("gender", value, gender)
        }
      />

      <FilterRadioGroup
        title="Availability"
        items={[
          { value: "in_stock", label: "In stock" },
          { value: "out_of_stock", label: "Out of stock" },
        ]}
        value={availability ?? ""}
        handleChange={(value) =>
          toggleFilter("availability", value, availability)
        }
      />

      <form onSubmit={handlePrice} data-testid="price-form">
        <Text className="txt-compact-small-plus text-ui-fg-muted mb-2">
          Price
        </Text>
        <div className="flex gap-x-2 items-center">
          <input
            ref={minPriceRef}
            type="number"
            name="min_price"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={minPrice ?? ""}
            placeholder="Min"
            aria-label="Minimum price"
            className="pt-2 pb-2 px-3 w-full text-ui-fg-base bg-ui-bg-field border rounded-md focus:outline-none focus:shadow-borders-interactive-with-active border-ui-border-base"
          />
          <span className="text-ui-fg-muted">–</span>
          <input
            ref={maxPriceRef}
            type="number"
            name="max_price"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={maxPrice ?? ""}
            placeholder="Max"
            aria-label="Maximum price"
            className="pt-2 pb-2 px-3 w-full text-ui-fg-base bg-ui-bg-field border rounded-md focus:outline-none focus:shadow-borders-interactive-with-active border-ui-border-base"
          />
        </div>
        <button
          type="submit"
          className="mt-2 txt-compact-small-plus text-ui-fg-subtle underline-offset-2 hover:underline"
          data-testid="price-apply"
        >
          Apply price
        </button>
      </form>

      {!hideOptionsPicker && (
        <OptionsPicker
          selectedValueIds={selectedOptionValueIds}
          setOptionValueIds={setOptionValueIds}
        />
      )}
    </div>
  )
}

export default RefinementList