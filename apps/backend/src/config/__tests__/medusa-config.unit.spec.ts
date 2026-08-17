import { Modules } from "@medusajs/framework/utils"

/**
 * medusa-config wiring (BD-AUTH-01..03 + REDIS WIRING = ENABLE NOW):
 * verifies that the customer authentication module registers emailpass always
 * and google only when AUTH_GOOGLE_ENABLED=true, that the session lifetime is
 * 1d, that email verification is required for emailpass customers, and that
 * the Redis-backed infrastructure modules (cache, caching, event bus, workflow
 * engine, locking) are registered with the exact 2.19.0 option contracts.
 *
 * The config is a CJS module (module.exports = defineConfig(...)); each test
 * re-requires it with a fresh module registry after mutating process.env so
 * both gate states are covered.
 */

const AUTH_GATE_KEYS = [
  "AUTH_GOOGLE_ENABLED",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALLBACK_URL",
] as const

const GOOGLE_ENV = {
  AUTH_GOOGLE_ENABLED: "true",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  GOOGLE_CALLBACK_URL: "https://storefront.test/api/auth/callback/google",
}

const loadConfig = () => {
  jest.resetModules()
  return require("../../../medusa-config") as {
    projectConfig: { http: Record<string, unknown> }
    modules: Record<
      string,
      {
        resolve?: string
        options?: {
          redisUrl?: string
          redis?: { redisUrl?: string }
          providers?: Array<{ resolve?: string; id?: string; options?: unknown }>
        }
      }
    >
  }
}

describe("medusa-config customer authentication wiring (BD-AUTH-01..03)", () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    for (const key of AUTH_GATE_KEYS) {
      if (key in originalEnv) {
        process.env[key] = originalEnv[key]
      } else {
        delete process.env[key]
      }
    }
  })

  it("registers the auth module with emailpass and no google by default", () => {
    const config = loadConfig()
    const authModule = config.modules[Modules.AUTH]
    expect(authModule).toBeDefined()
    expect(authModule!.resolve).toBe("@medusajs/medusa/auth")

    const providers = (authModule!.options as { providers: any[] }).providers
    expect(providers.map((p) => p.id)).toEqual(["emailpass"])
  })

  it("registers google with the GOOGLE_* options when the gate is enabled", () => {
    Object.assign(process.env, GOOGLE_ENV)
    const config = loadConfig()
    const providers = (
      (config.modules[Modules.AUTH]!.options as { providers: any[] }).providers
    ).map((p) => p.id)
    expect(providers).toEqual(["emailpass", "google"])

    const google = (
      (config.modules[Modules.AUTH]!.options as { providers: any[] }).providers
    ).find((p) => p.id === "google")
    expect(google!.options).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
      callbackUrl: "https://storefront.test/api/auth/callback/google",
    })
  })

  it("does not register google when the gate is enabled but credentials are missing", () => {
    Object.assign(process.env, { AUTH_GOOGLE_ENABLED: "true" })
    const config = loadConfig()
    const providers = (
      (config.modules[Modules.AUTH]!.options as { providers: any[] }).providers
    ).map((p) => p.id)
    expect(providers).toEqual(["emailpass"])
  })

  it("sets the session lifetime to 1d", () => {
    const config = loadConfig()
    expect(config.projectConfig.http.jwtExpiresIn).toBe("1d")
  })

  it("requires email verification for emailpass customers", () => {
    const config = loadConfig()
    expect(config.projectConfig.http.authVerificationsPerActor).toEqual({
      customer: [{ entity_type: "email", auth_provider: "emailpass" }],
    })
  })
})

describe("medusa-config Redis-backed infrastructure wiring (REDIS WIRING = ENABLE NOW)", () => {
  it("registers the cache module against @medusajs/medusa/cache-redis with redisUrl", () => {
    const config = loadConfig()
    const cache = config.modules[Modules.CACHE]
    expect(cache).toBeDefined()
    expect(cache!.resolve).toBe("@medusajs/medusa/cache-redis")
    expect(cache!.options?.redisUrl).toBe(process.env.REDIS_URL)
  })

  it("registers the caching module with the redis provider", () => {
    const config = loadConfig()
    const caching = config.modules[Modules.CACHING]
    expect(caching).toBeDefined()
    expect(caching!.resolve).toBe("@medusajs/medusa/caching")
    expect(caching!.options?.providers).toEqual([
      {
        resolve: "@medusajs/medusa/caching-redis",
        id: "redis",
        options: { redisUrl: process.env.REDIS_URL },
      },
    ])
  })

  it("registers the event bus module against @medusajs/medusa/event-bus-redis with redisUrl", () => {
    const config = loadConfig()
    const eventBus = config.modules[Modules.EVENT_BUS]
    expect(eventBus).toBeDefined()
    expect(eventBus!.resolve).toBe("@medusajs/medusa/event-bus-redis")
    expect(eventBus!.options?.redisUrl).toBe(process.env.REDIS_URL)
  })

  it("registers the workflow engine against @medusajs/medusa/workflow-engine-redis with redis.redisUrl", () => {
    const config = loadConfig()
    const workflowEngine = config.modules[Modules.WORKFLOW_ENGINE]
    expect(workflowEngine).toBeDefined()
    expect(workflowEngine!.resolve).toBe("@medusajs/medusa/workflow-engine-redis")
    // Runtime loader destructures options?.redis (verified in installed 2.19.0
    // loaders/redis.js) — the published .d.ts flattens redisUrl at the top
    // level, but the runtime contract requires the nested form.
    expect(workflowEngine!.options?.redis?.redisUrl).toBe(
      process.env.REDIS_URL
    )
  })

  it("registers the locking module with the redis provider", () => {
    const config = loadConfig()
    const locking = config.modules[Modules.LOCKING]
    expect(locking).toBeDefined()
    expect(locking!.resolve).toBe("@medusajs/medusa/locking")
    expect(locking!.options?.providers).toEqual([
      {
        resolve: "@medusajs/medusa/locking-redis",
        id: "redis",
        options: { redisUrl: process.env.REDIS_URL },
      },
    ])
  })
})