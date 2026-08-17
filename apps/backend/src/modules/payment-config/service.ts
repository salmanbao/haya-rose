/**
 * Payment-config module service.
 *
 * Owns the secure, persistent, Admin-managed configuration of payment
 * providers (Safepay, Stripe). PostgreSQL is the source of truth; secret
 * values are encrypted at rest (AES-256-GCM) and decrypted only here, on
 * demand, for the payment providers' runtime use. No API ever receives
 * decrypted secrets.
 *
 * Public methods:
 * - getRuntimeConfig(provider)      → decrypted config for provider runtime
 * - listAdminConfigs() / getAdminConfig() → masked Admin views (no values)
 * - upsertConfig(...)               → create/update with keep-on-blank secrets
 * - recordTestResult(...)           → persist test-connection outcome + audit
 */

import { MedusaError, MedusaService } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

import PaymentProviderConfig from "./models/provider-config"
import PaymentProviderConfigAudit from "./models/provider-config-audit"
import {
  decryptSecret,
  deriveEncryptionKey,
} from "./encryption"
import {
  PAYMENT_PROVIDER_IDS,
  getProviderRegistryEntry,
} from "./registry"
import {
  type AdminProviderConfigView,
  type UpsertProviderConfigInput,
  applySecretInput,
  buildAdminView,
  configuredSecretNames,
  validateUpsertInput,
} from "./utils"

export const PAYMENT_CONFIG_MODULE = "payment_config"

export type DecryptedProviderConfig = {
  provider: "safepay" | "stripe"
  enabled: boolean
  environment: string
  /** Public (non-secret) configuration. */
  config: Record<string, unknown>
  /** Decrypted secrets — server-side runtime use only. */
  secrets: Record<string, string>
}

type ConfigRow = {
  id: string
  provider: string
  enabled: boolean
  environment: string | null
  config: Record<string, unknown> | null
  secrets: Record<string, unknown> | null
  last_tested_at: string | Date | null
  last_test_status: string | null
  last_test_error: string | null
  created_at: string | Date
  updated_at: string | Date
}

type AuditInput = {
  provider: string
  action: string
  actor?: string | null
  environment?: string | null
  changedFields: string[]
}

