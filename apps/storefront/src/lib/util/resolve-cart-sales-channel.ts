import { HttpTypes } from "@medusajs/types"

/**
 * BD-I-01/BD-I-04 (approved): same-market allocation is achieved implicitly
 * through per-market sales channels. seed-shipping stores the market's sales
 * channel ID on the region (`metadata.sales_channel_id`); the storefront
 * passes it at cart creation so the cart is scoped to the market's stock
 * locations and shipping options.
 *
 * Returns `undefined` when the metadata is absent (e.g. seeds not yet run or
 * a non-market region), in which case Medusa falls back to the store's
 * default sales channel.
 */
export function resolveCartSalesChannel(
  region: Pick<HttpTypes.StoreRegion, "metadata"> | null | undefined
): string | undefined {
  const channelId = region?.metadata?.sales_channel_id
  return typeof channelId === "string" && channelId.length > 0
    ? channelId
    : undefined
}
