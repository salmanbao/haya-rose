import { MedusaContainer } from "@medusajs/framework"
import { StockLocationDTO } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { linkSalesChannelsToStockLocationWorkflow } from "@medusajs/medusa/core-flows"

const DEMO_QUANTITY = 100

// BD-I-03 (approved): per-level low-stock threshold; merchant email recipient;
// channels deferred to the Notifications specification. Demo value set at
// implementation — production values are business data configured via the
// level's `metadata` (stored in the native `inventory_level.metadata` JSONB
// column, read by src/subscribers/inventory-low-stock.ts).
const DEMO_LOW_STOCK_THRESHOLD = 10

const WAREHOUSES = [
  {
    name: "Karachi Warehouse",
    address: {
      address_1: "Shahrah-e-Faisal, Karachi",
      city: "Karachi",
      country_code: "pk",
      postal_code: "74000",
      phone: "+92 21 111 000 111",
    },
  },
  {
    name: "Dubai Warehouse",
    address: {
      address_1: "Jebel Ali Free Zone, Dubai",
      city: "Dubai",
      country_code: "ae",
      postal_code: "00000",
      phone: "+971 4 000 0000",
    },
  },
] as const

export default async function seedInventory({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)

  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION)
  const inventoryModule = container.resolve(Modules.INVENTORY)
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  const productModule = container.resolve(Modules.PRODUCT)

  logger.info("Seeding inventory and warehouse data...")

  const existingLocations = await stockLocationModule.listStockLocations(
    {},
    { take: null }
  )

  const demoLocations: StockLocationDTO[] = []
  for (const warehouse of WAREHOUSES) {
    const existing = existingLocations.find(
      (location) => location.name === warehouse.name
    )
    if (existing) {
      demoLocations.push(existing)
      continue
    }
    const [location] = await stockLocationModule.createStockLocations([
      { name: warehouse.name, address: { ...warehouse.address } },
    ])
    demoLocations.push(location)
  }

  // Interim channel links: every warehouse is linked to every channel that
  // currently exists (idempotent). seed-shipping finalizes the per-market
  // topology (BD-I-01/BD-I-04): it adds the market channel links and removes
  // the default-channel links from the market warehouses. Running this seed
  // alone (e.g. in earlier-phase integration suites) therefore keeps the
  // warehouses on the default channel, preserving their behavior.
  const channels = await salesChannelModule.listSalesChannels({}, { take: null })
  const locationLinkService = remoteLink.getLinkModule(
    Modules.SALES_CHANNEL,
    "sales_channel_id",
    Modules.STOCK_LOCATION,
    "stock_location_id"
  )!

  for (const location of demoLocations) {
    const existingLinks = (await locationLinkService.list({
      stock_location_id: location.id,
    })) as { sales_channel_id: string; stock_location_id: string }[]
    const existingChannelIds = new Set(
      existingLinks.map((link) => link.sales_channel_id)
    )
    const missingChannelIds = channels
      .map((channel) => channel.id)
      .filter((channelId) => !existingChannelIds.has(channelId))
    if (missingChannelIds.length) {
      await linkSalesChannelsToStockLocationWorkflow(container).run({
        input: { id: location.id, add: missingChannelIds },
      })
    }
  }

  const variants = await productModule.listProductVariants({}, { take: null })
  const existingItems = await inventoryModule.listInventoryItems(
    {},
    { take: null }
  )

  for (const variant of variants) {
    if (!variant.sku) {
      continue
    }
    const existingLinks = (await remoteLink
      .getLinkModule(
        Modules.PRODUCT,
        "variant_id",
        Modules.INVENTORY,
        "inventory_item_id"
      )!
      .list({ variant_id: variant.id })) as {
      variant_id: string
      inventory_item_id: string
    }[]

    if (existingLinks.length) {
      continue
    }

    let item = existingItems.find((existing) => existing.sku === variant.sku)
    if (!item) {
      const [createdItem] = await inventoryModule.createInventoryItems([
        {
          sku: variant.sku,
          title: variant.title,
          requires_shipping: true,
        },
      ])
      item = createdItem
    }

    await remoteLink.create([
      {
        [Modules.PRODUCT]: { variant_id: variant.id },
        [Modules.INVENTORY]: { inventory_item_id: item.id },
      },
    ])
  }

  const allItems = await inventoryModule.listInventoryItems({}, { take: null })

  for (const item of allItems) {
    const existingLevels = await inventoryModule.listInventoryLevels(
      { inventory_item_id: item.id },
      { take: null }
    )
    const existingLocationIds = new Set(
      existingLevels.map((level) => level.location_id)
    )
    const missingLevels = demoLocations
      .filter((location) => !existingLocationIds.has(location.id))
      .map((location) => ({
        inventory_item_id: item.id,
        location_id: location.id,
        stocked_quantity: DEMO_QUANTITY,
        metadata: {
          low_stock_threshold: DEMO_LOW_STOCK_THRESHOLD,
        },
      }))
    if (missingLevels.length) {
      await inventoryModule.createInventoryLevels(missingLevels)
    }
  }
}