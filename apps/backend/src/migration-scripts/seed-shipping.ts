import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {
  createShippingOptionsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateRegionsWorkflow,
} from "@medusajs/medusa/core-flows"
import { getOrCreateMarketSalesChannels } from "./seed-utils/market-channels"

const PUBLISHABLE_KEY_TITLE = "Default Publishable API Key"
const DEFAULT_SALES_CHANNEL_NAME = "Default Sales Channel"
const MANUAL_PROVIDER_ID = "manual_manual"

/**
 * Per-market shipping configuration (Phase 5 — Shipping & Fulfillment).
 *
 * Topology (BD-I-01/BD-I-04, REQ-SHIP-004/005/007):
 *
 *   Pakistan channel → Karachi Warehouse → Pakistan fulfillment set (PK geo
 *     zone) → "Standard Delivery (PK)" (flat, PKR)
 *   UAE channel → Dubai Warehouse → UAE fulfillment set (AE geo zone) →
 *     "Standard Delivery (AE)" (flat, AED)
 *
 * The default sales channel keeps serving the starter's European demo data
 * and is intentionally removed from the PK/AE warehouses so a cart scoped to
 * a market channel can only ever reserve from and fulfill from that market's
 * warehouse.
 *
 * The flat-rate amounts below are demo configuration values (replaceable via
 * the Medusa Admin); the rate model itself is the approved hybrid flat →
 * calculated model (BD-S-01). TCS/Aramex provider adapters are NOT created
 * here — provider contracts are unverified and adapters are gated.
 */
const MARKETS = [
  {
    marketName: "Pakistan",
    countryCode: "pk",
    currencyCode: "pkr",
    warehouseName: "Karachi Warehouse",
    fulfillmentSetName: "Karachi Warehouse delivery",
    serviceZoneName: "Pakistan",
    optionName: "Standard Delivery (PK)",
    optionCode: "standard-pk",
    optionDescription: "Standard delivery within Pakistan.",
    priceAmount: 25000, // 250.00 PKR in minor units
  },
  {
    marketName: "United Arab Emirates",
    countryCode: "ae",
    currencyCode: "aed",
    warehouseName: "Dubai Warehouse",
    fulfillmentSetName: "Dubai Warehouse delivery",
    serviceZoneName: "UAE",
    optionName: "Standard Delivery (AE)",
    optionCode: "standard-ae",
    optionDescription: "Standard delivery within the UAE.",
    priceAmount: 2500, // 25.00 AED in minor units
  },
] as const

