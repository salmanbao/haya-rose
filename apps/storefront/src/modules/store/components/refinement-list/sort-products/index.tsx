"use client"

import FilterRadioGroup from "@modules/common/components/filter-radio-group"

export type SortOptions =
  | "price_asc"
  | "price_desc"
  | "created_at"
  | "best_selling"
  | "relevance"

type SortProductsProps = {
  sortBy: SortOptions
  setQueryParams: (name: string, value: string) => void
  showRelevance?: boolean
  "data-testid"?: string
}

const SortProducts = ({
  "data-testid": dataTestId,
  sortBy,
  setQueryParams,
  showRelevance = false,
}: SortProductsProps) => {
  const sortOptions = [
    {
      value: "created_at",
      label: "Latest Arrivals",
    },
    ...(showRelevance
      ? [
          {
            value: "relevance" as SortOptions,
            label: "Relevance",
          },
        ]
      : []),
    {
      value: "price_asc",
      label: "Price: Low -> High",
    },
    {
      value: "price_desc",
      label: "Price: High -> Low",
    },
    {
      value: "best_selling",
      label: "Best Selling",
    },
  ]

  const handleChange = (value: string) => {
    setQueryParams("sortBy", value as SortOptions)
  }

  return (
    <FilterRadioGroup
      title="Sort by"
      items={sortOptions}
      value={sortBy}
      handleChange={handleChange}
      data-testid={dataTestId}
    />
  )
}

export default SortProducts