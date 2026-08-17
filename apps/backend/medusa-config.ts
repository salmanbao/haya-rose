import { loadEnv, defineConfig, Modules } from '@medusajs/framework/utils'

import { assertEnv } from './src/config/env'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// Fail fast on missing required configuration (AGENTS.md §15 env-var
// validation boundary). Skipped in test mode: the integration-test runner
// loads this config and supplies its own disposable database connection.
if (process.env.NODE_ENV !== 'test') {
  assertEnv(process.env)
}

const fileModule =
  process.env.FILE_PROVIDER === 's3'
    ? {
        resolve: '@medusajs/medusa/file',
        options: {
          providers: [
            {
              resolve: '@medusajs/medusa/file-s3',
              id: 's3',
              options: {
                file_url: process.env.S3_FILE_URL,
                access_key_id: process.env.S3_ACCESS_KEY_ID,
                secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
                region: process.env.S3_REGION,
                bucket: process.env.S3_BUCKET,
                endpoint: process.env.S3_ENDPOINT,
                prefix: process.env.S3_PREFIX,
                authentication_method: 'access-key',
                acl: false,
                additional_client_config: {
                  forcePathStyle: true,
                },
              },
            },
          ],
        },
      }
    : undefined

// Payment providers (approved topology: Pakistan/PKR → Safepay (BD-P-01,
// revised: Safepay replaces AssanPay), UAE/AED → Stripe (BD-P-02)). PAYMENT_PROVIDER
// accepts a comma-separated list (e.g. "safepay,stripe") and selects which
// providers are REGISTERED (infrastructure choice). Provider keys form as
// `pp_{identifier}_{id}` (verified in the @medusajs/payment 2.19.0 provider
// loader): `pp_stripe_stripe` and `pp_safepay_safepay`.
//
// ADMIN-MANAGED CONFIGURATION (approved architecture 2026-08-17): provider
// credentials and enable/disable state are managed through the Admin UI via
// the payment-config module (encrypted at rest in PostgreSQL). Providers
// resolve their runtime configuration from that module on every operation.
// The env options below are TRANSITIONAL bootstrap/backward-compat fallbacks
// only, with explicit precedence: Admin-managed configuration > legacy
// environment configuration. Neither is required for boot; a provider with
// no configuration fails safely at payment initiation (never falls back to
// another provider).
//
// Safepay is a local module provider (src/modules/payment-safepay)
// implementing the verified IPaymentProvider contract (contract + matrix:
// docs/architecture/provider-verification/safepay-verification.md); webhook
// endpoint POST /hooks/payment/safepay_safepay. Stripe uses a thin local
// runtime-config wrapper (src/modules/payment-stripe-runtime) that preserves
// the pp_stripe_stripe provider key and delegates to the official
// @medusajs/payment-stripe provider constructed lazily with the stored
// configuration (the official provider requires an apiKey at construction,
// verified in its stripe-base source — so it is constructed only when
// configuration exists). Stripe capture mode defaults to manual (deferred)
// per T-PAY-03, configurable via the Admin.
const paymentProviderSelection = (process.env.PAYMENT_PROVIDER ?? "")
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const paymentProviderRegistrations: Array<Record<string, unknown>> = []

if (paymentProviderSelection.includes('stripe')) {
  paymentProviderRegistrations.push({
    resolve: './src/modules/payment-stripe-runtime',
    id: 'stripe',
    options: {
      // Transitional fallback (Admin-managed config takes precedence).
      apiKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      capture: process.env.PAYMENT_STRIPE_CAPTURE === 'automatic',
    },
  })
}

if (paymentProviderSelection.includes('safepay')) {
  paymentProviderRegistrations.push({
    resolve: './src/modules/payment-safepay',
    id: 'safepay',
    options: {
      // Transitional fallback (Admin-managed config takes precedence).
      merchantApiKey: process.env.SAFEPAY_MERCHANT_API_KEY,
      secretKey: process.env.SAFEPAY_SECRET_KEY,
      webhookSecret: process.env.SAFEPAY_WEBHOOK_SECRET,
      environment: process.env.SAFEPAY_ENVIRONMENT ?? 'sandbox',
      redirectUrl: process.env.SAFEPAY_REDIRECT_URL,
      cancelUrl: process.env.SAFEPAY_CANCEL_URL,
    },
  })
}

const paymentModule =
  paymentProviderRegistrations.length > 0
    ? {
        resolve: '@medusajs/medusa/payment',
        // `payment_config` is declared as a module dependency so the payment
        // module's local container can lazily resolve it from the app
        // container (verified: modules-sdk load-internal.js registers each
        // dependency in the module's local container as a proxy to the main
        // container). The provider services resolve their Admin-managed
        // runtime configuration through this cradle access.
        dependencies: ['payment_config'],
        options: {
          providers: paymentProviderRegistrations,
        },
      }
    : undefined

