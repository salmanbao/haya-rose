/**
 * Static registry of payment providers managed through the Admin
 * payment-provider configuration experience.
 *
 * This is metadata only — the authoritative per-provider behavior stays in
 * the provider modules (Safepay adapter, Stripe wrapper). The registry drives:
 * - the Admin UI form (fields, labels, environments, markets)
 * - Admin API validation (field allowlists, environment values)
 * - the market-provider mapping display (PK → Safepay, AE → Stripe)
 *
 * The market mapping is the approved business rule (BD-P-01 revised /
 * BD-P-02): Pakistan/PKR → Safepay, UAE/AED → Stripe. It is NOT a routing
 * engine — provider availability per market remains the native
 * `region_payment_provider` binding; this registry only documents the mapping
 * for the Admin UX and validation.
 */

export type ProviderId = "safepay" | "stripe"

export type ProviderFieldKind = "secret" | "string" | "boolean"

export type ProviderFieldOption = {
  value: string
  label: string
}

export type ProviderField = {
  /** Field key as stored in the config `config`/`secrets` maps. */
  key: string
  label: string
  kind: ProviderFieldKind
  required: boolean
  /** Optional placeholder shown in the Admin form (never a real value). */
  placeholder?: string
  /**
   * Optional single-choice options. When present the Admin form renders a
   * dropdown (single-select) instead of a free-text input, and the Admin API
   * rejects values outside this list. Mirrors the provider contract: e.g.
   * Safepay's `intent` accepts exactly one channel per payment session.
   */
  options?: ProviderFieldOption[]
  /** Optional admin-facing help text explaining what to enter. */
  description?: string
  /** Optional example value shown in the Admin form (never a real value). */
  example?: string
}

export type ProviderEnvironment = {
  value: string
  label: string
}

export type ProviderRegistryEntry = {
  id: ProviderId
  displayName: string
  market: { name: string; currency: string; regionName: string }
  /** Medusa provider key `pp_{identifier}_{id}` (verified in the payment loader). */
  providerKey: string
  environments: ProviderEnvironment[]
  defaultEnvironment: string
  /** Native Medusa webhook path for this provider. */
  webhookPath: string
  /** Non-secret configuration fields (stored in the `config` JSON column). */
  configFields: ProviderField[]
  /** Secret fields (encrypted at rest in the `secrets` JSON column). */
  secretFields: ProviderField[]
}

export const PAYMENT_PROVIDER_REGISTRY: Record<ProviderId, ProviderRegistryEntry> = {
  safepay: {
    id: "safepay",
    displayName: "Safepay",
    market: { name: "Pakistan", currency: "PKR", regionName: "Pakistan" },
    providerKey: "pp_safepay_safepay",
    environments: [
      { value: "sandbox", label: "Sandbox" },
      { value: "production", label: "Production" },
    ],
    defaultEnvironment: "sandbox",
    webhookPath: "/hooks/payment/safepay_safepay",
    configFields: [
      {
        key: "redirectUrl",
        label: "Redirect URL",
        kind: "string",
        required: true,
        placeholder: "https://storefront/checkout/payment/safepay",
        description:
          "Where the customer is sent after a successful payment on Safepay's hosted checkout.",
        example: "https://frontend.flicter.com/checkout/payment/safepay/return",
      },
      {
        key: "cancelUrl",
        label: "Cancel URL",
        kind: "string",
        required: true,
        placeholder: "https://storefront/checkout",
        description:
          "Where the customer is sent if they cancel the payment or it fails.",
        example: "https://frontend.flicter.com/checkout",
      },
      {
        key: "intent",
        label: "Payment intent",
        kind: "string",
        required: false,
        description:
          "Payment channel used to process the payment. Safepay accepts exactly one value per payment session — CYBERSOURCE is the currently supported channel for Visa/Mastercard cards; MPGS is an alternative channel (availability depends on your merchant account). Leave unset to use the default (CYBERSOURCE).",
        example: "CYBERSOURCE",
        options: [
          { value: "CYBERSOURCE", label: "CYBERSOURCE (Visa/Mastercard)" },
          { value: "MPGS", label: "MPGS (alternative channel)" },
        ],
      },
    ],
    secretFields: [
      {
        key: "merchantApiKey",
        label: "Merchant API Key",
        kind: "secret",
        required: true,
        description:
          "Public API key from the Safepay Developer Dashboard (Settings → API Keys). Sent in the payment session request body.",
        example: "mer_...",
      },
      {
        key: "secretKey",
        label: "Secret Key",
        kind: "secret",
        required: true,
        description:
          "Secret API key from the Safepay Developer Dashboard. Sent as the x-sfpy-merchant-secret header to authenticate API requests.",
        example: "sec_...",
      },
      {
        key: "webhookSecret",
        label: "Webhook Secret",
        kind: "secret",
        required: true,
        description:
          "Signing secret shown when creating the webhook in the Safepay Developer Dashboard. Used to verify the X-SFPY-SIGNATURE (HMAC-SHA512) of events sent to /hooks/payment/safepay_safepay.",
        example: "whsec_...",
      },
    ],
  },
  stripe: {
    id: "stripe",
    displayName: "Stripe",
    market: {
      name: "United Arab Emirates",
      currency: "AED",
      regionName: "United Arab Emirates",
    },
    providerKey: "pp_stripe_stripe",
    environments: [
      { value: "test", label: "Test" },
      { value: "live", label: "Live" },
    ],
    defaultEnvironment: "test",
    webhookPath: "/hooks/payment/stripe_stripe",
    configFields: [
      {
        key: "publishableKey",
        label: "Publishable Key",
        kind: "string",
        required: false,
        description:
          "Public publishable key (pk_...) from the Stripe Dashboard (Developers → API keys). Used by the storefront to render the Stripe card form.",
        example: "pk_test_...",
      },
      {
        key: "capture",
        label: "Capture mode",
        kind: "boolean",
        required: false,
        description:
          "Fixed values: Automatic capture — the payment is captured right after authorization; Manual capture — the payment is authorized first and captured later from the Admin (Orders → order → payment).",
        options: [
          { value: "true", label: "Automatic capture" },
          { value: "false", label: "Manual capture" },
        ],
      },
    ],
    secretFields: [
      {
        key: "secretKey",
        label: "Secret Key",
        kind: "secret",
        required: true,
        description:
          "Secret key (sk_...) from the Stripe Dashboard (Developers → API keys). Used for server-side payment operations.",
        example: "sk_test_...",
      },
      {
        key: "webhookSecret",
        label: "Webhook Secret",
        kind: "secret",
        required: true,
        description:
          "Signing secret (whsec_...) from the Stripe webhook endpoint configured for /hooks/payment/stripe_stripe. Used to verify Stripe webhook signatures.",
        example: "whsec_...",
      },
    ],
  },
}

export const PAYMENT_PROVIDER_IDS = Object.keys(
  PAYMENT_PROVIDER_REGISTRY
) as ProviderId[]

export function getProviderRegistryEntry(
  provider: string
): ProviderRegistryEntry | undefined {
  return PAYMENT_PROVIDER_REGISTRY[provider as ProviderId]
}
