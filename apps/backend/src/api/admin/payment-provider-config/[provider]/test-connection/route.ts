import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import {
  PAYMENT_CONFIG_MODULE,
  type PaymentConfigModuleService,
} from "../../../../../modules/payment-config/service"
import {
  getProviderRegistryEntry,
  type ProviderId,
} from "../../../../../modules/payment-config/registry"
import { SafepayProviderService } from "../../../../../modules/payment-safepay/service"
import { StripeRuntimeProviderService } from "../../../../../modules/payment-stripe-runtime/service"
import { loadRegisteredProviderKeys } from "../../route"
import { sanitizeConnectionError } from "../../helpers"
import { ProviderParamSchema } from "../../validators"

/**
 * POST /admin/payment-provider-config/:provider/test-connection
 *
 * Runs a safe, NON-financial credential verification against the provider's
 * configured environment using the stored credentials:
 * - Safepay: `POST /client/passport/v1/token` (requires valid secret-key auth)
 * - Stripe:  `GET /v1/balance` (Bearer secret key)
 *
 * The provider services live inside the payment module's private container
 * (both the `pp_*` and modules-sdk `__providers__*` keys are registered only
 * in that local container — verified in @medusajs/modules-sdk load-internal:
 * loadInternalProvider passes `container: localContainer`), so they are NOT
 * resolvable from request scope. The route therefore constructs the provider
 * service transiently, injecting the payment-config module service the same
 * way the module container would. Registration status is gated through the
 * payment module's public API (DB-backed listPaymentProviders).
 *
 * The check runs server-side; only a sanitized result is returned. Never
 * performs a charge, never creates a financial transaction, never returns
 * secrets or raw provider responses. The outcome (ok/failed + sanitized
 * error) is persisted for the Admin UI.
 */
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { provider } = ProviderParamSchema.parse(req.params)
  const registry = getProviderRegistryEntry(provider)
  if (!registry) {
    res.status(400).json({
      message: `Unknown payment provider \`${provider}\`. Supported: safepay, stripe.`,
    })
    return
  }

  const configService = req.scope.resolve(
    PAYMENT_CONFIG_MODULE
  ) as PaymentConfigModuleService

  const testedAt = new Date()

  // Registration gate: a provider selected via PAYMENT_PROVIDER at boot is
  // registered in the payment module (DB-backed listPaymentProviders).
  const registeredKeys = await loadRegisteredProviderKeys(req)
  if (!registeredKeys.has(registry.providerKey)) {
    const error = `${registry.displayName} is not registered. Add \`${provider}\` to PAYMENT_PROVIDER in the backend environment, then restart, before testing the connection.`
    await configService.recordTestResult(provider, {
      status: "failed",
      error,
    })
    res.json({ status: "failed", error, tested_at: testedAt.toISOString() })
    return
  }

  const providerFactories: Record<
    ProviderId,
    (
      configService: PaymentConfigModuleService
    ) => { testConnection: () => Promise<{ status: string }> }
  > = {
    safepay: (service) =>
      new SafepayProviderService(
        { [PAYMENT_CONFIG_MODULE]: service } as never,
        {}
      ),
    stripe: (service) =>
      new StripeRuntimeProviderService(
        { [PAYMENT_CONFIG_MODULE]: service } as never,
        {}
      ),
  }

  const providerService = providerFactories[registry.id](configService)

  try {
    await providerService.testConnection()
    await configService.recordTestResult(provider, { status: "ok" })
    res.json({ status: "ok", tested_at: testedAt.toISOString() })
  } catch (error) {
    const sanitized = sanitizeConnectionError(error)
    await configService.recordTestResult(provider, {
      status: "failed",
      error: sanitized,
    })
    res.json({ status: "failed", error: sanitized, tested_at: testedAt.toISOString() })
  }
}