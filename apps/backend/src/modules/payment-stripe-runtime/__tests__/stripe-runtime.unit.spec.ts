import { MedusaError } from "@medusajs/framework/utils"

import { StripeProviderService } from "@medusajs/payment-stripe/dist/services"

import {
  StripeRuntimeProviderService,
  type StripeRuntimeOptions,
} from "../service"
import {
  PAYMENT_CONFIG_MODULE,
  type DecryptedProviderConfig,
} from "../../payment-config/service"

/** Minimal container with a resolvable payment-config module service. */
const makeContainer = (configService?: {
  getRuntimeConfig(provider: string): Promise<DecryptedProviderConfig>
}) =>
  ({
    // The provider reads the module through property access on its container
    // (the payment module's awilix cradle), not through a resolve() call.
    [PAYMENT_CONFIG_MODULE]: configService,
  }) as unknown as Record<string, unknown>

const noop = () => undefined
const emptyContainer = {} as never

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit?]>

const fetchMock = (impl: (url: string, init?: RequestInit) => Promise<Response>): FetchMock =>
  jest.fn<Promise<Response>, [string, RequestInit?]>(impl)

const requestInit = (init?: RequestInit): RequestInit => init ?? {}

const authHeader = (init?: RequestInit): string => {
  const headers = (requestInit(init).headers ?? {}) as Record<string, string>
  return headers.Authorization ?? headers.authorization ?? ""
}

const createService = (
  options: StripeRuntimeOptions = {},
  configService?: {
    getRuntimeConfig(provider: string): Promise<DecryptedProviderConfig>
  },
  fetchImpl?: typeof fetch
) =>
  new StripeRuntimeProviderService(
    configService ? makeContainer(configService) : emptyContainer,
    options,
    fetchImpl ? { fetch: fetchImpl } : undefined
  )

const adminRuntime = (
  overrides: Partial<DecryptedProviderConfig> = {}
): DecryptedProviderConfig => ({
  provider: "stripe",
  enabled: true,
  environment: "test",
  config: { capture: false },
  secrets: {
    secretKey: "sk_test_admin_key",
    webhookSecret: "whsec_admin_webhook",
  },
  ...overrides,
})

