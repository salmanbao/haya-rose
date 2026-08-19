import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

import initialDataSeed from "../../src/migration-scripts/initial-data-seed"
import seedMarkets from "../../src/migration-scripts/seed-markets"
import seedInventory from "../../src/migration-scripts/seed-inventory"
import seedShipping from "../../src/migration-scripts/seed-shipping"

const ADMIN_EMAIL = "returns-admin@baby-store.test"
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
        throw new Error("Failed to create the admin user for the returns suite")
      }

      const [providerIdentity] = await authModule.listProviderIdentities({
        entity_id: ADMIN_EMAIL,
        provider: "emailpass",
      })
      if (!providerIdentity?.auth_identity_id) {
        throw new Error(
          "Failed to resolve the admin auth identity for the returns suite"
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
        throw new Error("No publishable key found for the returns suite")
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

      const container = getContainer()
      const authModule = container.resolve(Modules.AUTH)
      const [providerIdentity] = await authModule.listProviderIdentities({
        entity_id: email,
        provider: "emailpass",
      })
      if (!providerIdentity?.auth_identity_id) {
        throw new Error(
          `Failed to resolve the auth identity for ${email} in the returns suite`
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
          email: `returns-customer-pk@test.local`,
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

    interface ReturnShippingQueryRow {
      id: string
      shipping_methods?: Array<{ amount?: number }>
    }

    interface ShippingOptionPriceQueryRow {
      id: string
      prices?: Array<{ amount?: number }>
    }

    const getReturnShippingAmounts = async (returnId: string) => {
      const container = getContainer()
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const { data } = (await query.graph({
        entity: "return",
        fields: ["id", "shipping_methods.amount"],
        filters: { id: returnId },
      })) as { data: ReturnShippingQueryRow[] }
      return (data?.[0]?.shipping_methods ?? [])
        .map((method) => method?.amount)
        .filter((amount): amount is number => typeof amount === "number")
    }

    const getShippingOptionPriceAmount = async (optionId: string) => {
      const container = getContainer()
      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const { data } = (await query.graph({
        entity: "shipping_option",
        fields: ["id", "prices.amount"],
        filters: { id: optionId },
      })) as { data: ShippingOptionPriceQueryRow[] }
      const amounts = (data?.[0]?.prices ?? [])
        .map((price) => price?.amount)
        .filter((amount): amount is number => typeof amount === "number")
      return amounts[0]
    }

    /**
     * Native return-item validation (order module, ChangeActionType.RETURN_ITEM)
     * refuses a return quantity exceeding the item's fulfilled_quantity, so
     * every test that reaches the native workflow must fulfill the order first.
     */
    const fulfillOrder = async (
      orderId: string,
      items: { id: string; quantity: number }[]
    ) => {
      const res = await api.post(
        `/admin/orders/${orderId}/fulfillments`,
        { items },
        { headers: adminHeaders, validateStatus: () => true }
      )
      expect(res.status).toBe(200)
      return res.data
    }

    // The integration runner shares a single database across the whole suite,
    // so seeds + shared fixtures run exactly once at suite scope.
    let key: { token: string }
    let variantId: string
    let adminHeaders: Record<string, string>
    let shippingOptionId: string
    let returnReasonId: string

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
        throw new Error("No variant seeded for the returns suite")
      }
      variantId = variant.id

      const option = await getShippingOption()
      shippingOptionId = option.id

      // REQ-RET-005: return reasons are Admin-managed records (native
      // validateReturnReasons validates provided reason_ids against them).
      const reasonRes = await api.post(
        "/admin/return-reasons",
        { value: "defective", label: "Defective item" },
        { headers: adminHeaders, validateStatus: () => true }
      )
      expect(reasonRes.status).toBe(200)
      const reason = reasonRes.data.return_reason
      if (!reason?.id) {
        throw new Error(
          `Admin return-reason creation failed: ${JSON.stringify(
            reasonRes.data
          )}`
        )
      }
      returnReasonId = reason.id
    })

    describe("T-RET-01 — store return authentication + ownership (REQ-RET-002/025)", () => {
      it("rejects unauthenticated return creation (401, REQ-RET-002)", async () => {
        const { order } = await completeCheckout(variantId, 1)
        const orderItemId = order.items[0].id

        const res = await api.post(
          "/store/returns",
          {
            order_id: order.id,
            items: [{ id: orderItemId, quantity: 1 }],
            return_shipping: { option_id: shippingOptionId },
          },
          { headers: authHeaders(key), validateStatus: () => true }
        )
        expect(res.status).toBe(401)
        expect(res.data.message).toMatch(/authenticated/i)
      })

      it("rejects another customer creating a return on a customer-owned order (403, no existence leak)", async () => {
        const tokenA = await registerCustomer("return-owner-a@test.local", key)
        const tokenB = await registerCustomer("return-intruder-b@test.local", key)
        const { order } = await completeCheckout(variantId, 1, tokenA)
        expect(order.customer_id).toBeTruthy()
        const orderItemId = order.items[0].id

        const res = await api.post(
          "/store/returns",
          {
            order_id: order.id,
            items: [{ id: orderItemId, quantity: 1 }],
            return_shipping: { option_id: shippingOptionId },
          },
          { headers: authHeaders(key, tokenB), validateStatus: () => true }
        )
        expect(res.status).toBe(403)
        expect(res.data.message).toMatch(/do not have access/i)
      })

      it("rejects receive_now on a non-owned order (REQ-RET-036: receive_now never bypasses the gate)", async () => {
        const tokenA = await registerCustomer("return-owner-c@test.local", key)
        const tokenB = await registerCustomer("return-intruder-d@test.local", key)
        const { order } = await completeCheckout(variantId, 1, tokenA)
        const orderItemId = order.items[0].id

        const res = await api.post(
          "/store/returns",
          {
            order_id: order.id,
            items: [{ id: orderItemId, quantity: 1 }],
            return_shipping: { option_id: shippingOptionId },
            receive_now: true,
          },
          { headers: authHeaders(key, tokenB), validateStatus: () => true }
        )
        expect(res.status).toBe(403)
        expect(res.data.message).toMatch(/do not have access/i)
      })

      it("allows the owning customer to create a return with an Admin-managed reason (REQ-RET-005)", async () => {
        const tokenA = await registerCustomer("return-owner-e@test.local", key)
        const { order } = await completeCheckout(variantId, 1, tokenA)
        const orderItemId = order.items[0].id
        await fulfillOrder(order.id, [{ id: orderItemId, quantity: 1 }])

        const res = await api.post(
          "/store/returns",
          {
            order_id: order.id,
            items: [
              { id: orderItemId, quantity: 1, reason_id: returnReasonId },
            ],
            return_shipping: { option_id: shippingOptionId },
          },
          { headers: authHeaders(key, tokenA), validateStatus: () => true }
        )
        expect(res.status).toBe(200)
        expect(res.data.return.id).toBeTruthy()
        expect(res.data.return.order_id).toBe(order.id)
        expect(res.data.return.status).toBe("requested")
      })

      it("preserves native 404 for unknown order IDs (no ownership leak)", async () => {
        const tokenA = await registerCustomer("return-owner-f@test.local", key)

        const res = await api.post(
          "/store/returns",
          {
            order_id: "order_does_not_exist",
            items: [{ id: "li_does_not_exist", quantity: 1 }],
            return_shipping: { option_id: shippingOptionId },
          },
          { headers: authHeaders(key, tokenA), validateStatus: () => true }
        )
        // Native workflow: useRemoteQueryStep(orders, throw_if_key_not_found)
        // → MedusaError NOT_FOUND → 404. The middleware defers unknown IDs so
        // the native error path is preserved verbatim.
        expect(res.status).toBe(404)
      })
    })

    describe("T-RET-02 — server-side return shipping cost (REQ-RET-003)", () => {
      it("ignores a customer-supplied return_shipping.price (server resolves the option's price)", async () => {
        const tokenA = await registerCustomer("return-owner-g@test.local", key)
        const { order } = await completeCheckout(variantId, 1, tokenA)
        const orderItemId = order.items[0].id
        await fulfillOrder(order.id, [{ id: orderItemId, quantity: 1 }])

        const res = await api.post(
          "/store/returns",
          {
            order_id: order.id,
            items: [{ id: orderItemId, quantity: 1 }],
            return_shipping: { option_id: shippingOptionId, price: 1 },
          },
          { headers: authHeaders(key, tokenA), validateStatus: () => true }
        )
        expect(res.status).toBe(200)
        const returnId = res.data.return.id
        expect(returnId).toBeTruthy()

        // The tampered price (1) must never be honored: the return's shipping
        // method amount must equal the option's server-side price.
        const amounts = await getReturnShippingAmounts(returnId)
        expect(amounts.length).toBeGreaterThan(0)
        const optionPrice = await getShippingOptionPriceAmount(shippingOptionId)
        expect(optionPrice).toBeDefined()
        expect(amounts[0]).toBe(optionPrice)
        expect(amounts[0]).not.toBe(1)
      })
    })
  },
})

jest.setTimeout(120 * 1000)
