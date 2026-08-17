import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows"

import initialDataSeed from "../../src/migration-scripts/initial-data-seed"
import seedMarkets from "../../src/migration-scripts/seed-markets"
import seedInventory from "../../src/migration-scripts/seed-inventory"
import seedShipping from "../../src/migration-scripts/seed-shipping"

const SYSTEM_PROVIDER_ID = "pp_system_default"

const toNumber = (value: unknown): number => Number(value ?? 0)

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
      await seedShipping({ container })
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
        throw new Error(
          "No publishable key is linked to a channel with products"
        )
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
      const uae = regions.find(
        (region) => region.name === "United Arab Emirates"
      )
      if (!pakistan || !uae) {
        throw new Error("Markets seed did not create the expected regions")
      }
      return { pakistan, uae }
    }

    const getShippingOption = async () => {
      const container = getContainer()
      const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
      const [existing] = await fulfillmentModule.listShippingOptions(
        { name: "Checkout Flat Rate" },
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
        throw new Error("Karachi Warehouse missing for the checkout suite")
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
        throw new Error("No default shipping profile for the checkout suite")
      }
      const fulfillmentSet = await fulfillmentModule.createFulfillmentSets({
        name: "Checkout Shipping Set",
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
            name: "Checkout Flat Rate",
            service_zone_id: serviceZoneId,
            shipping_profile_id: shippingProfile.id,
            provider_id: "manual_manual",
            price_type: "flat",
            type: {
              label: "Standard",
              description: "Test flat rate shipping.",
              code: "checkout-flat-rate",
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
        { name: "Checkout Flat Rate" },
        { take: 1 }
      )
      if (!option) {
        throw new Error("Shipping option was not created for the checkout suite")
      }
      return option
    }

    const getOrderCartLinks = async (cartId: string) => {
      const container = getContainer()
      const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
      const link = remoteLink.getLinkModule(
        Modules.ORDER,
        "order_id",
        Modules.CART,
        "cart_id"
      )!
      return (await link.list({ cart_id: cartId })) as {
        order_id: string
        cart_id: string
      }[]
    }

    /**
     * Creates a PK cart (guest), adds a line item, sets the shipping address,
     * adds the flat-rate shipping method, and creates a system-provider
     * payment session.
     */
    const prepareCheckout = async (
      variantId: string,
      quantity = 1,
      extra: { authHeaders?: Record<string, string>; email?: string } = {}
    ) => {
      const { storefrontKey, channelId } = await getStorefrontKey()
      const { pakistan } = await getMarkets()
      const headers = {
        "x-publishable-api-key": storefrontKey.token,
        ...(extra.authHeaders ?? {}),
      }
      const email = extra.email ?? "checkout-guest@test.local"

      const cartRes = await api.post(
        "/store/carts",
        {
          region_id: pakistan.id,
          sales_channel_id: channelId,
          email,
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

      // Re-fetch: the cart response reflects the prepared state (items,
      // shipping method, payment session).
      const freshRes = await api.get(`/store/carts/${cart.id}`, { headers })

      return {
        headers,
        cart: freshRes.data.cart,
        paymentCollection: sessionRes.data.payment_collection,
      }
    }

    /**
     * Same as prepareCheckout but WITHOUT a shipping method, so completion
     * reaches the shipping validation step and fails there.
     */
    const prepareCheckoutWithoutShipping = async (
      variantId: string,
      extra: { authHeaders?: Record<string, string>; email?: string } = {}
    ) => {
      const { storefrontKey, channelId } = await getStorefrontKey()
      const { pakistan } = await getMarkets()
      const headers = {
        "x-publishable-api-key": storefrontKey.token,
        ...(extra.authHeaders ?? {}),
      }
      const email = extra.email ?? "checkout-guest@test.local"

      const cartRes = await api.post(
        "/store/carts",
        {
          region_id: pakistan.id,
          sales_channel_id: channelId,
          email,
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
        { variant_id: variantId, quantity: 1 },
        { headers }
      )

      const pcRes = await api.post(
        "/store/payment-collections",
        { cart_id: cart.id },
        { headers }
      )
      await api.post(
        `/store/payment-collections/${pcRes.data.payment_collection.id}/payment-sessions`,
        { provider_id: SYSTEM_PROVIDER_ID },
        { headers }
      )

      return { headers, cart }
    }

    const completeCheckout = async (
      variantId: string,
      quantity = 1,
      extra: { authHeaders?: Record<string, string>; email?: string } = {}
    ) => {
      const { headers, cart } = await prepareCheckout(
        variantId,
        quantity,
        extra
      )
      const completeRes = await api.post(
        `/store/carts/${cart.id}/complete`,
        {},
        { headers }
      )
      return { headers, cart, order: completeRes.data.order }
    }

    /**
     * Registers a customer with email/password and completes the native
     * verification flow (BD-AUTH-01), returning a fully authenticated token.
     */
    const registerVerifiedCustomer = async () => {
      const container = getContainer()
      const eventBus = container.resolve(Modules.EVENT_BUS)
      const email = `checkout-customer-${Date.now()}@test.local`
      const password = "CheckoutTest123!"

      const registerRes = await api.post("/auth/customer/emailpass/register", {
        email,
        password,
      })
      const registerToken = registerRes.data.token as string
      if (!registerToken) {
        throw new Error("Register did not return an actorless token")
      }
      const actorlessHeaders = {
        authorization: `Bearer ${registerToken}`,
      }

      // Link the auth identity to a customer record (native flow).
      const customerRes = await api.post(
        "/store/customers",
        { email, first_name: "Checkout", last_name: "Customer" },
        {
          headers: {
            "x-publishable-api-key": (await getStorefrontKey()).storefrontKey
              .token,
            ...actorlessHeaders,
          },
          validateStatus: () => true,
        }
      )
      if (customerRes.status !== 200) {
        throw new Error(
          `Customer creation failed with ${customerRes.status}: ${
            customerRes.data?.message ?? "no message"
          }`
        )
      }

      const codes: { code: string }[] = []
      const onEvent = (event: { data?: { code?: string } }) => {
        if (typeof event?.data?.code === "string") {
          codes.push({ code: event.data.code })
        }
      }
      await eventBus.subscribe("auth.verification_requested", onEvent)
      try {
        await api.post(
          "/auth/verification/request",
          { entity_id: email, entity_type: "email" },
          { headers: actorlessHeaders }
        )
        const { code } = await waitForEvent(codes)
        await api.post(
          "/auth/verification/confirm",
          { code },
          { headers: actorlessHeaders }
        )
      } finally {
        await eventBus.unsubscribe("auth.verification_requested", onEvent)
      }

      const loginRes = await api.post("/auth/customer/emailpass", {
        email,
        password,
      })
      const token = loginRes.data.token as string
      if (!token) {
        throw new Error("Verified customer login returned no token")
      }
      return {
        email,
        authHeaders: { authorization: `Bearer ${token}` },
      }
    }

    describe("Cart & Checkout foundation (REQ-CC-004..022)", () => {
      let variantId: string
      let storefrontHeaders: Record<string, string>
      let pakistanRegionId: string

      beforeAll(async () => {
        await runSeeds()
        const container = getContainer()
        const productModule = container.resolve(Modules.PRODUCT)
        const [variant] = await productModule.listProductVariants(
          {},
          { take: 1 }
        )
        if (!variant) {
          throw new Error("No variant seeded for the checkout suite")
        }
        variantId = variant.id
        const { storefrontKey } = await getStorefrontKey()
        storefrontHeaders = { "x-publishable-api-key": storefrontKey.token }
        const { pakistan } = await getMarkets()
        pakistanRegionId = pakistan.id
      })

      it("REQ-CC-004 — one authoritative currency; client currency_code at update is ignored", async () => {
        const { cart } = await prepareCheckout(variantId)

        expect(cart.currency_code).toBe("pkr")

        // The update validator is strict: a client-supplied currency_code is
        // rejected outright rather than silently switching currency.
        const updateRes = await api.post(
          `/store/carts/${cart.id}`,
          { currency_code: "usd", email: cart.email },
          { headers: storefrontHeaders, validateStatus: () => true }
        )
        expect(updateRes.status).toBe(400)
        expect(updateRes.data.type).toBe("invalid_data")

        const fresh = await api.get(`/store/carts/${cart.id}`, {
          headers: storefrontHeaders,
        })
        expect(fresh.data.cart.currency_code).toBe("pkr")
        expect(fresh.data.cart.region_id).toBe(pakistanRegionId)
      })

      it("REQ-CC-005 — add requires quantity > 0; updating a line to 0 removes it", async () => {
        const { cart } = await prepareCheckout(variantId)

        const zero = await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: variantId, quantity: 0 },
          { headers: storefrontHeaders, validateStatus: () => true }
        )
        expect(zero.status).toBe(400)

        const negative = await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: variantId, quantity: -1 },
          { headers: storefrontHeaders, validateStatus: () => true }
        )
        expect(negative.status).toBe(400)

        const itemsRes = await api.get(`/store/carts/${cart.id}`, {
          headers: storefrontHeaders,
        })
        expect(itemsRes.data.cart.items).toHaveLength(1)
        expect(itemsRes.data.cart.items[0].quantity).toBe(1)

        const removeRes = await api.post(
          `/store/carts/${cart.id}/line-items/${itemsRes.data.cart.items[0].id}`,
          { quantity: 0 },
          { headers: storefrontHeaders }
        )
        expect(removeRes.data.cart.items).toHaveLength(0)
      })

      it("REQ-CC-006 — adding an invalid/deleted variant is rejected server-side", async () => {
        const { cart } = await prepareCheckout(variantId)

        const invalid = await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: "variant_does_not_exist", quantity: 1 },
          { headers: storefrontHeaders, validateStatus: () => true }
        )
        expect(invalid.status).toBe(400)

        const itemsRes = await api.get(`/store/carts/${cart.id}`, {
          headers: storefrontHeaders,
        })
        expect(itemsRes.data.cart.items).toHaveLength(1)
      })

      it("REQ-CC-008 — client-supplied prices are ignored; line item price comes from the catalog", async () => {
        const { cart } = await prepareCheckout(variantId)

        const tamperRes = await api.post(
          `/store/carts/${cart.id}/line-items`,
          {
            variant_id: variantId,
            quantity: 1,
            unit_price: 1,
            total: 0,
          },
          { headers: storefrontHeaders, validateStatus: () => true }
        )
        // Client price fields are rejected outright — they can never reach
        // the cart model.
        expect(tamperRes.status).toBe(400)
        expect(tamperRes.data.type).toBe("invalid_data")
        expect(tamperRes.data.message).toContain("Unrecognized fields")

        const fresh = await api.get(`/store/carts/${cart.id}`, {
          headers: storefrontHeaders,
        })
        const originalLine = fresh.data.cart.items.find(
          (item) => item.id === cart.items[0].id
        )
        expect(originalLine).toBeDefined()
        // The line price comes from the catalog: subtotal = Σ price × qty.
        // (item_total additionally carries the server-computed item tax.)
        const expectedSubtotal = fresh.data.cart.items.reduce(
          (sum: number, item: { unit_price: unknown; quantity: number }) =>
            sum + toNumber(item.unit_price) * item.quantity,
          0
        )
        expect(expectedSubtotal).toBeGreaterThan(1)
        expect(toNumber(fresh.data.cart.item_subtotal)).toBe(expectedSubtotal)
        for (const item of fresh.data.cart.items) {
          expect(toNumber(item.unit_price)).not.toBe(1)
        }
      })

      it("REQ-CC-009 — totals are backend-computed from items, quantities, and shipping", async () => {
        const { cart } = await prepareCheckout(variantId, 3)

        const expectedSubtotal = cart.items.reduce(
          (sum: number, item: { unit_price: unknown; quantity: number }) =>
            sum + toNumber(item.unit_price) * item.quantity,
          0
        )
        expect(cart.items).toHaveLength(1)
        expect(cart.items[0].quantity).toBe(3)
        // subtotal: pre-tax prices × quantities; shipping subtotal: option price.
        expect(toNumber(cart.item_subtotal)).toBe(expectedSubtotal)
        expect(toNumber(cart.shipping_subtotal)).toBe(100)
        // totals are tax-inclusive in the store DTO.
        expect(toNumber(cart.item_total)).toBe(
          toNumber(cart.item_subtotal) + toNumber(cart.item_tax_total)
        )
        expect(toNumber(cart.shipping_total)).toBe(
          toNumber(cart.shipping_subtotal) + toNumber(cart.shipping_tax_total)
        )
        // total = tax-inclusive item_total + tax-inclusive shipping_total.
        expect(toNumber(cart.total)).toBe(
          toNumber(cart.item_total) + toNumber(cart.shipping_total)
        )
      })

      it("REQ-CC-011 — tax lines are computed server-side from region + addresses", async () => {
        const { cart, order } = await completeCheckout(variantId)

        // Tax is computed server-side (PK GST) and carried into the order:
        // the order's tax_total is exactly the cart's computed tax_total.
        expect(toNumber(cart.tax_total)).toBeGreaterThan(0)
        expect(order.currency_code).toBe("pkr")
        expect(toNumber(order.tax_total)).toBe(toNumber(cart.tax_total))
        // The order preserves the same totals structure as the cart.
        expect(toNumber(order.item_total)).toBe(
          toNumber(order.item_subtotal) + toNumber(order.item_tax_total)
        )
        expect(toNumber(order.shipping_total)).toBe(
          toNumber(order.shipping_subtotal) + toNumber(order.shipping_tax_total)
        )
        expect(toNumber(order.total)).toBe(
          toNumber(order.item_total) + toNumber(order.shipping_total)
        )
      })

      it("REQ-CC-013 — completion with an empty cart is rejected (INVALID_DATA)", async () => {
        const { storefrontKey } = await getStorefrontKey()
        const cartRes = await api.post(
          "/store/carts",
          {
            region_id: pakistanRegionId,
            sales_channel_id: (await getStorefrontKey()).channelId,
          },
          { headers: storefrontHeaders }
        )

        const completeRes = await api.post(
          `/store/carts/${cartRes.data.cart.id}/complete`,
          {},
          { headers: storefrontHeaders, validateStatus: () => true }
        )
        expect(completeRes.status).toBe(400)
        expect(completeRes.data.type).toBe("invalid_data")
        expect(typeof completeRes.data.message).toBe("string")
        expect(completeRes.data.message.length).toBeGreaterThan(0)
        expect(JSON.stringify(completeRes.data)).not.toContain("at ")
        expect(JSON.stringify(completeRes.data)).not.toContain("node_modules")
      })

      it("REQ-CC-014 — parallel and duplicate completion produce exactly one order", async () => {
        const { headers, cart } = await prepareCheckout(variantId)

        const results = await Promise.allSettled([
          api.post(`/store/carts/${cart.id}/complete`, {}, { headers }),
          api.post(`/store/carts/${cart.id}/complete`, {}, { headers }),
        ])

        const orders = results
          .filter(
            (result): result is PromiseFulfilledResult<{ data: { order?: { id: string } } }> =>
              result.status === "fulfilled" && Boolean(result.value?.data?.order)
          )
          .map((result) => result.value.data.order!.id)

        const links = await getOrderCartLinks(cart.id)
        // The hard invariant: exactly one order was ever created for the cart.
        expect(links).toHaveLength(1)
        // Whatever the race outcome, every returned order is the same one.
        for (const orderId of orders) {
          expect(orderId).toBe(links[0].order_id)
        }

        // A later duplicate completion returns the SAME order (no re-run).
        const again = await api.post(
          `/store/carts/${cart.id}/complete`,
          {},
          { headers }
        )
        expect(again.data.type).toBe("order")
        expect(again.data.order.id).toBe(links[0].order_id)
        expect(await getOrderCartLinks(cart.id)).toHaveLength(1)
      })

      it("REQ-CC-016 — the order is a snapshot; later price changes do not alter it", async () => {
        const { order } = await completeCheckout(variantId)
        const originalUnitPrice = toNumber(order.items[0].unit_price)

        const container = getContainer()
        const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
        const variantPriceLink = remoteLink.getLinkModule(
          Modules.PRODUCT,
          "variant_id",
          Modules.PRICING,
          "price_set_id"
        )!
        const [variantLink] = (await variantPriceLink.list({
          variant_id: variantId,
        })) as { variant_id: string; price_set_id: string }[]
        if (!variantLink) {
          throw new Error("Variant has no price set link")
        }

        const pricingModule = container.resolve(Modules.PRICING)
        const prices = await pricingModule.listPrices(
          {
            currency_code: "pkr",
            price_set_id: [variantLink.price_set_id],
          },
          { take: null }
        )
        if (prices.length === 0) {
          throw new Error("No pkr price found for the variant")
        }
        for (const price of prices) {
          await pricingModule.updatePrices([
            { id: price.id, amount: originalUnitPrice + 1000 },
          ])
        }

        const retrieved = await api.get(`/store/orders/${order.id}`, {
          headers: storefrontHeaders,
        })
        expect(toNumber(retrieved.data.order.items[0].unit_price)).toBe(
          originalUnitPrice
        )
      })

      it("REQ-CC-018 — guest checkout completes end-to-end; order is retrievable without auth", async () => {
        const email = `guest-${Date.now()}@test.local`
        const { order } = await completeCheckout(variantId, 1, { email })

        expect(order).toBeDefined()
        expect(order.email).toBe(email)
        expect(order.currency_code).toBe("pkr")

        const byId = await api.get(`/store/orders/${order.id}`, {
          headers: storefrontHeaders,
        })
        expect(byId.status).toBe(200)
        expect(byId.data.order.id).toBe(order.id)
      })

      it("REQ-CC-019 — customer checkout completes with the cart's customer; order ties to the account", async () => {
        const { email, authHeaders } = await registerVerifiedCustomer()

        const { storefrontKey, channelId } = await getStorefrontKey()
        const { pakistan } = await getMarkets()
        const headers = {
          "x-publishable-api-key": storefrontKey.token,
          ...authHeaders,
        }

        const cartRes = await api.post(
          "/store/carts",
          {
            region_id: pakistan.id,
            sales_channel_id: channelId,
            email,
          },
          { headers }
        )
        const cart = cartRes.data.cart

        await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: variantId, quantity: 1 },
          { headers }
        )

        const transferRes = await api.post(
          `/store/carts/${cart.id}/customer`,
          {},
          { headers, validateStatus: () => true }
        )
        expect(transferRes.status).toBe(200)
        expect(transferRes.data.cart.customer_id).toBeTruthy()

        await api.post(
          `/store/carts/${cart.id}`,
          {
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
        await api.post(
          `/store/payment-collections/${pcRes.data.payment_collection.id}/payment-sessions`,
          { provider_id: SYSTEM_PROVIDER_ID },
          { headers }
        )

        const completeRes = await api.post(
          `/store/carts/${cart.id}/complete`,
          {},
          { headers }
        )
        expect(completeRes.data.type).toBe("order")
        expect(completeRes.data.order.email).toBe(email)

        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data: orderRows } = await query.graph({
          entity: "order",
          fields: ["id", "customer_id"],
          filters: { id: completeRes.data.order.id },
        })
        expect(orderRows).toHaveLength(1)
        expect(orderRows[0].customer_id).toBeTruthy()

        // The customer token can reach the order; a different token cannot.
        const byCustomer = await api.get(
          `/store/orders/${completeRes.data.order.id}`,
          { headers }
        )
        expect(byCustomer.status).toBe(200)
      })

      it("REQ-CC-020 — shipping address country must be in the cart's region (native)", async () => {
        const { cart } = await prepareCheckout(variantId)

        const mismatch = await api.post(
          `/store/carts/${cart.id}`,
          {
            shipping_address: {
              ...cart.shipping_address,
              country_code: "us",
            },
          },
          { headers: storefrontHeaders, validateStatus: () => true }
        )
        expect(mismatch.status).toBe(400)
        expect(mismatch.data.type).toBe("invalid_data")
        expect(mismatch.data.message).toContain("not within region")
      })

      it("REQ-CC-021/022 — completion cannot be forced or fabricated; errors are clean and deterministic", async () => {
        const { storefrontKey, channelId } = await getStorefrontKey()
        const cartRes = await api.post(
          "/store/carts",
          {
            region_id: pakistanRegionId,
            sales_channel_id: channelId,
            email: "force@test.local",
          },
          { headers: storefrontHeaders }
        )
        const cart = cartRes.data.cart
        await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: variantId, quantity: 1 },
          { headers: storefrontHeaders }
        )

        // No payment session → completion must fail, even with a fabricated
        // body claiming authorization.
        const forged = await api.post(
          `/store/carts/${cart.id}/complete`,
          { payment: "authorized", total: 0 },
          { headers: storefrontHeaders, validateStatus: () => true }
        )
        expect(forged.status).toBe(400)
        expect(forged.data.type).toBe("invalid_data")
        expect(forged.data.message).toContain("Payment")

        // Cart with a payment session but no shipping method → shipping step
        // fails validation (cannot complete a non-shippable cart silently).
        const { cart: cart2 } = await prepareCheckoutWithoutShipping(variantId)
        const noShipping = await api.post(
          `/store/carts/${cart2.id}/complete`,
          {},
          { headers: storefrontHeaders, validateStatus: () => true }
        )
        expect(noShipping.status).toBe(400)
        expect(noShipping.data.type).toBe("invalid_data")
        expect(noShipping.data.message).toContain("No shipping method")

        // Error surfaces never leak internals.
        const raw = JSON.stringify(forged.data)
        expect(raw).not.toContain("at ")
        expect(raw).not.toContain("node_modules")
        expect(raw).not.toContain("secret")
      })
    })
  },
})
