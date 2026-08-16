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

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    }
  },
  modules: {
    ...(fileModule ? { [Modules.FILE]: fileModule } : {}),
    ...(paymentModule ? { [Modules.PAYMENT]: paymentModule } : {}),
  }
})