/**
 * Amount conversion between Medusa and Safepay for the PKR market.
 *
 * Verified facts (official Safepay documentation, retrieved via Context7 from
 * safepay-docs.netlify.app, cross-checked against the official SDK source
 * @sfpy/node-core@0.3.5):
 * - Safepay `amount` values are integers in the **lowest denomination**
 *   (paisa for PKR — e.g. PKR 6,000 is sent as 600000).
 * - Medusa 2.19.0 payment-provider amounts are **major units** (verified via
 *   the bundled @medusajs/payment-stripe provider, which multiplies by the
 *   currency multiplier before calling Stripe, and the Medusa
 *   `prices-in-major-units` lint rule).
 *
 * PKR has 2 decimal places, so the conversion is ×100 / ÷100 and happens
 * exactly once, at this boundary.
 */

import { BigNumber, MathBN } from "@medusajs/framework/utils"
import type { BigNumberInput } from "@medusajs/framework/types"

/** The only currency supported by this provider (Pakistan market). */
export const SAFEPAY_SUPPORTED_CURRENCY = "pkr"

/** PKR has two decimal places: 100 paisa = 1 PKR. */
const PKR_MULTIPLIER = 100

export class SafepayAmountError extends Error {}

/**
 * Converts a Medusa major-unit PKR amount to Safepay's lowest denomination
 * (paisa). Throws for non-PKR currencies (no silent conversion — REQ-PAY-002)
 * and for zero/negative amounts.
 */
export function toSafepayAmount(
  amount: BigNumberInput,
  currencyCode: string
): number {
  if (currencyCode?.toLowerCase() !== SAFEPAY_SUPPORTED_CURRENCY) {
    throw new SafepayAmountError(
      `Safepay only supports PKR payments (received ${currencyCode}). ` +
        `Cross-currency conversion is not allowed.`
    )
  }

  const paisa = Math.round(
    new BigNumber(MathBN.mult(amount, PKR_MULTIPLIER)).numeric
  )

  if (!Number.isFinite(paisa) || !Number.isSafeInteger(paisa) || paisa <= 0) {
    throw new SafepayAmountError(
      `Invalid payment amount for Safepay: ${amount} ${currencyCode.toUpperCase()}. ` +
        `Amount must be a positive value expressible in whole paisa.`
    )
  }

  return paisa
}

/**
 * Converts a Safepay paisa amount back to Medusa major units (used for
 * webhook event amounts).
 */
export function fromSafepayAmount(paisa: number): number {
  return new BigNumber(MathBN.div(paisa, PKR_MULTIPLIER)).numeric
}
