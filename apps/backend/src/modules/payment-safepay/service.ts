/**
 * Safepay payment provider for the Pakistan (PKR) market.
 *
 * Approved provider selection BD-P-01 (revised 2026-08-17): Safepay replaces
 * AssanPay as the Pakistan provider. Verified contract + compatibility matrix:
 * `docs/architecture/provider-verification/safepay-verification.md`.
 *
 * Medusa lifecycle mapping (all contract facts verified against official
 * Safepay documentation via Context7 + official SDK source @sfpy/node-core):
 *
 * - `initiatePayment` → POST /order/payments/v3/ creates a payment tracker
 *   (TRACKER_STARTED); a passport token (POST /client/passport/v1/token) is
 *   used to build the hosted-checkout redirect URL, stored in provider data
 *   as `checkout_url`. The Medusa session id is attached to the tracker via
 *   `metadata.session_id` (the payment module injects `data.session_id`) and
 *   is echoed back in webhook payloads for correlation.
 * - Hosted checkout is an **auto-capture** model (`mode: "payment"`): a
 *   TRACKER_ENDED tracker means the customer's payment was captured by
 *   Safepay. There is no separate capture API (documented gap — see the
 *   compatibility matrix); `capturePayment` verifies the captured state via
 *   the reporter API instead of issuing a second capture.
 * - `authorizePayment`/`getPaymentStatus` → GET /reporter/api/v1/payments/
 *   {tracker}; state mapping verified (TRACKER_STARTED→pending,
 *   TRACKER_ENDED→captured, TRACKER_VOIDED→canceled, refunds→captured,
 *   unknown→error — never auto-success, REQ-PAY-021). A paid tracker whose
 *   amount differs from the session amount maps to error (REQ-PAY-001).
 * - `refundPayment` → POST /order/payments/v3/{tracker}/refund with
 *   { currency, amount(paisa) } — full and partial refunds are verified
 *   supported. Sent exactly once (no documented idempotency mechanism).
 * - `cancelPayment` → captured trackers cannot be cancelled (refund instead,
 *   REQ-PAY-012); un-paid trackers have no documented provider-side
 *   cancellation — the cancel is local only (documented gap) and a late
 *   webhook on such a tracker surfaces through the native pipeline.
 * - `getWebhookActionAndData` → HMAC-SHA512 signature verification over the
 *   raw body (X-SFPY-SIGNATURE) + event mapping through Medusa's native
 *   webhook pipeline (`POST /hooks/payment/safepay_safepay` →
 *   payment.webhook_received → subscriber → processPaymentWorkflow).
 *
 * CONFIGURATION (approved architecture 2026-08-17): credentials and
 * enable/disable state are Admin-managed through the payment-config module
 * (encrypted at rest in PostgreSQL). Each operation resolves the runtime
 * configuration from that module; a `payment_config` row takes precedence
 * over the legacy env options (which remain as a TRANSITIONAL bootstrap
 * fallback). The static-options path is preserved for unit tests and legacy
 * deployments. A provider that is not configured or is disabled fails
 * safely — it never falls back to another provider.
 */

import {
  AbstractPaymentProvider,
  MedusaError,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  CancelPaymentInput,
  CapturePaymentInput,
  DeletePaymentInput,
  GetPaymentStatusInput,
  InitiatePaymentInput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RetrievePaymentInput,
  UpdatePaymentInput,
  WebhookActionResult,
} from "@medusajs/framework/types"

type ProviderWebhookPayloadPayload = ProviderWebhookPayload["payload"]

import {
  PAYMENT_CONFIG_MODULE,
  type DecryptedProviderConfig,
} from "../payment-config/service"
import {
  fromSafepayAmount,
  toSafepayAmount,
} from "./amounts"
import {
  SafepayClient,
  SAFEPAY_ENVIRONMENTS,
  type SafepayEnvironment,
} from "./client"
import {
  verifyAndParseWebhook,
  type SafepayWebhookEvent,
} from "./webhook"

