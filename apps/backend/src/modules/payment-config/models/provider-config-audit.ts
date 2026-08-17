import { model } from "@medusajs/framework/utils"

/**
 * Sanitized audit trail for payment-provider configuration changes
 * (AGENTS.md §19; approved payment-config architecture 2026-08-17).
 *
 * NEVER stores secret values — `changed_fields` carries field NAMES only
 * (e.g. ["secretKey", "environment"]), never values, never headers.
 */
const PaymentProviderConfigAudit = model.define(
  {
    name: "PaymentProviderConfigAudit",
    tableName: "payment_provider_config_audit",
  },
  {
    id: model.id({ prefix: "pca" }).primaryKey(),
    provider: model.text(),
    action: model.text(),
    actor: model.text().nullable(),
    environment: model.text().nullable(),
    changed_fields: model.json().nullable(),
  }
)

export default PaymentProviderConfigAudit
