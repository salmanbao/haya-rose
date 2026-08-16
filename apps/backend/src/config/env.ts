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
  "STORE_CORS",
  "ADMIN_CORS",
  "AUTH_CORS",
  "JWT_SECRET",
  "COOKIE_SECRET",
  "AUTH_MFA_ENCRYPTION_KEY",
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
 * Variables required when the Stripe payment provider (UAE/AED) is enabled
 * via `PAYMENT_PROVIDER=stripe` in `medusa-config.ts`.
 *
 * Names only — values stay in the environment. `STRIPE_PUBLISHABLE_KEY` is
 * intentionally server-side config here (it is a publishable, non-secret
 * value); the storefront reads its own copy from the storefront env.
 */
export const STRIPE_REQUIRED_ENV_VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
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

  if (env.PAYMENT_PROVIDER === "stripe") {
    missing.push(...STRIPE_REQUIRED_ENV_VARS.filter((key) => !env[key]))
  }

  return missing.sort()
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
}
