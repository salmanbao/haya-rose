import { MedusaError } from "@medusajs/framework/utils"

import { deriveEncryptionKey, decryptSecret } from "../encryption"
import {
  applySecretInput,
  buildAdminView,
  configuredSecretNames,
  validateUpsertInput,
} from "../utils"
import { getProviderRegistryEntry } from "../registry"

const KEY = deriveEncryptionKey("a".repeat(64))
const SAFEPAY = getProviderRegistryEntry("safepay")!
const STRIPE = getProviderRegistryEntry("stripe")!

describe("payment-config utils", () => {
  describe("validateUpsertInput", () => {
    it("rejects unknown providers", () => {
      expect(() =>
        validateUpsertInput("assanpay", {
          provider: "assanpay" as unknown as "safepay" | "stripe",
        })
      ).toThrow(MedusaError)
    })

    it("rejects invalid environments per provider", () => {
      expect(() =>
        validateUpsertInput("safepay", {
          provider: "safepay",
          environment: "live",
        })
      ).toThrow(/environment/)
      expect(() =>
        validateUpsertInput("stripe", {
          provider: "stripe",
          environment: "production",
        })
      ).toThrow(/environment/)
    })

    it("rejects unknown config and secret fields", () => {
      expect(() =>
        validateUpsertInput("safepay", {
          provider: "safepay",
          config: { notAField: "x" },
        })
      ).toThrow(/Unknown configuration field/)
      expect(() =>
        validateUpsertInput("safepay", {
          provider: "safepay",
          secrets: { notASecret: "x" },
        })
      ).toThrow(/Unknown secret field/)
    })

    it("accepts valid safepay input and normalizes booleans", () => {
      const normalized = validateUpsertInput("safepay", {
        provider: "safepay",
        environment: "sandbox",
        enabled: true,
        config: { redirectUrl: "https://x/return", intent: "CYBERSOURCE" },
        secrets: { merchantApiKey: "sec_1", secretKey: "sk_1", webhookSecret: "wh_1" },
      })
      expect(normalized.environment).toBe("sandbox")
      expect(normalized.config.redirectUrl).toBe("https://x/return")
      expect(normalized.secrets.merchantApiKey).toBe("sec_1")
    })

    it("drops blank public fields and blank secrets", () => {
      const normalized = validateUpsertInput("stripe", {
        provider: "stripe",
        config: { publishableKey: "", capture: "true" },
        secrets: { secretKey: "", webhookSecret: "wh_new" },
      })
      expect(normalized.config.publishableKey).toBeUndefined()
      expect(normalized.config.capture).toBe(true)
      expect(normalized.secrets.secretKey).toBeUndefined()
      expect(normalized.secrets.webhookSecret).toBe("wh_new")
    })

    it("rejects a non-boolean enabled value", () => {
      expect(() =>
        validateUpsertInput("safepay", {
          provider: "safepay",
          enabled: "yes" as unknown as boolean,
        })
      ).toThrow(/enabled/)
    })

    it("accepts documented intent values for safepay", () => {
      for (const intent of ["CYBERSOURCE", "MPGS"]) {
        const normalized = validateUpsertInput("safepay", {
          provider: "safepay",
          config: { intent },
        })
        expect(normalized.config.intent).toBe(intent)
      }
    })

    it("rejects intent values outside the documented set", () => {
      expect(() =>
        validateUpsertInput("safepay", {
          provider: "safepay",
          config: { intent: "PAYPAL" },
        })
      ).toThrow(/Invalid value `PAYPAL` for `intent` of Safepay/)
      expect(() =>
        validateUpsertInput("safepay", {
          provider: "safepay",
          config: { intent: "CYBERSOURCE,MPGS" },
        })
      ).toThrow(/Supported: CYBERSOURCE, MPGS/)
    })

    it("allows an unset intent (blank is not written, adapter default applies)", () => {
      const normalized = validateUpsertInput("safepay", {
        provider: "safepay",
        config: { intent: "" },
      })
      expect(normalized.config.intent).toBeUndefined()
    })

    it("accepts capture mode option values and normalizes to booleans", () => {
      const automatic = validateUpsertInput("stripe", {
        provider: "stripe",
        config: { capture: "true" },
      })
      expect(automatic.config.capture).toBe(true)

      const manual = validateUpsertInput("stripe", {
        provider: "stripe",
        config: { capture: "false" },
      })
      expect(manual.config.capture).toBe(false)
    })

    it("rejects capture mode values outside the fixed set", () => {
      expect(() =>
        validateUpsertInput("stripe", {
          provider: "stripe",
          config: { capture: "automatic" },
        })
      ).toThrow(/Invalid value `automatic` for `capture` of Stripe/)
      expect(() =>
        validateUpsertInput("stripe", {
          provider: "stripe",
          config: { capture: "maybe" },
        })
      ).toThrow(/Supported: true, false/)
    })

    it("drops a blank capture mode (not written)", () => {
      const normalized = validateUpsertInput("stripe", {
        provider: "stripe",
        config: { capture: "" },
      })
      expect(normalized.config.capture).toBeUndefined()
    })
  })

  describe("registry field metadata", () => {
    it("documents every config and secret field with a label and description", () => {
      for (const provider of ["safepay", "stripe"] as const) {
        const entry = getProviderRegistryEntry(provider)!
        for (const field of [...entry.configFields, ...entry.secretFields]) {
          expect(field.label.length).toBeGreaterThan(0)
          expect(field.description?.length ?? 0).toBeGreaterThan(0)
        }
      }
    })

    it("exposes the intent field as a single-choice list (CYBERSOURCE, MPGS)", () => {
      const intent = SAFEPAY.configFields.find((f) => f.key === "intent")!
      expect(intent.options).toEqual([
        { value: "CYBERSOURCE", label: expect.stringContaining("CYBERSOURCE") },
        { value: "MPGS", label: expect.stringContaining("MPGS") },
      ])
      expect(intent.required).toBe(false)
    })

    it("exposes capture mode as the fixed-value dropdown (automatic/manual)", () => {
      const capture = STRIPE.configFields.find((f) => f.key === "capture")!
      expect(capture.kind).toBe("boolean")
      expect(capture.options).toEqual([
        { value: "true", label: "Automatic capture" },
        { value: "false", label: "Manual capture" },
      ])
      expect(capture.description).toMatch(/Fixed values:/)
    })

    it("keeps registry option values consistent with validation", () => {
      const intent = SAFEPAY.configFields.find((f) => f.key === "intent")!
      for (const option of intent.options ?? []) {
        expect(() =>
          validateUpsertInput("safepay", {
            provider: "safepay",
            config: { intent: option.value },
          })
        ).not.toThrow()
      }
    })
  })

  describe("applySecretInput (blank = keep, value = rotate)", () => {
    const existing = {
      merchantApiKey: "v1:encrypted-old-merchant",
      secretKey: "v1:encrypted-old-secret",
      webhookSecret: "v1:encrypted-old-webhook",
    }

    it("keeps existing secrets when the input omits them", () => {
      const result = applySecretInput(existing, {}, KEY, SAFEPAY)
      expect(result).toEqual(existing)
    })

    it("keeps existing secrets on blank input", () => {
      const result = applySecretInput(
        existing,
        { merchantApiKey: "", secretKey: "" },
        KEY,
        SAFEPAY
      )
      expect(result.merchantApiKey).toBe(existing.merchantApiKey)
      expect(result.secretKey).toBe(existing.secretKey)
    })

    it("rotates a secret on non-blank input without touching others", () => {
      const result = applySecretInput(
        existing,
        { secretKey: "sk_new_value" },
        KEY,
        SAFEPAY
      )
      expect(result.secretKey).not.toBe(existing.secretKey)
      expect(decryptSecret(result.secretKey, KEY)).toBe("sk_new_value")
      expect(result.merchantApiKey).toBe(existing.merchantApiKey)
      expect(result.webhookSecret).toBe(existing.webhookSecret)
    })

    it("drops a stored secret when the registry no longer lists it (rotation cleanup)", () => {
      // Simulates removing a legacy secret field: it is not in the input and
      // not in the registry field list → dropped from the new map.
      const legacy = { ...existing, obsoleteSecret: "v1:old" }
      const result = applySecretInput(legacy, {}, KEY, SAFEPAY)
      expect(result.obsoleteSecret).toBeUndefined()
    })
  })

  describe("configuredSecretNames", () => {
    it("returns only names of non-empty stored secrets", () => {
      expect(
        configuredSecretNames({
          merchantApiKey: "v1:a:b:c",
          secretKey: "",
          webhookSecret: null,
        })
      ).toEqual(["merchantApiKey"])
    })

    it("returns an empty list for empty/null input", () => {
      expect(configuredSecretNames(null)).toEqual([])
      expect(configuredSecretNames({})).toEqual([])
    })
  })

  describe("buildAdminView (masking)", () => {
    it("never exposes secret values", () => {
      const view = buildAdminView({
        provider: "safepay",
        enabled: true,
        environment: "sandbox",
        config: { redirectUrl: "https://x/return", cancelUrl: "https://x/cancel" },
        secrets: { merchantApiKey: "v1:enc:1", secretKey: "v1:enc:2", webhookSecret: "v1:enc:3" },
        last_tested_at: null,
        last_test_status: null,
        last_test_error: null,
        created_at: null,
        updated_at: null,
      })
      const serialized = JSON.stringify(view)
      expect(serialized).not.toContain("v1:enc:1")
      expect(view.secrets_configured).toEqual([
        "merchantApiKey",
        "secretKey",
        "webhookSecret",
      ])
      expect(view.has_webhook_secret).toBe(true)
      expect(view.configured).toBe(true)
      expect(view.config).toEqual({
        redirectUrl: "https://x/return",
        cancelUrl: "https://x/cancel",
      })
    })

    it("marks an incomplete config as not configured", () => {
      const view = buildAdminView({
        provider: "stripe",
        enabled: false,
        environment: null,
        config: {},
        secrets: { secretKey: "v1:a" },
        last_tested_at: null,
        last_test_status: null,
        last_test_error: null,
        created_at: null,
        updated_at: null,
      })
      expect(view.configured).toBe(false)
      expect(view.has_webhook_secret).toBe(false)
      expect(view.environment).toBe("test") // registry default
    })

    it("defaults missing environments from the registry", () => {
      const view = buildAdminView({
        provider: "safepay",
        enabled: false,
        environment: null,
        config: null,
        secrets: null,
        last_tested_at: null,
        last_test_status: null,
        last_test_error: null,
        created_at: null,
        updated_at: null,
      })
      expect(view.environment).toBe("sandbox")
    })

    it("preserves sanitized test metadata", () => {
      const view = buildAdminView({
        provider: "safepay",
        enabled: false,
        environment: "sandbox",
        config: null,
        secrets: null,
        last_tested_at: new Date("2026-08-17T10:00:00Z"),
        last_test_status: "failed",
        last_test_error: "authentication rejected (invalid credentials)",
        created_at: null,
        updated_at: null,
      })
      expect(view.last_test_status).toBe("failed")
      expect(view.last_test_error).toBe(
        "authentication rejected (invalid credentials)"
      )
    })
  })
})
