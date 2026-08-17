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

// UAE/AED payment provider (approved decision BD-P-02: Stripe, PaymentIntents
// model). Registered only when PAYMENT_PROVIDER=stripe; the provider key
// forms as `pp_stripe_stripe` (verified `pp_{identifier}_{id}`). Capture mode
// defaults to manual (deferred) capture per T-PAY-03 and is overridable via
// PAYMENT_STRIPE_CAPTURE=automatic. AssanPay (PK/PKR) remains unregistered:
// its official contract is still pending verification (hard gates: auth,
// webhooks, refunds — provider-verification docs).
const paymentModule =
  process.env.PAYMENT_PROVIDER === 'stripe'
    ? {
        resolve: '@medusajs/medusa/payment',
        options: {
          providers: [
            {
              resolve: '@medusajs/medusa/payment-stripe',
              id: 'stripe',
              options: {
                apiKey: process.env.STRIPE_SECRET_KEY,
                webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
                capture:
                  process.env.PAYMENT_STRIPE_CAPTURE === 'automatic',
              },
            },
          ],
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