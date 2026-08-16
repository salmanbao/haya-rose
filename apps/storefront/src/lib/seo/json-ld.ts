import { HttpTypes } from "@medusajs/types"
import { isVariantAvailable } from "@lib/util/availability"

type JsonLd = Record<string, unknown>

type BreadcrumbItem = {
  name: string
  url: string
}

export const organizationJsonLd = ({
  name,
  url,
}: {
  name: string
  url: string
}): JsonLd => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name,
  url,
})

export const breadcrumbJsonLd = (items: BreadcrumbItem[]): JsonLd | null => {
  if (items.length === 0) {
    return null
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

const isPricedVariant = (
  variant: HttpTypes.StoreProductVariant | undefined
): variant is HttpTypes.StoreProductVariant & {
  calculated_price: { calculated_amount: number; currency_code: string }
} => variant?.calculated_price?.calculated_amount != null

export const productJsonLd = ({
  product,
  region,
  baseUrl,
  countryCode,
  handle,
  selectedVariantId,
}: {
  product: HttpTypes.StoreProduct
  region: Pick<HttpTypes.StoreRegion, "currency_code">
  baseUrl: string
  countryCode: string
  handle: string
  selectedVariantId?: string
}): JsonLd | null => {
  const variants = product.variants ?? []

  if (variants.length === 0) {
    return null
  }

  const pricedVariants = variants.filter(isPricedVariant)

  let selectedVariant: HttpTypes.StoreProductVariant | undefined

  if (selectedVariantId) {
    selectedVariant = variants.find((v) => v.id === selectedVariantId)
  }

  if (!selectedVariant) {
    selectedVariant = [...pricedVariants].sort(
      (a, b) =>
        (a.calculated_price?.calculated_amount ?? 0) -
        (b.calculated_price?.calculated_amount ?? 0)
    )[0]
  }

  const jsonLd: JsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
  }

  if (product.description) {
    jsonLd.description = product.description
  }

  if (product.thumbnail) {
    jsonLd.image = product.thumbnail
  }

  if (selectedVariant?.sku) {
    jsonLd.sku = selectedVariant.sku
  }

  if (isPricedVariant(selectedVariant)) {
    jsonLd.offers = {
      "@type": "Offer",
      price: String(selectedVariant.calculated_price.calculated_amount),
      priceCurrency: region.currency_code.toUpperCase(),
      availability: isVariantAvailable(selectedVariant)
        ? "InStock"
        : "OutOfStock",
      url: `${baseUrl.replace(/\/+$/, "")}/${countryCode}/products/${handle}`,
    }
  }

  return jsonLd
}
