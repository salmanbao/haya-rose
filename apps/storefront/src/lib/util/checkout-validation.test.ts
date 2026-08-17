import {
  CHECKOUT_REQUIRED_FIELDS,
  resolveRequiredFields,
  validateCheckoutFields,
  validateEmail,
} from "./checkout-validation"

describe("checkout-validation (BD-C-05/06)", () => {
  describe("resolveRequiredFields", () => {
    it("returns the common required set for unconfigured markets", () => {
      const fields = resolveRequiredFields("pk")
      expect(fields).toEqual([
        "first_name",
        "last_name",
        "address_1",
        "city",
        "postal_code",
        "country_code",
      ])
    })

    it("is case-insensitive and falls back to the default for unknown codes", () => {
      expect(resolveRequiredFields("AE")).toEqual(
        resolveRequiredFields("default")
      )
      expect(resolveRequiredFields("xx")).toEqual(
        resolveRequiredFields("default")
      )
    })

    it("allows per-market overrides via the config map without code changes", () => {
      const original = CHECKOUT_REQUIRED_FIELDS["default"]
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(CHECKOUT_REQUIRED_FIELDS as any)["pk"] = [
          "first_name",
          "last_name",
          "address_1",
          "city",
          "postal_code",
          "country_code",
          "phone",
        ]
        expect(resolveRequiredFields("pk")).toContain("phone")
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (CHECKOUT_REQUIRED_FIELDS as any)["pk"]
        expect(resolveRequiredFields("pk")).toEqual(original)
      }
    })
  })

  describe("validateEmail", () => {
    it("rejects missing, empty, and whitespace-only emails", () => {
      expect(validateEmail(null)).toBeTruthy()
      expect(validateEmail(undefined)).toBeTruthy()
      expect(validateEmail("")).toBeTruthy()
      expect(validateEmail("   ")).toBeTruthy()
    })

    it("rejects malformed emails", () => {
      expect(validateEmail("not-an-email")).toBeTruthy()
      expect(validateEmail("a@b")).toBeTruthy()
      expect(validateEmail("a b@c.com")).toBeTruthy()
    })

    it("accepts valid emails", () => {
      expect(validateEmail("buyer@example.com")).toBeNull()
      expect(validateEmail("buyer+tag@example.co.uk")).toBeNull()
    })
  })

  describe("validateCheckoutFields", () => {
    const validShipping = {
      first_name: "Ayesha",
      last_name: "Khan",
      address_1: "House 12, Street 4",
      city: "Karachi",
      postal_code: "74000",
      country_code: "pk",
    }

    it("accepts a complete shipping address with a valid email", () => {
      const result = validateCheckoutFields(
        { ...validShipping, email: "buyer@example.com" },
        "pk"
      )
      expect(result).toEqual({ ok: true })
    })

    it("treats company, province, phone, and address_2 as optional", () => {
      const result = validateCheckoutFields(
        {
          ...validShipping,
          email: "buyer@example.com",
          company: "",
          province: undefined,
          phone: null as unknown as string,
          address_2: "",
        },
        "pk"
      )
      expect(result).toEqual({ ok: true })
    })

    it("collects every missing required field", () => {
      const result = validateCheckoutFields(
        { first_name: "Ayesha", email: "buyer@example.com" },
        "pk"
      )
      expect(result).toEqual({
        ok: false,
        errors: {
          last_name: "required",
          address_1: "required",
          city: "required",
          postal_code: "required",
          country_code: "required",
        },
      })
    })

    it("rejects whitespace-only values for required fields", () => {
      const result = validateCheckoutFields(
        {
          first_name: "   ",
          last_name: "Khan",
          address_1: "House 12",
          city: "Karachi",
          postal_code: "74000",
          country_code: "pk",
          email: "buyer@example.com",
        },
        "pk"
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors.first_name).toBe("required")
      }
    })

    it("rejects a missing or malformed email (BD-C-05)", () => {
      const withoutEmail = validateCheckoutFields(validShipping, "pk")
      expect(withoutEmail.ok).toBe(false)
      if (!withoutEmail.ok) {
        expect(withoutEmail.errors.email).toBe("email")
      }

      const badEmail = validateCheckoutFields(
        { ...validShipping, email: "nope" },
        "pk"
      )
      expect(badEmail.ok).toBe(false)
      if (!badEmail.ok) {
        expect(badEmail.errors.email).toBe("email")
      }
    })

    it("falls back to the common set for unconfigured markets", () => {
      const result = validateCheckoutFields(
        { email: "buyer@example.com", first_name: "Ayesha" },
        "ae"
      )
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors.last_name).toBe("required")
      }
    })
  })
})
