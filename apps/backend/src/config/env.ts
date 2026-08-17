import { MedusaError } from "@medusajs/framework/utils"

/**
 * Backend environment configuration validation (Foundation).
 *
 * AGENTS.md §15 requires validating env vars at the application boundary.
 * `medusa-config.ts` dereferences several variables directly; a missing
 * variable currently fails later with a cryptic error. This module fails
 * fast at startup with a clear message listing exactly what is missing.
 *
 * Scope note: this validates *presence* of required configuration. It does
 * not implement business rules and never holds values (secrets stay in the
 * environment). The integration-test runner loads `medusa-config.ts` and
 * provides its own database connection, so callers must skip validation
 * when `NODE_ENV === "test"` (see `medusa-config.ts`).
 */

/** Variables required for the backend to boot in any environment. */
export const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "REDIS_URL",
  "STORE_CORS",
  "ADMIN_CORS",
  "AUTH_CORS",
  "JWT_SECRET",
  "COOKIE_SECRET",
  "AUTH_MFA_ENCRYPTION_KEY",
  // Master key for AES-256-GCM encryption of Admin-managed payment-provider
  // secrets at rest (payment-config module). Provider credentials themselves
  // are managed through the Admin UI — only this key stays in the
  // environment (approved architecture 2026-08-17).
  "PAYMENT_CONFIG_ENCRYPTION_KEY",
] as const

/**
 * Variables required when the S3-compatible storage provider (Cloudflare R2)
 * is selected via `FILE_PROVIDER=s3` in `medusa-config.ts`.
 */
export const S3_REQUIRED_ENV_VARS = [
  "S3_FILE_URL",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ENDPOINT",
] as const

/**
 * TRANSITIONAL legacy Stripe provider variables (approved architecture
 * 2026-08-17): provider credentials are now managed through the Admin UI
 * (payment-config module, encrypted at rest) — they are NOT required for
 * boot anymore. These names remain supported as a bootstrap/backward-
 * compatibility fallback with an explicit precedence:
 *   Admin-managed configuration > legacy environment configuration
 * See docs/specifications/payments.md (Admin-managed provider configuration).
 * `STRIPE_PUBLISHABLE_KEY` is non-secret client config; the storefront reads
 * its own copy from its env.
 */
export const LEGACY_STRIPE_ENV_VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const

/**
 * TRANSITIONAL legacy Safepay provider variables — same migration policy as
 * LEGACY_STRIPE_ENV_VARS. Names map to the verified Safepay contract
 * (docs/architecture/provider-verification/safepay-verification.md).
 */
export const LEGACY_SAFEPAY_ENV_VARS = [
  "SAFEPAY_MERCHANT_API_KEY",
  "SAFEPAY_SECRET_KEY",
  "SAFEPAY_WEBHOOK_SECRET",
  "SAFEPAY_ENVIRONMENT",
  "SAFEPAY_REDIRECT_URL",
  "SAFEPAY_CANCEL_URL",
] as const

/**
 * Variables required when the Google OAuth customer-auth provider is enabled
 * via `AUTH_GOOGLE_ENABLED=true` in `medusa-config.ts` (BD-AUTH-03: Google is
 * wired env-gated; the storefront only offers Google sign-in when the backend
 * has registered the provider — verified via GET /auth/customer/providers).
 *
 * Names only — values stay in the environment.
 */
export const GOOGLE_AUTH_REQUIRED_ENV_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALLBACK_URL",
] as const

/**
 * Returns the names of required variables that are missing or empty.
 * Pure function — unit-testable without touching `process.env`.
 */
export function getMissingEnvVars(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const missing: string[] = REQUIRED_ENV_VARS.filter((key) => !env[key])

  if (env.FILE_PROVIDER === "s3") {
    missing.push(...S3_REQUIRED_ENV_VARS.filter((key) => !env[key]))
  }

  // PAYMENT_PROVIDER still selects which providers are REGISTERED in
  // medusa-config.ts (infrastructure choice). Provider credentials are no
  // longer required in the environment — they are managed through the Admin
  // UI (payment-config module). Legacy env variables remain supported as a
  // transitional fallback only (precedence: Admin config > legacy env).

  if (env.AUTH_GOOGLE_ENABLED === "true") {
    missing.push(...GOOGLE_AUTH_REQUIRED_ENV_VARS.filter((key) => !env[key]))
  }

  return missing.sort()
}

/**
 * Returns format problems for PAYMENT_CONFIG_ENCRYPTION_KEY (never the value
 * itself). The key must be a 64-character hex string (32 bytes) for
 * AES-256-GCM. Empty list = valid.
 */
export function getEncryptionKeyFormatErrors(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const value = env.PAYMENT_CONFIG_ENCRYPTION_KEY
  if (!value) {
    return [] // absence is reported by getMissingEnvVars
  }
  if (value.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(value)) {
    return [
      "PAYMENT_CONFIG_ENCRYPTION_KEY must be a 64-character hex string (32 " +
        "bytes) for AES-256-GCM. Generate one with: openssl rand -hex 32",
    ]
  }
  return []
}

/**
 * Throws a descriptive error naming every missing required variable.
 * Called once at startup (after `loadEnv`) — not on the request path.
 */
export function assertEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing = getMissingEnvVars(env)
  if (missing.length > 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Set them in apps/backend/.env (see .env.example) or the deployment ` +
        `environment before starting the backend.`
    )
  }

  const formatErrors = getEncryptionKeyFormatErrors(env)
  if (formatErrors.length > 0) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      formatErrors.join(" ")
    )
  }
}
