/**
 * Safepay webhook verification (verified contract).
 *
 * Official Safepay documentation (developers/webhooks/verify-hmac-signatures):
 * - Signature header: `X-SFPY-SIGNATURE`
 * - Algorithm: HMAC-SHA512 over the **raw request body**, hex-encoded digest,
 *   keyed with the endpoint's shared secret from the Developer Dashboard.
 * - Comparison must be constant-time (timingSafeEqual).
 *
 * Event envelope (developers/webhooks/webhook-types):
 *   { token: "evt_…", version, type, endpoint?, data: { tracker, state,
 *     amount (lowest denomination), currency, metadata, … }, created_at }
 *
 * Documented event types relevant to V1 payments: `payment.succeeded`,
 * `payment.failed`, `void.succeeded` (plus subscription.* types, which are
 * not payment-lifecycle events for this integration).
 */

import { createHmac, timingSafeEqual } from "crypto"

export const SAFEPAY_SIGNATURE_HEADER = "x-sfpy-signature"

export type SafepayWebhookEvent = {
  token?: string
  version?: string
  type?: string
  data?: {
    tracker?: string
    state?: string
    amount?: number
    currency?: string
    metadata?: Record<string, unknown> | null
    [key: string]: unknown
  }
}

export class SafepayWebhookError extends Error {}

/** Case-insensitive header lookup (Node lowercases request headers). */
export function getHeader(
  headers: Record<string, unknown>,
  name: string
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()]
  if (Array.isArray(value)) {
    return value[0] !== undefined ? String(value[0]) : undefined
  }
  return value !== undefined && value !== null ? String(value) : undefined
}

/**
 * Verifies the X-SFPY-SIGNATURE header against an HMAC-SHA512 hex digest of
 * the raw body, then parses and validates the event envelope.
 * Throws SafepayWebhookError on any verification/validation failure — the
 * native payment webhook pipeline surfaces the failure (event-bus retries ×3)
 * and never treats an unverified event as a payment-state transition.
 */
export function verifyAndParseWebhook(
  rawData: string | Buffer,
  headers: Record<string, unknown>,
  webhookSecret: string
): SafepayWebhookEvent {
  const signature = getHeader(headers, SAFEPAY_SIGNATURE_HEADER)
  if (!signature) {
    throw new SafepayWebhookError(
      "Safepay webhook rejected: missing X-SFPY-SIGNATURE header"
    )
  }

  const raw = typeof rawData === "string" ? rawData : Buffer.from(rawData).toString("utf8")
  const expected = createHmac("sha512", webhookSecret).update(raw).digest("hex")

  if (!timingSafeEqualHex(expected, signature)) {
    throw new SafepayWebhookError(
      "Safepay webhook rejected: invalid X-SFPY-SIGNATURE signature"
    )
  }

  let event: SafepayWebhookEvent
  try {
    event = JSON.parse(raw) as SafepayWebhookEvent
  } catch {
    throw new SafepayWebhookError(
      "Safepay webhook rejected: payload is not valid JSON"
    )
  }

  if (!event || typeof event !== "object" || !event.type || !event.data) {
    throw new SafepayWebhookError(
      `Safepay webhook rejected: malformed event envelope (type=${String(
        event?.type
      )})`
    )
  }

  return event
}

function timingSafeEqualHex(expectedHex: string, receivedHex: string): boolean {
  const expected = Buffer.from(expectedHex, "utf8")
  const received = Buffer.from(receivedHex, "utf8")
  if (expected.length !== received.length) {
    return false
  }
  return timingSafeEqual(expected, received)
}
