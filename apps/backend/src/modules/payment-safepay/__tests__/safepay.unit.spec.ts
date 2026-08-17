import { createHmac } from "crypto"

import { PaymentSessionStatus } from "@medusajs/framework/utils"

import { SafepayProviderService, type SafepayProviderOptions } from "../service"
import { fromSafepayAmount, toSafepayAmount } from "../amounts"

/**
 * Safepay payment provider (Pakistan/PKR — approved decision BD-P-01,
 * revised: Safepay replaces AssanPay) unit tests.
 *
 * All Safepay contract facts exercised here are verified against the official
 * Safepay documentation (safepay-docs.netlify.app, retrieved via Context7)
 * and cross-checked against the published official SDK source
 * (@sfpy/node-core@0.3.5):
 * - tracker creation: POST /order/payments/v3/ (merchant_api_key, intent,
 *   mode, currency, amount in lowest denomination, metadata)
 * - status lookup: GET /reporter/api/v1/payments/{tracker}
 * - refunds: POST /order/payments/v3/{tracker}/refund { currency, amount }
 * - passport token: POST /client/passport/v1/token → { data: "<tbt>" }
 * - hosted checkout URL: {checkout host}/embedded/?environment=&tracker=&tbt=&source=…
 * - webhooks: X-SFPY-SIGNATURE header, HMAC-SHA512 hex over the raw body
 * - event envelope { token, type, data: { tracker, amount, currency, metadata } }
 *
 * Network calls are mocked (no sandbox credentials in CI). Provider-level
 * sandbox contract tests remain pending (see safepay-verification.md).
 */

const OPTIONS = {
  merchantApiKey: "sec_merchant_api_key",
  secretKey: "sk_test_secret",
  webhookSecret: "whsec_test_secret",
  environment: "sandbox" as const,
  redirectUrl: "https://storefront.test/checkout/payment/safepay",
  cancelUrl: "https://storefront.test/checkout",
}

const TRACKER = "track_1a46dc70-91f9-4892-8e25-0bb5205b69c7"

const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response

const trackerResponse = (state: string, amount = 250000, currency = "PKR") =>
  jsonResponse({
    data: {
      tracker: {
        token: TRACKER,
        state,
        purchase_totals: {
          quote_amount: { currency, amount },
        },
      },
    },
    status: { errors: [], message: "success" },
  })

const sessionResponse = () =>
  jsonResponse({
    data: { tracker: { token: TRACKER } },
    status: { errors: [], message: "success" },
  })

const passportResponse = () => jsonResponse({ data: "tbt_token_value" })

const createService = (fetchImpl?: typeof fetch) =>
  new SafepayProviderService(
    {} as never,
    { ...OPTIONS },
    fetchImpl ? { fetch: fetchImpl } : undefined
  )

const signedEvent = (event: Record<string, unknown>, secret = OPTIONS.webhookSecret) => {
  const raw = JSON.stringify(event)
  const signature = createHmac("sha512", secret).update(raw).digest("hex")
  return { raw, headers: { "x-sfpy-signature": signature } }
}

const paymentSucceededEvent = (amount = 250000) => ({
  token: "evt_64b3218e-f65c-45a9-96b0-fe4e293bb879",
  version: "2.0.0",
  type: "payment.succeeded",
  data: {
    tracker: TRACKER,
    state: "TRACKER_ENDED",
    net: 43525,
    fee: 1475,
    amount,
    currency: "PKR",
    metadata: { order_id: "paysess_123" },
    charged_at: { seconds: 1698754230, nanos: 752997627 },
  },
  created_at: { seconds: 1698754230, nanos: 912705711 },
})

describe("amount conversion (PKR major units ↔ paisa, exactly once)", () => {
  it("converts Medusa major-unit PKR amounts to paisa", () => {
    expect(toSafepayAmount(2500, "pkr")).toBe(250000)
    expect(toSafepayAmount(2500.5, "pkr")).toBe(250050)
    expect(toSafepayAmount(0.01, "pkr")).toBe(1)
  })

  it("rounds half-up to whole paisa", () => {
    expect(toSafepayAmount(10.125, "pkr")).toBe(1013)
  })

  it("rejects non-PKR currencies (no silent conversion, REQ-PAY-002)", () => {
    expect(() => toSafepayAmount(100, "aed")).toThrow(/PKR/)
  })

  it("rejects zero and negative amounts", () => {
    expect(() => toSafepayAmount(0, "pkr")).toThrow()
    expect(() => toSafepayAmount(-1, "pkr")).toThrow()
  })

  it("converts paisa back to Medusa major units", () => {
    expect(fromSafepayAmount(250000)).toBe(2500)
    expect(fromSafepayAmount(1)).toBe(0.01)
  })
})

