import { medusaIntegrationTestRunner, TestEventUtils } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  cancelOrderWorkflowId,
  createShippingOptionsWorkflow,
} from "@medusajs/medusa/core-flows"

import initialDataSeed from "../../src/migration-scripts/initial-data-seed"
import seedMarkets from "../../src/migration-scripts/seed-markets"
import seedInventory from "../../src/migration-scripts/seed-inventory"
import { INVENTORY_LOW_STOCK_EVENT } from "../../src/subscribers/inventory-low-stock"

const DEMO_QUANTITY = 100
const WAREHOUSE_NAMES = [
  "Karachi Warehouse",
  "Dubai Warehouse",
  "European Warehouse",
]

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer, utils }) => {
    const runSeeds = async () => {
      const container = getContainer()

      const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
      const [defaultShippingProfile] =
        await fulfillmentModule.listShippingProfiles({ type: "default" })
      if (!defaultShippingProfile) {
        await fulfillmentModule.createShippingProfiles({
          name: "Default Shipping Profile",
          type: "default",
        })
      }
      const [shippingProfile] = await fulfillmentModule.listShippingProfiles({
        type: "default",
      })

      const productModule = container.resolve(Modules.PRODUCT)
      const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
      const products = await productModule.listProducts({}, { take: null })
      const productProfileLinkService = remoteLink.getLinkModule(
        Modules.PRODUCT,
        "product_id",
        Modules.FULFILLMENT,
        "shipping_profile_id"
      )!
      const productProfileLinks = (await productProfileLinkService.list(
        {},
        { select: ["product_id"] }
      )) as { product_id: string }[]
      const linkedProductIds = new Set(
        productProfileLinks.map((link) => link.product_id)
      )
      const missingProductLinks = products
        .filter((product) => !linkedProductIds.has(product.id))
        .map((product) => ({
          [Modules.PRODUCT]: { product_id: product.id },
          [Modules.FULFILLMENT]: { shipping_profile_id: shippingProfile.id },
        }))
      if (missingProductLinks.length) {
        await remoteLink.create(missingProductLinks)
      }

      await initialDataSeed({ container })
      await seedMarkets({ container })
      await seedInventory({ container })
      await utils.waitWorkflowExecutions()
    }

    const getStorefrontKey = async () => {
      const container = getContainer()
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)

      const { data: productChannelLinks } = await query.graph({
        entity: "product_sales_channel",
        fields: ["sales_channel_id"],
      })
      const channelIdsWithProducts = new Set(
        productChannelLinks.map((link) => link.sales_channel_id)
      )

      const apiKeyModule = container.resolve(Modules.API_KEY)
      const publishableKeys = await apiKeyModule.listApiKeys(
        { type: "publishable" },
        { take: null }
      )
      const keyChannelLinkService = remoteLink.getLinkModule(
        Modules.API_KEY,
        "publishable_key_id",
        Modules.SALES_CHANNEL,
        "sales_channel_id"
      )!

      let storefrontKey
      for (const key of publishableKeys) {
        const links = (await keyChannelLinkService.list({
          publishable_key_id: key.id,
        })) as { publishable_key_id: string; sales_channel_id: string }[]
        if (
          links.some((link) => channelIdsWithProducts.has(link.sales_channel_id))
        ) {
          storefrontKey = key
          break
        }
      }
      if (!storefrontKey) {
        throw new Error("No publishable key is linked to a channel with products")
      }

      const channelId = productChannelLinks[0].sales_channel_id
      return { storefrontKey, channelId }
    }

    const getMarkets = async () => {
      const container = getContainer()
      const regionModule = container.resolve(Modules.REGION)
      const regions = await regionModule.listRegions(
        {},
        { relations: ["countries"], take: null }
      )
      const pakistan = regions.find((region) => region.name === "Pakistan")
      const uae = regions.find((region) => region.name === "United Arab Emirates")
      if (!pakistan || !uae) {
        throw new Error("Markets seed did not create the expected regions")
      }
      return { pakistan, uae }
    }

    const getWarehouses = async () => {
      const container = getContainer()
      const stockLocationModule = container.resolve(Modules.STOCK_LOCATION)
      const locations = await stockLocationModule.listStockLocations(
        {},
        { take: null }
      )
      const warehouses = {}
      for (const name of WAREHOUSE_NAMES) {
        const location = locations.find((loc) => loc.name === name)
        if (!location) {
          throw new Error(`Warehouse "${name}" was not created by the seed`)
        }
        warehouses[name] = location
      }
      return warehouses
    }

    const getVariantInventoryData = async () => {
      const container = getContainer()
      const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
      const variantLinkService = remoteLink.getLinkModule(
        Modules.PRODUCT,
        "variant_id",
        Modules.INVENTORY,
        "inventory_item_id"
      )!
      const variantLinks = (await variantLinkService.list(
        {},
        { select: ["variant_id", "inventory_item_id"] }
      )) as { variant_id: string; inventory_item_id: string }[]

      const productModule = container.resolve(Modules.PRODUCT)
      const variants = await productModule.listProductVariants(
        {},
        { take: 1 }
      )
      const variant = variants[0]
      const link = variantLinks.find((l) => l.variant_id === variant.id)
      if (!link) {
        throw new Error("The first variant has no inventory item")
      }

      const inventoryModule = container.resolve(Modules.INVENTORY)
      const levels = await inventoryModule.listInventoryLevels(
        { inventory_item_id: link.inventory_item_id },
        { take: null }
      )

      return { container, variantId: variant.id, inventoryItemId: link.inventory_item_id, levels }
    }

    const getReservedTotal = async (inventoryItemId) => {
      const container = getContainer()
      const inventoryModule = container.resolve(Modules.INVENTORY)
      const reservations = await inventoryModule.listReservationItems(
        { inventory_item_id: inventoryItemId },
        { take: null }
      )
      return reservations.reduce(
        (sum, res) => sum + Number(res.quantity.toString()),
        0
      )
    }

    const getShippingOption = async () => {
      const container = getContainer()
      const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
      const [existing] = await fulfillmentModule.listShippingOptions(
        { name: "Test Flat Rate" },
        { take: 1 }
      )
      if (existing) {
        return existing
      }
      const stockLocationModule = container.resolve(Modules.STOCK_LOCATION)
      const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
      const [karachi] = await stockLocationModule.listStockLocations({
        name: "Karachi Warehouse",
      })

      const providerLinkService = remoteLink.getLinkModule(
        Modules.STOCK_LOCATION,
        "stock_location_id",
        Modules.FULFILLMENT,
        "fulfillment_provider_id"
      )!
      const providerLinks = (await providerLinkService.list({
        stock_location_id: karachi.id,
      })) as { stock_location_id: string; fulfillment_provider_id: string }[]
      if (
        !providerLinks.some(
          (link) => link.fulfillment_provider_id === "manual_manual"
        )
      ) {
        await remoteLink.create({
          [Modules.STOCK_LOCATION]: { stock_location_id: karachi.id },
          [Modules.FULFILLMENT]: { fulfillment_provider_id: "manual_manual" },
        })
      }

      const [shippingProfile] = await fulfillmentModule.listShippingProfiles({
        type: "default",
      })
      const fulfillmentSet = await fulfillmentModule.createFulfillmentSets({
        name: "Test Shipping Set",
        type: "shipping",
        service_zones: [
          {
            name: "Pakistan Zone",
            geo_zones: [{ type: "country", country_code: "pk" }],
          },
        ],
      })
      await remoteLink.create({
        [Modules.STOCK_LOCATION]: { stock_location_id: karachi.id },
        [Modules.FULFILLMENT]: { fulfillment_set_id: fulfillmentSet.id },
      })

      const serviceZoneId = fulfillmentSet.service_zones[0].id
      await createShippingOptionsWorkflow(container).run({
        input: [
          {
            name: "Test Flat Rate",
            service_zone_id: serviceZoneId,
            shipping_profile_id: shippingProfile.id,
            provider_id: "manual_manual",
            price_type: "flat",
            type: {
              label: "Standard",
              description: "Test flat rate shipping.",
              code: "test-flat-rate",
            },
            prices: [{ currency_code: "pkr", amount: 100 }],
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
      const [option] = await fulfillmentModule.listShippingOptions(
        { name: "Test Flat Rate" },
        { take: 1 }
      )
      return option
    }

    const completeCheckout = async (variantId, quantity) => {
      const { storefrontKey, channelId } = await getStorefrontKey()
      const { pakistan } = await getMarkets()
      const headers = { "x-publishable-api-key": storefrontKey.token }

      const cartRes = await api.post(
        "/store/carts",
        {
          region_id: pakistan.id,
          sales_channel_id: channelId,
          email: "customer@test.local",
          currency_code: "pkr",
          shipping_address: {
            first_name: "Test",
            last_name: "Customer",
            address_1: "Test Street 1",
            city: "Karachi",
            country_code: "pk",
            postal_code: "74000",
            phone: "+923001234567",
          },
        },
        { headers }
      )
      const cart = cartRes.data.cart

      await api.post(
        `/store/carts/${cart.id}/line-items`,
        { variant_id: variantId, quantity },
        { headers }
      )

      const shippingOption = await getShippingOption()
      await api.post(
        `/store/carts/${cart.id}/shipping-methods`,
        { option_id: shippingOption.id },
        { headers }
      )

      const pcRes = await api.post(
        "/store/payment-collections",
        { cart_id: cart.id },
        { headers }
      )
      const paymentCollection = pcRes.data.payment_collection
      await api.post(
        `/store/payment-collections/${paymentCollection.id}/payment-sessions`,
        { provider_id: "pp_system_default" },
        { headers }
      )

      const completeRes = await api.post(
        `/store/carts/${cart.id}/complete`,
        {},
        { headers }
      )
      return { cart, order: completeRes.data.order }
    }

    const setAllLevelsTo = async (inventoryItemId, stockedQuantity) => {
      const container = getContainer()
      const inventoryModule = container.resolve(Modules.INVENTORY)
      const levels = await inventoryModule.listInventoryLevels(
        { inventory_item_id: inventoryItemId },
        { take: null }
      )
      await inventoryModule.updateInventoryLevels(
        levels.map((level) => ({
          inventory_item_id: inventoryItemId,
          location_id: level.location_id,
          stocked_quantity: stockedQuantity,
        }))
      )
    }

    beforeAll(async () => {
      await runSeeds()
    })

    describe("Inventory & Warehouses seed", () => {
      it("creates the Karachi and Dubai demo warehouses with market addresses, keeping the starter warehouse", async () => {
        const container = getContainer()
        const warehouses = await getWarehouses()
        const stockLocationModule = container.resolve(Modules.STOCK_LOCATION)

        const karachi = await stockLocationModule.retrieveStockLocation(
          warehouses["Karachi Warehouse"].id,
          { relations: ["address"] }
        )
        const dubai = await stockLocationModule.retrieveStockLocation(
          warehouses["Dubai Warehouse"].id,
          { relations: ["address"] }
        )
        const european = await stockLocationModule.retrieveStockLocation(
          warehouses["European Warehouse"].id,
          { relations: ["address"] }
        )

        expect(karachi.address!.country_code).toBe("pk")
        expect(dubai.address!.country_code).toBe("ae")
        expect(european.address!.country_code).toBe("DK")
      })

      it("links every warehouse to the sales channel", async () => {
        const container = getContainer()
        const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
        const channelLinkService = remoteLink.getLinkModule(
          Modules.SALES_CHANNEL,
          "sales_channel_id",
          Modules.STOCK_LOCATION,
          "stock_location_id"
        )!
        const warehouses = await getWarehouses()

        for (const name of WAREHOUSE_NAMES) {
          const links = (await channelLinkService.list({
            stock_location_id: warehouses[name].id,
          })) as { sales_channel_id: string; stock_location_id: string }[]
          expect(links.length).toBeGreaterThanOrEqual(1)
        }
      })

      it("links every variant to an inventory item that has a stock level at every warehouse", async () => {
        const container = getContainer()
        const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
        const variantLinkService = remoteLink.getLinkModule(
          Modules.PRODUCT,
          "variant_id",
          Modules.INVENTORY,
          "inventory_item_id"
        )!
        const inventoryModule = container.resolve(Modules.INVENTORY)
        const warehouses = await getWarehouses()

        const variantLinks = (await variantLinkService.list(
          {},
          { select: ["variant_id", "inventory_item_id"] }
        )) as { variant_id: string; inventory_item_id: string }[]
        expect(variantLinks.length).toBeGreaterThanOrEqual(20)

        for (const link of variantLinks) {
          const levels = await inventoryModule.listInventoryLevels(
            { inventory_item_id: link.inventory_item_id },
            { take: null }
          )
          const levelLocationIds = levels.map((level) => level.location_id)
          for (const name of WAREHOUSE_NAMES) {
            expect(levelLocationIds).toContain(warehouses[name].id)
          }
          const karachiLevel = levels.find(
            (level) => level.location_id === warehouses["Karachi Warehouse"].id
          )!
          const dubaiLevel = levels.find(
            (level) => level.location_id === warehouses["Dubai Warehouse"].id
          )!
          expect(karachiLevel.stocked_quantity).toBe(DEMO_QUANTITY)
          expect(dubaiLevel.stocked_quantity).toBe(DEMO_QUANTITY)
          expect(karachiLevel.reserved_quantity).toBe(0)
          expect(dubaiLevel.reserved_quantity).toBe(0)
        }
      })

      it("rejects reservations that exceed the available quantity at a location", async () => {
        const container = getContainer()
        const inventoryModule = container.resolve(Modules.INVENTORY)
        const warehouses = await getWarehouses()
        const { inventoryItemId } = await getVariantInventoryData()

        await inventoryModule.updateInventoryLevels({
          inventory_item_id: inventoryItemId,
          location_id: warehouses["Karachi Warehouse"].id,
          stocked_quantity: 1,
        })

        await expect(
          inventoryModule.createReservationItems([
            {
              inventory_item_id: inventoryItemId,
              location_id: warehouses["Karachi Warehouse"].id,
              quantity: 2,
            },
          ])
        ).rejects.toThrow()

        const [reservation] = await inventoryModule.createReservationItems([
          {
            inventory_item_id: inventoryItemId,
            location_id: warehouses["Karachi Warehouse"].id,
            quantity: 1,
          },
        ])
        expect(reservation.quantity).toBe(1)

        await inventoryModule.deleteReservationItems([reservation.id])
        await inventoryModule.updateInventoryLevels({
          inventory_item_id: inventoryItemId,
          location_id: warehouses["Karachi Warehouse"].id,
          stocked_quantity: DEMO_QUANTITY,
        })
      })

      it("is idempotent — running the inventory seed again creates no duplicates", async () => {
        const container = getContainer()
        const stockLocationModule = container.resolve(Modules.STOCK_LOCATION)
        const inventoryModule = container.resolve(Modules.INVENTORY)
        const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
        const channelLinkService = remoteLink.getLinkModule(
          Modules.SALES_CHANNEL,
          "sales_channel_id",
          Modules.STOCK_LOCATION,
          "stock_location_id"
        )!
        const variantLinkService = remoteLink.getLinkModule(
          Modules.PRODUCT,
          "variant_id",
          Modules.INVENTORY,
          "inventory_item_id"
        )!

        const snapshot = async () => ({
          locations: (await stockLocationModule.listStockLocations({}, { take: null }))
            .length,
          items: (await inventoryModule.listInventoryItems({}, { take: null }))
            .length,
          levels: (await inventoryModule.listInventoryLevels({}, { take: null }))
            .length,
          channelLinks: (await channelLinkService.list({})).length,
          variantLinks: (await variantLinkService.list({})).length,
        })

        const before = await snapshot()

        await seedInventory({ container })
        await utils.waitWorkflowExecutions()

        const after = await snapshot()

        expect(before.locations).toBe(3)
        expect(before.items).toBeGreaterThanOrEqual(20)
        expect(after).toEqual(before)
      })
    })

    describe("Inventory reservation lifecycle", () => {
      it("does not reserve inventory when items are added to a cart", async () => {
        const { storefrontKey, channelId } = await getStorefrontKey()
        const { pakistan } = await getMarkets()
        const { variantId, inventoryItemId } = await getVariantInventoryData()
        const headers = { "x-publishable-api-key": storefrontKey.token }

        const cartRes = await api.post(
          "/store/carts",
          {
            region_id: pakistan.id,
            sales_channel_id: channelId,
            email: "customer@test.local",
            currency_code: "pkr",
            shipping_address: {
              first_name: "Test",
              last_name: "Customer",
              address_1: "Test Street 1",
              city: "Karachi",
              country_code: "pk",
              postal_code: "74000",
              phone: "+923001234567",
            },
          },
          { headers }
        )
        const cart = cartRes.data.cart

        await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: variantId, quantity: 2 },
          { headers }
        )

        expect(await getReservedTotal(inventoryItemId)).toBe(0)
      })

      it("reserves inventory exactly once when the cart is completed, keeping the order on re-completion", async () => {
        const { container, variantId, inventoryItemId } =
          await getVariantInventoryData()
        const inventoryModule = container.resolve(Modules.INVENTORY)
        const { storefrontKey } = await getStorefrontKey()

        const { cart, order } = await completeCheckout(variantId, 1)
        expect(order).toBeDefined()
        expect(order.id).toBeDefined()

        const reservations = await inventoryModule.listReservationItems(
          { inventory_item_id: inventoryItemId },
          { take: null }
        )
        expect(reservations).toHaveLength(1)
        expect(reservations[0].quantity).toBe(1)
        expect(
          order.items.some(
            (item) => item.id === reservations[0].line_item_id
          )
        ).toBe(true)

        const levelsAfter = await inventoryModule.listInventoryLevels(
          { inventory_item_id: inventoryItemId },
          { take: null }
        )
        const reservedTotal = levelsAfter.reduce(
          (sum, level) => sum + level.reserved_quantity,
          0
        )
        expect(Number(reservedTotal.toString())).toBe(1)

        const reCompleteRes = await api.post(
          `/store/carts/${cart.id}/complete`,
          {},
          { headers: { "x-publishable-api-key": storefrontKey.token } }
        )
        expect(reCompleteRes.data.order.id).toBe(order.id)

        const reservationsAfterReComplete =
          await inventoryModule.listReservationItems(
            { inventory_item_id: inventoryItemId },
            { take: null }
          )
        expect(reservationsAfterReComplete).toHaveLength(1)
      })

      it("restores inventory exactly once when the order is cancelled", async () => {
        const { container, variantId, inventoryItemId } =
          await getVariantInventoryData()
        const inventoryModule = container.resolve(Modules.INVENTORY)
        const workflowEngine = container.resolve(Modules.WORKFLOW_ENGINE)

        const { order } = await completeCheckout(variantId, 1)
        const orderLineItemIds = new Set(order.items.map((item) => item.id))

        const reservationsBefore = await inventoryModule.listReservationItems(
          { inventory_item_id: inventoryItemId },
          { take: null }
        )
        expect(reservationsBefore).toHaveLength(1)
        expect(
          reservationsBefore.some((res) =>
            orderLineItemIds.has(res.line_item_id)
          )
        ).toBe(true)

        await workflowEngine.run(cancelOrderWorkflowId, {
          input: { order_id: order.id },
        })

        const reservationsAfter = await inventoryModule.listReservationItems(
          { inventory_item_id: inventoryItemId },
          { take: null }
        )
        expect(reservationsAfter).toHaveLength(0)

        const levelsAfter = await inventoryModule.listInventoryLevels(
          { inventory_item_id: inventoryItemId },
          { take: null }
        )
        const reservedTotal = levelsAfter.reduce(
          (sum, level) => sum + Number(level.reserved_quantity.toString()),
          0
        )
        expect(reservedTotal).toBe(0)
        for (const level of levelsAfter) {
          expect(Number(level.available_quantity.toString())).toBe(
            Number(level.stocked_quantity.toString())
          )
        }

        const orderModule = container.resolve(Modules.ORDER)
        const canceledOrder = await orderModule.retrieveOrder(order.id, {})
        expect(canceledOrder.status).toBe("canceled")
        expect(canceledOrder.canceled_at).not.toBeNull()

        let secondCancelResult: string
        try {
          const second = await workflowEngine.run(cancelOrderWorkflowId, {
            input: { order_id: order.id },
          })
          secondCancelResult = `resolved hasFailed=${second.acknowledgement.hasFailed} errors=${second.errors?.map((e) => e.error?.message).join(" | ")}`
        } catch (err) {
          secondCancelResult = `threw ${(err as Error).message}`
        }
        expect(secondCancelResult).toMatch(/threw .*has been canceled/)

        const levelsAfterSecondCancel = await inventoryModule.listInventoryLevels(
          { inventory_item_id: inventoryItemId },
          { take: null }
        )
        const reservedAfterSecondCancel = levelsAfterSecondCancel.reduce(
          (sum, level) => sum + Number(level.reserved_quantity.toString()),
          0
        )
        expect(reservedAfterSecondCancel).toBe(0)
        const reservationsAfterSecondCancel =
          await inventoryModule.listReservationItems(
            { inventory_item_id: inventoryItemId },
            { take: null }
          )
        expect(reservationsAfterSecondCancel).toHaveLength(0)
        for (const level of levelsAfterSecondCancel) {
          expect(Number(level.available_quantity.toString())).toBe(
            Number(level.stocked_quantity.toString())
          )
        }
      })

      it("reserves at most once under concurrent checkouts of a single unit", async () => {
        const { container, variantId, inventoryItemId } =
          await getVariantInventoryData()
        const inventoryModule = container.resolve(Modules.INVENTORY)

        const reservationsBefore = await inventoryModule.listReservationItems(
          { inventory_item_id: inventoryItemId },
          { take: null }
        )
        expect(reservationsBefore).toHaveLength(0)
        await setAllLevelsTo(inventoryItemId, 1)

        const [first, second] = await Promise.allSettled([
          completeCheckout(variantId, 1),
          completeCheckout(variantId, 1),
        ])

        const succeeded = [first, second].filter(
          (result) => result.status === "fulfilled"
        )
        const failed = [first, second].filter(
          (result) => result.status === "rejected"
        )
        expect(succeeded).toHaveLength(1)
        expect(failed).toHaveLength(1)

        const succeededOrder = succeeded[0].value.order
        const succeededOrderLineItemIds = new Set(
          succeededOrder.items.map((item) => item.id)
        )

        const reservationsAfter = await inventoryModule.listReservationItems(
          { inventory_item_id: inventoryItemId },
          { take: null }
        )
        expect(reservationsAfter).toHaveLength(1)
        expect(
          reservationsAfter.some((res) =>
            succeededOrderLineItemIds.has(res.line_item_id)
          )
        ).toBe(true)

        const levelsAfter = await inventoryModule.listInventoryLevels(
          { inventory_item_id: inventoryItemId },
          { take: null }
        )
        const reservedTotalAfter = levelsAfter.reduce(
          (sum, level) => sum + Number(level.reserved_quantity.toString()),
          0
        )
        expect(reservedTotalAfter).toBe(1)
      })
    })

    describe("Low-stock threshold trigger (BD-I-03)", () => {
      const LOW_STOCK_EVENT = INVENTORY_LOW_STOCK_EVENT

      const getLowStockTestLevel = async () => {
        const container = getContainer()
        const inventoryModule = container.resolve(Modules.INVENTORY)
        const { inventoryItemId } = await getVariantInventoryData()
        const warehouses = await getWarehouses()
        const karachi = warehouses["Karachi Warehouse"]

        const levels = await inventoryModule.listInventoryLevels(
          { inventory_item_id: inventoryItemId },
          { take: null }
        )
        const karachiLevel = levels.find(
          (level) => level.location_id === karachi.id
        )
        if (!karachiLevel) {
          throw new Error("Karachi level missing")
        }
        return { container, inventoryModule, inventoryItemId, karachi, karachiLevel }
      }

      it("emits inventory.low_stock when an updated level crosses its threshold", async () => {
        const { container, inventoryModule, inventoryItemId, karachi } =
          await getLowStockTestLevel()
        const eventBus = container.resolve(Modules.EVENT_BUS)

        // Clear any reservations left by earlier tests so available = stocked.
        const reservations = await inventoryModule.listReservationItems(
          { inventory_item_id: inventoryItemId },
          { take: null }
        )
        if (reservations.length) {
          await inventoryModule.deleteReservationItems(
            reservations.map((r) => r.id)
          )
        }

        // Ensure the level is above threshold first (seed threshold = 10).
        await inventoryModule.updateInventoryLevels({
          inventory_item_id: inventoryItemId,
          location_id: karachi.id,
          stocked_quantity: 50,
        })
        await utils.waitWorkflowExecutions()

        const waitPromise = TestEventUtils.waitSubscribersExecution(
          LOW_STOCK_EVENT,
          eventBus
        )

        await inventoryModule.updateInventoryLevels({
          inventory_item_id: inventoryItemId,
          location_id: karachi.id,
          stocked_quantity: 5,
        })

        const [published] = await waitPromise
        expect(published.data).toMatchObject({
          inventory_item_id: inventoryItemId,
          location_id: karachi.id,
          available_quantity: 5,
          threshold: 10,
        })

        // Restore the level.
        await inventoryModule.updateInventoryLevels({
          inventory_item_id: inventoryItemId,
          location_id: karachi.id,
          stocked_quantity: 100,
        })
      })

      it("does not emit inventory.low_stock when the level stays above threshold", async () => {
        const { container, inventoryModule, inventoryItemId, karachi } =
          await getLowStockTestLevel()
        const eventBus = container.resolve(Modules.EVENT_BUS)

        const events: any[] = []
        const listener = async (message: any) => {
          events.push(message)
        }
        eventBus.subscribe(LOW_STOCK_EVENT, listener)

        try {
          await inventoryModule.updateInventoryLevels({
            inventory_item_id: inventoryItemId,
            location_id: karachi.id,
            stocked_quantity: 40,
          })
          await new Promise((resolve) => setTimeout(resolve, 200))
          expect(events).toHaveLength(0)
        } finally {
          eventBus.unsubscribe(LOW_STOCK_EVENT, listener)
        }
      })

      it("does not emit inventory.low_stock for a level without a configured threshold", async () => {
        const { container, inventoryModule, inventoryItemId, karachi } =
          await getLowStockTestLevel()
        const eventBus = container.resolve(Modules.EVENT_BUS)

        const events: any[] = []
        const listener = async (message: any) => {
          events.push(message)
        }
        eventBus.subscribe(LOW_STOCK_EVENT, listener)

        try {
          const [item] = await inventoryModule.createInventoryItems([
            {
              sku: "TEST-NO-THRESHOLD",
              title: "No Threshold Item",
              requires_shipping: true,
            },
          ])
          await inventoryModule.createInventoryLevels([
            {
              inventory_item_id: item.id,
              location_id: karachi.id,
              stocked_quantity: 2,
              // no metadata → no threshold configured
            },
          ])
          await new Promise((resolve) => setTimeout(resolve, 200))
          expect(events).toHaveLength(0)
        } finally {
          eventBus.unsubscribe(LOW_STOCK_EVENT, listener)
        }
      })
    })
  },
})

jest.setTimeout(120 * 1000)