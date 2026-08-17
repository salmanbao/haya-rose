/**
 * Checkout field validation (BD-C-05/06).
 *
 * The required set is config-driven: `CHECKOUT_REQUIRED_FIELDS` maps a
 * country code to its required address fields and falls back to a common
 * default set shared by all markets. Per-market overrides (e.g. PK or AE
 * requiring `phone`) are added to the map without code changes.
 *
 * This is a client-side UX guard mirroring the backend contract; the
 * backend remains authoritative and re-validates every field on save.
 */

export type CheckoutAddressField =
  | "first_name"
  | "last_name"
  | "company"
  | "address_1"
  | "address_2"
  | "city"
  | "province"
  | "postal_code"
  | "country_code"
  | "phone"

export type CheckoutFields = Partial<Record<CheckoutAddressField, string>>

export const CHECKOUT_REQUIRED_FIELDS: Record<
  string,
  readonly CheckoutAddressField[]
> = {
  default: [
    "first_name",
    "last_name",
    "address_1",
    "city",
    "postal_code",
    "country_code",
  ],
}

export type CheckoutFieldErrors = Partial<
  Record<CheckoutAddressField | "email", string>
>

export type CheckoutValidationResult =
  | { ok: true }
  | { ok: false; errors: CheckoutFieldErrors }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function resolveRequiredFields(
  countryCode: string
): readonly CheckoutAddressField[] {
  return (
    CHECKOUT_REQUIRED_FIELDS[countryCode.toLowerCase()] ??
    CHECKOUT_REQUIRED_FIELDS.default
  )
}

/** Returns an error key for an invalid email, or null when valid. */
export function validateEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim()
  if (!trimmed || !EMAIL_PATTERN.test(trimmed)) {
    return "email"
  }
  return null
}

export function validateCheckoutFields(
  fields: CheckoutFields & { email?: string | null },
  countryCode: string
): CheckoutValidationResult {
  const errors: CheckoutFieldErrors = {}

  const emailError = validateEmail(fields.email)
  if (emailError) {
    errors.email = emailError
  }

  for (const field of resolveRequiredFields(countryCode)) {
    const value = fields[field]
    if (value === undefined || value === null || value.trim() === "") {
      errors[field] = "required"
    }
  }

  return Object.keys(errors).length === 0
    ? { ok: true }
    : { ok: false, errors }
}
