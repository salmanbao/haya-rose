import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows"

import {
  PAYMENT_CONFIG_MODULE,
  type PaymentConfigModuleService,
} from "../../../../modules/payment-config/service"
import { getProviderRegistryEntry } from "../../../../modules/payment-config/registry"
import { computeRegionBindingUpdate } from "../helpers"
import { loadRegisteredProviderKeys } from "../route"
import {
  ProviderParamSchema,
  UpsertProviderConfigSchema,
} from "../validators"

/**
 * GET /admin/payment-provider-config/:provider
 * POST /admin/payment-provider-config/:provider
 *
 * GET returns the masked admin view for one provider (secrets as names only).
 *
 * POST creates/updates the provider configuration:
 * - blank/absent secret fields retain the stored value (rotation only on
 *   explicit non-blank input);
 * - enabling requires every required field to be configured;
 * - when the provider is registered, the native region↔provider binding is
 *   synced so the storefront stops/start offering the provider in its market;
 * - a sanitized audit entry is recorded (field names, never values).
 *
 * Never returns secret values. Protected by the framework's automatic
 * /admin authentication (user actor).
 */
export async function GET(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { provider } = ProviderParamSchema.parse(req.params)
  const configService = req.scope.resolve(
    PAYMENT_CONFIG_MODULE
  ) as PaymentConfigModuleService

  const view = await configService.getAdminConfig(provider)
  const registeredKeys = await loadRegisteredProviderKeys(req)
  res.json({ payment_provider: { ...view, registered: registeredKeys.has(view.provider_key) } })
}

export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const { provider } = ProviderParamSchema.parse(req.params)
  const parsed = UpsertProviderConfigSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    res.status(400).json({
      message: `Invalid payment provider configuration: ${parsed.error.issues
        .map((issue) => issue.path.join(".") || "body")
        .join(", ")}`,
    })
    return
  }

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

  const actorId = req.auth_context?.actor_id
  const view = await configService.upsertConfig(
    provider,
    {
      provider: provider as "safepay" | "stripe",
      enabled: parsed.data.enabled,
      environment: parsed.data.environment,
      config: parsed.data.config,
      secrets: parsed.data.secrets,
    },
    actorId
  )

  const registeredKeys = await loadRegisteredProviderKeys(req)
  const registered = registeredKeys.has(view.provider_key)
  const responseView = { ...view, registered }

  if (registered) {
    await syncRegionBinding(req, registry.market.regionName, registry.providerKey, view.enabled)
  }

  res.json({ payment_provider: responseView })
}

/**
 * Binds/unbinds the provider's market region (native region_payment_provider
 * link) to match the Admin `enabled` flag. Idempotent; only ever touches the
 * provider's own market region (cross-market isolation preserved).
 */
async function syncRegionBinding(
  req: AuthenticatedMedusaRequest,
  regionName: string,
  providerKey: string,
  enabled: boolean
): Promise<void> {
  const container = req.scope
  const regionModule = container.resolve(Modules.REGION) as {
    listRegions: (
      filters: Record<string, unknown>
    ) => Promise<Array<{ id: string; payment_providers?: Array<{ id: string }> }>>
  }

  const [region] = await regionModule.listRegions({ name: regionName })
  if (!region) {
    return
  }
  const [regionRecord] = await regionModule.listRegions({ id: region.id })
  const bound = (regionRecord?.payment_providers ?? []).map(
    (provider: { id: string }) => provider.id
  )
  const next = computeRegionBindingUpdate(bound, providerKey, enabled)
  if (next.join(",") !== bound.join(",")) {
    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: region.id },
        update: { payment_providers: next },
      },
    })
  }
}