describe("validateOptions (boot-time, Admin-managed config mode)", () => {
  it("allows empty options (credentials are Admin-managed at runtime)", () => {
    expect(() =>
      SafepayProviderService.validateOptions({} as SafepayProviderOptions)
    ).not.toThrow()
    expect(() =>
      SafepayProviderService.validateOptions({
        environment: "sandbox",
      } as SafepayProviderOptions)
    ).not.toThrow()
  })

  it("fails fast on a partially filled legacy env config", () => {
    expect(() =>
      SafepayProviderService.validateOptions({
        ...OPTIONS,
        secretKey: undefined as unknown as string,
      })
    ).toThrow(/secretKey/)
  })

  it("rejects an unknown environment", () => {
    expect(() =>
      SafepayProviderService.validateOptions({
        ...OPTIONS,
        environment: "dev" as never,
      })
    ).toThrow(/environment/)
  })

  it("rejects an undocumented intent value", () => {
    expect(() =>
      SafepayProviderService.validateOptions({
        ...OPTIONS,
        intent: "PAYPAL" as never,
      })
    ).toThrow(/intent/)
  })
})

describe("initiatePayment", () => {
  it("creates a tracker with the documented body and returns a pending session with checkout URL", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetchImpl = (async (url: any, init: any) => {
      calls.push({ url: String(url), init })
      if (String(url).endsWith("/order/payments/v3/")) return sessionResponse()
      if (String(url).endsWith("/client/passport/v1/token"))
        return passportResponse()
      throw new Error(`unexpected url ${url}`)
    }) as unknown as typeof fetch

    const service = createService(fetchImpl)
    const result = await service.initiatePayment({
      amount: 2500,
      currency_code: "pkr",
      data: { session_id: "paysess_123" },
    })

    // Tracker creation request shape (verified contract).
    const createCall = calls[0]
    expect(createCall.url).toBe(
      "https://sandbox.api.getsafepay.com/order/payments/v3/"
    )
    const body = JSON.parse(String(createCall.init.body))
    expect(body).toEqual({
      merchant_api_key: "sec_merchant_api_key",
      intent: "CYBERSOURCE",
      mode: "payment",
      currency: "PKR",
      amount: 250000,
      metadata: { order_id: "paysess_123" },
    })
    // Auth header (verified in official SDK source).
    expect(
      (createCall.init.headers as Record<string, string>)["x-sfpy-merchant-secret"]
    ).toBe("sk_test_secret")

    // Passport token request for the checkout URL.
    expect(calls[1].url).toBe(
      "https://sandbox.api.getsafepay.com/client/passport/v1/token"
    )

    expect(result).toMatchObject({
      id: TRACKER,
      status: PaymentSessionStatus.PENDING,
    })
    expect(result.data!.checkout_url).toContain(
      `tracker=${encodeURIComponent(TRACKER)}`
    )
    expect(result.data!.checkout_url).toContain("tbt=tbt_token_value")
    expect(result.data!.checkout_url).toContain("source=hosted")
    expect(result.data!.checkout_url).toContain(
      `redirect_url=${encodeURIComponent(OPTIONS.redirectUrl)}`
    )
    expect(result.data!.checkout_url).toContain(
      `cancel_url=${encodeURIComponent(OPTIONS.cancelUrl)}`
    )
    expect(result.data!.checkout_url).toContain("environment=sandbox")
  })

  it("uses the production API host in production mode", async () => {
    const fetchImpl = (async (url: any) => {
      if (String(url).endsWith("/order/payments/v3/")) return sessionResponse()
      return passportResponse()
    }) as unknown as typeof fetch

    const service = new SafepayProviderService(
      {} as never,
      { ...OPTIONS, environment: "production" },
      { fetch: fetchImpl }
    )
    const result = await service.initiatePayment({
      amount: 100,
      currency_code: "pkr",
      data: { session_id: "paysess_123" },
    })
    expect(result.data!.checkout_url).toContain("https://getsafepay.com/embedded/")
  })

  it("rejects a non-PKR currency before any provider call", async () => {
    const fetchImpl = jest.fn()
    const service = createService(fetchImpl as unknown as typeof fetch)
    await expect(
      service.initiatePayment({
        amount: 100,
        currency_code: "aed",
        data: { session_id: "paysess_123" },
      })
    ).rejects.toThrow(/PKR/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("throws when the provider reports errors in the status envelope", async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        data: {},
        status: { errors: ["Invalid amount"], message: "error" },
      })) as unknown as typeof fetch
    const service = createService(fetchImpl)
    await expect(
      service.initiatePayment({
        amount: 100,
        currency_code: "pkr",
        data: { session_id: "paysess_123" },
      })
    ).rejects.toThrow(/Invalid amount/)
  })

  it("throws on a non-2xx provider response", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ message: "Unauthorized" }, 401)) as unknown as typeof fetch
    const service = createService(fetchImpl)
    await expect(
      service.initiatePayment({
        amount: 100,
        currency_code: "pkr",
        data: { session_id: "paysess_123" },
      })
    ).rejects.toThrow()
  })
})