export class PaymentConfigModuleService extends MedusaService({
  PaymentProviderConfig,
  PaymentProviderConfigAudit,
}) {
  private encryptionKey_: ReturnType<typeof deriveEncryptionKey> | undefined

  constructor(...args: unknown[]) {
    super(...args as [never])
  }

  private get encryptionKey() {
    if (!this.encryptionKey_) {
      this.encryptionKey_ = deriveEncryptionKey(
        process.env.PAYMENT_CONFIG_ENCRYPTION_KEY
      )
    }
    return this.encryptionKey_
  }

  /**
   * Returns the decrypted runtime configuration for a provider. Throws a
   * NOT_FOUND MedusaError when no configuration exists yet — providers treat
   * that as "not configured" and fail safely.
   */
  async getRuntimeConfig(provider: string): Promise<DecryptedProviderConfig> {
    const registry = getProviderRegistryEntry(provider)
    if (!registry) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unknown payment provider \`${provider}\`.`
      )
    }
    const [row] = await this.listPaymentProviderConfigs({ provider })
    if (!row) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Payment provider \`${provider}\` is not configured. Configure it in the Admin (Settings → Payment Providers) before accepting payments.`
      )
    }
    return this.toDecryptedConfig_(row as unknown as ConfigRow)
  }

  private toDecryptedConfig_(row: ConfigRow): DecryptedProviderConfig {
    const secrets: Record<string, string> = {}
    for (const [name, payload] of Object.entries(row.secrets ?? {})) {
      if (typeof payload === "string" && payload.length > 0) {
        secrets[name] = decryptSecret(payload, this.encryptionKey)
      }
    }
    return {
      provider: row.provider as "safepay" | "stripe",
      enabled: row.enabled,
      environment: row.environment ?? "",
      config: row.config ?? {},
      secrets,
    }
  }

  /** Masked admin views for every known provider (never includes values). */
  async listAdminConfigs(): Promise<AdminProviderConfigView[]> {
    const rows = (await this.listPaymentProviderConfigs({}, { take: null })) as unknown as ConfigRow[]
    const byProvider = new Map(rows.map((row) => [row.provider, row]))
    return PAYMENT_PROVIDER_IDS.map((provider) => {
      const row = byProvider.get(provider)
      return buildAdminView({
        provider,
        enabled: row?.enabled ?? false,
        environment: row?.environment ?? null,
        config: row?.config ?? null,
        secrets: row?.secrets ?? null,
        last_tested_at: row?.last_tested_at ?? null,
        last_test_status: row?.last_test_status ?? null,
        last_test_error: row?.last_test_error ?? null,
        created_at: row?.created_at ?? null,
        updated_at: row?.updated_at ?? null,
      })
    })
  }

  async getAdminConfig(provider: string): Promise<AdminProviderConfigView> {
    const registry = getProviderRegistryEntry(provider)
    if (!registry) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Unknown payment provider \`${provider}\`.`
      )
    }
    const [row] = await this.listPaymentProviderConfigs({ provider })
    return buildAdminView({
      provider,
      enabled: row?.enabled ?? false,
      environment: row?.environment ?? null,
      config: row?.config ?? null,
      secrets: row?.secrets ?? null,
      last_tested_at: row?.last_tested_at ?? null,
      last_test_status: row?.last_test_status ?? null,
      last_test_error: row?.last_test_error ?? null,
      created_at: row?.created_at ?? null,
      updated_at: row?.updated_at ?? null,
    })
  }

  /**
   * Creates or updates a provider configuration. Blank/absent secret values
   * retain the stored secret; a non-blank value rotates it. Enabling a
   * provider requires every required field to be present. Records a sanitized
   * audit entry (field names only — never values).
   */
  async upsertConfig(
    rawProvider: string,
    input: UpsertProviderConfigInput,
    actor?: string
  ): Promise<AdminProviderConfigView> {
    const { provider, enabled, environment, config, secrets } =
      validateUpsertInput(rawProvider, input)
    const registry = getProviderRegistryEntry(provider)!

    const [existing] = (await this.listPaymentProviderConfigs({
      provider,
    })) as unknown as ConfigRow[]

    const newSecrets = applySecretInput(
      existing?.secrets ?? null,
      secrets,
      this.encryptionKey,
      registry
    )
    const newConfig: Record<string, unknown> = {
      ...(existing?.config ?? {}),
      ...config,
    }
    const newEnvironment = environment ?? existing?.environment ?? null
    const newEnabled = enabled ?? existing?.enabled ?? false

    const view = buildAdminView({
      provider,
      enabled: newEnabled,
      environment: newEnvironment,
      config: newConfig,
      secrets: newSecrets,
      last_tested_at: existing?.last_tested_at ?? null,
      last_test_status: existing?.last_test_status ?? null,
      last_test_error: existing?.last_test_error ?? null,
      created_at: existing?.created_at ?? null,
      updated_at: existing?.updated_at ?? null,
    })

    if (newEnabled && !view.configured) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Cannot enable ${registry.displayName}: all required fields must be configured ` +
          `(missing: ${this.missingRequired_(newConfig, newSecrets, registry).join(", ")}).`
      )
    }

    const changedFields = this.changedFields_(
      existing,
      { enabled: newEnabled, environment: newEnvironment, config: newConfig, secrets: newSecrets },
      registry
    )

    if (existing) {
      await this.updatePaymentProviderConfigs({
        id: existing.id,
        enabled: newEnabled,
        environment: newEnvironment,
        config: newConfig,
        secrets: newSecrets,
      })
    } else {
      await this.createPaymentProviderConfigs({
        provider,
        enabled: newEnabled,
        environment: newEnvironment,
        config: newConfig,
        secrets: newSecrets,
      })
    }

    await this.recordAudit_({
      provider,
      action: existing ? "updated" : "created",
      actor: actor ?? null,
      environment: newEnvironment,
      changedFields,
    })

    return this.getAdminConfig(provider)
  }

  /**
   * Persists the outcome of a provider connection test. The error message is
   * sanitized by the caller (provider modules) — never a raw provider
   * response, never a secret.
   */
  async recordTestResult(
    provider: string,
    result: { status: "ok" | "failed"; error?: string }
  ): Promise<void> {
    const [existing] = (await this.listPaymentProviderConfigs({
      provider,
    })) as unknown as ConfigRow[]
    if (!existing) {
      // Still record the attempt for visibility.
      await this.createPaymentProviderConfigs({
        provider,
        enabled: false,
        environment: null,
        config: {},
        secrets: {},
        last_tested_at: new Date(),
        last_test_status: result.status,
        last_test_error: result.error ?? null,
      })
    } else {
      await this.updatePaymentProviderConfigs({
        id: existing.id,
        last_tested_at: new Date(),
        last_test_status: result.status,
        last_test_error: result.error ?? null,
      })
    }
    await this.recordAudit_({
      provider,
      action: "test_connection",
      actor: null,
      environment: existing?.environment ?? null,
      changedFields: ["last_test_status"],
    })
  }

  async listAudits(provider?: string) {
    return this.listPaymentProviderConfigAudits(
      provider ? { provider } : {},
      { take: 50, order: { created_at: "DESC" } }
    )
  }

  private missingRequired_(
    config: Record<string, unknown>,
    secrets: Record<string, unknown>,
    registry: ReturnType<typeof getProviderRegistryEntry> & {}
  ): string[] {
    const missing: string[] = []
    for (const field of registry.configFields) {
      if (field.required && !config[field.key]) {
        missing.push(field.key)
      }
    }
    const secretNames = configuredSecretNames(secrets)
    for (const field of registry.secretFields) {
      if (field.required && !secretNames.includes(field.key)) {
        missing.push(field.key)
      }
    }
    return missing
  }

  private changedFields_(
    existing: ConfigRow | null,
    next: {
      enabled: boolean
      environment: string | null
      config: Record<string, unknown>
      secrets: Record<string, unknown>
    },
    registry: ReturnType<typeof getProviderRegistryEntry> & {}
  ): string[] {
    const changed = new Set<string>()
    if (!existing) {
      return [
        "enabled",
        "environment",
        ...registry.configFields.map((f) => f.key),
        ...registry.secretFields.map((f) => f.key),
      ]
    }
    if (existing.enabled !== next.enabled) {
      changed.add("enabled")
    }
    if ((existing.environment ?? null) !== next.environment) {
      changed.add("environment")
    }
    for (const field of registry.configFields) {
      if ((existing.config?.[field.key] ?? undefined) !== next.config[field.key]) {
        changed.add(field.key)
      }
    }
    const oldSecretNames = new Set(configuredSecretNames(existing.secrets))
    const newSecretNames = new Set(configuredSecretNames(next.secrets))
    for (const field of registry.secretFields) {
      if (oldSecretNames.has(field.key) !== newSecretNames.has(field.key)) {
        changed.add(field.key)
      }
    }
    return [...changed].sort()
  }

  private async recordAudit_(input: AuditInput): Promise<void> {
    await this.createPaymentProviderConfigAudits({
      provider: input.provider,
      action: input.action,
      actor: input.actor ?? null,
      environment: input.environment ?? null,
      // JSON column typed as Record<string, unknown> by DML; the audit stores
      // field NAMES only (never values) as an array under `fields`.
      changed_fields: {
        fields: input.changedFields,
      } as unknown as Record<string, unknown>,
    })
  }
}

export default PaymentConfigModuleService
