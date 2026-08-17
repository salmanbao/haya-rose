import { createHmac } from "crypto"

import { MedusaError } from "@medusajs/framework/utils"

import { SafepayProviderService } from "../service"
import {
  PAYMENT_CONFIG_MODULE,
  type DecryptedProviderConfig,
} from "../../payment-config/service"

const ADMIN_CONFIG: DecryptedProviderConfig = {
  provider: "safepay",
  enabled: true,
  environment: "sandbox",
  config: {
    redirectUrl: "https://storefront.test/admin-managed/return",
    cancelUrl: "https://storefront.test/admin-managed/cancel",
    intent: "CYBERSOURCE",
  },
  secrets: {
    merchantApiKey: "sec_admin_merchant",
    secretKey: "sk_admin_secret",
    webhookSecret: "whsec_admin_webhook",
  },
}

const makeContainer = (configService?: {
  getRuntimeConfig(provider: string): Promise<DecryptedProviderConfig>
}) =>
  ({
    // The provider reads the module through property access on its container
    // (the payment module's awilix cradle), not through a resolve() call.
    [PAYMENT_CONFIG_MODULE]: configService,
  }) as unknown as Record<string, unknown>

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response

const trackerResponse = () =>
  jsonResponse({
    data: { tracker: { token: "track_runtime_test" } },
    status: { errors: [], message: "success" },
  })

const passportResponse = () => jsonResponse({ data: "tbt_runtime_token" })

const signedEvent = (event: Record<string, unknown>, secret: string) => {
  const raw = JSON.stringify(event)
  const signature = createHmac("sha512", secret).update(raw).digest("hex")
  return { raw, headers: { "x-sfpy-signature": signature } }
}

const safepayEvent = () => ({
  token: "evt_test",
  version: "2.0.0",
  type: "payment.succeeded",
  data: {
    tracker: "track_runtime_test",
    state: "TRACKER_ENDED",
    amount: 250000,
    currency: "PKR",
    metadata: { session_id: "pay_123" },
  },
})

