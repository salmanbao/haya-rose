/**
 * Minimal HTTP client for the verified Safepay REST contract.
 *
 * Every endpoint, header, and payload shape below is verified against the
 * official Safepay documentation (safepay-docs.netlify.app, retrieved via
 * Context7) and cross-checked against the published official SDK source
 * (@sfpy/node-core@0.3.5 — whose RequestSender sends the
 * `x-sfpy-merchant-secret` header on every request and whose resource
 * definitions pin the endpoint paths):
 *
 * - POST {host}/order/payments/v3/                      create tracker
 *   body { merchant_api_key, intent, mode, currency, amount, metadata }
 * - GET  {host}/reporter/api/v1/payments/{tracker}      tracker status
 * - POST {host}/order/payments/v3/{tracker}/refund      refund { currency, amount }
 * - POST {host}/client/passport/v1/token                checkout auth token (tbt)
 *
 * Responses use the envelope { data, status: { errors, message } }; a call is
 * successful only when HTTP is 2xx AND `status.errors` is empty AND `data` is
 * present.
 *
 * Retry policy (approved BD-P-05 — bounded retries with backoff, status
 * check before any new financial effect): read-only/status calls are retried
 * on network errors and 5xx with exponential backoff + jitter. Financial
 * operations (tracker creation, refunds) are sent exactly once — Safepay
 * documents no idempotency mechanism for them, so an automatic retry could
 * duplicate a financial effect. A timed-out refund must surface for manual
 * reconciliation instead of being retried blindly.
 */

export type SafepayEnvironment = "sandbox" | "production"

const API_HOSTS: Record<SafepayEnvironment, string> = {
  sandbox: "https://sandbox.api.getsafepay.com",
  production: "https://api.getsafepay.com",
}

/** Hosted checkout page (verified in @sfpy/node-core@0.3.5 Checkout.js). */
const CHECKOUT_HOSTS: Record<SafepayEnvironment, string> = {
  sandbox: "https://sandbox.api.getsafepay.com/embedded/",
  production: "https://getsafepay.com/embedded/",
}

export const SAFEPAY_ENVIRONMENTS = Object.keys(API_HOSTS) as SafepayEnvironment[]

export type SafepayClientConfig = {
  environment: SafepayEnvironment
  merchantApiKey: string
  secretKey: string
  intent: string
  fetch?: typeof fetch
  retry?: { maxRetries: number; baseDelayMs: number }
}

export class SafepayApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = "SafepayApiError"
  }
}

export type SafepayTracker = {
  token: string
  state?: string
  purchase_totals?: {
    quote_amount?: { currency?: string; amount?: number }
  }
}

export type CreateTrackerInput = {
  /** Amount in paisa (lowest denomination — see amounts.ts). */
  amount: number
  currency: string
  metadata?: Record<string, unknown>
}

const DEFAULT_RETRY = { maxRetries: 3, baseDelayMs: 1000 }

export class SafepayClient {
  private readonly host_: string
  private readonly fetchImpl_: typeof fetch
  private readonly retry_: { maxRetries: number; baseDelayMs: number }

  constructor(private readonly config: SafepayClientConfig) {
    this.host_ = API_HOSTS[config.environment]
    this.fetchImpl_ = config.fetch ?? fetch
    this.retry_ = config.retry ?? DEFAULT_RETRY
  }

  static checkoutHost(environment: SafepayEnvironment): string {
    return CHECKOUT_HOSTS[environment]
  }

  /** Single attempt — no auto-retry (financial operation). */
  async createTracker(input: CreateTrackerInput): Promise<SafepayTracker> {
    const body = {
      merchant_api_key: this.config.merchantApiKey,
      intent: this.config.intent,
      mode: "payment",
      currency: input.currency,
      amount: input.amount,
      metadata: input.metadata,
    }
    const data = await this.request_(
      "POST",
      "/order/payments/v3/",
      body,
      /* retryable */ false
    )
    const tracker = (data as { tracker?: SafepayTracker }).tracker
    if (!tracker?.token) {
      throw new SafepayApiError(
        "Safepay did not return a tracker token in the payment session response"
      )
    }
    return tracker
  }

