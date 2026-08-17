import {
  GOOGLE_AUTH_REQUIRED_ENV_VARS,
  REQUIRED_ENV_VARS,
  S3_REQUIRED_ENV_VARS,
  STRIPE_REQUIRED_ENV_VARS,
  assertEnv,
  getMissingEnvVars,
} from "../env"

const completeEnv = (overrides: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  DATABASE_URL: "postgres://medusa:pass@localhost/medusa-baby-store",
  REDIS_URL: "redis://localhost:6379",
  STORE_CORS: "http://localhost:8000",
  ADMIN_CORS: "http://localhost:5173,http://localhost:9000",
  AUTH_CORS: "http://localhost:5173,http://localhost:9000,http://localhost:8000",
  JWT_SECRET: "secret",
  COOKIE_SECRET: "secret",
  AUTH_MFA_ENCRYPTION_KEY: "a".repeat(64),
  ...overrides,
})

describe("getMissingEnvVars", () => {
  it("returns an empty list when every required variable is present", () => {
    expect(getMissingEnvVars(completeEnv())).toEqual([])
  })

  it("reports DATABASE_URL when absent", () => {
    const { DATABASE_URL, ...env } = completeEnv()
    expect(getMissingEnvVars(env)).toEqual(["DATABASE_URL"])
  })

  it("reports REDIS_URL when absent", () => {
    const { REDIS_URL, ...env } = completeEnv()
    expect(getMissingEnvVars(env)).toEqual(["REDIS_URL"])
  })

  it("reports all missing variables, sorted alphabetically", () => {
    const env = {
      DATABASE_URL: "postgres://medusa:pass@localhost/medusa-baby-store",
    }
    expect(getMissingEnvVars(env)).toEqual(
      [...REQUIRED_ENV_VARS].filter((key) => key !== "DATABASE_URL").sort()
    )
  })

  it("treats an empty-string value as missing", () => {
    const env = completeEnv({ JWT_SECRET: "" })
    expect(getMissingEnvVars(env)).toEqual(["JWT_SECRET"])
  })

  it("does not require S3 variables when FILE_PROVIDER is unset (local default)", () => {
    const env = completeEnv()
    expect(getMissingEnvVars(env)).toEqual([])
    for (const key of S3_REQUIRED_ENV_VARS) {
      expect(env[key]).toBeUndefined()
    }
  })

  it("requires the full S3 variable set when FILE_PROVIDER is s3", () => {
    const env = completeEnv({ FILE_PROVIDER: "s3" })
    expect(getMissingEnvVars(env)).toEqual([...S3_REQUIRED_ENV_VARS].sort())
  })

  it("reports only the absent S3 variables when FILE_PROVIDER is s3", () => {
    const env = completeEnv({
      FILE_PROVIDER: "s3",
      S3_FILE_URL: "https://cdn.example.com",
      S3_ACCESS_KEY_ID: "key",
      S3_SECRET_ACCESS_KEY: "secret",
      S3_REGION: "auto",
      S3_BUCKET: "media",
      S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
    })
    expect(getMissingEnvVars(env)).toEqual([])
  })

  it("does not require S3 variables for any other FILE_PROVIDER value", () => {
    const env = completeEnv({ FILE_PROVIDER: "local" })
    expect(getMissingEnvVars(env)).toEqual([])
  })

  it("does not require Stripe variables when PAYMENT_PROVIDER is unset", () => {
    const env = completeEnv()
    expect(getMissingEnvVars(env)).toEqual([])
    for (const key of STRIPE_REQUIRED_ENV_VARS) {
      expect(env[key]).toBeUndefined()
    }
  })

  it("requires the full Stripe variable set when PAYMENT_PROVIDER is stripe", () => {
    const env = completeEnv({ PAYMENT_PROVIDER: "stripe" })
    expect(getMissingEnvVars(env)).toEqual([...STRIPE_REQUIRED_ENV_VARS].sort())
  })

  it("reports only the absent Stripe variables when PAYMENT_PROVIDER is stripe", () => {
    const env = completeEnv({
      PAYMENT_PROVIDER: "stripe",
      STRIPE_SECRET_KEY: "sk_test_secret",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
    })
    expect(getMissingEnvVars(env)).toEqual([])
  })

  it("does not require Stripe variables for any other PAYMENT_PROVIDER value", () => {
    const env = completeEnv({ PAYMENT_PROVIDER: "assanpay" })
    expect(getMissingEnvVars(env)).toEqual([])
  })

  it("does not require Google variables when AUTH_GOOGLE_ENABLED is unset", () => {
    const env = completeEnv()
    expect(getMissingEnvVars(env)).toEqual([])
    for (const key of GOOGLE_AUTH_REQUIRED_ENV_VARS) {
      expect(env[key]).toBeUndefined()
    }
  })

  it("requires the full Google variable set when AUTH_GOOGLE_ENABLED is true", () => {
    const env = completeEnv({ AUTH_GOOGLE_ENABLED: "true" })
    expect(getMissingEnvVars(env)).toEqual(
      [...GOOGLE_AUTH_REQUIRED_ENV_VARS].sort()
    )
  })

  it("reports only the absent Google variables when AUTH_GOOGLE_ENABLED is true", () => {
    const env = completeEnv({
      AUTH_GOOGLE_ENABLED: "true",
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      GOOGLE_CALLBACK_URL: "https://storefront.test/api/auth/callback/google",
    })
    expect(getMissingEnvVars(env)).toEqual([])
  })

  it("does not require Google variables for any other AUTH_GOOGLE_ENABLED value", () => {
    const env = completeEnv({ AUTH_GOOGLE_ENABLED: "false" })
    expect(getMissingEnvVars(env)).toEqual([])
  })
})

describe("assertEnv", () => {
  it("does not throw when the environment is complete", () => {
    expect(() => assertEnv(completeEnv())).not.toThrow()
  })

  it("throws a descriptive error naming every missing variable", () => {
    const env = completeEnv({ DATABASE_URL: "", JWT_SECRET: "" })
    expect(() => assertEnv(env)).toThrow(
      "Missing required environment variables: DATABASE_URL, JWT_SECRET"
    )
  })

  it("throws when the S3 provider is selected but its variables are missing", () => {
    const env = completeEnv({ FILE_PROVIDER: "s3" })
    expect(() => assertEnv(env)).toThrow("S3_FILE_URL")
  })

  it("throws when Google auth is enabled but its variables are missing", () => {
    const env = completeEnv({ AUTH_GOOGLE_ENABLED: "true" })
    expect(() => assertEnv(env)).toThrow("GOOGLE_CLIENT_ID")
  })
})