const DEFAULT_INTENT = "CYBERSOURCE"

/** Documented payment-channel intents (verified: safepay-verification.md). */
const DOCUMENTED_INTENTS = ["CYBERSOURCE", "MPGS"] as const

type ProviderData = {
  session_id?: string
  tracker?: string
  checkout_url?: string
  amount?: number | string
  currency_code?: string
  [key: string]: unknown
}

export type SafepayProviderOptions = {
  /** Public merchant API key (`sec_…`) sent as `merchant_api_key`. */
  merchantApiKey: string
  /** Secret key sent as the `x-sfpy-merchant-secret` header. */
  secretKey: string
  /** Shared webhook secret from the Safepay Developer Dashboard. */
  webhookSecret: string
  environment: SafepayEnvironment
  /** Storefront success/return URL for the hosted checkout. */
  redirectUrl: string
  /** Storefront URL for customer-cancelled checkouts. */
  cancelUrl: string
  /** Payment channel intent (documented values e.g. CYBERSOURCE, MPGS). */
  intent?: string
}

/** Test seam: dependency injection for unit tests (never set in production). */
export type SafepayProviderTestOptions = {
  fetch?: typeof fetch
  retry?: { maxRetries: number; baseDelayMs: number }
}

/** Resolved configuration used by a single operation. */
type ResolvedSafepayConfig = {
  merchantApiKey: string
  secretKey: string
  webhookSecret: string
  environment: SafepayEnvironment
  redirectUrl: string
  cancelUrl: string
  intent?: string
  enabled: boolean
  /** True when the config came from the Admin-managed payment-config module. */
  adminManaged: boolean
}

const LEGACY_OPTION_KEYS = [
  "merchantApiKey",
  "secretKey",
  "webhookSecret",
] as const

export class SafepayProviderService extends AbstractPaymentProvider<
  Partial<SafepayProviderOptions>