  /** Read-only — retried on network errors/5xx (BD-P-05). */
  async fetchTracker(tracker: string): Promise<SafepayTracker> {
    const data = await this.request_(
      "GET",
      `/reporter/api/v1/payments/${encodeURIComponent(tracker)}`,
      undefined,
      /* retryable */ true
    )
    // The sandbox reporter returns the tracker directly under `data`; the
    // webhook-shaped `{ tracker }` wrapper is accepted for robustness
    // (verified against sandbox.api.getsafepay.com on 2026-08-17).
    const wrapped = data as { tracker?: SafepayTracker } | SafepayTracker
    const result = (wrapped as { tracker?: SafepayTracker }).tracker ?? (wrapped as SafepayTracker)
    if (!result?.state) {
      throw new SafepayApiError(
        `Safepay reporter response for tracker ${tracker} carries no state`
      )
    }
    return result
  }

  /** Single attempt — no auto-retry (financial operation). */
  async refundTracker(tracker: string, amount: number, currency: string) {
    return this.request_(
      "POST",
      `/order/payments/v3/${encodeURIComponent(tracker)}/refund`,
      { currency, amount },
      /* retryable */ false
    )
  }

  /** Non-financial token request — retried (cheap, no side effects). */
  async createPassportToken(): Promise<string> {
    const data = await this.request_(
      "POST",
      "/client/passport/v1/token",
      undefined,
      /* retryable */ true
    )
    if (typeof data !== "string" || data.length === 0) {
      throw new SafepayApiError(
        "Safepay did not return a passport token (tbt) for the checkout URL"
      )
    }
    return data
  }

  private async request_(
    method: string,
    path: string,
    body: unknown,
    retryable: boolean
  ): Promise<unknown> {
    const maxAttempts = retryable ? this.retry_.maxRetries : 1

    for (let attempt = 1; ; attempt += 1) {
      let response: Response
      try {
        response = await this.fetchImpl_(`${this.host_}${path}`, {
          method,
          headers: {
            "x-sfpy-merchant-secret": this.config.secretKey,
            ...(body !== undefined
              ? { "content-type": "application/json" }
              : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        })
      } catch (error) {
        // Network failure: retry only safe (read-only) operations.
        if (retryable && attempt < maxAttempts) {
          await this.delay_(attempt)
          continue
        }
        throw new SafepayApiError(
          `Safepay ${method} ${path} failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      }

      if (response.ok || (response.status >= 500 && retryable && attempt < maxAttempts)) {
        if (response.status >= 500) {
          await this.delay_(attempt)
          continue
        }
        return this.parseSuccess_(response, path)
      }

      // Non-retryable HTTP status (4xx, or 5xx on a single-attempt call).
      let message = `Safepay ${method} ${path} returned HTTP ${response.status}`
      try {
        const parsed = (await response.json()) as {
          message?: string
          error?: string
          status?: { errors?: string[] }
        }
        const detail =
          parsed.status?.errors?.join(", ") ||
          parsed.message ||
          parsed.error
        if (detail) {
          message += `: ${detail}`
        }
      } catch {
        // Keep the HTTP-status message.
      }
      throw new SafepayApiError(message, response.status)
    }
  }

  private async parseSuccess_(response: Response, path: string): Promise<unknown> {
    const parsed = (await response.json()) as {
      data?: unknown
      status?: { errors?: unknown[]; message?: string }
    }
    const errors = parsed.status?.errors
    if (Array.isArray(errors) && errors.length > 0) {
      throw new SafepayApiError(
        `Safepay ${path} reported errors: ${errors.join(", ")}`
      )
    }
    if (parsed.data === undefined || parsed.data === null) {
      throw new SafepayApiError(`Safepay ${path} returned no data`)
    }
    return parsed.data
  }

  private delay_(attempt: number): Promise<void> {
    // Exponential backoff with jitter (same shape as the bundled Stripe
    // provider's executeWithRetry).
    const delay =
      this.retry_.baseDelayMs *
      Math.pow(2, attempt - 1) *
      (0.5 + Math.random() * 0.5)
    return new Promise((resolve) => setTimeout(resolve, delay))
  }
}
