import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"

import initialDataSeed from "../../src/migration-scripts/initial-data-seed"
import seedMarkets from "../../src/migration-scripts/seed-markets"
import seedInventory from "../../src/migration-scripts/seed-inventory"
import {
  PAYMENT_CONFIG_MODULE,
  type PaymentConfigModuleService,
} from "../../src/modules/payment-config/service"

const ADMIN_EMAIL = "payment-config-admin@baby-store.test"
const ADMIN_PASSWORD = "SuperSecretTest123!"

const SAFEPAY_SECRETS = {
  merchantApiKey: "sec_test_merchant_key_123",
  secretKey: "sk_test_safepay_secret_456",
  webhookSecret: "whsec_test_safepay_789",
}

const STRIPE_SECRETS = {
  secretKey: "sk_test_stripe_secret_111",
  webhookSecret: "whsec_test_stripe_222",
}

/**
 * Integration coverage for the Admin-managed payment-provider configuration
 * (approved architecture 2026-08-17):
 * - Admin-only access (framework /admin auth middleware)
 * - secret values never returned (masked views only)
 * - blank secret on save retains the stored value; non-blank rotates
 * - enabling requires a fully configured provider
 * - storefront API cannot access provider configuration
 * - connection-test endpoint returns sanitized results (no network in CI:
 *   the runner registers the real providers via .env; the unregistered path
 *   is exercised by deleting the provider row and the registered path by
 *   removing the Admin config so the provider fails safely before any
 *   external call)
 * - audit trail records sanitized metadata only
 */
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer, dbConnection, utils }) => {
    const runSeeds = async () => {
      const container = getContainer()

      // initialDataSeed expects a default shipping profile (same setup as the
      // payments suite).
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

    const createAdmin = async () => {
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
        throw new Error("Failed to create the admin user for the payment-config suite")
      }

      const [providerIdentity] = await authModule.listProviderIdentities({
        entity_id: ADMIN_EMAIL,
        provider: "emailpass",
      })
      if (!providerIdentity?.auth_identity_id) {
        throw new Error("Failed to resolve the admin auth identity")
      }
      await authModule.updateAuthIdentities({
        id: providerIdentity.auth_identity_id,
        app_metadata: { user_id: user.id },
      })
    }

    // Login only — the admin user is created in beforeAll (and thus present in
    // every per-test database restore).
    const getAdminToken = async () => {
      const login = await api.post("/auth/user/emailpass", {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      })
      return login.data.token as string
    }

    const configService = () =>
      getContainer().resolve(PAYMENT_CONFIG_MODULE) as PaymentConfigModuleService

    const adminHeaders = (token: string) => ({
      authorization: `Bearer ${token}`,
    })

    const fullSafepayPayload = (overrides: Record<string, unknown> = {}) => ({
      enabled: true,
      environment: "sandbox",
      config: {
        redirectUrl: "https://storefront.test/checkout/payment/safepay",
        cancelUrl: "https://storefront.test/checkout",
        intent: "CYBERSOURCE",
      },
      secrets: { ...SAFEPAY_SECRETS },
      ...overrides,
    })

    const fullStripePayload = (overrides: Record<string, unknown> = {}) => ({
      enabled: false,
      environment: "test",
      config: { publishableKey: "pk_test_pub", capture: false },
      secrets: { ...STRIPE_SECRETS },
      ...overrides,
    })

    beforeAll(async () => {
      await runSeeds()
      await createAdmin()

      // Seed both provider configurations in beforeAll so they are part of the
      // per-test database restore template (the runner snapshots after the
      // suite's beforeAll hooks).
      const token = await getAdminToken()
      const safepaySave = await api.post(
        "/admin/payment-provider-config/safepay",
        fullSafepayPayload(),
        { headers: adminHeaders(token), validateStatus: () => true }
      )
      expect(safepaySave.status).toBe(200)
      // Stripe is seeded INCOMPLETE (no credentials) so the suite can exercise
      // the "enabling requires a fully configured provider" rejection.
      const stripeSave = await api.post(
        "/admin/payment-provider-config/stripe",
        fullStripePayload({ secrets: {} }),
        { headers: adminHeaders(token), validateStatus: () => true }
      )
      expect(stripeSave.status).toBe(200)
    })

    it("requires admin authentication (401 without a token)", async () => {
      const res = await api.get("/admin/payment-provider-config", {
        validateStatus: () => true,
      })
      expect(res.status).toBe(401)
    })

    it("lists both providers with masked views and no secret values", async () => {
      const token = await getAdminToken()
      const res = await api.get("/admin/payment-provider-config", {
        headers: adminHeaders(token),
        validateStatus: () => true,
      })
      expect(res.status).toBe(200)
      const providers = res.data.payment_providers as Array<{
        provider: string
        secrets_configured: string[]
        registered: boolean
      }>
      expect(providers.map((p) => p.provider).sort()).toEqual([
        "safepay",
        "stripe",
      ])
      const safepayView = providers.find((p) => p.provider === "safepay")
      expect(safepayView?.secrets_configured.sort()).toEqual(
        ["merchantApiKey", "secretKey", "webhookSecret"].sort()
      )
      // Registered flag mirrors boot-time PAYMENT_PROVIDER selection. The
      // runner loads the project's medusa-config, whose loadEnv() reads .env
      // — and the dev .env registers both providers
      // (PAYMENT_PROVIDER=safepay,stripe). The flag is DB-backed
      // (payment module listPaymentProviders).
      for (const provider of providers) {
        expect(provider.registered).toBe(true)
      }
      // No secret-shaped tokens anywhere in the response.
      expect(JSON.stringify(res.data)).not.toMatch(
        /(sk|rk|whsec|sec)_[A-Za-z0-9_\-.]{6,}/
      )
    })

    it("saves a provider configuration and never returns secret values", async () => {
      const token = await getAdminToken()
      const res = await api.post(
        "/admin/payment-provider-config/safepay",
        fullSafepayPayload(),
        { headers: adminHeaders(token), validateStatus: () => true }
      )
      expect(res.status).toBe(200)
      const view = res.data.payment_provider as {
        provider: string
        secrets_configured: string[]
        configured: boolean
        enabled: boolean
      }
      expect(view.provider).toBe("safepay")
      expect(view.enabled).toBe(true)
      expect(view.configured).toBe(true)
      expect(view.secrets_configured.sort()).toEqual(
        ["merchantApiKey", "secretKey", "webhookSecret"].sort()
      )
      const body = JSON.stringify(res.data)
      for (const secret of Object.values(SAFEPAY_SECRETS)) {
        expect(body).not.toContain(secret)
      }
    })

    it("keeps the secret masked when reading back via GET", async () => {
      const token = await getAdminToken()
      const res = await api.get("/admin/payment-provider-config/safepay", {
        headers: adminHeaders(token),
        validateStatus: () => true,
      })
      expect(res.status).toBe(200)
      const body = JSON.stringify(res.data)
      for (const secret of Object.values(SAFEPAY_SECRETS)) {
        expect(body).not.toContain(secret)
      }
      expect(res.data.payment_provider.secrets_configured).toContain(
        "secretKey"
      )
    })

    it("retains the stored secret when saved with a blank secret field", async () => {
      const token = await getAdminToken()
      // Rotate only the merchantApiKey; leave secretKey + webhookSecret blank.
      const res = await api.post(
        "/admin/payment-provider-config/safepay",
        fullSafepayPayload({
          enabled: false,
          secrets: { merchantApiKey: "sec_test_rotated_key_999" },
        }),
        { headers: adminHeaders(token), validateStatus: () => true }
      )
      expect(res.status).toBe(200)

      const runtime = await configService().getRuntimeConfig("safepay")
      expect(runtime.secrets.merchantApiKey).toBe("sec_test_rotated_key_999")
      // Blank fields retained the original values.
      expect(runtime.secrets.secretKey).toBe(SAFEPAY_SECRETS.secretKey)
      expect(runtime.secrets.webhookSecret).toBe(SAFEPAY_SECRETS.webhookSecret)
      expect(runtime.enabled).toBe(false)
    })

    it("rejects enabling a provider that is not fully configured", async () => {
      const token = await getAdminToken()
      const res = await api.post(
        "/admin/payment-provider-config/stripe",
        { enabled: true, environment: "test", config: {}, secrets: {} },
        { headers: adminHeaders(token), validateStatus: () => true }
      )
      expect(res.status).toBe(400)
      expect(JSON.stringify(res.data)).toMatch(/required/)
    })

    it("rejects unknown providers and unknown fields", async () => {
      const token = await getAdminToken()
      const unknown = await api.post(
        "/admin/payment-provider-config/assanpay",
        { enabled: true },
        { headers: adminHeaders(token), validateStatus: () => true }
      )
      expect(unknown.status).toBe(400)

      const badField = await api.post(
        "/admin/payment-provider-config/stripe",
        fullStripePayload({ config: { notAField: "x" } }),
        { headers: adminHeaders(token), validateStatus: () => true }
      )
      expect(badField.status).toBe(400)
    })

    it("rejects an invalid environment for the provider", async () => {
      const token = await getAdminToken()
      const res = await api.post(
        "/admin/payment-provider-config/stripe",
        fullStripePayload({ environment: "production" }),
        { headers: adminHeaders(token), validateStatus: () => true }
      )
      expect(res.status).toBe(400)
    })

    it("records sanitized audit entries (no secret values)", async () => {
      const token = await getAdminToken()
      // Trigger an update so both "created" (baseline) and "updated" exist.
      const update = await api.post(
        "/admin/payment-provider-config/safepay",
        { enabled: false, environment: "sandbox", config: {}, secrets: {} },
        { headers: adminHeaders(token), validateStatus: () => true }
      )
      expect(update.status).toBe(200)

      const audits = await configService().listAudits("safepay")
      expect(audits.length).toBeGreaterThan(0)
      const body = JSON.stringify(audits)
      for (const secret of [
        ...Object.values(SAFEPAY_SECRETS),
        "sec_test_rotated_key_999",
      ]) {
        expect(body).not.toContain(secret)
      }
      const actions = (audits as Array<{ action: string }>).map(
        (audit) => audit.action
      )
      expect(actions).toContain("created")
      expect(actions).toContain("updated")
    })

    it("test-connection returns a sanitized failure for an unregistered provider", async () => {
      // The route's registration gate is DB-backed (payment module
      // listPaymentProviders). Delete the provider row so the gate
      // short-circuits — this path involves no network at all.
      await dbConnection.raw(
        "DELETE FROM payment_provider WHERE id = 'pp_safepay_safepay'"
      )
      const token = await getAdminToken()
      const res = await api.post(
        "/admin/payment-provider-config/safepay/test-connection",
        {},
        { headers: adminHeaders(token), validateStatus: () => true }
      )
      expect(res.status).toBe(200)
      expect(res.data.status).toBe("failed")
      expect(String(res.data.error)).toMatch(/not registered/)
      const body = JSON.stringify(res.data)
      for (const secret of Object.values(SAFEPAY_SECRETS)) {
        expect(body).not.toContain(secret)
      }
    })

    it("test-connection takes the registered path and fails safely when the provider is unconfigured", async () => {
      // The provider IS registered (via .env), so the route must proceed past
      // the registration gate and resolve the runtime configuration — which
      // is missing here. resolveConfig_ therefore fails with "not configured"
      // BEFORE any external call, proving the registered path end-to-end
      // without network access.
      await configService().deletePaymentProviderConfigs({ provider: "safepay" })

      const token = await getAdminToken()
      const res = await api.post(
        "/admin/payment-provider-config/safepay/test-connection",
        {},
        { headers: adminHeaders(token), validateStatus: () => true }
      )
      expect(res.status).toBe(200)
      expect(res.data.status).toBe("failed")
      expect(String(res.data.error)).toMatch(/not configured/)
      expect(String(res.data.error)).not.toMatch(/not registered/)

      const audits = await configService().listAudits("safepay") as unknown as Array<{
        action: string
        changed_fields: { fields: string[] }
      }>
      const testAudit = audits.find((audit) => audit.action === "test_connection")
      expect(testAudit?.changed_fields.fields).toContain("last_test_status")
      // Audits are sanitized — no secret-shaped values anywhere.
      expect(JSON.stringify(audits)).not.toContain(
        "sk_test_safepay_secret_456"
      )
    })

    it("storefront APIs cannot access provider configuration", async () => {
      const container = getContainer()
      const apiKeyModule = container.resolve(Modules.API_KEY)
      const [publishableKey] = await apiKeyModule.listApiKeys({
        type: "publishable",
      })
      const res = await api.get("/store/payment-provider-config", {
        headers: { "x-publishable-api-key": publishableKey?.token ?? "" },
        validateStatus: () => true,
      })
      expect(res.status).toBe(404)
    })

    it("admin config for stripe is saved and masked too", async () => {
      const token = await getAdminToken()
      const res = await api.post(
        "/admin/payment-provider-config/stripe",
        fullStripePayload(),
        { headers: adminHeaders(token), validateStatus: () => true }
      )
      expect(res.status).toBe(200)
      const body = JSON.stringify(res.data)
      for (const secret of Object.values(STRIPE_SECRETS)) {
        expect(body).not.toContain(secret)
      }
      const runtime = await configService().getRuntimeConfig("stripe")
      expect(runtime.secrets.secretKey).toBe(STRIPE_SECRETS.secretKey)
      expect(runtime.enabled).toBe(false)
    })
  },
})
