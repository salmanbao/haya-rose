/**
 * Shared helpers for the payment-provider-config Admin API.
 */

/**
 * Computes the next region payment-provider id list after enabling or
 * disabling a provider. Pure function — unit-testable.
 *
 * Semantics: enabling binds the provider key to its market region (so the
 * storefront lists it); disabling unbinds it (so the storefront stops
 * offering it) without touching historical payment data. Cross-market
 * isolation is preserved because each provider only ever targets its own
 * market region (PK → Safepay, AE → Stripe).
 */
export function computeRegionBindingUpdate(
  boundProviderIds: string[],
  providerKey: string,
  enable: boolean
): string[] {
  const has = boundProviderIds.includes(providerKey)
  if (enable && !has) {
    return [...boundProviderIds, providerKey]
  }
  if (!enable && has) {
    return boundProviderIds.filter((id) => id !== providerKey)
  }
  return boundProviderIds
}

/**
 * Sanitizes an error thrown by a provider connection test. The provider
 * modules already produce sanitized messages (no secrets, no raw responses);
 * this is a final boundary guard that also produces a stable fallback.
 */
export function sanitizeConnectionError(error: unknown): string {
  const message =
    error instanceof Error && error.message.length > 0
      ? error.message
      : "connection test failed"
  // Final belt-and-braces: never echo anything that looks like a credential.
  const redacted = message.replace(
    /(sk|rk|whsec|sec)_[A-Za-z0-9_\-.]{6,}/g,
    "***"
  )
  return redacted.length > 500 ? redacted.slice(0, 500) : redacted
}
