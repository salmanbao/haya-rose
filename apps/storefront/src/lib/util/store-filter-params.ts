export const AVAILABILITY_VALUES = ["in_stock", "out_of_stock"] as const
export type AvailabilityFilter = (typeof AVAILABILITY_VALUES)[number]

export const GENDER_VALUES = ["girls", "boys", "unisex"] as const
export type GenderFilter = (typeof GENDER_VALUES)[number]

const FILTER_QUERY_KEYS = [
  "q",
  "gender",
  "availability",
  "min_price",
  "max_price",
  "sortBy",
  "optionValueIds",
]

type SearchParamsRecord = Record<string, string | string[] | undefined>

const getStringParam = (
  params: SearchParamsRecord,
  key: string
): string | undefined => {
  const value = params[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

export const parseQuery = (params: SearchParamsRecord): string | undefined => {
  const value = getStringParam(params, "q")
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

export const parseGender = (
  params: SearchParamsRecord
): GenderFilter | undefined => {
  const value = getStringParam(params, "gender")
  return GENDER_VALUES.includes(value as GenderFilter)
    ? (value as GenderFilter)
    : undefined
}

export const parseAvailability = (
  params: SearchParamsRecord
): AvailabilityFilter | undefined => {
  const value = getStringParam(params, "availability")
  return AVAILABILITY_VALUES.includes(value as AvailabilityFilter)
    ? (value as AvailabilityFilter)
    : undefined
}

const parsePriceBound = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined
  }
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

export const parseMinMaxPrice = (
  params: SearchParamsRecord
): { minPrice?: number; maxPrice?: number } => {
  const minPrice = parsePriceBound(getStringParam(params, "min_price"))
  const maxPrice = parsePriceBound(getStringParam(params, "max_price"))
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    return {}
  }
  return {
    ...(minPrice !== undefined ? { minPrice } : {}),
    ...(maxPrice !== undefined ? { maxPrice } : {}),
  }
}

export const parsePage = (value: string | undefined): number => {
  const parsed = value === undefined ? NaN : Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1
}

/**
 * Filtered/sorted store listings must not be indexable: every filter and
 * sort combination would otherwise generate an indexable URL (AGENTS.md §18).
 * A clean listing (optionally paginated) stays indexable with its canonical
 * URL. Mirrors the backend browse route's filter surface.
 */
export const shouldNoindexStorePage = (
  params: SearchParamsRecord
): boolean => FILTER_QUERY_KEYS.some((key) => params[key] !== undefined)