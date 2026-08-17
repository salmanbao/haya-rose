import { model } from "@medusajs/framework/utils"

/**
 * Runtime configuration for an Admin-managed payment provider.
 *
 * - `config` holds public (non-secret) settings only.
 * - `secrets` holds AES-256-GCM encrypted values (`v1:iv:tag:ciphertext`);
 *   they are decrypted only inside the module service for runtime use and
 *   are never exposed through any API.
 * - `enabled` gates new payment sessions (provider-level eligibility).
 *
 * PostgreSQL is the authoritative persistent store; Redis is never used for
 * credentials.
 */
const PaymentProviderConfig = model.define(
  { name: "PaymentProviderConfig", tableName: "payment_provider_config" },
  {
    id: model.id({ prefix: "pc" }).primaryKey(),
    provider: model.text().unique(),
    enabled: model.boolean().default(false),
    environment: model.text().nullable(),
    config: model.json().nullable(),
    secrets: model.json().nullable(),
    last_tested_at: model.dateTime().nullable(),
    last_test_status: model.text().nullable(),
    last_test_error: model.text().nullable(),
  }
)

export default PaymentProviderConfig
