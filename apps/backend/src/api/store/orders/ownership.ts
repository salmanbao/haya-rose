/**
 * T-ORD-09 — Single-order access enforcement decision (B-ORD-01).
 *
 * Native Medusa store order retrieval (`GET /store/orders/:id`) is
 * unauthenticated and ID-addressed (verified route; source contains a
 * `TODO: Do we want to apply some sort of authentication here?`). This is
 * the order-domain analog of the cart ownership gap (cart spec T-CC-01) and
 * is registered as B-ORD-01/T-ORD-09.
 *
 * Policy (approved — B-ORD-01, "Authenticated-customer ownership check;
 * guest lookup by email + reference"):
 * - Authenticated requests are ownership-checked: the actor must match the
 *   order's `customer_id`. A mismatch → 403 (never reveal the order exists).
 *   The authenticated path is ownership-only — a matching email is never a
 *   substitute for customer_id ownership.
 * - Unauthenticated requests (guests) are allowed ONLY when the supplied
 *   email matches the order's `email` (case-insensitive). Never order-ID
 *   alone: an order is never exposed by ID without a verified credential.
 */
export type OrderAccessDecision =
  | { outcome: "allow" }
  | { outcome: "forbidden" }

const normalizeEmail = (email: string | null | undefined): string | null => {
  if (!email) {
    return null
  }
  const trimmed = email.trim()
  return trimmed.length > 0 ? trimmed.toLowerCase() : null
}

export function decideOrderAccess(input: {
  order: { customer_id?: string | null; email?: string | null }
  actorId?: string | null
  guestEmail?: string | null
}): OrderAccessDecision {
  const { order, actorId, guestEmail } = input

  // Guest model: no authenticated actor → the email + order reference is the
  // credential (B-ORD-01). An empty-string actor is treated as
  // unauthenticated (mirrors the cart T-CC-01 decision).
  if (!actorId) {
    const orderEmail = normalizeEmail(order.email)
    const suppliedEmail = normalizeEmail(guestEmail)

    if (!orderEmail || !suppliedEmail) {
      return { outcome: "forbidden" }
    }

    return orderEmail === suppliedEmail
      ? { outcome: "allow" }
      : { outcome: "forbidden" }
  }

  // Authenticated path is ownership-only: the actor must be the order's
  // customer. No owner on the order → nothing to match → forbidden (an
  // authenticated customer never falls back to the guest email path).
  if (!order.customer_id) {
    return { outcome: "forbidden" }
  }

  if (actorId !== order.customer_id) {
    return { outcome: "forbidden" }
  }

  return { outcome: "allow" }
}