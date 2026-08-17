/**
 * Stripe (UAE/AED) payment provider — runtime-configuration wrapper
 * (approved architecture 2026-08-17: Admin-managed provider configuration).
 *
 * The official `@medusajs/payment-stripe` provider requires `apiKey` at
 * construction time (verified in its `stripe-base` source: the constructor
 * instantiates the Stripe client immediately), so it cannot be registered
 * with credentials that only exist at runtime. This thin wrapper:
 *
 * - keeps the exact provider key `pp_stripe_stripe` (`identifier = "stripe"`
 *   + registered with `id: "stripe"`), preserving the native webhook route
 *   `POST /hooks/payment/stripe_stripe`, region bindings, seed-markets
 *   binding, and the storefront contract;
 * - resolves its configuration from the payment-config module (encrypted at
 *   rest in PostgreSQL) on every operation, with the legacy env options as a
 *   TRANSITIONAL fallback (precedence: Admin config > legacy env);
 * - constructs the official `StripeProviderService` lazily — only when
 *   configuration exists — and delegates the full IPaymentProvider contract
 *   to it (no re-implementation of Stripe logic);
 * - gates NEW payment sessions on the Admin `enabled` flag and fails safely
 *   (never falls back to another provider) when disabled or unconfigured;
 * - keeps webhook signature verification working for in-flight sessions
 *   (verification only needs the stored webhook secret, not `enabled`).
 *
 * Stripe contract facts (verified via Context7 official Stripe docs):
 * - API auth: `Authorization: Bearer <secret key>`; test mode = `sk_test_*`.
 * - PaymentIntent lifecycle: create → confirm → (manual) capture per
 *   T-PAY-03, or automatic capture when configured.
 * - Webhooks: `Stripe-Signature` header, verified by
 *   `stripe.webhooks.constructEvent` with the endpoint signing secret
 *   (default 5-minute timestamp tolerance — replay protection).
 * - Safe credential check for "Test connection": `GET /v1/balance`
 *   (non-financial; returns 401 for invalid keys).
 */

import { AbstractPaymentProvider, MedusaError } from "@medusajs/framework/utils"
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types"
// The official Stripe provider service class is only published under the
// package's dist subpath (the package root exports only the ModuleProvider
// default) — this delegation is the supported way to reuse the verified
// official implementation with runtime-managed credentials.
// eslint-disable-next-line @medusajs/import-from-framework-not-internal
import { StripeProviderService } from "@medusajs/payment-stripe/dist/services"

import {
  PAYMENT_CONFIG_MODULE,
  type DecryptedProviderConfig,
} from "../payment-config/service"

const STRIPE_API_BASE = "https://api.stripe.com/v1"
const STRIPE_API_VERSION = "2025-03-31.basil"

export type StripeRuntimeOptions = {
  apiKey?: string
  webhookSecret?: string
  capture?: boolean
}

type ResolvedStripeConfig = {
  options: StripeRuntimeOptions
  enabled: boolean
  adminManaged: boolean
}

/** Test seam: dependency injection for unit tests (never set in production). */
export type StripeRuntimeTestOptions = {
  fetch?: typeof fetch
}

export class StripeRuntimeProviderService extends AbstractPaymentProvider<StripeRuntimeOptions> {
  static identifier = "stripe"

  private readonly options_: StripeRuntimeOptions
  private readonly fetchImpl_: typeof fetch
  private inner_: StripeProviderService | null = null
  private innerFingerprint_ = ""

  constructor(
    container: Record<string, unknown>,
    options: StripeRuntimeOptions,
    testOptions?: StripeRuntimeTestOptions
  ) {
    super(container as never, options as never)
    this.options_ = options
    this.fetchImpl_ = testOptions?.fetch ?? fetch
  }

  async initiatePayment(
    input: InitiatePaymentInput
  ): Promise<InitiatePaymentOutput> {
    const inner = await this.requireOperational_()
    return inner.initiatePayment(input)
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    const inner = await this.requireOperational_()
    return inner.updatePayment(input)
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    const inner = await this.getInner_()
    return inner.deletePayment(input)
  }

  async authorizePayment(
    input: AuthorizePaymentInput
  ): Promise<AuthorizePaymentOutput> {
    const inner = await this.getInner_()
    return inner.authorizePayment(input)
  }

  async capturePayment(
    input: CapturePaymentInput
  ): Promise<CapturePaymentOutput> {
    const inner = await this.getInner_()
    return inner.capturePayment(input)
  }

  async refundPayment(
    input: RefundPaymentInput
  ): Promise<RefundPaymentOutput> {
    const inner = await this.getInner_()
    return inner.refundPayment(input)
  }