export default async function seedShipping({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION)
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
  const regionModule = container.resolve(Modules.REGION)
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  const apiKeyModule = container.resolve(Modules.API_KEY)

  logger.info("Seeding shipping and fulfillment data...")

  const { pakistan: pkChannel, uae: aeChannel } =
    await getOrCreateMarketSalesChannels(container)

  const locations = await stockLocationModule.listStockLocations(
    {},
    { take: null }
  )
  const warehouses = new Map(
    locations.map((location) => [location.name, location])
  )

  const [defaultChannel] = await salesChannelModule.listSalesChannels({
    name: DEFAULT_SALES_CHANNEL_NAME,
  })

  const locationLinkService = remoteLink.getLinkModule(
    Modules.SALES_CHANNEL,
    "sales_channel_id",
    Modules.STOCK_LOCATION,
    "stock_location_id"
  )!

  // Finalize the per-market topology (BD-I-01/BD-I-04): each warehouse serves
  // only its market's channel. Remove stale default-channel links so a cart on
  // the default channel (starter demo) can never allocate PK/AE stock; a
  // channel-less cart then fails fast instead of silently cross-allocating.
  for (const market of MARKETS) {
    const warehouse = warehouses.get(market.warehouseName)
    if (!warehouse) {
      continue
    }
    const marketChannel =
      market.marketName === "Pakistan" ? pkChannel : aeChannel
    const links = (await locationLinkService.list({
      stock_location_id: warehouse.id,
    })) as { sales_channel_id: string; stock_location_id: string }[]
    const linkedIds = new Set(links.map((link) => link.sales_channel_id))
    if (!linkedIds.has(marketChannel.id)) {
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: { id: warehouse.id, add: [marketChannel.id] },
      })
    }
    if (defaultChannel && linkedIds.has(defaultChannel.id)) {
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: { id: warehouse.id, remove: [defaultChannel.id] },
      })
    }
  }

  const providerLinkService = remoteLink.getLinkModule(
    Modules.STOCK_LOCATION,
    "stock_location_id",
    Modules.FULFILLMENT,
    "fulfillment_provider_id"
  )!

  const [shippingProfile] = await fulfillmentModule.listShippingProfiles({
    type: "default",
  })
  if (!shippingProfile) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "seed-shipping requires the default shipping profile (run initial-data-seed first)"
    )
  }

  for (const market of MARKETS) {
    const warehouse = warehouses.get(market.warehouseName)
    if (!warehouse) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `seed-shipping requires the "${market.warehouseName}" warehouse (run seed-inventory first)`
      )
    }

    // Provider link: the manual provider fulfills until TCS/Aramex adapters
    // are implemented (contract verification gate).
    const providerLinks = (await providerLinkService.list({
      stock_location_id: warehouse.id,
    })) as { stock_location_id: string; fulfillment_provider_id: string }[]
    if (
      !providerLinks.some(
        (link) => link.fulfillment_provider_id === MANUAL_PROVIDER_ID
      )
    ) {
      await remoteLink.create({
        [Modules.STOCK_LOCATION]: { stock_location_id: warehouse.id },
        [Modules.FULFILLMENT]: { fulfillment_provider_id: MANUAL_PROVIDER_ID },
      })
    }

    // Fulfillment set per market (idempotent by name), geo zone per country.
    const {
      data: existingSets,
    } = await query.graph({
      entity: "fulfillment_set",
      fields: ["id", "service_zones.id"],
      filters: { name: market.fulfillmentSetName },
    })
    let fulfillmentSet: {
      id: string
      service_zones: { id: string }[]
    } | undefined = existingSets?.[0]
    if (!fulfillmentSet) {
      fulfillmentSet = await fulfillmentModule.createFulfillmentSets({
        name: market.fulfillmentSetName,
        type: "shipping",
        service_zones: [
          {
            name: market.serviceZoneName,
            geo_zones: [
              { type: "country", country_code: market.countryCode },
            ],
          },
        ],
      })
    }
    const serviceZoneId = fulfillmentSet.service_zones[0].id

    const setLinkService = remoteLink.getLinkModule(
      Modules.STOCK_LOCATION,
      "stock_location_id",
      Modules.FULFILLMENT,
      "fulfillment_set_id"
    )!
    const setLinks = (await setLinkService.list({
      stock_location_id: warehouse.id,
    })) as { stock_location_id: string; fulfillment_set_id: string }[]
    if (
      !setLinks.some(
        (link) => link.fulfillment_set_id === fulfillmentSet.id
      )
    ) {
      await remoteLink.create({
        [Modules.STOCK_LOCATION]: { stock_location_id: warehouse.id },
        [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
      })
    }

    // Flat-rate option (idempotent by name) with enabled_in_store /
    // is_return=false rules (REQ-SHIP-007 eligibility).
    const [existingOption] = await fulfillmentModule.listShippingOptions(
      { name: market.optionName },
      { take: 1 }
    )
    if (!existingOption) {
      await createShippingOptionsWorkflow(container).run({
        input: [
          {
            name: market.optionName,
            service_zone_id: serviceZoneId,
            shipping_profile_id: shippingProfile.id,
            provider_id: MANUAL_PROVIDER_ID,
            price_type: "flat",
            type: {
              label: "Standard",
              description: market.optionDescription,
              code: market.optionCode,
            },
            prices: [
              { currency_code: market.currencyCode, amount: market.priceAmount },
            ],
            rules: [
              {
                attribute: "enabled_in_store",
                value: "true",
                operator: "eq",
              },
              {
                attribute: "is_return",
                value: "false",
                operator: "eq",
              },
            ],
          },
        ],
      })
    }

    // Region metadata: the storefront derives the market's sales channel from
    // the region it already resolves (store region responses include
    // `metadata` by default — verified query-config). Keeps channel IDs
    // environment-agnostic and configuration-driven (REQ-SHIP-005).
    const [region] = await regionModule.listRegions(
      { name: market.marketName },
      { take: 1 }
    )
    if (!region) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `seed-shipping requires the "${market.marketName}" region (run seed-markets first)`
      )
    }
    const channelId =
      market.marketName === "Pakistan" ? pkChannel.id : aeChannel.id
    const existingMetadata = (region.metadata ?? {}) as Record<string, unknown>
    if (existingMetadata.sales_channel_id !== channelId) {
      await updateRegionsWorkflow(container).run({
        input: {
          selector: { id: region.id },
          update: {
            metadata: { ...existingMetadata, sales_channel_id: channelId },
          },
        },
      })
    }
  }

  // Publishable key: serve both markets (PK + AE channels) in addition to the
  // default channel already linked by seed-markets.
  const [publishableKey] = await apiKeyModule.listApiKeys({
    type: "publishable",
    title: PUBLISHABLE_KEY_TITLE,
  })
  if (publishableKey) {
    const keyChannelLinkService = remoteLink.getLinkModule(
      Modules.API_KEY,
      "publishable_key_id",
      Modules.SALES_CHANNEL,
      "sales_channel_id"
    )!
    const keyLinks = (await keyChannelLinkService.list({
      publishable_key_id: publishableKey.id,
    })) as { publishable_key_id: string; sales_channel_id: string }[]
    const linked = new Set(keyLinks.map((link) => link.sales_channel_id))
    const missing = [pkChannel.id, aeChannel.id].filter(
      (channelId) => !linked.has(channelId)
    )
    if (missing.length) {
      await linkSalesChannelsToApiKeyWorkflow(container).run({
        input: { id: publishableKey.id, add: missing },
      })
    }
  }

  logger.info("Finished seeding shipping and fulfillment data.")
}
