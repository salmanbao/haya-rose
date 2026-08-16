const PAGE_PARAM = "page"

const getParamValue = (
  params: Record<string, string | string[] | undefined> | URLSearchParams,
  key: string
): string | undefined => {
  if (params instanceof URLSearchParams) {
    return params.get(key) ?? undefined
  }
  return Array.isArray(params[key]) ? params[key]?.[0] : params[key]
}

export const buildCanonicalUrl = ({
  baseUrl,
  countryCode,
  path,
  params = {},
}: {
  baseUrl: string
  countryCode: string
  path: string[]
  params?: Record<string, string | string[] | undefined> | URLSearchParams
}): string => {
  const pageValue = getParamValue(params, PAGE_PARAM)
  const pageNumber = pageValue ? parseInt(pageValue, 10) : NaN
  const keepPage = Number.isInteger(pageNumber) && pageNumber > 1

  const segments = [baseUrl.replace(/\/+$/, ""), countryCode, ...path]

  const url = segments.join("/")
  return keepPage ? `${url}?${PAGE_PARAM}=${pageNumber}` : url
}
