/**
 * T-CC-01 — Customer-cart ownership enforcement decision.
 *
 * Native Medusa store cart routes are cart-ID-addressed and do not enforce
 * `customer_id` ownership server-side (verified in cart-and-checkout spec
 * §9/§22). This pure decision maps a cart + request auth context to the
 * access outcome the store middleware must enforce.
 *
 * Policy (approved — REQ-CC-003, BD-G-01, spec §9/§22):
 * - Unauthenticated requests rely on the unguessable cart ID as a bearer
 *   credential (guest model) — access is allowed without authentication.
 *   This is required for approved guest checkout with email: native
 *   `findOrCreateCustomerStep` sets `customer_id` on any cart created or
 *   updated with an email, so a guest cart must not be blocked merely
 *   because it carries a `customer_id`.
 * - Authenticated requests are ownership-checked: the actor must match the
 *   cart's `customer_id` when set. A mismatch → 403 (never reveal the cart
 *   exists).
 */
export type CartOwnershipDecision =
  | { outcome: "allow" }
  | { outcome: "forbidden" }

export function decideCartOwnership(input: {
  cart: { customer_id?: string | null }
  actorId?: string | null
}): CartOwnershipDecision {
  const { cart, actorId } = input

  // Guest model: no authenticated actor → the cart ID is the credential.
  if (!actorId) {
    return { outcome: "allow" }
  }

  // No owner on the cart → nothing to enforce.
  if (!cart.customer_id) {
    return { outcome: "allow" }
  }

  // Authenticated actor must be the owner → 403 otherwise.
  if (actorId !== cart.customer_id) {
    return { outcome: "forbidden" }
  }

  return { outcome: "allow" }
}