describe("authorizePayment / getPaymentStatus (tracker state mapping)", () => {
  const cases: Array<[string, PaymentSessionStatus]> = [
    ["TRACKER_STARTED", PaymentSessionStatus.PENDING_AUTHORIZATION],
    ["TRACKER_ENDED", PaymentSessionStatus.CAPTURED],
    ["TRACKER_VOIDED", PaymentSessionStatus.CANCELED],
    ["TRACKER_REFUNDED", PaymentSessionStatus.CAPTURED],
    ["TRACKER_PARTIAL_REFUND", PaymentSessionStatus.CAPTURED],
  ]

  for (const [state, expected] of cases) {
    it(`maps ${state} to ${expected}`, async () => {
      const service = createService(
        (async () => trackerResponse(state)) as unknown as typeof fetch
      )
      const result = await service.authorizePayment({
        data: { tracker: TRACKER, amount: 2500, currency_code: "pkr" },
      })
      expect(result.status).toBe(expected)
    })
  }

  it("maps an unknown tracker state to error (never auto-success, REQ-PAY-021)", async () => {
    const service = createService(
      (async () => trackerResponse("SOME_NEW_STATE")) as unknown as typeof fetch
    )
    const result = await service.authorizePayment({
      data: { tracker: TRACKER, amount: 2500, currency_code: "pkr" },
    })
    expect(result.status).toBe(PaymentSessionStatus.ERROR)
  })

  it("reads the tracker directly from the reporter response (sandbox shape)", async () => {
    const service = createService(
      (async () =>
        jsonResponse({
          ok: true,
          data: {
            token: TRACKER,
            state: "TRACKER_ENDED",
            purchase_totals: {
              quote_amount: { currency: "PKR", amount: 250000 },
            },
          },
        })) as unknown as typeof fetch
    )
    const result = await service.authorizePayment({
      data: { tracker: TRACKER, amount: 2500, currency_code: "pkr" },
    })
    expect(result.status).toBe(PaymentSessionStatus.CAPTURED)
  })

  it("maps a paid tracker with a mismatched amount to error (REQ-PAY-001)", async () => {
    const service = createService(
      (async () => trackerResponse("TRACKER_ENDED", 999999)) as unknown as typeof fetch
    )
    const result = await service.authorizePayment({
      data: { tracker: TRACKER, amount: 2500, currency_code: "pkr" },
    })
    expect(result.status).toBe(PaymentSessionStatus.ERROR)
  })

  it("retries reporter requests on 5xx with backoff (BD-P-05)", async () => {
    let calls = 0
    const service = new SafepayProviderService(
      {} as never,
      { ...OPTIONS },
      {
        fetch: (async () => {
          calls += 1
          if (calls < 3) return jsonResponse({}, 500)
          return trackerResponse("TRACKER_ENDED")
        }) as unknown as typeof fetch,
        retry: { maxRetries: 3, baseDelayMs: 1 },
      }
    )
    const result = await service.getPaymentStatus({
      data: { tracker: TRACKER, amount: 2500, currency_code: "pkr" },
    })
    expect(result.status).toBe(PaymentSessionStatus.CAPTURED)
    expect(calls).toBe(3)
  })
})