describe("Safepay provider runtime configuration (Admin-managed)", () => {
  it("fails safely when Safepay has no configuration at all", async () => {
    const service = new SafepayProviderService({} as never, {})
    await expect(service.initiatePayment({} as never)).rejects.toThrow(
      "Safepay is not configured"
    )
    await expect(service.getPaymentStatus({} as never)).rejects.toThrow(
      "Safepay is not configured"
    )
  })

  it("refuses new payments when Safepay is disabled (Admin config)", async () => {
    const service = new SafepayProviderService(
      makeContainer({
        getRuntimeConfig: async () => ({ ...ADMIN_CONFIG, enabled: false }),
      }),
      {}
    )
    await expect(
      service.initiatePayment({
        amount: 2500,
        currency_code: "pkr",
        data: { session_id: "pay_1" },
      } as never)
    ).rejects.toThrow(/Safepay is disabled/)
  })

  it("fails safely on incomplete Admin config (missing credentials)", async () => {
    const service = new SafepayProviderService(
      makeContainer({
        getRuntimeConfig: async () => ({
          ...ADMIN_CONFIG,
          secrets: { webhookSecret: "whsec_only" },
        }),
      }),
      {}
    )
    await expect(service.initiatePayment({} as never)).rejects.toThrow(
      /not fully configured/
    )
  })

  it("initiates a payment using the Admin-managed configuration", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      if (url.includes("/client/passport/v1/token")) {
        return passportResponse()
      }
      return trackerResponse()
    }

    const service = new SafepayProviderService(
      makeContainer({ getRuntimeConfig: async () => ADMIN_CONFIG }),
      {},
      { fetch: fetchImpl as unknown as typeof fetch }
    )

    const result = await service.initiatePayment({
      amount: 2500,
      currency_code: "pkr",
      data: { session_id: "pay_1" },
    } as never)

    expect(result.status).toBe("pending")
    // The tracker body carries the Admin-managed merchant API key.
    const trackerCall = calls.find((call) =>
      call.url.includes("/order/payments/v3/")
    )
    const body = JSON.parse(String(trackerCall?.init?.body))
    expect(body.merchant_api_key).toBe("sec_admin_merchant")
    // The checkout URL uses the Admin-managed redirect/cancel URLs.
    const checkoutUrl = (result.data as Record<string, unknown>)
      .checkout_url as string
    expect(checkoutUrl).toContain(
      encodeURIComponent("https://storefront.test/admin-managed/return")
    )
    expect(checkoutUrl).toContain(
      encodeURIComponent("https://storefront.test/admin-managed/cancel")
    )
  })

  it("uses Admin config over legacy env options (precedence)", async () => {
    const fetchImpl = jest.fn(async (url: string) =>
      url.includes("/client/passport/v1/token")
        ? passportResponse()
        : trackerResponse()
    )
    const service = new SafepayProviderService(
      makeContainer({ getRuntimeConfig: async () => ADMIN_CONFIG }),
      {
        // Legacy env fallback present — must NOT win.
        merchantApiKey: "sec_legacy_env_key",
        secretKey: "sk_legacy_env_secret",
        webhookSecret: "whsec_legacy_webhook",
        environment: "sandbox",
        redirectUrl: "https://legacy.test/return",
        cancelUrl: "https://legacy.test/cancel",
      },
      { fetch: fetchImpl as unknown as typeof fetch }
    )

    await service.initiatePayment({
      amount: 2500,
      currency_code: "pkr",
      data: { session_id: "pay_1" },
    } as never)

    const trackerCall = (fetchImpl.mock.calls as Array<[string, RequestInit?]>).find(
      ([url]) => url.includes("/order/payments/v3/")
    )
    const body = JSON.parse(String(trackerCall?.[1]?.body))
    expect(body.merchant_api_key).toBe("sec_admin_merchant")
  })

  it("falls back to legacy env options when no Admin row exists (transitional)", async () => {
    const fetchImpl = jest.fn(async (url: string) =>
      url.includes("/client/passport/v1/token")
        ? passportResponse()
        : trackerResponse()
    )
    const service = new SafepayProviderService(
      makeContainer({
        getRuntimeConfig: async () => {
          throw new MedusaError(MedusaError.Types.NOT_FOUND, "no config")
        },
      }),
      {
        merchantApiKey: "sec_legacy_env_key",
        secretKey: "sk_legacy_env_secret",
        webhookSecret: "whsec_legacy_webhook",
        environment: "sandbox",
        redirectUrl: "https://legacy.test/return",
        cancelUrl: "https://legacy.test/cancel",
      },
      { fetch: fetchImpl as unknown as typeof fetch }
    )

    const result = await service.initiatePayment({
      amount: 2500,
      currency_code: "pkr",
      data: { session_id: "pay_1" },
    } as never)
    expect(result.status).toBe("pending")
    const trackerCall = (fetchImpl.mock.calls as Array<[string, RequestInit?]>).find(
      ([url]) => url.includes("/order/payments/v3/")
    )
    const body = JSON.parse(String(trackerCall?.[1]?.body))
    expect(body.merchant_api_key).toBe("sec_legacy_env_key")
  })

  it("falls back to legacy env options when the container is an awilix cradle (property access throws)", async () => {
    // In production the provider's container is the payment module's awilix
    // cradle: property access on unregistered keys THROWS an
    // AwilixResolutionError (verified against awilix@8.0.1 — the cradle's get
    // trap calls resolve() for every property). The provider must treat that
    // as "no payment-config module available" and use the legacy env options.
    const cradleLikeContainer = new Proxy(
      {},
      {
        get: () => {
          throw new Error("AwilixResolutionError: Could not resolve")
        },
      }
    )
    const fetchImpl = jest.fn(async (url: string) =>
      url.includes("/client/passport/v1/token")
        ? passportResponse()
        : trackerResponse()
    )
    const service = new SafepayProviderService(
      cradleLikeContainer as never,
      {
        merchantApiKey: "sec_legacy_env_key",
        secretKey: "sk_legacy_env_secret",
        webhookSecret: "whsec_legacy_webhook",
        environment: "sandbox",
        redirectUrl: "https://legacy.test/return",
        cancelUrl: "https://legacy.test/cancel",
      },
      { fetch: fetchImpl as unknown as typeof fetch }
    )

    const result = await service.initiatePayment({
      amount: 2500,
      currency_code: "pkr",
      data: { session_id: "pay_1" },
    } as never)
    expect(result.status).toBe("pending")
    const trackerCall = (fetchImpl.mock.calls as Array<[string, RequestInit?]>).find(
      ([url]) => url.includes("/order/payments/v3/")
    )
    const body = JSON.parse(String(trackerCall?.[1]?.body))
    expect(body.merchant_api_key).toBe("sec_legacy_env_key")
  })

  it("verifies webhooks using the stored webhook secret from the Admin config", async () => {
    const service = new SafepayProviderService(
      makeContainer({ getRuntimeConfig: async () => ADMIN_CONFIG }),
      {}
    )

    const event = safepayEvent()
    const { raw, headers } = signedEvent(event, ADMIN_CONFIG.secrets.webhookSecret)
    const action = await service.getWebhookActionAndData({
      rawData: raw,
      headers,
    } as never)
    expect(action.action).toBe("captured") // PaymentActions.SUCCESSFUL
  })

  it("rejects webhooks signed with the wrong secret (stored secret is authoritative)", async () => {
    const service = new SafepayProviderService(
      makeContainer({ getRuntimeConfig: async () => ADMIN_CONFIG }),
      {}
    )

    const event = safepayEvent()
    const { raw, headers } = signedEvent(event, "whsec_wrong_secret")
    await expect(
      service.getWebhookActionAndData({ rawData: raw, headers } as never)
    ).rejects.toThrow(/invalid X-SFPY-SIGNATURE/)
  })

  it("fails webhook processing safely when the config is missing the webhook secret", async () => {
    const service = new SafepayProviderService(
      makeContainer({
        getRuntimeConfig: async () => ({
          ...ADMIN_CONFIG,
          secrets: { merchantApiKey: "sec_m", secretKey: "sk_s" },
        }),
      }),
      {}
    )
    await expect(
      service.getWebhookActionAndData({ rawData: "{}", headers: {} } as never)
    ).rejects.toThrow(/not fully configured/)
  })
})
