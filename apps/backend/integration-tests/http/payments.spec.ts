import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import {
  createShippingOptionsWorkflow,
  updateRegionsWorkflow,
} from "@medusajs/medusa/core-flows"

import initialDataSeed from "../../src/migration-scripts/initial-data-seed"
import seedMarkets from "../../src/migration-scripts/seed-markets"
import seedInventory from "../../src/migration-scripts/seed-inventory"

const ADMIN_EMAIL = "payments-admin@baby-store.test"
const ADMIN_PASSWORD = "SuperSecretTest123!"
const SYSTEM_PROVIDER_ID = "pp_system_default"

const toNumber = (value: unknown): number => Number(value ?? 0)

const sumRelation = (payment: any, relation: string): number =>
  (payment?.[relation] ?? []).reduce(
    (total: number, entry: any) => total + toNumber(entry.amount),
    0
  )

const waitForEvent = async <T>(
  captured: T[],
  timeoutMs = 10_000,
  intervalMs = 100
): Promise<T> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (captured.length > 0) {
      return captured[0]
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for the captured event`
  )
}

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
        throw new Error("Failed to create the admin user for the payments suite")
      }

      const [providerIdentity] = await authModule.listProviderIdentities({
        entity_id: ADMIN_EMAIL,
        provider: "emailpass",
      })
      if (!providerIdentity?.auth_identity_id) {
        throw new Error(
          "Failed to resolve the admin auth identity for the payments suite"
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

    const getShippingOption = async () => {
      const container = getContainer()
      const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
      const [existing] = await fulfillmentModule.listShippingOptions(
        { name: "Payments Flat Rate" },
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
      if (!karachi) {
        throw new Error("Karachi Warehouse missing for the payments suite")
      }

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
      if (!shippingProfile) {
        throw new Error("No default shipping profile for the payments suite")
      }
      const fulfillmentSet = await fulfillmentModule.createFulfillmentSets({
        name: "Payments Shipping Set",
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
            name: "Payments Flat Rate",
            service_zone_id: serviceZoneId,
            shipping_profile_id: shippingProfile.id,
            provider_id: "manual_manual",
            price_type: "flat",
            type: {
              label: "Standard",
              description: "Test flat rate shipping.",
              code: "payments-flat-rate",
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
        { name: "Payments Flat Rate" },
        { take: 1 }
      )
      if (!option) {
        throw new Error("Shipping option was not created for the payments suite")
      }
      return option
    }

    /**
     * Creates a cart with one line item, adds the flat-rate shipping method,
     * and creates a payment collection with a system-provider session.
     */
    const prepareCheckout = async (variantId: string, quantity = 1) => {
      const { storefrontKey, channelId } = await getStorefrontKey()
      const { pakistan } = await getMarkets()
      const headers = { "x-publishable-api-key": storefrontKey.token }

      const cartRes = await api.post(
        "/store/carts",
        {
          region_id: pakistan.id,
          sales_channel_id: channelId,
          email: "payments-customer@test.local",
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

    const completeCheckout = async (variantId: string, quantity = 1) => {
      const { headers, cart, paymentCollection } = await prepareCheckout(
        variantId,
        quantity
      )
      const completeRes = await api.post(
        `/store/carts/${cart.id}/complete`,
        {},
        { headers }
      )
      return { headers, cart, paymentCollection, order: completeRes.data.order }
    }

    /**
     * Resolves the payment created for an order's payment collection, with
     * the captures/refunds relations loaded so the DTO-computed
     * `captured_amount`/`refunded_amount` are populated.
     */
    const getOrderPayment = async (order: { payment_collections: { id: string }[] }) => {
      const container = getContainer()
      const paymentModule = container.resolve(Modules.PAYMENT)
      const collectionId = order.payment_collections[0].id
      const [collection] = await paymentModule.listPaymentCollections(
        { id: collectionId },
        { relations: ["payments.captures", "payments.refunds"], take: 1 }
      )
      const payment = collection?.payments?.[0]
      if (!payment) {
        throw new Error("No payment was created for the completed order")
      }
      return payment
    }

    describe("Payments — native module + webhook pipeline (T-PAY-04)", () => {
      let variantId: string

      beforeAll(async () => {
        await runSeeds()
        const container = getContainer()
        const productModule = container.resolve(Modules.PRODUCT)
        const [variant] = await productModule.listProductVariants({}, { take: 1 })
        if (!variant) {
          throw new Error("No variant seeded for the payments suite")
        }
        variantId = variant.id
      })

      it("REQ-PAY-003 — store provider listing is scoped to the region via region_payment_provider", async () => {
        const { storefrontKey } = await getStorefrontKey()
        const headers = { "x-publishable-api-key": storefrontKey.token }
        const { pakistan, uae } = await getMarkets()

        // Unbound regions expose no providers.
        const pkBefore = await api.get(
          `/store/payment-providers?region_id=${pakistan.id}`,
          { headers, validateStatus: () => true }
        )
        expect(pkBefore.status).toBe(200)
        expect(pkBefore.data.payment_providers).toHaveLength(0)

        // Binding the system provider to the PK region makes it visible there…
        const container = getContainer()
        await updateRegionsWorkflow(container).run({
          input: {
            selector: { id: pakistan.id },
            update: { payment_providers: [SYSTEM_PROVIDER_ID] },
          },
        })

        const pkAfter = await api.get(
          `/store/payment-providers?region_id=${pakistan.id}`,
          { headers }
        )
        expect(pkAfter.data.payment_providers.map((p) => p.id)).toEqual([
          SYSTEM_PROVIDER_ID,
        ])

        // …but not in the AE region (cross-market isolation).
        const ae = await api.get(`/store/payment-providers?region_id=${uae.id}`, {
          headers,
        })
        expect(ae.data.payment_providers).toHaveLength(0)

        // Missing region_id is rejected natively.
        const missing = await api.get("/store/payment-providers", {
          headers,
          validateStatus: () => true,
        })
        expect(missing.status).toBe(400)
      })

      it("REQ-PAY-004/030 — collection + session creation via native store routes; one authoritative session per collection", async () => {
        const { headers, cart, paymentCollection } = await prepareCheckout(variantId)

        // The store DTO intentionally exposes only id/currency/amount/sessions;
        // the cart link is verified through the module instead.
        expect(paymentCollection.currency_code).toBe("pkr")
        expect(toNumber(paymentCollection.amount)).toBeGreaterThan(0)

        const container = getContainer()
        const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
        const link = remoteLink.getLinkModule(
          Modules.CART,
          "cart_id",
          Modules.PAYMENT,
          "payment_collection_id"
        )!
        const links = (await link.list({
          payment_collection_id: paymentCollection.id,
        })) as { cart_id: string; payment_collection_id: string }[]
        expect(links).toHaveLength(1)
        expect(links[0].cart_id).toBe(cart.id)

        const sessions = paymentCollection.payment_sessions ?? []
        expect(sessions).toHaveLength(1)
        expect(sessions[0].provider_id).toBe(SYSTEM_PROVIDER_ID)

        // Re-initializing the same provider keeps exactly one authoritative
        // session (native delete-other-sessions behavior).
        const again = await api.post(
          `/store/payment-collections/${paymentCollection.id}/payment-sessions`,
          { provider_id: SYSTEM_PROVIDER_ID },
          { headers }
        )
        const sessionsAfter = again.data.payment_collection.payment_sessions ?? []
        expect(sessionsAfter).toHaveLength(1)
        expect(sessionsAfter[0].provider_id).toBe(SYSTEM_PROVIDER_ID)
      })

      it("REQ-PAY-006 — completing checkout authorizes the payment session (order-first, authorize-last)", async () => {
        const { order } = await completeCheckout(variantId)
        expect(order).toBeTruthy()
        expect(order.id).toMatch(/^order_/)

        const payment = await getOrderPayment(order)
        expect(toNumber(payment.amount)).toBeGreaterThan(0)
        expect(payment.currency_code).toBe("pkr")
        // Authorized but not yet captured: no capture records exist.
        expect(sumRelation(payment, "captures")).toBe(0)
        expect(sumRelation(payment, "refunds")).toBe(0)
      })

      it("REQ-PAY-010/031 — admin capture succeeds once; a duplicate capture has no second financial effect", async () => {
        const adminToken = await getAdminToken()
        const adminHeaders = { Authorization: `Bearer ${adminToken}` }

        const { order } = await completeCheckout(variantId)
        const payment = await getOrderPayment(order)
        const amount = toNumber(payment.amount)

        const captured = await api.post(
          `/admin/payments/${payment.id}/capture`,
          { amount },
          { headers: adminHeaders, validateStatus: () => true }
        )
        expect(captured.status).toBe(200)

        const afterCapture = await getOrderPayment(order)
        expect(sumRelation(afterCapture, "captures")).toBe(amount)

        // A duplicate full capture is idempotent success (native behavior):
        // the capture step short-circuits on captured_at, so no second
        // capture record is created (REQ-PAY-010 — one financial effect).
        const duplicate = await api.post(
          `/admin/payments/${payment.id}/capture`,
          { amount },
          { headers: adminHeaders, validateStatus: () => true }
        )
        expect(duplicate.status).toBe(200)

        const after = await getOrderPayment(order)
        expect(sumRelation(after, "captures")).toBe(amount)
        expect(sumRelation(after, "captures")).not.toBe(amount * 2)
      })

      it("REQ-PAY-011 — refund ≤ captured is enforced natively; over-refund is rejected", async () => {
        const adminToken = await getAdminToken()
        const adminHeaders = { Authorization: `Bearer ${adminToken}` }

        const { order } = await completeCheckout(variantId)
        const payment = await getOrderPayment(order)
        const amount = toNumber(payment.amount)

        const captured = await api.post(
          `/admin/payments/${payment.id}/capture`,
          { amount },
          { headers: adminHeaders }
        )
        expect(captured.status).toBe(200)

        // Full refund of the captured amount is allowed.
        const refunded = await api.post(
          `/admin/payments/${payment.id}/refund`,
          { amount },
          { headers: adminHeaders, validateStatus: () => true }
        )
        expect(refunded.status).toBe(200)

        const afterRefund = await getOrderPayment(order)
        expect(sumRelation(afterRefund, "refunds")).toBe(amount)

        // Refunding beyond the refundable amount is rejected (native
        // validateRefundPaymentExceedsCapturedAmountStep).
        const over = await api.post(
          `/admin/payments/${payment.id}/refund`,
          { amount },
          { headers: adminHeaders, validateStatus: () => true }
        )
        expect(over.status).toBeGreaterThanOrEqual(400)

        const after = await getOrderPayment(order)
        expect(sumRelation(after, "refunds")).toBe(amount)
      })

      it("REQ-PAY-027 — POST /hooks/payment/:provider emits payment.webhook_received through the native pipeline", async () => {
        const container = getContainer()
        const eventBus = container.resolve(Modules.EVENT_BUS)

        // Capture the event directly: the shipped webhook subscriber is a
        // `not_supported` early-return, so waitSubscribersExecution would
        // resolve to `undefined` rather than the event payload.
        const captured: any[] = []
        const listener = async (message: any) => {
          captured.push(message)
        }
        eventBus.subscribe("payment.webhook_received", listener)

        const res = await api.post(
          "/hooks/payment/system_default",
          {
            type: "payment_intent.succeeded",
            data: { object: { id: "pi_test" } },
          },
          { validateStatus: () => true }
        )
        expect(res.status).toBe(200)

        // The route emits the event with the native webhook_delay (5000ms).
        const event = await waitForEvent(captured, 10_000)
        expect(event.data.provider).toBe("system_default")
        expect(event.data.payload.data.type).toBe("payment_intent.succeeded")

        // The system provider maps the webhook to `not_supported`, so no
        // session/order state is mutated (verified subscriber behavior).
        await utils.waitWorkflowExecutions()
        const paymentModule = container.resolve(Modules.PAYMENT)
        const sessions = await paymentModule.listPaymentSessions({}, { take: 1 })
        const states = sessions.map((s) => s.status)
        expect(states.every((s) => s === "pending")).toBe(true)
      })
    })
  },
})

jest.setTimeout(120 * 1000)