> {
  static identifier = "safepay"

  /**
   * Boot-time validation of the provider registration options.
   *
   * Credentials may be Admin-managed (payment-config module) and resolved at
   * runtime — an empty options object is therefore valid at boot. But when
   * ANY legacy env credential is present, the whole legacy set is validated
   * so a partially filled environment fails fast instead of at payment time.
   * Values that ARE provided are always validated (environment, intent).
   */
  static validateOptions(options: SafepayProviderOptions): void {
    const required: Array<keyof SafepayProviderOptions> = [
      "merchantApiKey",
      "secretKey",
      "webhookSecret",
      "redirectUrl",
      "cancelUrl",
    ]
    const anyCredentialProvided = LEGACY_OPTION_KEYS.some((key) =>
      Boolean(options[key])
    )
    if (anyCredentialProvided) {
      for (const key of required) {
        if (!options[key]) {
          throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            `Required Safepay provider option \`${key}\` is missing.`
          )
        }
      }
    }
    if (options.environment !== undefined) {
      if (!SAFEPAY_ENVIRONMENTS.includes(options.environment)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Invalid Safepay \`environment\` \`${String(
            options.environment
          )}\`. Supported: ${SAFEPAY_ENVIRONMENTS.join(", ")}.`
        )
      }
    }
    if (
      options.intent !== undefined &&
      !DOCUMENTED_INTENTS.includes(options.intent as never)
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Invalid Safepay \`intent\` \`${options.intent}\`. ` +
          `Supported: ${DOCUMENTED_INTENTS.join(", ")}.`
      )
    }
  }

  protected readonly options_: Partial<SafepayProviderOptions>
  private readonly testOptions_?: SafepayProviderTestOptions

  constructor(
    container: Record<string, unknown>,
    options: Partial<SafepayProviderOptions>,
    testOptions?: SafepayProviderTestOptions
  ) {
    super(container as never, options as never)
    this.options_ = options
    this.testOptions_ = testOptions
    if (this.hasCompleteLegacyOptions_()) {
      // Fully-formed legacy env configuration: validate it once at boot.
      SafepayProviderService.validateOptions(options as SafepayProviderOptions)
    }
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<{ id: string; status?: PaymentSessionStatus; data?: Record<string, unknown> }> {
    const config = await this.resolveConfig_()
    this.assertOperational_(config)

    const data = (input.data ?? {}) as ProviderData
    if (!data.session_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Safepay initiatePayment requires data.session_id (injected by the payment module)."
      )
    }

    const amountPaisa = toSafepayAmount(input.amount, input.currency_code)
    const client = this.clientFor_(config)

    const tracker = await client.createTracker({
      amount: amountPaisa,
      currency: "PKR",
      // Safepay's metadata whitelist (verified on the sandbox) rejects
      // arbitrary keys — the Medusa payment session id is carried in the
      // documented `order_id` field.
      metadata: { order_id: data.session_id },
    })

    const checkoutUrl = await this.buildCheckoutUrl_(tracker.token, config)

    return {
      id: tracker.token,
      status: PaymentSessionStatus.PENDING,
      data: {
        tracker: tracker.token,
        checkout_url: checkoutUrl,
        amount: input.amount,
        currency_code: input.currency_code.toLowerCase(),
        environment: config.environment,
      },
    }
  }

  async updatePayment(
    input: UpdatePaymentInput
  ): Promise<{ status?: PaymentSessionStatus; data?: Record<string, unknown> }> {
    // No documented API updates an existing tracker's amount. The native
    // refresh path deletes/recreates sessions; when updatePayment is invoked
    // directly with a changed amount, a fresh tracker is created for the new
    // amount so the customer always pays the authoritative total. Stale
    // unpaid trackers can never complete without customer action; a payment
    // on a stale tracker surfaces via the webhook/reconciliation path.
    return this.initiatePayment(input)
  }

  async deletePayment(
    _input: DeletePaymentInput
  ): Promise<{ data?: Record<string, unknown> }> {
    // A Safepay tracker that has not been paid holds no captured funds and
    // has no documented server-side deletion requirement. Nothing to do.
    return {}
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<{ status: PaymentSessionStatus; data?: Record<string, unknown> }> {
    return this.getPaymentStatus(input)
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<{ status: PaymentSessionStatus; data?: Record<string, unknown> }> {
    const config = await this.resolveConfig_()
    const trackerToken = this.requireTracker_(input.data)
    const tracker = await this.clientFor_(config).fetchTracker(trackerToken)
    return {
      status: this.mapTrackerState_(tracker, input.data),
      data: { ...(input.data ?? {}), safepay_tracker: tracker },
    }
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<{ data?: Record<string, unknown> }> {
    const config = await this.resolveConfig_()
    const trackerToken = this.requireTracker_(input.data)
    const tracker = await this.clientFor_(config).fetchTracker(trackerToken)

    if (!this.isCapturedState_(tracker.state)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Safepay tracker ${trackerToken} is in state ${tracker.state}; ` +
          `Safepay hosted checkout captures funds only on customer completion ` +
          `(auto-capture model) — refusing to record a capture.`
      )
    }

    return { data: { ...(input.data ?? {}), state: tracker.state } }
  }

  async refundPayment(
    input: RefundPaymentInput
  ): Promise<{ data?: Record<string, unknown> }> {
    const config = await this.resolveConfig_()
    const trackerToken = this.requireTracker_(input.data)
    const currencyCode =
      ((input.data as ProviderData | undefined)?.currency_code as
        | string
        | undefined) ?? "pkr"
    const amountPaisa = toSafepayAmount(input.amount, currencyCode)

    const result = (await this.clientFor_(config).refundTracker(
      trackerToken,
      amountPaisa,
      "PKR"
    )) as { tracker?: { state?: string } }

    return {
      data: {
        ...(input.data ?? {}),
        state: result?.tracker?.state,
        refund_amount_paisa: amountPaisa,
      },
    }
  }

  async cancelPayment(
    input: CancelPaymentInput
  ): Promise<{ data?: Record<string, unknown> }> {
    const config = await this.resolveConfig_()
    const trackerToken = this.requireTracker_(input.data)
    const tracker = await this.clientFor_(config).fetchTracker(trackerToken)

    if (this.isCapturedState_(tracker.state)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Safepay tracker ${trackerToken} is already captured (${tracker.state}); ` +
          `captured payments must be refunded, not cancelled (REQ-PAY-012).`
      )
    }

    // Un-paid tracker: Safepay documents no provider-side cancellation for a
    // pending tracker. The cancellation is local only — the tracker cannot
    // complete without customer action on the hosted page. A late
    // payment.succeeded webhook on a cancelled session surfaces through the
    // native pipeline for manual reconciliation (never auto-success).
    return {
      data: {
        ...(input.data ?? {}),
        state: tracker.state,
        provider_cancel: "not_supported_by_safepay",
      },
    }
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<{ data?: Record<string, unknown> }> {
    const config = await this.resolveConfig_()
    const trackerToken = this.requireTracker_(input.data)
    const tracker = await this.clientFor_(config).fetchTracker(trackerToken)
    return { data: { ...(input.data ?? {}), safepay_tracker: tracker } }
  }

  async getWebhookActionAndData(
    webhookData: ProviderWebhookPayloadPayload
  ): Promise<WebhookActionResult> {
    const config = await this.resolveConfig_()

    const event: SafepayWebhookEvent = verifyAndParseWebhook(
      webhookData.rawData,
      webhookData.headers,
      config.webhookSecret
    )

    const sessionId = this.metadataSessionId_(event)
    if (!sessionId) {
      // Events without a Medusa session id did not originate from this
      // integration (mirrors the bundled Stripe provider's guard); the
      // native subscriber ignores not_supported events.
      return { action: PaymentActions.NOT_SUPPORTED }
    }

    switch (event.type) {
      case "payment.succeeded":
        return {
          action: PaymentActions.SUCCESSFUL,
          data: {
            session_id: sessionId,
            amount: fromSafepayAmount(Number(event.data?.amount ?? 0)),
          },
        }
      case "payment.failed":
        return {
          action: PaymentActions.FAILED,
          data: {
            session_id: sessionId,
            amount: fromSafepayAmount(Number(event.data?.amount ?? 0)),
          },
        }
      case "void.succeeded":
        return {
          action: PaymentActions.CANCELED,
          data: {
            session_id: sessionId,
            amount: fromSafepayAmount(Number(event.data?.amount ?? 0)),
          },
        }
      default:
        return { action: PaymentActions.NOT_SUPPORTED }
    }
  }

  /**
   * Admin "Test connection" (approved architecture): performs a safe,
   * non-financial verification call against the configured Safepay
   * environment using the stored credentials (passport token request — it
   * requires valid secret-key authentication and has no financial effect).
   * Throws a sanitized SafepayApiError on failure; never returns secrets.
   */
  async testConnection(): Promise<{ status: "ok"; environment: SafepayEnvironment }> {
    const config = await this.resolveConfig_()
    await this.clientFor_(config).createPassportToken()
    return { status: "ok", environment: config.environment }
  }

  // ---------------------------------------------------------------------------
  // Runtime configuration resolution
  // ---------------------------------------------------------------------------

  private hasCompleteLegacyOptions_(): boolean {
    return LEGACY_OPTION_KEYS.every((key) => Boolean(this.options_[key]))
  }

  private configService_(): {
    getRuntimeConfig(provider: string): Promise<DecryptedProviderConfig>
  } | undefined {
    const container = this.container as Record<string, unknown> | undefined
    if (!container) {
      return undefined
    }
    let service: unknown
    try {
      // The provider's container is the payment module's awilix cradle: every
      // property access is a resolution, and unregistered keys THROW
      // (AwilixResolutionError) — `container.resolve` is not callable there.
      // `payment_config` is declared as a dependency of the payment module
      // (medusa-config.ts), so the cradle resolves it lazily from the app
      // container; when it is absent (tests, legacy setups) we fall through
      // to the legacy env options.
      service = container[PAYMENT_CONFIG_MODULE]
    } catch {
      return undefined
    }
    if (
      !service ||
      typeof (service as { getRuntimeConfig?: unknown }).getRuntimeConfig !==
        "function"
    ) {
      return undefined
    }
    return service as {
      getRuntimeConfig(provider: string): Promise<DecryptedProviderConfig>
    }
  }

  /**
   * Resolves the configuration for the current operation.
   *
   * Precedence (approved architecture): Admin-managed payment-config row >
   * legacy env options (TRANSITIONAL fallback) > fail safely. The Admin row
   * is authoritative once it exists — a partially configured row never falls
   * back to legacy env (no ambiguous dual authority).
   */
  private async resolveConfig_(): Promise<ResolvedSafepayConfig> {
    const configService = this.configService_()
    if (configService?.getRuntimeConfig) {
      try {
        const runtime = await configService.getRuntimeConfig("safepay")
        return this.mapRuntimeConfig_(runtime)
      } catch (error) {
        if (
          error instanceof MedusaError &&
          error.type === MedusaError.Types.NOT_FOUND
        ) {
          // No Admin row yet — fall through to the legacy env options.
        } else {
          throw error
        }
      }
    }

    if (this.hasCompleteLegacyOptions_()) {
      return {
        merchantApiKey: this.options_.merchantApiKey!,
        secretKey: this.options_.secretKey!,
        webhookSecret: this.options_.webhookSecret!,
        environment: this.options_.environment ?? "sandbox",
        redirectUrl: this.options_.redirectUrl ?? "",
        cancelUrl: this.options_.cancelUrl ?? "",
        intent: this.options_.intent,
        enabled: true, // legacy env config is treated as enabled (transitional)
        adminManaged: false,
      }
    }

    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Safepay is not configured. Configure it in the Medusa Admin (Settings → Payment Providers) " +
        "before accepting payments."
    )
  }

  private mapRuntimeConfig_(
    runtime: DecryptedProviderConfig
  ): ResolvedSafepayConfig {
    const { secrets, config, environment, enabled } = runtime
    const merchantApiKey = secrets.merchantApiKey
    const secretKey = secrets.secretKey
    const webhookSecret = secrets.webhookSecret
    if (!merchantApiKey || !secretKey || !webhookSecret) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Safepay is not fully configured (missing required credentials). " +
          "Complete the configuration in the Medusa Admin (Settings → Payment Providers)."
      )
    }
    return {
      merchantApiKey,
      secretKey,
      webhookSecret,
      environment: environment === "production" ? "production" : "sandbox",
      redirectUrl:
        typeof config.redirectUrl === "string" ? config.redirectUrl : "",
      cancelUrl: typeof config.cancelUrl === "string" ? config.cancelUrl : "",
      intent: typeof config.intent === "string" ? config.intent : undefined,
      enabled,
      adminManaged: true,
    }
  }

  /** New payment sessions require an enabled, fully-usable provider. */
  private assertOperational_(config: ResolvedSafepayConfig): void {
    if (!config.enabled) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Safepay is disabled. Enable it in the Medusa Admin (Settings → Payment Providers) " +
          "before accepting new payments."
      )
    }
    if (!config.redirectUrl || !config.cancelUrl) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Safepay is not fully configured: the redirect and cancel URLs are required. " +
          "Complete the configuration in the Medusa Admin (Settings → Payment Providers)."
      )
    }
  }

  private clientFor_(config: ResolvedSafepayConfig): SafepayClient {
    return new SafepayClient({
      environment: config.environment,
      merchantApiKey: config.merchantApiKey,
      secretKey: config.secretKey,
      intent: config.intent ?? DEFAULT_INTENT,
      fetch: this.testOptions_?.fetch,
      retry: this.testOptions_?.retry,
    })
  }

  private async buildCheckoutUrl_(
    tracker: string,
    config: ResolvedSafepayConfig
  ): Promise<string> {
    const client = this.clientFor_(config)
    const tbt = await client.createPassportToken()
    const params = new URLSearchParams({
      environment: config.environment,
      tracker,
      tbt,
      source: "hosted",
      redirect_url: config.redirectUrl,
      cancel_url: config.cancelUrl,
    })
    return `${SafepayClient.checkoutHost(config.environment)}?${params}`
  }

  private requireTracker_(data?: Record<string, unknown>): string {
    const tracker = (data as ProviderData | undefined)?.tracker
    if (!tracker) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "No Safepay tracker token found in payment data."
      )
    }
    return tracker
  }

  private mapTrackerState_(
    tracker: { state?: string; purchase_totals?: { quote_amount?: { currency?: string; amount?: number } } },
    data?: Record<string, unknown>
  ): PaymentSessionStatus {
    switch (tracker.state) {
      case "TRACKER_ENDED":
      case "TRACKER_REFUNDED":
      case "TRACKER_PARTIAL_REFUND":
        return this.verifyAmountOrError_(tracker, data)
      case "TRACKER_STARTED":
        // The customer pays later on Safepay's hosted checkout, so the
        // session is deferred (async payment): complete-cart only proceeds
        // for pending_authorization / authorized — a plain `pending` status
        // throws PAYMENT_AUTHORIZATION_ERROR there.
        return PaymentSessionStatus.PENDING_AUTHORIZATION
      case "TRACKER_VOIDED":
        return PaymentSessionStatus.CANCELED
      default:
        // Unknown provider state — never auto-success (REQ-PAY-21).
        return PaymentSessionStatus.ERROR
    }
  }

  /**
   * A captured tracker must match the session amount and currency exactly;
   * any mismatch is a discrepancy that routes to manual intervention
   * (REQ-PAY-001/021), never an authorized payment.
   */
  private verifyAmountOrError_(
    tracker: { state?: string; purchase_totals?: { quote_amount?: { currency?: string; amount?: number } } },
    data?: Record<string, unknown>
  ): PaymentSessionStatus {
    const quote = tracker.purchase_totals?.quote_amount
    const sessionAmount = (data as ProviderData | undefined)?.amount
    const sessionCurrency = (data as ProviderData | undefined)?.currency_code

    if (
      quote?.currency?.toLowerCase() !== "pkr" ||
      sessionCurrency?.toLowerCase() !== "pkr" ||
      sessionAmount === undefined ||
      quote?.amount !== toSafepayAmount(sessionAmount, sessionCurrency ?? "pkr")
    ) {
      return PaymentSessionStatus.ERROR
    }

    return PaymentSessionStatus.CAPTURED
  }

  private isCapturedState_(state?: string): boolean {
    return (
      state === "TRACKER_ENDED" ||
      state === "TRACKER_REFUNDED" ||
      state === "TRACKER_PARTIAL_REFUND"
    )
  }

  private metadataSessionId_(event: SafepayWebhookEvent): string | undefined {
    const metadata = event.data?.metadata
    if (!metadata || typeof metadata !== "object") {
      return undefined
    }
    const record = metadata as Record<string, unknown>
    // The sandbox rejects arbitrary metadata keys ("unsupported meta key"),
    // so the Medusa session id travels in the documented `order_id` field
    // (verified against the sandbox on 2026-08-17). `session_id` is read as a
    // fallback for trackers created before that change.
    const sessionId =
      typeof record.order_id === "string" && record.order_id.length > 0
        ? record.order_id
        : record.session_id
    return typeof sessionId === "string" && sessionId.length > 0
      ? sessionId
      : undefined
  }
}

export default SafepayProviderService
