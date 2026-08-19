import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

import initialDataSeed from "../../src/migration-scripts/initial-data-seed"
import seedMarkets from "../../src/migration-scripts/seed-markets"
import seedInventory from "../../src/migration-scripts/seed-inventory"
import seedShipping from "../../src/migration-scripts/seed-shipping"

const ADMIN_EMAIL = "orders-admin@baby-store.test"
const ADMIN_PASSWORD = "SuperSecretTest123!"
const SYSTEM_PROVIDER_ID = "pp_system_default"
const PUBLISHABLE_KEY_TITLE = "Default Publishable API Key"
const TEST_PASSWORD = "password123"

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
        throw new Error("Failed to create the admin user for the orders suite")
      }

      const [providerIdentity] = await authModule.listProviderIdentities({
        entity_id: ADMIN_EMAIL,
        provider: "emailpass",
      })
      if (!providerIdentity?.auth_identity_id) {
        throw new Error(
          "Failed to resolve the admin auth identity for the orders suite"
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
        throw new Error("No publishable key found for the orders suite")
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
      if (!pakistan) {
        throw new Error("seed-shipping did not create the Pakistan channel")
      }
      return { pakistan }
    }

    const getMarkets = async () => {
      const container = getContainer()
      const regionModule = container.resolve(Modules.REGION)
      const regions = await regionModule.listRegions(
        {},
        { relations: ["countries"], take: null }
      )
      const pakistan = regions.find((region) => region.name === "Pakistan")
      if (!pakistan) {
        throw new Error("Markets seed did not create the Pakistan region")
      }
      return { pakistan }
    }

    const getShippingOption = async () => {
      const container = getContainer()
      const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
      const [option] = await fulfillmentModule.listShippingOptions(
        { name: "Standard Delivery (PK)" },
        { take: 1 }
      )
      if (!option) {
        throw new Error("seed-shipping did not create the PK shipping option")
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
    } as const

    /**
     * Medusa-native customer registration + authentication (the exact flow the
     * storefront uses): register auth identity → create + link customer →
     * complete email verification → authenticate. In 2.19.0 the emailpass
     * provider returns the actor-attached JWT directly from
     * POST /auth/customer/emailpass (no callback step — the provider has no
     * validateCallback, verified in installed source). Since BD-AUTH-01 email
     * verification is required, login stays gated (verification_required)
     * until the email is confirmed — the helper completes the full flow.
     */
    const registerCustomer = async (email: string, key: { token: string }) => {
      const registerRes = await api.post(
        "/auth/customer/emailpass/register",
        {
          email,
          password: TEST_PASSWORD,
        },
        { validateStatus: () => true }
      )
      expect(registerRes.status).toBe(200)

      // The register response carries an actorless token used to link the
      // customer account to the auth identity (native flow).
      const customerRes = await api.post(
        "/store/customers",
        {
          email,
          first_name: "Test",
          last_name: "Customer",
        },
        {
          headers: {
            "x-publishable-api-key": key.token,
            authorization: `Bearer ${registerRes.data.token}`,
          },
          validateStatus: () => true,
        }
      )
      expect(customerRes.status).toBe(200)

      // Email verification (BD-AUTH-01): the plaintext code is NOT in the
      // HTTP response (stripped by the request-verification workflow). In
      // production it is delivered through the `auth.verification_requested`
      // event payload (how production sends it by email). The Redis event
      // bus's grouped-event release chain does not deliver grouped events to
      // in-process subscribers in the test environment (pre-existing break
      // affecting all HTTP suites since the Redis wiring), so the code is
      // obtained deterministically from the auth module service — the same
      // `requestAuthVerification` the request-verification workflow wraps
      // (the token provider returns the plaintext code; the DB stores only
      // its hash). Confirming through the HTTP endpoint still exercises the
      // real confirm path.
      const container = getContainer()
      const authModule = container.resolve(Modules.AUTH)
      const [providerIdentity] = await authModule.listProviderIdentities({
        entity_id: email,
        provider: "emailpass",
      })
      if (!providerIdentity?.auth_identity_id) {
        throw new Error(
          `Failed to resolve the auth identity for ${email} in the orders suite`
        )
      }

      const requestRes = await api.post(
        "/auth/verification/request",
        { entity_id: email, entity_type: "email" },
        {
          headers: { authorization: `Bearer ${registerRes.data.token}` },
          validateStatus: () => true,
        }
      )
      expect(requestRes.status).toBe(201)

      const { code } = await authModule.requestAuthVerification({
        auth_identity_id: providerIdentity.auth_identity_id,
        entity_id: email,
        entity_type: "email",
        code_provider: "token",
      })
      expect(code).toBeTruthy()

      const confirmRes = await api.post(
        "/auth/verification/confirm",
        { code },
        {
          headers: { authorization: `Bearer ${registerRes.data.token}` },
          validateStatus: () => true,
        }
      )
      expect(confirmRes.status).toBe(200)

      const authRes = await api.post(
        "/auth/customer/emailpass",
        {
          email,
          password: TEST_PASSWORD,
        },
        { validateStatus: () => true }
      )
      expect(authRes.status).toBe(200)
      return authRes.data.token as string
    }

    const authHeaders = (key: { token: string }, token?: string) => ({
      "x-publishable-api-key": key.token,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    })

    /**
     * Creates a cart scoped to the Pakistan market's sales channel, adds a
     * line item and the market's shipping method, and creates a system-provider
     * payment session. When `customerToken` is supplied the cart is created as
     * that customer (customer_id is set on the cart → order).
     */
    const prepareCheckout = async (
      variantId: string,
      quantity = 1,
      customerToken?: string
    ) => {
      const storefrontKey = await getStorefrontKey()
      const { pakistan } = await getMarkets()
      const { pakistan: channel } = await getMarketChannels()
      const headers = authHeaders({ token: storefrontKey }, customerToken)

      const cartRes = await api.post(
        "/store/carts",
        {
          region_id: pakistan.id,
          sales_channel_id: channel.id,
          email: `orders-customer-pk@test.local`,
          currency_code: "pkr",
          shipping_address: MARKET_ADDRESSES.pk,
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

    const completeCheckout = async (
      variantId: string,
      quantity = 1,
      customerToken?: string
    ) => {
      const { headers, cart } = await prepareCheckout(
        variantId,
        quantity,
        customerToken
      )
      // `+customer_id`: the native store order fields do NOT include
      // customer_id by default (verified in installed query-config), but the
      // ownership assertions need it from the complete response.
      const completeRes = await api.post(
        `/store/carts/${cart.id}/complete`,
        {},
        { headers, params: { fields: "+customer_id" }, validateStatus: () => true }
      )
      const order = completeRes.data.order
      if (!order) {
        throw new Error(
          `Checkout completion failed: ${JSON.stringify(completeRes.data)}`
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

    // The integration runner shares a single database across the whole suite,
    // so seeds + shared fixtures run exactly once at suite scope.
    let key: { token: string }
    let variantId: string
    let adminHeaders: Record<string, string>

    beforeAll(async () => {
      await runSeeds()
      key = { token: await getStorefrontKey() }
      adminHeaders = { Authorization: `Bearer ${await getAdminToken()}` }

      const container = getContainer()
      const productModule = container.resolve(Modules.PRODUCT)
      const [variant] = await productModule.listProductVariants(
        {},
        { take: 1 }
      )
      if (!variant) {
        throw new Error("No variant seeded for the orders suite")
      }
      variantId = variant.id
    })

    describe("T-ORD-09 — single-order access enforcement (B-ORD-01)", () => {
      it("allows a guest with the matching order email (order ID + email credential)", async () => {
        const { order } = await completeCheckout(variantId, 1)
        expect(order.email).toBe("orders-customer-pk@test.local")

        const res = await api.get(`/store/orders/${order.id}`, {
          params: { email: order.email },
          headers: authHeaders(key),
        })
        expect(res.status).toBe(200)
        expect(res.data.order.id).toBe(order.id)
      })

      it("rejects a guest without an email credential (403, no existence leak)", async () => {
        const { order } = await completeCheckout(variantId, 1)

        const res = await api.get(`/store/orders/${order.id}`, {
          headers: authHeaders(key),
          validateStatus: () => true,
        })
        expect(res.status).toBe(403)
        expect(res.data.message).toMatch(/do not have access/i)
      })

      it("rejects a guest with a mismatched email (403, no existence leak)", async () => {
        const { order } = await completeCheckout(variantId, 1)

        const res = await api.get(`/store/orders/${order.id}`, {
          params: { email: "someone-else@test.local" },
          headers: authHeaders(key),
          validateStatus: () => true,
        })
        expect(res.status).toBe(403)
        expect(res.data.message).toMatch(/do not have access/i)
      })

      it("allows the owning customer to retrieve their order", async () => {
        const tokenA = await registerCustomer("order-owner-a@test.local", key)
        const { order } = await completeCheckout(variantId, 1, tokenA)
        expect(order.customer_id).toBeTruthy()

        const res = await api.get(`/store/orders/${order.id}`, {
          headers: authHeaders(key, tokenA),
        })
        expect(res.status).toBe(200)
        expect(res.data.order.id).toBe(order.id)
      })

      it("rejects another customer accessing a customer-owned order (403, no existence leak)", async () => {
        const tokenA = await registerCustomer("order-owner-b@test.local", key)
        const tokenB = await registerCustomer("order-intruder-c@test.local", key)
        const { order } = await completeCheckout(variantId, 1, tokenA)
        expect(order.customer_id).toBeTruthy()

        const res = await api.get(`/store/orders/${order.id}`, {
          headers: authHeaders(key, tokenB),
          validateStatus: () => true,
        })
        expect(res.status).toBe(403)
        expect(res.data.message).toMatch(/do not have access/i)
      })

      it("preserves native 404 for unknown order IDs", async () => {
        const res = await api.get("/store/orders/order_does_not_exist", {
          headers: authHeaders(key),
          validateStatus: () => true,
        })
        expect(res.status).toBe(404)
      })

      it("REQ-ORD-033 — draft orders are excluded from store exposure (404)", async () => {
        // Use the Pakistan sales channel — seed-inventory links the seeded
        // variants to its stock location; a random channel would fail the
        // stock-location check in createOrderWorkflow.
        const { pakistan: channel } = await getMarketChannels()

        // Native admin draft-order creation: sets status DRAFT +
        // is_draft_order true via createOrderWorkflow (verified in installed
        // source). The draft order must never be reachable through the store
        // surface even with the matching email credential.
        const draftRes = await api.post(
          "/admin/draft-orders",
          {
            region_id: (await getMarkets()).pakistan.id,
            sales_channel_id: channel.id,
            email: "draft-order@test.local",
            currency_code: "pkr",
            items: [{ variant_id: variantId, quantity: 1 }],
          },
          { headers: adminHeaders, validateStatus: () => true }
        )
        expect(draftRes.status).toBe(200)
        const draftOrder = draftRes.data.draft_order
        expect(draftOrder).toBeTruthy()

        const res = await api.get(`/store/orders/${draftOrder.id}`, {
          params: { email: "draft-order@test.local" },
          headers: authHeaders(key),
          validateStatus: () => true,
        })
        expect(res.status).toBe(404)
      })
    })

    describe("T-ORD-010 — customer order cancellation (REQ-ORD-016)", () => {
      it("rejects unauthenticated cancellation (401)", async () => {
        const { order } = await completeCheckout(variantId, 1)

        const res = await api.post(
          `/store/orders/${order.id}/cancel`,
          {},
          { headers: authHeaders(key), validateStatus: () => true }
        )
        expect(res.status).toBe(401)
      })

      it("rejects a non-owner customer canceling (403, no existence leak)", async () => {
        const tokenA = await registerCustomer("order-owner-d@test.local", key)
        const tokenB = await registerCustomer("order-intruder-e@test.local", key)
        const { order } = await completeCheckout(variantId, 1, tokenA)

        const res = await api.post(
          `/store/orders/${order.id}/cancel`,
          {},
          { headers: authHeaders(key, tokenB), validateStatus: () => true }
        )
        expect(res.status).toBe(403)
        expect(res.data.message).toMatch(/do not have access/i)
      })

      it("cancels an order before fulfillment and restores reservations exactly once (BD-O-02/03)", async () => {
        const tokenA = await registerCustomer("order-owner-f@test.local", key)
        const { order } = await completeCheckout(variantId, 2, tokenA)
        const orderItemId = order.items[0].id

        const beforeCancel = await getReservations(orderItemId)
        expect(beforeCancel).toHaveLength(1)
        expect(beforeCancel[0].quantity).toBe(2)

        const res = await api.post(
          `/store/orders/${order.id}/cancel`,
          {},
          { headers: authHeaders(key, tokenA), validateStatus: () => true }
        )
        expect(res.status).toBe(200)
        expect(res.data.order.id).toBe(order.id)
        expect(res.data.order.status).toBe("canceled")

        // Native cancelOrderWorkflow deletes reservations by line item
        // (deleteReservationsByLineItemsStep) — exactly once, so a subsequent
        // cancel attempt is rejected natively (BD-O-05).
        const afterCancel = await getReservations(orderItemId)
        expect(afterCancel).toHaveLength(0)

        const duplicate = await api.post(
          `/store/orders/${order.id}/cancel`,
          {},
          { headers: authHeaders(key, tokenA), validateStatus: () => true }
        )
        expect(duplicate.status).toBe(400)
      })

      it("rejects canceling an order with an uncanceled fulfillment (BD-O-04)", async () => {
        const tokenA = await registerCustomer("order-owner-g@test.local", key)
        const { order } = await completeCheckout(variantId, 1, tokenA)
        const orderItemId = order.items[0].id

        const fulfillRes = await api.post(
          `/admin/orders/${order.id}/fulfillments`,
          { items: [{ id: orderItemId, quantity: 1 }] },
          { headers: adminHeaders }
        )
        expect(fulfillRes.status).toBe(200)
        expect(await getFulfillmentIdsForOrder(order.id)).toHaveLength(1)

        const res = await api.post(
          `/store/orders/${order.id}/cancel`,
          {},
          { headers: authHeaders(key, tokenA), validateStatus: () => true }
        )
        // Native cancelValidateOrder: "All fulfillments must be canceled
        // before canceling an order" → NOT_ALLOWED → 400.
        expect(res.status).toBe(400)
      })
    })
  },
})

jest.setTimeout(120 * 1000)