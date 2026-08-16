import { MedusaContainer } from "@medusajs/framework"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { createSalesChannelsWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Per-market sales channels (BD-I-01/BD-I-04 — same-market allocation
 * implicit via sales-channel links).
 *
 * Each market gets its own sales channel so that:
 *  - cart creation scoped to a channel collects only that market's stock
 *    locations (`prepareConfirmInventoryInput` scopes by the cart's sales
 *    channel — verified in @medusajs/core-flows 2.19.0), so the reservation
 *    created at completion lands on the same-market warehouse; and
 *  - the native option-eligibility chain (cart → sales channel → stock
 *    locations → fulfillment sets) only surfaces that market's shipping
 *    options.
 *
 * The default sales channel continues to serve the starter's European demo
 * data; it is not used for PK/AE commerce.
 */
export const MARKET_CHANNELS = {
  PAKISTAN: {
    name: "Pakistan Sales Channel",
    description: "Sales channel serving the Pakistan (PKR) market",
  },
  UAE: {
    name: "UAE Sales Channel",
    description: "Sales channel serving the UAE (AED) market",
  },
} as const

export interface MarketSalesChannels {
  pakistan: { id: string; name: string }
  uae: { id: string; name: string }
}

export async function getOrCreateMarketSalesChannels(
  container: MedusaContainer
): Promise<MarketSalesChannels> {
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  const existing = await salesChannelModule.listSalesChannels(
    {},
    { take: null }
  )
  const byName = new Map(existing.map((channel) => [channel.name, channel]))

  const missing = (
    [MARKET_CHANNELS.PAKISTAN, MARKET_CHANNELS.UAE] as const
  ).filter((candidate) => !byName.has(candidate.name))

  if (missing.length) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [...missing] },
    })
    result.forEach((channel) => byName.set(channel.name, channel))
  }

  const pakistan = byName.get(MARKET_CHANNELS.PAKISTAN.name)
  const uae = byName.get(MARKET_CHANNELS.UAE.name)

  if (!pakistan || !uae) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Failed to create or resolve the market sales channels"
    )
  }

  return { pakistan, uae }
}
