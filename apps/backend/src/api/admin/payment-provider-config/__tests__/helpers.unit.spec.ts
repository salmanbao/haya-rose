import {
  computeRegionBindingUpdate,
  sanitizeConnectionError,
} from "../helpers"

describe("payment-provider-config admin helpers", () => {
  describe("computeRegionBindingUpdate", () => {
    it("binds a provider key when enabling (idempotent)", () => {
      expect(
        computeRegionBindingUpdate(
          ["pp_system_default"],
          "pp_safepay_safepay",
          true
        )
      ).toEqual(["pp_system_default", "pp_safepay_safepay"])

      // Second enable → unchanged.
      expect(
        computeRegionBindingUpdate(
          ["pp_system_default", "pp_safepay_safepay"],
          "pp_safepay_safepay",
          true
        )
      ).toEqual(["pp_system_default", "pp_safepay_safepay"])
    })

    it("unbinds a provider key when disabling (idempotent)", () => {
      expect(
        computeRegionBindingUpdate(
          ["pp_system_default", "pp_safepay_safepay"],
          "pp_safepay_safepay",
          false
        )
      ).toEqual(["pp_system_default"])

      expect(
        computeRegionBindingUpdate(
          ["pp_system_default"],
          "pp_safepay_safepay",
          false
        )
      ).toEqual(["pp_system_default"])
    })

    it("never touches other providers' bindings", () => {
      const bound = [
        "pp_system_default",
        "pp_safepay_safepay",
        "pp_stripe_stripe",
      ]
      const next = computeRegionBindingUpdate(bound, "pp_stripe_stripe", false)
      expect(next).toEqual(["pp_system_default", "pp_safepay_safepay"])
    })
  })

  describe("sanitizeConnectionError", () => {
    it("passes through sanitized provider messages", () => {
      expect(
        sanitizeConnectionError(new Error("authentication rejected"))
      ).toBe("authentication rejected")
    })

    it("redacts credential-shaped tokens", () => {
      const sanitized = sanitizeConnectionError(
        new Error("invalid key sk_test_abc123def in request")
      )
      expect(sanitized).not.toContain("sk_test_abc123def")
      expect(sanitized).toContain("***")
    })

    it("redacts webhook secret tokens", () => {
      const sanitized = sanitizeConnectionError(
        new Error("whsec_abcdef123456 mismatch")
      )
      expect(sanitized).not.toContain("whsec_abcdef123456")
    })

    it("produces a stable fallback for unknown errors", () => {
      expect(sanitizeConnectionError(undefined)).toBe("connection test failed")
      expect(sanitizeConnectionError("boom")).toBe("connection test failed")
    })

    it("truncates overly long messages", () => {
      const long = new Error("x".repeat(1000))
      expect(sanitizeConnectionError(long).length).toBe(500)
    })
  })
})