  async retrievePayment(
    input: RetrievePaymentInput
  ): Promise<RetrievePaymentOutput> {
    const inner = await this.getInner_()
    return inner.retrievePayment(input)
  }

  async cancelPayment(
    input: CancelPaymentInput
  ): Promise<CancelPaymentOutput> {
    const inner = await this.getInner_()
    return inner.cancelPayment(input)
  }

  async getPaymentStatus(
    input: GetPaymentStatusInput
  ): Promise<GetPaymentStatusOutput> {
    const inner = await this.getInner_()
    return inner.getPaymentStatus(input)
  }

  async getWebhookActionAndData(
    webhookData: ProviderWebhookPayload["payload"]
  ): Promise<WebhookActionResult> {
    // Webhook verification must keep working for in-flight sessions even
    // when the provider is disabled — it only needs the stored secret.
    const inner = await this.getInner_()
    return inner.getWebhookActionAndData(webhookData)
  }

  /**
   * Admin "Test connection": safe, non-financial credential check via
   * `GET /v1/balance` (verified Stripe contract). Returns a sanitized result;
   * never returns the key or the raw response body.
   */
  async testConnection(): Promise<{ status: "ok" }> {
    const { options } = await this.resolveConfig_()
    if (!options.apiKey) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Stripe is not fully configured (missing secret key). Complete the configuration in the Medusa Admin."
      )
    }
    let response: Response
    try {
      response = await this.fetchImpl_(`${STRIPE_API_BASE}/balance`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Stripe-Version": STRIPE_API_VERSION,
        },
      })
    } catch (error) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Stripe connection test failed: unable to reach Stripe (${
          error instanceof Error ? error.message : "network error"
        }).`
      )
    }
    if (!response.ok) {
      const status = response.status
      const reason =
        status === 401 || status === 403
          ? "authentication rejected (invalid secret key)"
          : `Stripe returned HTTP ${status}`
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Stripe connection test failed: ${reason}.`
      )
    }
    return { status: "ok" }
  }

  // ---------------------------------------------------------------------------
  // Runtime configuration resolution
  // ---------------------------------------------------------------------------

  private hasLegacyOptions_(): boolean {
    return Boolean(this.options_.apiKey)
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
   * Precedence (approved architecture): Admin-managed payment-config row >
   * legacy env options (TRANSITIONAL fallback) > fail safely. An Admin row,
   * once present, is authoritative (no ambiguous dual authority).
   */
  private async resolveConfig_(): Promise<ResolvedStripeConfig> {
    const configService = this.configService_()
    if (configService?.getRuntimeConfig) {
      try {
        const runtime = await configService.getRuntimeConfig("stripe")
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

    if (this.hasLegacyOptions_()) {
      return {
        options: {
          apiKey: this.options_.apiKey,
          webhookSecret: this.options_.webhookSecret,
          capture: this.options_.capture,
        },
        enabled: true, // legacy env config is treated as enabled (transitional)
        adminManaged: false,
      }
    }

    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Stripe is not configured. Configure it in the Medusa Admin (Settings → Payment Providers) " +
        "before accepting payments."
    )
  }

  private mapRuntimeConfig_(
    runtime: DecryptedProviderConfig
  ): ResolvedStripeConfig {
    const { secrets, config, enabled } = runtime
    return {
      options: {
        apiKey: secrets.secretKey,
        webhookSecret: secrets.webhookSecret,
        capture: config.capture === true,
      },
      enabled,
      adminManaged: true,
    }
  }

  private async getInner_(): Promise<StripeProviderService> {
    const { options } = await this.resolveConfig_()
    if (!options.apiKey) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Stripe is not fully configured (missing required credentials). " +
          "Complete the configuration in the Medusa Admin (Settings → Payment Providers)."
      )
    }
    const fingerprint = JSON.stringify(options)
    if (!this.inner_ || this.innerFingerprint_ !== fingerprint) {
      // Constructed lazily — never at boot — so credentials can be managed
      // at runtime through the Admin without a restart.
      this.inner_ = new StripeProviderService(
        this.container as Record<string, unknown>,
        options
      )
      this.innerFingerprint_ = fingerprint
    }
    return this.inner_
  }

  /** New payment sessions require an enabled provider with credentials. */
  private async requireOperational_(): Promise<StripeProviderService> {
    const { enabled } = await this.resolveConfig_()
    if (!enabled) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Stripe is disabled. Enable it in the Medusa Admin (Settings → Payment Providers) " +
          "before accepting new payments."
      )
    }
    return this.getInner_()
  }
}

export default StripeRuntimeProviderService