// Redis-backed infrastructure (approved decision: REDIS WIRING = ENABLE NOW).
// Replaces the in-memory defaults (cache-inmemory, event-bus-local,
// workflow-engine-inmemory, locking in-memory) for cache, event bus, workflow
// engine, and distributed locking. Also enables the CACHING module (graph
// query cache), which the framework only loads when explicitly configured
// (verified: CACHING has no defaultPackage). All option names verified against
// the installed 2.19.0 module contracts (caching-redis, event-bus-redis,
// workflow-engine-redis, locking-redis); unlisted options keep native defaults
// (prefix "mc:", queues "events-queue"/"medusa-workflows*", namespace
// "medusa_lock:"). Redis is supporting infrastructure only — PostgreSQL
// remains the source of truth for commerce state. The framework default
// workerMode is "shared", so event-bus/workflow BullMQ workers run in-process.
// Graph-query caching is additionally gated by the native MEDUSA_FF_CACHING
// feature flag (see .env.example). REDIS_URL is validated by assertEnv above.
// Customer authentication module (approved decisions BD-AUTH-01..03,
// 2026-08-17). Email/password is the baseline provider; Google OAuth
// (auth-google) is wired ENV-GATED: it registers only when
// AUTH_GOOGLE_ENABLED=true AND all GOOGLE_* variables are present
// (assertEnv enforces the same rule at boot; the gate is double-checked
// here so an unset flag can never register a half-configured provider).
// The MFA encryption key is merged into this module automatically by
// defineConfig's applyDefaultAuthMfaOptions (verified in installed
// define-config.js), so AUTH_MFA_ENCRYPTION_KEY must NOT be repeated
// here. All option names verified against the installed
// @medusajs/medusa/auth-emailpass and auth-google 2.19.0 source:
// auth-emailpass accepts { password: string } only; auth-google accepts
// clientId / clientSecret / callbackUrl.
const googleAuthEnabled =
  process.env.AUTH_GOOGLE_ENABLED === 'true' &&
  Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_CALLBACK_URL
  )

const authModule = {
  resolve: '@medusajs/medusa/auth',
  options: {
    providers: [
      { resolve: '@medusajs/medusa/auth-emailpass', id: 'emailpass' },
      ...(googleAuthEnabled
        ? [
            {
              resolve: '@medusajs/medusa/auth-google',
              id: 'google',
              options: {
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                callbackUrl: process.env.GOOGLE_CALLBACK_URL,
              },
            },
          ]
        : []),
    ],
  },
}

const redisModuleOptions = { redisUrl: process.env.REDIS_URL }

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
      // BD-AUTH-02: session lifetime = native default (1 day), set
      // explicitly. The storefront _medusa_jwt cookie must match (1d).
      jwtExpiresIn: '1d',
      // BD-AUTH-01: email verification REQUIRED for emailpass customers.
      // shape verified against installed @medusajs/types config-module.d.ts
      // (authVerificationsPerActor: { actor: [{ entity_type, auth_provider }] }).
      authVerificationsPerActor: {
        customer: [{ entity_type: 'email', auth_provider: 'emailpass' }],
      },
    }
  },
  modules: {
    // Secure, Admin-managed payment-provider configuration (encrypted at
    // rest; master key PAYMENT_CONFIG_ENCRYPTION_KEY stays in the
    // environment). Registered unconditionally — it is the configuration
    // store, requires no credentials, and is used by the providers + Admin.
    payment_config: {
      resolve: './src/modules/payment-config',
    },
    [Modules.AUTH]: authModule,
    [Modules.CACHE]: {
      resolve: '@medusajs/medusa/cache-redis',
      options: redisModuleOptions,
    },
    [Modules.CACHING]: {
      resolve: '@medusajs/medusa/caching',
      options: {
        providers: [
          {
            resolve: '@medusajs/medusa/caching-redis',
            id: 'redis',
            options: redisModuleOptions,
          },
        ],
      },
    },
    [Modules.EVENT_BUS]: {
      resolve: '@medusajs/medusa/event-bus-redis',
      options: redisModuleOptions,
    },
    [Modules.WORKFLOW_ENGINE]: {
      resolve: '@medusajs/medusa/workflow-engine-redis',
      options: { redis: redisModuleOptions },
    },
    [Modules.LOCKING]: {
      resolve: '@medusajs/medusa/locking',
      options: {
        providers: [
          {
            resolve: '@medusajs/medusa/locking-redis',
            id: 'redis',
            options: redisModuleOptions,
          },
        ],
      },
    },
    ...(fileModule ? { [Modules.FILE]: fileModule } : {}),
    ...(paymentModule ? { [Modules.PAYMENT]: paymentModule } : {}),
  }
})