describe("capturePayment (hosted-checkout auto-capture model)", () => {
  it("succeeds when the tracker is TRACKER_ENDED without a second provider capture call", async () => {
    const fetchImpl = jest.fn(
      (async () => trackerResponse("TRACKER_ENDED")) as unknown as typeof fetch
    )
    const service = createService(fetchImpl as unknown as typeof fetch)
    const result = await service.capturePayment({ data: { tracker: TRACKER } })
    expect(result.data!.state).toBe("TRACKER_ENDED")
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("throws when the tracker is not captured (nothing to capture provider-side)", async () => {
    const service = createService(
      (async () => trackerResponse("TRACKER_STARTED")) as unknown as typeof fetch
    )
    await expect(
      service.capturePayment({ data: { tracker: TRACKER } })
    ).rejects.toThrow()
  })
})

describe("refundPayment", () => {
  it("calls the documented refund endpoint with paisa amounts", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const service = createService(
      (async (url: any, init: any) => {
        calls.push({ url: String(url), init })
        return jsonResponse({
          data: {
            tracker: {
              token: TRACKER,
              state: "TRACKER_PARTIAL_REFUND",
              purchase_totals: {
                quote_amount: { currency: "PKR", amount: 600000 },
              },
            },
          },
          status: { errors: [], message: "success" },
        })
      }) as unknown as typeof fetch
    )
    const result = await service.refundPayment({
      amount: 1000,
      data: { tracker: TRACKER, currency_code: "pkr" },
    })
    expect(calls[0].url).toBe(
      `https://sandbox.api.getsafepay.com/order/payments/v3/${TRACKER}/refund`
    )
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      currency: "PKR",
      amount: 100000,
    })
    expect(result.data!.state).toBe("TRACKER_PARTIAL_REFUND")
  })

  it("does NOT auto-retry a failed refund (no provider idempotency — double-refund risk)", async () => {
    let calls = 0
    const service = new SafepayProviderService(
      {} as never,
      { ...OPTIONS },
      {
        fetch: (async () => {
          calls += 1
          return jsonResponse({ message: "Server Error" }, 500)
        }) as unknown as typeof fetch,
        retry: { maxRetries: 3, baseDelayMs: 1 },
      }
    )
    await expect(
      service.refundPayment({
        amount: 1000,
        data: { tracker: TRACKER, currency_code: "pkr" },
      })
    ).rejects.toThrow()
    expect(calls).toBe(1)
  })

  it("propagates provider errors (no phantom refund)", async () => {
    const service = createService(
      (async () =>
        jsonResponse({
          data: {},
          status: { errors: ["Already fully refunded"], message: "error" },
        })) as unknown as typeof fetch
    )
    await expect(
      service.refundPayment({
        amount: 1000,
        data: { tracker: TRACKER, currency_code: "pkr" },
      })
    ).rejects.toThrow(/refunded/)
  })
})

