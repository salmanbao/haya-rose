import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import initialDataSeed from "../../src/migration-scripts/initial-data-seed"
import seedMarkets from "../../src/migration-scripts/seed-markets"
import seedInventory from "../../src/migration-scripts/seed-inventory"

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
      if (!pakistan) {
        throw new Error("Markets seed did not create the Pakistan region")
      }
      return { pakistan }
    }

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
          `Failed to resolve the auth identity for ${email} in the cart-ownership suite`
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

    const createCart = async (
      key: { token: string; id: string },
      channelId: string,
      regionId: string,
      token?: string
    ) => {
      const res = await api.post(
        "/store/carts",
        {
          region_id: regionId,
          sales_channel_id: channelId,
          currency_code: "pkr",
        },
        { headers: authHeaders(key, token) }
      )
      return res.data.cart
    }

    describe("T-CC-01 — customer-cart ownership enforcement", () => {
      let key: { token: string; id: string }
      let channelId: string
      let regionId: string

      beforeAll(async () => {
        await runSeeds()
        const storefront = await getStorefrontKey()
        key = storefront.storefrontKey
        channelId = storefront.channelId
        const { pakistan } = await getMarkets()
        regionId = pakistan.id
      })

      it("allows unauthenticated access to a guest cart (cart ID is the credential)", async () => {
        const cart = await createCart(key, channelId, regionId)
        // The store DTO serializes the unset value as null.
        expect(cart.customer_id).toBeFalsy()

        const res = await api.get(`/store/carts/${cart.id}`, {
          headers: authHeaders(key),
        })
        expect(res.status).toBe(200)
        expect(res.data.cart.id).toBe(cart.id)
      })

      it("keeps a guest cart accessible to an authenticated customer", async () => {
        const cart = await createCart(key, channelId, regionId)
        const tokenA = await registerCustomer("guest-access-a@test.local", key)

        const res = await api.get(`/store/carts/${cart.id}`, {
          headers: authHeaders(key, tokenA),
        })
        expect(res.status).toBe(200)
      })

      it("keeps a guest cart created with an email mutable without authentication (BD-G-01)", async () => {
        // Native findOrCreateCustomerStep sets customer_id when the cart is
        // created with an email. The approved guest checkout flow must still
        // work unauthenticated (the cart ID is the bearer credential).
        const res = await api.post(
          "/store/carts",
          {
            region_id: regionId,
            sales_channel_id: channelId,
            currency_code: "pkr",
            email: "guest@test.local",
          },
          { headers: authHeaders(key) }
        )
        const cart = res.data.cart
        expect(cart.customer_id).toBeTruthy()

        const mutate = await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: "variant_does_not_matter", quantity: 1 },
          { headers: authHeaders(key), validateStatus: () => true }
        )
        // Passes the ownership gate; the native route then rejects the
        // invalid variant (proving the guest was not blocked by T-CC-01).
        expect(mutate.status).not.toBe(401)
        expect(mutate.status).not.toBe(403)
      })

      it("allows the owning customer to access their cart", async () => {
        const tokenA = await registerCustomer("owner-a@test.local", key)
        const cart = await createCart(key, channelId, regionId, tokenA)
        expect(cart.customer_id).toBeTruthy()

        const res = await api.get(`/store/carts/${cart.id}`, {
          headers: authHeaders(key, tokenA),
        })
        expect(res.status).toBe(200)
        expect(res.data.cart.id).toBe(cart.id)
      })

      it("rejects another customer accessing a customer-owned cart (403, no existence leak)", async () => {
        const tokenA = await registerCustomer("owner-b@test.local", key)
        const tokenB = await registerCustomer("intruder-c@test.local", key)
        const cart = await createCart(key, channelId, regionId, tokenA)

        const res = await api.get(`/store/carts/${cart.id}`, {
          headers: authHeaders(key, tokenB),
          validateStatus: () => true,
        })
        expect(res.status).toBe(403)
        expect(res.data.message).toMatch(/do not have access/i)
      })

      it("allows unauthenticated ID-based access to a customer-owned cart (guest bearer model)", async () => {
        // Native findOrCreateCustomerStep sets customer_id on any cart created
        // with an email (approved guest checkout). Unauthenticated sessions
        // rely on the unguessable cart ID as the credential — REQ-CC-003
        // enforcement applies to authenticated customers.
        const tokenA = await registerCustomer("owner-d@test.local", key)
        const cart = await createCart(key, channelId, regionId, tokenA)
        expect(cart.customer_id).toBeTruthy()

        const res = await api.get(`/store/carts/${cart.id}`, {
          headers: authHeaders(key),
          validateStatus: () => true,
        })
        expect(res.status).toBe(200)
        expect(res.data.cart.id).toBe(cart.id)
      })

      it("guards cart subroutes (line-items) with the same ownership rule", async () => {
        const tokenA = await registerCustomer("owner-e@test.local", key)
        const tokenB = await registerCustomer("intruder-f@test.local", key)
        const cart = await createCart(key, channelId, regionId, tokenA)

        const blocked = await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: "variant_does_not_matter", quantity: 1 },
          { headers: authHeaders(key, tokenB), validateStatus: () => true }
        )
        expect(blocked.status).toBe(403)

        const allowed = await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: "variant_does_not_matter", quantity: 1 },
          { headers: authHeaders(key, tokenA), validateStatus: () => true }
        )
        // The owner passes the ownership gate; the native route then rejects
        // the invalid variant — proving the middleware did not block the owner.
        expect(allowed.status).not.toBe(401)
        expect(allowed.status).not.toBe(403)
      })

      it("preserves native 404 for unknown cart IDs", async () => {
        const res = await api.get("/store/carts/cart_does_not_exist", {
          headers: authHeaders(key),
          validateStatus: () => true,
        })
        expect(res.status).toBe(404)
      })
    })
  },
})

jest.setTimeout(120 * 1000)
