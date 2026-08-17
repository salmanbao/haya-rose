/**
 * Pure helpers for the payment-config module — no I/O, fully unit-testable.
 *
 * Security rules enforced here:
 * - Secret values are NEVER included in admin views (names only).
 * - A blank/absent secret in an upsert retains the existing stored value;
 *   a non-blank value replaces (rotates) it.
 * - Enabling a provider requires every required field (public + secret).
 * - Unknown fields/environments are rejected (no silent field invention).
 */

import { MedusaError } from "@medusajs/framework/utils"

import { encryptSecret } from "./encryption"
import {
  type ProviderId,
  type ProviderRegistryEntry,
  getProviderRegistryEntry,
} from "./registry"

export type AdminProviderConfigView = {
  provider: ProviderId
  display_name: string
  enabled: boolean
  environment: string
  market: { name: string; currency: string }
  provider_key: string
  webhook_path: string
  /** Public (non-secret) configuration only. */
  config: Record<string, unknown>
  /** Names of configured secrets — never values. */
  secrets_configured: string[]
  has_webhook_secret: boolean
  /** True when every required field (public + secret) is present. */
  configured: boolean
  /** True when the provider key exists in the payment module (set by the API route). */
  registered: boolean
  last_tested_at: string | null
  last_test_status: "ok" | "failed" | null
  last_test_error: string | null
  created_at: string | null
  updated_at: string | null
}

export type UpsertProviderConfigInput = {
  provider: ProviderId
  enabled?: boolean
  environment?: string
  /** Public config fields (validated against the registry allowlist). */
  config?: Record<string, unknown>
  /**
   * Secret fields. Semantics: undefined or "" → keep existing stored value;
   * non-empty string → replace (rotate). Values are plaintext here ONLY
   * transiently in the API request and are encrypted before persistence.
   */
  secrets?: Record<string, string>
}

/**
 * Validates an upsert payload against the provider registry. Throws
 * MedusaError(INVALID_DATA) with a clear message on unknown providers,
 * unknown fields, or invalid environments. Returns a normalized input.
 */
export function validateUpsertInput(
  rawProvider: string,
  input: UpsertProviderConfigInput
): {
  provider: ProviderId
  enabled?: boolean
  environment?: string
  config: Record<string, unknown>
  secrets: Record<string, string>
} {
  const registry = getProviderRegistryEntry(rawProvider)
  if (!registry) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Unknown payment provider \`${rawProvider}\`. Supported: safepay, stripe.`
    )
  }
  const provider = rawProvider as ProviderId

  let environment: string | undefined
  if (input.environment !== undefined) {
    if (
      !registry.environments.some((env) => env.value === input.environment)
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Invalid \`environment\` \`${input.environment}\` for ${registry.displayName}. ` +
          `Supported: ${registry.environments.map((e) => e.value).join(", ")}.`
      )
    }
    environment = input.environment
  }

  const configFields = new Set(registry.configFields.map((f) => f.key))
  const secretFields = new Set(registry.secretFields.map((f) => f.key))

  const config: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input.config ?? {})) {
    if (!configFields.has(key)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unknown configuration field \`${key}\` for ${registry.displayName}.`
      )
    }
    const field = registry.configFields.find((f) => f.key === key)!
    if (field.kind === "boolean" && field.options) {
      // Options-based booleans accept the option values only, and are
      // normalized to real booleans so the runtime sees `true`/`false`.
      if (value === "") {
        continue // Blank public fields are simply not written.
      }
      if (!field.options.some((option) => option.value === String(value))) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Invalid value \`${value}\` for \`${field.key}\` of ${registry.displayName}. ` +
            `Supported: ${field.options.map((o) => o.value).join(", ")}.`
        )
      }
      config[key] = value === true || value === "true"
    } else if (field.kind === "boolean") {
      config[key] =
        value === true ||
        value === "true" ||
        value === 1 ||
        value === "1"
    } else if (typeof value === "string" && value.length > 0) {
      if (
        field.options &&
        !field.options.some((option) => option.value === value)
      ) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Invalid value \`${value}\` for \`${field.key}\` of ${registry.displayName}. ` +
            `Supported: ${field.options.map((o) => o.value).join(", ")}.`
        )
      }
      config[key] = value
    }
    // Blank/absent public fields are simply not written.
  }

  const secrets: Record<string, string> = {}
  for (const [key, value] of Object.entries(input.secrets ?? {})) {
    if (!secretFields.has(key)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unknown secret field \`${key}\` for ${registry.displayName}.`
      )
    }
    if (typeof value === "string" && value.length > 0) {
      secrets[key] = value
    }
    // Blank secret → keep existing (handled by applySecretInput).
  }

  if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `\`enabled\` must be a boolean for ${registry.displayName}.`
    )
  }

  return {
    provider,
    enabled: input.enabled,
    environment,
    config,
    secrets,
  }
}

