import { browseProducts } from "@lib/data/browse"
import { HttpTypes } from "@medusajs/types"
import ProductActions from "@modules/products/components/product-actions"

/**
 * Fetches real time pricing and availability for a product and renders the
 * product actions component. Goes through the custom browse route because
 * the standard store products route cannot compute availability under the
 * multi-channel publishable key (verified against 2.19.0).
 */
export default async function ProductActionsWrapper({
  id,
  region,
}: {
  id: string
  region: HttpTypes.StoreRegion
}) {
  const regionCountry = region.countries?.[0]?.iso_2 ?? "pk"
  const product = await browseProducts({
    countryCode: regionCountry,
    id,
    limit: 1,
  }).then(({ products }) => products[0])

  if (!product) {
    return null
  }

  return <ProductActions product={product} region={region} />
}
