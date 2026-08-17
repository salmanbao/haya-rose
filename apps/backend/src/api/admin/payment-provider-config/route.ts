import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"

import {
  PAYMENT_CONFIG_MODULE,
  type PaymentConfigModuleService,
} from "../../../modules/payment-config/service"

/**
 * GET /admin/payment-provider-config
 *
 * Lists the Admin-managed configuration for every known payment provider
 * (Safepay, Stripe) with secrets masked (names only — values are never
 * returned) plus registration status. Protected by the framework's automatic
 * /admin authentication (user actor; bearer/session/api-key).
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const configService = req.scope.resolve(
    PAYMENT_CONFIG_MODULE
  ) as PaymentConfigModuleService

  const views = await configService.listAdminConfigs()

  const registeredKeys = await loadRegisteredProviderKeys(req)

  res.json({
    payment_providers: views.map((view) => ({
      ...view,
      registered: registeredKeys.has(view.provider_key),
    })),
  })
}

/**
 * Returns the set of provider keys that are actually registered in the
 * payment module (i.e. selected via PAYMENT_PROVIDER at boot). A provider
 * that is not registered cannot accept payments regardless of its Admin
 * config — the Admin UI surfaces this so operators know to register it.
 */
export async function loadRegisteredProviderKeys(
  req: AuthenticatedMedusaRequest
): Promise<Set<string>> {
  try {
    const paymentModule = req.scope.resolve(Modules.PAYMENT) as {
      listPaymentProviders: (
        filters?: Record<string, unknown>,
        config?: Record<string, unknown>
      ) => Promise<Array<{ id: string }>>
    }
    const providers = await paymentModule.listPaymentProviders(
      {},
      { select: ["id"] }
    )
    return new Set(providers.map((provider) => provider.id))
  } catch {
    // The payment module is always present in the framework; if it is ever
    // unavailable, treat nothing as registered rather than failing the list.
    return new Set()
  }
}