/**
 * Merges plaintext secret input into the stored encrypted map.
 * - non-empty input value → encrypt and store
 * - absent/blank input value → retain the existing encrypted value
 * Returns the new map of encrypted secrets (field → `v1:…`).
 */
export function applySecretInput(
  existing: Record<string, unknown> | null | undefined,
  secretsInput: Record<string, string>,
  key: Buffer,
  registry: ProviderRegistryEntry
): Record<string, string> {
  const result: Record<string, string> = {}
  const secretKeys = registry.secretFields.map((f) => f.key)

  for (const field of secretKeys) {
    const incoming = secretsInput[field]
    // Non-empty input replaces (rotates) the secret. Blank/absent input
    // retains the existing stored value — a normal form submission must
    // never clear a secret accidentally.
    if (incoming !== undefined && incoming.length > 0) {
      result[field] = encryptSecret(incoming, key)
      continue
    }
    const stored = existing?.[field]
    if (typeof stored === "string" && stored.length > 0) {
      result[field] = stored
    }
  }
  return result
}

/** Names of the secrets currently stored (values are never exposed). */
export function configuredSecretNames(
  encryptedSecrets: Record<string, unknown> | null | undefined
): string[] {
  return Object.entries(encryptedSecrets ?? {})
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .map(([name]) => name)
    .sort()
}

/**
 * Builds the Admin-safe view of a stored config row. No decryption happens
 * here; the view carries field names and booleans only.
 */
export function buildAdminView(input: {
  provider: string
  enabled: boolean
  environment: string | null
  config: Record<string, unknown> | null
  secrets: Record<string, unknown> | null
  last_tested_at: string | Date | null
  last_test_status: string | null
  last_test_error: string | null
  created_at: string | Date | null
  updated_at: string | Date | null
  registered?: boolean
}): AdminProviderConfigView {
  const registry = getProviderRegistryEntry(input.provider)
  if (!registry) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Unknown payment provider \`${input.provider}\`.`
    )
  }

  const secretNames = configuredSecretNames(input.secrets)
  const requiredSecretKeys = registry.secretFields
    .filter((f) => f.required)
    .map((f) => f.key)
  const requiredConfigKeys = registry.configFields
    .filter((f) => f.required)
    .map((f) => f.key)

  const hasAllRequiredSecrets = requiredSecretKeys.every((key) =>
    secretNames.includes(key)
  )
  const hasAllRequiredConfig = requiredConfigKeys.every((key) =>
    Boolean(input.config?.[key])
  )

  return {
    provider: input.provider as ProviderId,
    display_name: registry.displayName,
    enabled: input.enabled,
    environment: input.environment ?? registry.defaultEnvironment,
    market: registry.market,
    provider_key: registry.providerKey,
    webhook_path: registry.webhookPath,
    config: input.config ?? {},
    secrets_configured: secretNames,
    has_webhook_secret: secretNames.includes("webhookSecret"),
    configured: hasAllRequiredSecrets && hasAllRequiredConfig,
    registered: input.registered ?? false,
    last_tested_at: input.last_tested_at
      ? new Date(input.last_tested_at).toISOString()
      : null,
    last_test_status:
      input.last_test_status === "ok" || input.last_test_status === "failed"
        ? input.last_test_status
        : null,
    last_test_error: input.last_test_error,
    created_at: input.created_at
      ? new Date(input.created_at).toISOString()
      : null,
    updated_at: input.updated_at
      ? new Date(input.updated_at).toISOString()
      : null,
  }
}