describe("cancelPayment", () => {
  it("throws when the tracker is captured (cancellation ≠ refund, REQ-PAY-012)", async () => {
    const service = createService(
      (async () => trackerResponse("TRACKER_ENDED")) as unknown as typeof fetch
    )
    await expect(
      service.cancelPayment({ data: { tracker: TRACKER } })
    ).rejects.toThrow()
  })

  it("cancels locally for an un-paid tracker (no documented provider-side pending cancel)", async () => {
    const fetchImpl = jest.fn(
      (async () => trackerResponse("TRACKER_STARTED")) as unknown as typeof fetch
    )
    const service = createService(fetchImpl as unknown as typeof fetch)
    const result = await service.cancelPayment({ data: { tracker: TRACKER } })
    expect(result.data!.state).toBe("TRACKER_STARTED")
    // Only the status lookup happens — no provider void of an un-paid tracker.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe("updatePayment / deletePayment", () => {
  it("re-creates the tracker for a changed amount and replaces provider data", async () => {
    const fetchImpl = (async (url: any) => {
      if (String(url).endsWith("/order/payments/v3/")) return sessionResponse()
      return passportResponse()
    }) as unknown as typeof fetch
    const service = createService(fetchImpl)
    const result = await service.updatePayment({
      amount: 3000,
      currency_code: "pkr",
      data: {
        session_id: "paysess_123",
        tracker: "track_old",
        checkout_url: "https://old",
        amount: 2500,
      },
    })
    expect(result.data!.tracker).toBe(TRACKER)
    expect(result.data!.checkout_url).toContain("tbt=tbt_token_value")
    expect(result.status).toBe(PaymentSessionStatus.PENDING)
  })

  it("deletePayment is a no-op (nothing to delete for an unpaid tracker)", async () => {
    const fetchImpl = jest.fn()
    const service = createService(fetchImpl as unknown as typeof fetch)
    await expect(
      service.deletePayment({ data: { tracker: TRACKER } })
    ).resolves.toEqual({})
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe("getWebhookActionAndData", () => {
  it("maps a signature-verified payment.succeeded event to captured with major-unit amount", async () => {
    const service = createService()
    const { raw, headers } = signedEvent(paymentSucceededEvent())
    const result = await service.getWebhookActionAndData({
      data: JSON.parse(raw),
      rawData: raw,
      headers,
    })
    expect(result.action).toBe("captured")
    expect(result.data).toEqual({
      session_id: "paysess_123",
      amount: 2500,
    })
  })

  it("maps payment.failed to failed", async () => {
    const service = createService()
    const event = {
      ...paymentSucceededEvent(),
      type: "payment.failed",
      data: { ...paymentSucceededEvent().data, state: "TRACKER_FAILED" },
    }
    const { raw, headers } = signedEvent(event)
    const result = await service.getWebhookActionAndData({
      data: JSON.parse(raw),
      rawData: raw,
      headers,
    })
    expect(result.action).toBe("failed")
  })

  it("maps void.succeeded to canceled", async () => {
    const service = createService()
    const event = {
      token: "evt_846f361c",
      version: "2.0.0",
      type: "void.succeeded",
      data: {
        tracker: TRACKER,
        state: "TRACKER_VOIDED",
metadata: { order_id: "paysess_123" },
        void_type: "CAPTURE",
      },
    }
    const { raw, headers } = signedEvent(event)
    const result = await service.getWebhookActionAndData({
      data: JSON.parse(raw),
      rawData: raw,
      headers,
    })
    expect(result.action).toBe("canceled")
  })

  it("rejects a webhook with an invalid signature", async () => {
    const service = createService()
    const { raw } = signedEvent(paymentSucceededEvent(), "wrong-secret")
    await expect(
      service.getWebhookActionAndData({
        data: JSON.parse(raw),
        rawData: raw,
        headers: { "x-sfpy-signature": "0".repeat(128) },
      })
    ).rejects.toThrow(/signature/i)
  })

  it("rejects a webhook without the X-SFPY-SIGNATURE header", async () => {
    const service = createService()
    await expect(
      service.getWebhookActionAndData({
        data: {},
        rawData: "{}",
        headers: {},
      })
    ).rejects.toThrow(/signature/i)
  })

  it("ignores events whose metadata carries no Medusa session id", async () => {
    const service = createService()
    const event = paymentSucceededEvent()
    delete (event.data as { metadata?: unknown }).metadata
    const { raw, headers } = signedEvent(event)
    const result = await service.getWebhookActionAndData({
      data: JSON.parse(raw),
      rawData: raw,
      headers,
    })
    expect(result.action).toBe("not_supported")
    expect(result.data).toBeUndefined()
  })

  it("ignores unknown event types", async () => {
    const service = createService()
    const event = { ...paymentSucceededEvent(), type: "subscription.paused" }
    const { raw, headers } = signedEvent(event)
    const result = await service.getWebhookActionAndData({
      data: JSON.parse(raw),
      rawData: raw,
      headers,
    })
    expect(result.action).toBe("not_supported")
  })

  it("rejects a signature-valid but malformed payload (fail safe)", async () => {
    const service = createService()
    const raw = "not-json"
    const signature = createHmac("sha512", OPTIONS.webhookSecret)
      .update(raw)
      .digest("hex")
    await expect(
      service.getWebhookActionAndData({
        data: {},
        rawData: raw,
        headers: { "x-sfpy-signature": signature },
      })
    ).rejects.toThrow()
  })

  it("is deterministic under duplicate delivery (same event → same action)", async () => {
    const service = createService()
    const { raw, headers } = signedEvent(paymentSucceededEvent())
    const payload = { data: JSON.parse(raw), rawData: raw, headers }
    const first = await service.getWebhookActionAndData(payload)
    const second = await service.getWebhookActionAndData(payload)
    expect(second).toEqual(first)
  })

  it("verifies the signature over the raw body (Buffer form)", async () => {
    const service = createService()
    const { raw, headers } = signedEvent(paymentSucceededEvent())
    const result = await service.getWebhookActionAndData({
      data: JSON.parse(raw),
      rawData: Buffer.from(raw, "utf8"),
      headers,
    })
    expect(result.action).toBe("captured")
  })
})

describe("provider errors and network failures", () => {
  it("propagates network failures from tracker creation", async () => {
    const service = createService(
      (async () => {
        throw new Error("ECONNRESET")
      }) as unknown as typeof fetch
    )
    await expect(
      service.initiatePayment({
        amount: 100,
        currency_code: "pkr",
        data: { session_id: "paysess_123" },
      })
    ).rejects.toThrow(/ECONNRESET/)
  })

  it("does not retry tracker creation (no documented idempotency mechanism)", async () => {
    let calls = 0
    const service = new SafepayProviderService(
      {} as never,
      { ...OPTIONS },
      {
        fetch: (async () => {
          calls += 1
          throw new Error("timeout")
        }) as unknown as typeof fetch,
        retry: { maxRetries: 3, baseDelayMs: 1 },
      }
    )
    await expect(
      service.initiatePayment({
        amount: 100,
        currency_code: "pkr",
        data: { session_id: "paysess_123" },
      })
    ).rejects.toThrow()
    expect(calls).toBe(1)
  })
})