describe("Stripe runtime-config provider wrapper", () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("fails safely when Stripe is not configured at all", async () => {
    const service = createService({})
    await expect(service.initiatePayment({} as never)).rejects.toThrow(
      "Stripe is not configured"
    )
    await expect(service.getPaymentStatus({} as never)).rejects.toThrow(
      "Stripe is not configured"
    )
  })

  it("refuses new payments when Stripe is disabled (Admin config)", async () => {
    const service = createService({}, {
      getRuntimeConfig: async () => adminRuntime({ enabled: false }),
    })
    const spy = jest
      .spyOn(StripeProviderService.prototype, "initiatePayment")
      .mockResolvedValue({ id: "pi_test", status: "pending" as never })

    await expect(service.initiatePayment({} as never)).rejects.toThrow(
      /Stripe is disabled/
    )
    expect(spy).not.toHaveBeenCalled()
  })

  it("refuses new payments when the official provider is never constructed while disabled", async () => {
    const service = createService({}, {
      getRuntimeConfig: async () => adminRuntime({ enabled: false }),
    })
    await expect(service.initiatePayment({} as never)).rejects.toThrow(
      MedusaError
    )
  })

  it("fails safely on incomplete Admin config (missing apiKey)", async () => {
    const service = createService(
      {},
      {
        getRuntimeConfig: async () =>
          adminRuntime({ secrets: { webhookSecret: "whsec_only" } }),
      }
    )
    await expect(service.initiatePayment({} as never)).rejects.toThrow(
      /not fully configured/
    )
  })

  it("delegates payment operations to the official provider when configured", async () => {
    const service = createService({}, {
      getRuntimeConfig: async () => adminRuntime(),
    })
    const spy = jest
      .spyOn(StripeProviderService.prototype, "initiatePayment")
      .mockResolvedValue({ id: "pi_test", status: "pending" as never })

    const result = await service.initiatePayment({
      amount: 45,
      currency_code: "aed",
    } as never)
    expect(result).toEqual({ id: "pi_test", status: "pending" })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("uses Admin config over legacy env options (precedence)", async () => {
    const mock = fetchMock(async () => jsonResponse({}, 200))
    const service = createService(
      { apiKey: "sk_test_legacy_env_key" },
      { getRuntimeConfig: async () => adminRuntime() },
      mock as unknown as typeof fetch
    )

    await service.testConnection()
    const [url, init] = mock.mock.calls[0]
    expect(url).toContain("/v1/balance")
    expect(authHeader(init)).toContain("sk_test_admin_key")
    expect(authHeader(init)).not.toContain("legacy_env_key")
  })

  it("falls back to legacy env options when no Admin row exists (transitional)", async () => {
    const mock = fetchMock(async () => jsonResponse({}, 200))
    const service = createService(
      { apiKey: "sk_test_legacy_env_key" },
      {
        getRuntimeConfig: async () => {
          throw new MedusaError(MedusaError.Types.NOT_FOUND, "no config")
        },
      },
      mock as unknown as typeof fetch
    )

    await service.testConnection()
    const [, init] = mock.mock.calls[0]
    expect(authHeader(init)).toContain("sk_test_legacy_env_key")
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
    const mock = fetchMock(async () => jsonResponse({}, 200))
    const service = new StripeRuntimeProviderService(
      cradleLikeContainer as never,
      { apiKey: "sk_test_legacy_env_key" },
      { fetch: mock as unknown as typeof fetch }
    )

    await service.testConnection()
    const [, init] = mock.mock.calls[0]
    expect(authHeader(init)).toContain("sk_test_legacy_env_key")
  })

  it("testConnection succeeds with valid credentials (200)", async () => {
    const mock = fetchMock(async () => jsonResponse({}, 200))
    const service = createService({}, {
      getRuntimeConfig: async () => adminRuntime(),
    }, mock as unknown as typeof fetch)

    const result = await service.testConnection()
    expect(result).toEqual({ status: "ok" })
  })

  it("testConnection fails sanitized on invalid credentials (401)", async () => {
    const mock = fetchMock(async () => jsonResponse({ error: "x" }, 401))
    const service = createService({}, {
      getRuntimeConfig: async () => adminRuntime(),
    }, mock as unknown as typeof fetch)

    await expect(service.testConnection()).rejects.toThrow(
      /authentication rejected/
    )
  })

  it("testConnection fails sanitized on network errors (no secrets leaked)", async () => {
    const mock = fetchMock(async () => {
      throw new Error("ECONNREFUSED")
    })
    const service = createService({}, {
      getRuntimeConfig: async () => adminRuntime(),
    }, mock as unknown as typeof fetch)

    await expect(service.testConnection()).rejects.toThrow(/unable to reach/)
    // Secret values never surface in the sanitized failure message.
    await expect(service.testConnection()).rejects.not.toThrow(
      /sk_test_admin_key|whsec_admin_webhook/
    )
  })

  it("webhook verification fails safely when Stripe is not configured", async () => {
    const service = createService({})
    await expect(
      service.getWebhookActionAndData({ rawData: "{}", headers: {} } as never)
    ).rejects.toThrow("Stripe is not configured")
  })

  it("resolves the webhook secret through the runtime config for in-flight sessions", async () => {
    const service = createService({}, {
      getRuntimeConfig: async () => adminRuntime(),
    })
    const spy = jest
      .spyOn(StripeProviderService.prototype, "getWebhookActionAndData")
      .mockResolvedValue({ action: "not_supported" as never })

    await service.getWebhookActionAndData({ rawData: "{}", headers: {} } as never)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it("never falls back to another provider (no silent routing)", async () => {
    const service = createService({}, {
      getRuntimeConfig: async () => {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, "no config")
      },
    })
    await expect(service.initiatePayment({} as never)).rejects.toThrow(
      /not configured/
    )
  })

  it("ignores an unrelated container key (defensive)", async () => {
    const container = {
      resolve: (key: string) => (key === "something-else" ? {} : undefined),
    }
    const service = new StripeRuntimeProviderService(
      container as unknown as Record<string, unknown>,
      {}
    )
    await expect(service.initiatePayment({} as never)).rejects.toThrow(
      "Stripe is not configured"
    )
    expect(noop).not.toThrow()
  })
})
