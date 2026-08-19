import { cancelOrderWorkflow } from "@medusajs/medusa/core-flows"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
  remoteQueryObjectFromString,
} from "@medusajs/framework/utils"
import { decideOrderAccess } from "../../ownership"

/**
 * T-ORD-010 — Customer order cancellation (REQ-ORD-016).
 *
 * There is no native store-side cancel route (verified: native store order
 * middlewares expose GET retrieve/list and the transfer routes only; cancel
 * exists on the admin surface). This route mirrors the admin cancel route
 * (`api/admin/orders/[id]/cancel`) while enforcing the B-ORD-01 ownership
 * model on the store surface.
 *
 * Ownership/authorization:
 * - The route is registered behind `authenticate("customer", ["session",
 *   "bearer"])` in `middlewares.ts` (no `allowUnauthenticated`), so an
 *   unauthenticated request is rejected with 401 before this handler runs —
 *   matching the T-ORD-010 contract and the native transfer routes' pattern.
 * - This handler resolves the order and re-checks ownership via
 *   `decideOrderAccess` (authenticated, ownership-only): a different
 *   customer → 403 without revealing the order's existence.
 * - Draft orders are excluded from the store surface (REQ-ORD-033) → 404.
 *
 * State transitions are delegated to the native `cancelOrderWorkflow`
 * (validated transitions, BD-O-02/03): it deletes reservations exactly once,
 * and `cancelValidateOrder` rejects a duplicate cancel or an order with
 * uncanceled fulfillments with NOT_ALLOWED → 400 (BD-O-04/05) — never
 * invented here.
 *
 * Response mirrors the native store order retrieval shape (`{ order }` with
 * the store retrieve fields) so storefront consumers are unaffected.
 */
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const orderId = req.params.id as string
  const actorId = (req as unknown as { auth_context?: { actor_id?: string } })
    .auth_context?.actor_id

  const orderModule = req.scope.resolve(Modules.ORDER)

  let order:
    | {
        customer_id?: string | null
        is_draft_order?: boolean
      }
    | undefined
  try {
    order = await orderModule.retrieveOrder(orderId, {
      select: ["id", "customer_id", "is_draft_order"],
    })
  } catch (error) {
    // Non-existent order: never surface ownership semantics for unknown IDs
    // (mirrors the T-ORD-09 middleware's defer-to-native behavior; here the
    // handler is the terminal 404).
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Order with id ${orderId} was not found`
    )
  }

  if (order.is_draft_order) {
    // Draft orders are excluded from store exposure (REQ-ORD-033); the
    // native retrieve route filters them (404) and this cancel route must
    // not expose them either.
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Order with id ${orderId} was not found`
    )
  }

  const decision = decideOrderAccess({ order, actorId })
  if (decision.outcome === "forbidden") {
    // FORBIDDEN (403) per the order error model (mirrors T-ORD-09): a
    // customer without verified ownership is rejected without revealing the
    // order's existence.
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "You do not have access to this order"
    )
  }

  await cancelOrderWorkflow(req.scope).run({
    input: {
      order_id: orderId,
      canceled_by: actorId,
    },
  })

  // Refetch with the native store order retrieve fields so the response
  // shape matches GET /store/orders/:id (mirrors the admin cancel route's
  // post-workflow refetch via remoteQuery).
  const remoteQuery = req.scope.resolve(ContainerRegistrationKeys.REMOTE_QUERY)
  const queryObject = remoteQueryObjectFromString({
    entryPoint: "order",
    variables: { id: orderId },
    fields: STORE_ORDER_RETRIEVE_FIELDS,
  })

  const [orderResult] = await remoteQuery(queryObject)

  res.status(200).json({ order: orderResult })
}

/**
 * Mirrors the native store order retrieve fields
 * (`@medusajs/medusa/dist/api/store/orders/query-config.js`,
 * `defaultStoreRetrieveOrderFields`) so the cancel response matches the
 * store retrieve surface exactly.
 */
const STORE_ORDER_RETRIEVE_FIELDS = [
  "id",
  "status",
  "summary",
  "currency_code",
  "display_id",
  "custom_display_id",
  "region_id",
  "email",
  "total",
  "subtotal",
  "tax_total",
  "discount_total",
  "discount_subtotal",
  "discount_tax_total",
  "original_total",
  "original_subtotal",
  "original_tax_total",
  "item_total",
  "item_subtotal",
  "item_tax_total",
  "original_item_total",
  "original_item_subtotal",
  "original_item_tax_total",
  "shipping_total",
  "shipping_subtotal",
  "shipping_tax_total",
  "original_shipping_tax_total",
  "original_shipping_subtotal",
  "original_shipping_total",
  "credit_line_total",
  "credit_line_subtotal",
  "credit_line_tax_total",
  "created_at",
  "updated_at",
  "*credit_lines",
  "*items",
  "*items.tax_lines",
  "*items.adjustments",
  "*items.detail",
  "*items.variant",
  "*items.variant.product",
  "*shipping_address",
  "*billing_address",
  "*shipping_methods",
  "*shipping_methods.tax_lines",
  "*shipping_methods.adjustments",
  "*payment_collections",
]
