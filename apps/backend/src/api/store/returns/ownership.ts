/**
 * T-RET-01 — Store return request access enforcement (REQ-RET-002,
 * REQ-RET-025).
 *
 * Native Medusa store return creation (`POST /store/returns`) is
 * unauthenticated and order-ID addressed (verified in installed 2.19.0
 * source: the native middlewares only run
 * `validateAndTransformBody(StorePostReturnsReqSchema)` and
 * `validateAndTransformQuery` — no auth middleware). This is the
 * returns-domain analog of the order access gap (T-ORD-09) and the cart
 * ownership gap (T-CC-01), registered as T-RET-01.
 *
 * Policy (REQ-RET-002, REQ-RET-025, REQ-RET-036):
 * - Store return requests REQUIRE customer authentication (REQ-RET-002).
 *   Unlike order retrieval (which has the approved guest email credential,
 *   B-ORD-01), there is NO guest path for returns: an unauthenticated
 *   request is rejected with 401 before any order lookup happens.
 * - Authenticated requests are ownership-checked: the actor must match the
 *   order's `customer_id`. A mismatch → 403 (never reveal the order
 *   exists). The authenticated path is ownership-only — a matching email
 *   is never a substitute for customer_id ownership.
 * - An order without a `customer_id` can never be returned by an
 *   authenticated customer (nothing to match → forbidden).
 * - `receive_now` (REQ-RET-036) is honored only per policy; it never
 *   bypasses the authentication/ownership gate (the middleware runs before
 *   the native workflow, which is the only consumer of `receive_now`).
 */
export type ReturnAccessDecision =
  | { outcome: "allow" }
  | { outcome: "unauthenticated" }
  | { outcome: "forbidden" }

export function decideReturnAccess(input: {
  order: { customer_id?: string | null }
  actorId?: string | null
}): ReturnAccessDecision {
  const { order, actorId } = input

  // REQ-RET-002: returns require customer authentication. There is no guest
  // email fallback (unlike B-ORD-01). An empty-string actor is treated as
  // unauthenticated (mirrors the cart T-CC-01 decision).
  if (!actorId) {
    return { outcome: "unauthenticated" }
  }

  // Authenticated path is ownership-only (REQ-RET-025): the actor must be
  // the order's customer. No owner on the order → nothing to match →
  // forbidden.
  if (!order.customer_id) {
    return { outcome: "forbidden" }
  }

  if (actorId !== order.customer_id) {
    return { outcome: "forbidden" }
  }

  return { outcome: "allow" }
}
