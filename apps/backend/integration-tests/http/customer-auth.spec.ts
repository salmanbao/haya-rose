import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

/**
 * Customer authentication (Phase: customer authentication, 2026-08-17).
 *
 * Approved decisions (BD-AUTH-01..04):
 *  - Email verification REQUIRED for emailpass customers
 *    (`projectConfig.http.authVerificationsPerActor`).
 *  - Session lifetime = native default `jwtExpiresIn: "1d"`.
 *  - Google OAuth wired env-gated (`AUTH_GOOGLE_ENABLED=true` + GOOGLE_*
 *    credentials) — not enabled in tests, so the providers list must contain
 *    only emailpass here.
 *  - Password reset uses the native `reset-password` + `update` routes; the
 *    reset token is delivered via the `auth.password_reset` event payload.
 *
 * All route/response contracts below were verified against the installed
 * Medusa 2.19.0 source (auth routes, verification workflow, reset-password
 * workflow, generate-jwt-token utils).
 */

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
  testSuite: ({ api, getContainer }) => {
    const PASSWORD = "Sup3rSecret!Test"

    const getPublishableKey = async (): Promise<{
      id: string
      token: string
    }> => {
      const container = getContainer()
      const apiKeyModule = container.resolve(Modules.API_KEY)
      const keys = await apiKeyModule.listApiKeys({ type: "publishable" })
      if (!keys.length) {
        throw new Error("No publishable key available in the test database")
      }
      return { id: keys[0].id, token: keys[0].token }
    }

    const getCartTargets = async (keyId: string) => {
      const container = getContainer()
      const regionModule = container.resolve(Modules.REGION)
      const region = await regionModule.createRegions({
        name: "Auth Test Region",
        currency_code: "pkr",
        countries: ["PK"],
      })
      const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
      const channel = await salesChannelModule.createSalesChannels({
        name: "Auth Test Channel",
        description: "auth test",
      })

      // Cart creation validates that the sales channel is associated with the
      // publishable key in the header (verified native behavior) — link them.
      // (LinkModuleService.create(primaryKey, foreignKey) — 2.19 signature.)
      const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
      const keyChannelLinkService = remoteLink.getLinkModule(
        Modules.API_KEY,
        "publishable_key_id",
        Modules.SALES_CHANNEL,
        "sales_channel_id"
      )!
      await keyChannelLinkService.create(keyId, channel.id)

      return { region, channel }
    }

    /**
     * Full native customer registration + verification + login flow (the exact
     * flow the storefront performs once email verification is required):
     * register (actorless token) → create customer → request verification →
     * confirm → login (full token).
     *
     * The plaintext verification code is NOT in the HTTP response — the
     * request-verification workflow strips it (verified in the installed
     * request-verification.js) and delivers it through the
     * `auth.verification_requested` event payload (how production sends it by
     * email). The helper captures it from the event bus.
     */
    const registerVerifiedCustomer = async (
      email: string,
      keyToken: string
    ) => {
      const container = getContainer()
      const eventBus = container.resolve(Modules.EVENT_BUS)
      const captured: any[] = []
      const listener = async (message: any) => {
        captured.push(message)
      }
      eventBus.subscribe("auth.verification_requested", listener)

      try {
        const registerRes = await api.post(
          "/auth/customer/emailpass/register",
          { email, password: PASSWORD },
          { validateStatus: () => true }
        )
        expect(registerRes.status).toBe(200)
        const actorlessToken = registerRes.data.token as string

        const customerRes = await api.post(
          "/store/customers",
          { email, first_name: "Auth", last_name: "Test" },
          {
            headers: {
              "x-publishable-api-key": keyToken,
              authorization: `Bearer ${actorlessToken}`,
            },
            validateStatus: () => true,
          }
        )
        expect(customerRes.status).toBe(200)

        const requestRes = await api.post(
          "/auth/verification/request",
          { entity_id: email, entity_type: "email" },
          {
            headers: { authorization: `Bearer ${actorlessToken}` },
            validateStatus: () => true,
          }
        )
        expect(requestRes.status).toBe(201)

        const event = await waitForEvent(captured)
        const code = event.data?.code as string
        expect(code).toBeTruthy()

        const confirmRes = await api.post(
          "/auth/verification/confirm",
          { code },
          {
            headers: { authorization: `Bearer ${actorlessToken}` },
            validateStatus: () => true,
          }
        )
        expect(confirmRes.status).toBe(200)

        const loginRes = await api.post(
          "/auth/customer/emailpass",
          { email, password: PASSWORD },
          { validateStatus: () => true }
        )
        expect(loginRes.status).toBe(200)
        expect(loginRes.data.verification_required).toBeUndefined()
        return loginRes.data.token as string
      } finally {
        eventBus.unsubscribe("auth.verification_requested", listener)
      }
    }

    describe("customer authentication (BD-AUTH-01..04)", () => {
      it("lists emailpass as the only customer auth provider (google not enabled without credentials)", async () => {
        const res = await api.get("/auth/customer/providers")
        expect(res.status).toBe(200)
        const ids = res.data.providers.map(
          (provider: { id: string }) => provider.id
        )
        expect(ids).toContain("emailpass")
        expect(ids).not.toContain("google")
      })

      it("gates login with verification_required until the email is verified", async () => {
        const key = await getPublishableKey()
        const email = "unverified@baby-store.test"

        const registerRes = await api.post(
          "/auth/customer/emailpass/register",
          { email, password: PASSWORD },
          { validateStatus: () => true }
        )
        expect(registerRes.status).toBe(200)

        const customerRes = await api.post(
          "/store/customers",
          { email, first_name: "Auth", last_name: "Test" },
          {
            headers: {
              "x-publishable-api-key": key.token,
              authorization: `Bearer ${registerRes.data.token}`,
            },
            validateStatus: () => true,
          }
        )
        expect(customerRes.status).toBe(200)

        const loginRes = await api.post(
          "/auth/customer/emailpass",
          { email, password: PASSWORD },
          { validateStatus: () => true }
        )
        expect(loginRes.status).toBe(200)
        expect(loginRes.data.verification_required).toBe(true)
        expect(loginRes.data.token).toBeTruthy()

        const meRes = await api.get("/store/customers/me", {
          headers: {
            "x-publishable-api-key": key.token,
            authorization: `Bearer ${loginRes.data.token}`,
          },
          validateStatus: () => true,
        })
        expect(meRes.status).toBe(401)
      })

      it("verifies the email and issues a full token on login (customers/me reachable)", async () => {
        const key = await getPublishableKey()
        const email = "verified@baby-store.test"
        const token = await registerVerifiedCustomer(email, key.token)

        const meRes = await api.get("/store/customers/me", {
          headers: {
            "x-publishable-api-key": key.token,
            authorization: `Bearer ${token}`,
          },
          validateStatus: () => true,
        })
        expect(meRes.status).toBe(200)
        expect(meRes.data.customer.email).toBe(email)
      })

      it("rejects a wrong password with 401", async () => {
        const key = await getPublishableKey()
        await registerVerifiedCustomer("wrongpass@baby-store.test", key.token)

        const res = await api.post(
          "/auth/customer/emailpass",
          { email: "wrongpass@baby-store.test", password: "NotThePassword!" },
          { validateStatus: () => true }
        )
        expect(res.status).toBe(401)
      })

      it("rejects confirmation with a wrong code", async () => {
        const key = await getPublishableKey()
        const email = "wrongcode@baby-store.test"

        const registerRes = await api.post(
          "/auth/customer/emailpass/register",
          { email, password: PASSWORD },
          { validateStatus: () => true }
        )
        expect(registerRes.status).toBe(200)

        const confirmRes = await api.post(
          "/auth/verification/confirm",
          { code: "000000" },
          {
            headers: {
              authorization: `Bearer ${registerRes.data.token}`,
            },
            validateStatus: () => true,
          }
        )
        expect(confirmRes.status).toBeGreaterThanOrEqual(400)
        expect(confirmRes.status).toBeLessThan(500)
      })

      it("rejects duplicate registration", async () => {
        const key = await getPublishableKey()
        const email = "duplicate@baby-store.test"
        await registerVerifiedCustomer(email, key.token)

        const res = await api.post(
          "/auth/customer/emailpass/register",
          { email, password: PASSWORD },
          { validateStatus: () => true }
        )
        expect(res.status).toBeGreaterThanOrEqual(400)
        expect(res.status).toBeLessThan(500)
      })

      it("associates the authenticated customer with their cart", async () => {
        const key = await getPublishableKey()
        const email = "cartlink@baby-store.test"
        const token = await registerVerifiedCustomer(email, key.token)
        const { region, channel } = await getCartTargets(key.id)

        const cartRes = await api.post(
          "/store/carts",
          {
            region_id: region.id,
            sales_channel_id: channel.id,
            currency_code: "pkr",
          },
          {
            headers: { "x-publishable-api-key": key.token },
            validateStatus: () => true,
          }
        )
        expect(cartRes.status).toBe(200)
        const cartId = cartRes.data.cart.id as string

        const meRes = await api.get("/store/customers/me", {
          headers: {
            "x-publishable-api-key": key.token,
            authorization: `Bearer ${token}`,
          },
        })
        const customerId = meRes.data.customer.id as string

        const linkRes = await api.post(
          `/store/carts/${cartId}/customer`,
          {},
          {
            headers: {
              "x-publishable-api-key": key.token,
              authorization: `Bearer ${token}`,
            },
            validateStatus: () => true,
          }
        )
        expect(linkRes.status).toBe(200)
        expect(linkRes.data.cart.customer_id).toBe(customerId)
      })

      it("resets the password with the token delivered via the auth.password_reset event", async () => {
        const key = await getPublishableKey()
        const email = "reset@baby-store.test"
        await registerVerifiedCustomer(email, key.token)

        const container = getContainer()
        const eventBus = container.resolve(Modules.EVENT_BUS)
        const captured: any[] = []
        const listener = async (message: any) => {
          captured.push(message)
        }
        eventBus.subscribe("auth.password_reset", listener)

        try {
          const resetRes = await api.post(
            "/auth/customer/emailpass/reset-password",
            { identifier: email },
            { validateStatus: () => true }
          )
          expect(resetRes.status).toBe(201)

          const event = await waitForEvent(captured)
          expect(event.data).toMatchObject({
            entity_id: email,
            actor_type: "customer",
          })
          const resetToken = event.data.token as string
          expect(resetToken).toBeTruthy()

          const newPassword = "NewSup3rSecret!Test"
          const updateRes = await api.post(
            "/auth/customer/emailpass/update",
            { password: newPassword },
            {
              headers: { authorization: `Bearer ${resetToken}` },
              validateStatus: () => true,
            }
          )
          expect(updateRes.status).toBe(200)

          const newLogin = await api.post(
            "/auth/customer/emailpass",
            { email, password: newPassword },
            { validateStatus: () => true }
          )
          expect(newLogin.status).toBe(200)

          const oldLogin = await api.post(
            "/auth/customer/emailpass",
            { email, password: PASSWORD },
            { validateStatus: () => true }
          )
          expect(oldLogin.status).toBe(401)
        } finally {
          eventBus.unsubscribe("auth.password_reset", listener)
        }
      })

      it("does not leak identity existence on reset-password for an unknown email", async () => {
        const res = await api.post(
          "/auth/customer/emailpass/reset-password",
          { identifier: "nobody@baby-store.test" },
          { validateStatus: () => true }
        )
        expect(res.status).toBe(201)
      })
    })
  },
})