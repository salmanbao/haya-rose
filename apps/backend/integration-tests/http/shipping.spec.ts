import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

import initialDataSeed from "../../src/migration-scripts/initial-data-seed"
import seedMarkets from "../../src/migration-scripts/seed-markets"
import seedInventory from "../../src/migration-scripts/seed-inventory"
import seedShipping from "../../src/migration-scripts/seed-shipping"

const ADMIN_EMAIL = "shipping-admin@baby-store.test"
const ADMIN_PASSWORD = "SuperSecretTest123!"
const SYSTEM_PROVIDER_ID = "pp_system_default"
const PUBLISHABLE_KEY_TITLE = "Default Publishable API Key"

const toNumber = (value: unknown): number => Number(value ?? 0)

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

      await initialDataSeed({ container })
      await seedMarkets({ container })
      await seedInventory({ container })
      await seedShipping({ container })
      await utils.waitWorkflowExecutions()
    }

    const getAdminToken = async () => {
      const container = getContainer()
      await api.post("/auth/user/emailpass/register", {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      })

      const userModule = container.resolve(Modules.USER)
      const authModule = container.resolve(Modules.AUTH)

      const [user] = await userModule.createUsers([
        { email: ADMIN_EMAIL, first_name: "Test", last_name: "Admin" },
      ])
      if (!user) {
        throw new Error("Failed to create the admin user for the shipping suite")
      }

      const [providerIdentity] = await authModule.listProviderIdentities({
        entity_id: ADMIN_EMAIL,
        provider: "emailpass",
      })
      if (!providerIdentity?.auth_identity_id) {
        throw new Error(
          "Failed to resolve the admin auth identity for the shipping suite"
        )
      }
      await authModule.updateAuthIdentities({
        id: providerIdentity.auth_identity_id,
        app_metadata: { user_id: user.id },
      })

      const login = await api.post("/auth/user/emailpass", {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      })
      return login.data.token as string
    }

    const getStorefrontKey = async () => {
      const container = getContainer()
      const apiKeyModule = container.resolve(Modules.API_KEY)
      const [key] = await apiKeyModule.listApiKeys({
        type: "publishable",
        title: PUBLISHABLE_KEY_TITLE,
      })
      if (!key) {
        throw new Error("No publishable key found for the shipping suite")
      }
      return key.token as string
    }

    const getMarketChannels = async () => {
      const container = getContainer()
      const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
      const channels = await salesChannelModule.listSalesChannels(
        {},
        { take: null }
      )
      const pakistan = channels.find(
        (channel) => channel.name === "Pakistan Sales Channel"
      )
      const uae = channels.find(
        (channel) => channel.name === "UAE Sales Channel"
      )
      if (!pakistan || !uae) {
        throw new Error("seed-shipping did not create the market channels")
      }
      return { pakistan, uae }
    }

    const getMarkets = async () => {
      const container = getContainer()
      const regionModule = container.resolve(Modules.REGION)
      const regions = await regionModule.listRegions(
        {},
        { relations: ["countries"], take: null }
      )
      const pakistan = regions.find((region) => region.name === "Pakistan")
      const uae = regions.find(
        (region) => region.name === "United Arab Emirates"
      )
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
      const karachi = locations.find((loc) => loc.name === "Karachi Warehouse")
      const dubai = locations.find((loc) => loc.name === "Dubai Warehouse")
      if (!karachi || !dubai) {
        throw new Error("seed-inventory did not create the market warehouses")
      }
      return { karachi, dubai }
    }

    const getShippingOption = async (market: "pk" | "ae") => {
      const container = getContainer()
      const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
      const name =
        market === "pk" ? "Standard Delivery (PK)" : "Standard Delivery (AE)"
      const [option] = await fulfillmentModule.listShippingOptions(
        { name },
        { take: 1 }
      )
      if (!option) {
        throw new Error(`seed-shipping did not create the option "${name}"`)
      }
      return option
    }

    const MARKET_ADDRESSES = {
      pk: {
        first_name: "Test",
        last_name: "Customer",
        address_1: "Shahrah-e-Faisal 5",
        city: "Karachi",
        country_code: "pk",
        postal_code: "74000",
        phone: "+923001234567",
      },
      ae: {
        first_name: "Test",
        last_name: "Customer",
        address_1: "Sheikh Zayed Road 5",
        city: "Dubai",
        country_code: "ae",
        postal_code: "00000",
        phone: "+971500000000",
      },
    } as const

    /**
     * Creates a cart scoped to the market's sales channel, adds a line item
     * and the market's shipping method, and creates a system-provider payment
     * session.
     */
    const prepareCheckout = async (
      market: "pk" | "ae",
      variantId: string,
      quantity = 1
    ) => {
      const storefrontKey = await getStorefrontKey()
      const { pakistan, uae } = await getMarkets()
      const { pakistan: pkChannel, uae: aeChannel } = await getMarketChannels()
      const region = market === "pk" ? pakistan : uae
      const channel = market === "pk" ? pkChannel : aeChannel
      const currencyCode = market === "pk" ? "pkr" : "aed"
      const headers = { "x-publishable-api-key": storefrontKey }

      const cartRes = await api.post(
        "/store/carts",
        {
          region_id: region.id,
          sales_channel_id: channel.id,
          email: `shipping-customer-${market}@test.local`,
          currency_code: currencyCode,
          shipping_address: MARKET_ADDRESSES[market],
        },
        { headers }
      )
      const cart = cartRes.data.cart

      await api.post(
        `/store/carts/${cart.id}/line-items`,
        { variant_id: variantId, quantity },
        { headers }
      )

      const shippingOption = await getShippingOption(market)
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

      const sessionRes = await api.post(
        `/store/payment-collections/${paymentCollection.id}/payment-sessions`,
        { provider_id: SYSTEM_PROVIDER_ID },
        { headers }
      )

      return {
        headers,
        cart,
        paymentCollection: sessionRes.data.payment_collection,
      }
    }

    const completeCheckout = async (
      market: "pk" | "ae",
      variantId: string,
      quantity = 1
    ) => {
      const { headers, cart } = await prepareCheckout(market, variantId, quantity)
      const completeRes = await api.post(
        `/store/carts/${cart.id}/complete`,
        {},
        { headers }
      )
      const order = completeRes.data.order
      if (!order) {
        throw new Error(
          `Checkout completion failed for the ${market} market: ${JSON.stringify(
            completeRes.data
          )}`
        )
      }
      return { headers, cart, order }
    }

    const getFulfillmentIdsForOrder = async (orderId: string) => {
      const container = getContainer()
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const { data } = await query.graph({
        entity: "order",
        fields: ["id", "fulfillments.id"],
        filters: { id: orderId },
      })
      return (data?.[0]?.fulfillments ?? [])
        .map((fulfillment) => fulfillment?.id)
        .filter((id): id is string => Boolean(id))
    }

    const getReservations = async (lineItemId: string) => {
      const container = getContainer()
      const inventoryModule = container.resolve(Modules.INVENTORY)
      return inventoryModule.listReservationItems(
        { line_item_id: lineItemId },
        { take: null }
      )
    }

    const getLevel = async (inventoryItemId: string, locationId: string) => {
      const container = getContainer()
      const inventoryModule = container.resolve(Modules.INVENTORY)
      const [level] = await inventoryModule.listInventoryLevels({
        inventory_item_id: inventoryItemId,
        location_id: locationId,
      })
      if (!level) {
        throw new Error("Inventory level not found for the reservation check")
      }
      return level
    }

    describe("Shipping & Fulfillment — per-market topology + native fulfillment (Phase 5)", () => {
      let variantId: string
      let adminHeaders: Record<string, string>

      beforeAll(async () => {
        await runSeeds()
        const container = getContainer()
        const productModule = container.resolve(Modules.PRODUCT)
        const [variant] = await productModule.listProductVariants(
          {},
          { take: 1 }
        )
        if (!variant) {
          throw new Error("No variant seeded for the shipping suite")
        }
        variantId = variant.id
        adminHeaders = { Authorization: `Bearer ${await getAdminToken()}` }
      })

      it("REQ-SHIP-007 — option eligibility is market-isolated (geo zone + channel fulfillment sets)", async () => {
        const storefrontKey = await getStorefrontKey()
        const headers = { "x-publishable-api-key": storefrontKey }

        const pkCheckout = await prepareCheckout("pk", variantId)
        const pkOptions = await api.get(
          `/store/shipping-options?cart_id=${pkCheckout.cart.id}`,
          { headers }
        )
        const pkNames = pkOptions.data.shipping_options.map(
          (option) => option.name
        )
        expect(pkNames).toEqual(["Standard Delivery (PK)"])
        expect(pkNames).not.toContain("Standard Delivery (AE)")

        const aeCheckout = await prepareCheckout("ae", variantId)
        const aeOptions = await api.get(
          `/store/shipping-options?cart_id=${aeCheckout.cart.id}`,
          { headers }
        )
        const aeNames = aeOptions.data.shipping_options.map(
          (option) => option.name
        )
        expect(aeNames).toEqual(["Standard Delivery (AE)"])
        expect(aeNames).not.toContain("Standard Delivery (PK)")
      })

      it("BD-I-01/T-SHIP-14 — same-market allocation: reservations land on the market's warehouse", async () => {
        const { karachi, dubai } = await getWarehouses()

        const pkOrder = await completeCheckout("pk", variantId)
        const pkOrderItemId = pkOrder.order.items[0].id
        const pkReservations = await getReservations(pkOrderItemId)
        expect(pkReservations).toHaveLength(1)
        expect(pkReservations[0].location_id).toBe(karachi.id)

        const aeOrder = await completeCheckout("ae", variantId)
        const aeOrderItemId = aeOrder.order.items[0].id
        const aeReservations = await getReservations(aeOrderItemId)
        expect(aeReservations).toHaveLength(1)
        expect(aeReservations[0].location_id).toBe(dubai.id)
      })

      it("REQ-SHIP-014/019 + B-SHIP-24 — admin-only fulfillment consumes the same-market reservation without a captured payment", async () => {
        const { karachi } = await getWarehouses()
        const { order } = await completeCheckout("pk", variantId, 1)
        const orderItemId = order.items[0].id
        const reservationsAtCompletion = await getReservations(orderItemId)
        const inventoryItemId = reservationsAtCompletion[0].inventory_item_id

        // B-SHIP-24: no payment-state gate. The system-provider payment is
        // authorized (not captured) at completion — fulfillment must still
        // succeed natively.
        const levelBefore = await getLevel(inventoryItemId, karachi.id)
        const stockedBefore = toNumber(levelBefore.stocked_quantity)

        // The store surface exposes no fulfillment route (REQ-SHIP-019): the
        // store attempt is rejected (non-2xx) and creates no fulfillment.
        const storeAttempt = await api.post(
          `/store/orders/${order.id}/fulfillments`,
          { items: [{ id: orderItemId, quantity: 1 }] },
          { validateStatus: () => true }
        )
        expect(storeAttempt.status).toBeGreaterThanOrEqual(400)
        expect(await getFulfillmentIdsForOrder(order.id)).toHaveLength(0)

        const fulfillRes = await api.post(
          `/admin/orders/${order.id}/fulfillments`,
          { items: [{ id: orderItemId, quantity: 1 }] },
          { headers: adminHeaders }
        )
        expect(fulfillRes.status).toBe(200)
        const [fulfillmentId] = await getFulfillmentIdsForOrder(order.id)
        if (!fulfillmentId) {
          throw new Error("No fulfillment was created for the order")
        }

        const container = getContainer()
        const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
        const [fulfillment] = await fulfillmentModule.listFulfillments(
          { id: fulfillmentId },
          { take: 1 }
        )
        if (!fulfillment) {
          throw new Error("No fulfillment was created for the order")
        }
        expect(fulfillment.packed_at).toBeTruthy()
        // Location derives from the option's fulfillment set → Karachi.
        expect(fulfillment.location_id).toBe(karachi.id)

        // Reservation consumed (deleted) and deduction recorded at Karachi.
        const reservations = await getReservations(orderItemId)
        expect(reservations).toHaveLength(0)
        const levelAfter = await getLevel(inventoryItemId, karachi.id)
        expect(toNumber(levelAfter.stocked_quantity)).toBe(stockedBefore - 1)
      })

      it("REQ-SHIP-015 — shipment stores shipped_at + tracking labels natively", async () => {
        const { order } = await completeCheckout("pk", variantId, 1)
        const orderItemId = order.items[0].id

        const fulfillRes = await api.post(
          `/admin/orders/${order.id}/fulfillments`,
          { items: [{ id: orderItemId, quantity: 1 }] },
          { headers: adminHeaders }
        )
        expect(fulfillRes.status).toBe(200)
        const [fulfillmentId] = await getFulfillmentIdsForOrder(order.id)
        if (!fulfillmentId) {
          throw new Error("No fulfillment was created for the order")
        }

        const shipmentRes = await api.post(
          `/admin/orders/${order.id}/fulfillments/${fulfillmentId}/shipments`,
          {
            items: [{ id: orderItemId, quantity: 1 }],
            labels: [
              {
                tracking_number: "PK-TRACK-001",
                tracking_url: "https://example.test/track/PK-TRACK-001",
                label_url: "https://example.test/label/PK-TRACK-001",
              },
            ],
          },
          { headers: adminHeaders }
        )
        expect(shipmentRes.status).toBe(200)

        const container = getContainer()
        const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
        const [fulfillment] = await fulfillmentModule.listFulfillments(
          { id: fulfillmentId },
          { relations: ["labels"], take: 1 }
        )
        if (!fulfillment) {
          throw new Error("Fulfillment missing after shipment creation")
        }
        expect(fulfillment.shipped_at).toBeTruthy()
        expect(fulfillment.labels).toHaveLength(1)
        expect(fulfillment.labels[0].tracking_number).toBe("PK-TRACK-001")
      })

      it("REQ-SHIP-020 — canceling a fulfillment restores the unfulfilled reservation", async () => {
        const { order } = await completeCheckout("pk", variantId, 2)
        const orderItemId = order.items[0].id

        const fulfillRes = await api.post(
          `/admin/orders/${order.id}/fulfillments`,
          { items: [{ id: orderItemId, quantity: 1 }] },
          { headers: adminHeaders }
        )
        expect(fulfillRes.status).toBe(200)
        const [fulfillmentId] = await getFulfillmentIdsForOrder(order.id)
        if (!fulfillmentId) {
          throw new Error("No fulfillment was created for the order")
        }

        // Fulfilling 1 of 2 reduces the reservation to the remaining 1 unit.
        const afterFulfill = await getReservations(orderItemId)
        expect(afterFulfill).toHaveLength(1)
        expect(toNumber(afterFulfill[0].quantity)).toBe(1)

        const cancelRes = await api.post(
          `/admin/orders/${order.id}/fulfillments/${fulfillmentId}/cancel`,
          {},
          { headers: adminHeaders }
        )
        expect(cancelRes.status).toBe(200)

        const container = getContainer()
        const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
        const [fulfillment] = await fulfillmentModule.listFulfillments(
          { id: fulfillmentId },
          { take: 1 }
        )
        if (!fulfillment) {
          throw new Error("Fulfillment missing after cancellation")
        }
        expect(fulfillment.canceled_at).toBeTruthy()

        // The canceled fulfillment restores the full 2-unit reservation.
        const restored = await getReservations(orderItemId)
        const totalReserved = restored.reduce(
          (total, reservation) => total + toNumber(reservation.quantity),
          0
        )
        expect(totalReserved).toBe(2)
      })

      it("REQ-SHIP-016 — mark-as-delivered sets delivered_at", async () => {
        const { order } = await completeCheckout("ae", variantId, 1)
        const orderItemId = order.items[0].id

        const fulfillRes = await api.post(
          `/admin/orders/${order.id}/fulfillments`,
          { items: [{ id: orderItemId, quantity: 1 }] },
          { headers: adminHeaders }
        )
        expect(fulfillRes.status).toBe(200)
        const [fulfillmentId] = await getFulfillmentIdsForOrder(order.id)
        if (!fulfillmentId) {
          throw new Error("No fulfillment was created for the order")
        }

        const deliveredRes = await api.post(
          `/admin/orders/${order.id}/fulfillments/${fulfillmentId}/mark-as-delivered`,
          {},
          { headers: adminHeaders }
        )
        expect(deliveredRes.status).toBe(200)

        const container = getContainer()
        const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
        const [fulfillment] = await fulfillmentModule.listFulfillments(
          { id: fulfillmentId },
          { take: 1 }
        )
        expect(fulfillment?.delivered_at).toBeTruthy()
      })
    })
  },
})
