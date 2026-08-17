import { z } from "@medusajs/framework/zod"

/**
 * Admin payload validation for payment-provider configuration.
 *
 * Provider-specific field allowlists (which fields exist, which are secrets,
 * which environments are valid) live in the payment-config module registry —
 * this schema only enforces the wire types. The module is the single
 * validation boundary for provider semantics (no duplicated rules).
 */
export const UpsertProviderConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    environment: z.string().min(1).max(64).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    secrets: z.record(z.string(), z.string()).optional(),
  })
  .strict()

export type UpsertProviderConfigPayload = z.infer<
  typeof UpsertProviderConfigSchema
>

export const ProviderParamSchema = z.object({
  provider: z.string().min(1).max(64),
})
