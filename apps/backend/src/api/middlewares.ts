import {
  authenticate,
  defineMiddlewares,
  MedusaRequest,
} from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { decideCartOwnership } from "./store/carts/ownership"
import { decideOrderAccess } from "./store/orders/ownership"
import { decideReturnAccess } from "./store/returns/ownership"

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
])

const DEFAULT_MAX_UPLOAD_SIZE_MB = 5

const getMaxUploadSizeBytes = () => {
  const configuredMb = Number(process.env.MEDUSA_UPLOAD_MAX_SIZE_MB)
  const mb =
    Number.isFinite(configuredMb) && configuredMb > 0
      ? configuredMb
      : DEFAULT_MAX_UPLOAD_SIZE_MB
  return mb * 1024 * 1024
}

type UploadedFile = {
  fieldname: string
  originalname: string
  mimetype: string
  size: number
}

export default defineMiddlewares({
  routes: [
    {
      /**
       * T-CC-01 — Customer-cart ownership enforcement (REQ-CC-003).
       *
       * Native Medusa store cart routes are cart-ID-addressed and do not
       * enforce `customer_id` ownership server-side (verified). This global
       * middleware runs before the native cart routes (routes sorter places
       * global middlewares first) and enforces ownership for authenticated
       * requests.
       *
       * Guest model (approved): unauthenticated requests rely on the
       * unguessable cart ID as a bearer credential. This is required because
       * native `findOrCreateCustomerStep` sets `customer_id` on any cart
       * created/updated with an email — approved guest checkout (BD-G-01)
       * must not be blocked for those carts.
       *
       * Outcomes: non-existent cart → next() (native 404); unauthenticated
       * → allow (guest credential model); authenticated owner → allow;
       * authenticated different customer → 403 without revealing the cart's
       * existence.
       */
      matcher: "/store/carts/:id",
      middlewares: [
        async (req: MedusaRequest, _res, next) => {
          const cartId = req.params.id
          if (!cartId) {
            return next()
          }

          const cartModule = req.scope.resolve(Modules.CART)

          let cart: { customer_id?: string | null } | undefined
          try {
            cart = await cartModule.retrieveCart(cartId, {
              select: ["id", "customer_id"],
            })
          } catch (error) {
            // Non-existent cart: defer to the native route (404). Never
            // surface ownership semantics for unknown IDs.
            return next()
          }

          const authContext = (req as unknown as {
            auth_context?: { actor_id?: string }
          }).auth_context

          const decision = decideCartOwnership({
            cart,
            actorId: authContext?.actor_id,
          })

          if (decision.outcome === "allow") {
            return next()
          }

          // FORBIDDEN (403) per the cart-and-checkout error model: a
          // customer-owned cart accessed by a different authenticated
          // customer is rejected without revealing the cart's existence.
          // (NOT_ALLOWED would map to 400.)
          throw new MedusaError(
            MedusaError.Types.FORBIDDEN,
            "You do not have access to this cart"
          )
        },
      ],
    },
    {
      /**
       * T-ORD-09 — Single-order access enforcement (REQ-ORD-008, B-ORD-01).
       *
       * Native Medusa store order retrieval `GET /store/orders/:id` is
       * unauthenticated and ID-addressed (verified; source TODO). This
       * middleware runs before the native route and enforces the approved
       * B-ORD-01 decision: authenticated requests are ownership-checked
       * against the order's `customer_id`; unauthenticated requests are
       * allowed only when the supplied `?email=` matches the order's email
       * (never order-ID alone).
       *
       * Registration is deliberately WITHOUT `methods` so the routes sorter
       * places it in the "global" bucket, which runs before the native
       * "params" bucket (sorter order: global → wildcard → regex → static →
       * params). This is required for two reasons:
       *  1. The native route's strict query validation
       *     (`validateAndTransformQuery(StoreGetOrderParams)`, zod
       *     `.strict()`) would otherwise reject the non-native `?email=`
       *     credential with 400 before this middleware could consume it.
       *  2. The guest email credential must be stripped from `req.query`
       *     before the native validator runs (done below before every
       *     `next()`).
       *
       * The global `/store` auth middleware (allowUnauthenticated: true) is
       * registered before sorted routes, so `req.auth_context` is populated
       * before this middleware runs — no explicit `authenticate` is needed
       * here; guests pass through with an empty auth context and hit the
       * guest email path.
       *
       * Scoped to GET only via an in-handler gate (a global-bucket matcher
       * also matches non-GET methods): the native POST transfer routes
       * (`/store/orders/:id/transfer/*`) must not be blocked —
       * `accept`/`decline` are token-based and the accepting customer is not
       * yet the owner.
       *
       * Outcomes: non-existent order → next() (native 404); draft order →
       * next() (native route filters `is_draft_order: false` → 404, so draft
       * orders never leak existence); unauthenticated matching email → allow;
       * authenticated owner → allow; everything else → 403 without revealing
       * the order's existence.
       */
      matcher: "/store/orders/:id",
      middlewares: [
        async (req: MedusaRequest, _res, next) => {
          // Gate: only GET order retrieval is ownership-checked. The
          // global-bucket matcher also matches POST transfer routes, which
          // must pass through untouched (see docstring above).
          if (req.method !== "GET") {
            return next()
          }

          const orderId = req.params.id
          if (!orderId) {
            return next()
          }

          // Consume the guest email credential and strip it from the query
          // BEFORE the native strict validator runs. `req.query.email` is
          // non-native and would 400 under `StoreGetOrderParams` (zod
          // `.strict()`); every `next()` below therefore sees a clean query.
          const guestEmail =
            typeof req.query.email === "string" ? req.query.email : undefined
          delete req.query.email

          const orderModule = req.scope.resolve(Modules.ORDER)

          let order:
            | {
                customer_id?: string | null
                email?: string | null
                is_draft_order?: boolean
              }
            | undefined
          try {
            order = await orderModule.retrieveOrder(orderId, {
              select: ["id", "customer_id", "email", "is_draft_order"],
            })
          } catch (error) {
            // Non-existent order: defer to the native route (404). Never
            // surface ownership semantics for unknown IDs.
            return next()
          }

          if (order.is_draft_order) {
            // Draft orders are excluded from store exposure (REQ-ORD-033);
            // defer to the native route which filters them out (404).
            return next()
          }

          const authContext = (req as unknown as {
            auth_context?: { actor_id?: string }
          }).auth_context

          const decision = decideOrderAccess({
            order,
            actorId: authContext?.actor_id,
            guestEmail,
          })

          if (decision.outcome === "allow") {
            return next()
          }

          // FORBIDDEN (403) per the order error model (mirrors T-CC-01): a
          // customer/guest without a verified credential is rejected without
          // revealing the order's existence. (NOT_ALLOWED would map to 400.)
          throw new MedusaError(
            MedusaError.Types.FORBIDDEN,
            "You do not have access to this order"
          )
        },
      ],
    },
    {
      /**
       * T-ORD-010 — Customer order cancellation (REQ-ORD-016).
       *
       * Native Medusa exposes no store-side cancel route (verified: store
       * order middlewares cover GET retrieve/list and the transfer routes
       * only; cancel exists on the admin surface). The custom route
       * `src/api/store/orders/[id]/cancel/route.ts` mirrors the admin cancel
       * workflow while enforcing B-ORD-01 ownership.
       *
       * This entry authenticates the request with the same native middleware
       * the store transfer routes use (`authenticate("customer",
       * ["session", "bearer"])`) — without `allowUnauthenticated`, an
       * unauthenticated request gets a native 401 before the handler runs.
       * The handler then re-checks ownership (403 for a different customer)
       * and delegates the state transition to `cancelOrderWorkflow`.
       *
       * The global-bucket T-ORD-09 middleware (matcher `/store/orders/:id`)
       * also matches this sub-path, but its in-handler GET gate passes POST
       * through untouched.
       */
      matcher: "/store/orders/:id/cancel",
      methods: ["POST"],
      middlewares: [authenticate("customer", ["session", "bearer"])],
    },
    {
      /**
       * T-RET-01 + T-RET-02 — Store return request hardening
       * (REQ-RET-002, REQ-RET-003, REQ-RET-025, REQ-RET-036).
       *
       * Native Medusa `POST /store/returns` is unauthenticated and
       * order-ID addressed, and it honors a customer-supplied
       * `return_shipping.price` (verified in installed 2.19.0 source:
       * `prepareShippingMethodData` uses `inputShippingOption.price` when
       * defined and >= 0, otherwise falls back to the option's calculated
       * price). This global middleware runs before the native route and:
       *  - T-RET-01: enforces authentication (REQ-RET-002 — no guest path
       *    for returns, unlike order retrieval's B-ORD-01 guest email) and
       *    order ownership (REQ-RET-025 — 403 without existence leak).
       *  - T-RET-02: strips `return_shipping.price` from the body so the
       *    native workflow resolves the return shipping cost server-side
       *    from the option's calculated price (REQ-RET-003 — never accept
       *    a customer-supplied return shipping price).
       *
       * Registration is deliberately WITHOUT `methods` so the routes sorter
       * places it in the "global" bucket, which runs before the native
       * "static" bucket (sorter order: global → wildcard → regex → static →
       * params). This is required because the native
       * `validateAndTransformBody(StorePostReturnsReqSchema)` runs in the
       * static bucket and would otherwise parse the customer-supplied
       * `price` into `req.validatedBody` before this middleware could strip
       * it. The body parser is applied app-wide before route registration
       * (verified in installed router.js), so `req.body` is available here.
       *
       * The global `/store` auth middleware (allowUnauthenticated: true) is
       * registered before sorted routes, so `req.auth_context` is populated
       * before this middleware runs — no explicit `authenticate` is needed
       * here; guests pass through with an empty auth context and are
       * rejected with 401.
       *
       * Scoped to POST via an in-handler gate (a global-bucket matcher also
       * matches non-POST methods; the native route only defines POST).
       *
       * Outcomes: non-existent order → next() (native workflow throws via
       * `useRemoteQueryStep` throw_if_key_not_found → 404, never leaking
       * ownership semantics); unauthenticated → 401; authenticated owner →
       * next() (native workflow runs); authenticated different customer →
       * 403 without revealing the order's existence.
       */
      matcher: "/store/returns",
      middlewares: [
        async (req: MedusaRequest, _res, next) => {
          // Gate: only POST return creation is hardened (the native route
          // only defines POST; a global-bucket matcher also matches other
          // methods which must pass through untouched).
          if (req.method !== "POST") {
            return next()
          }

          // T-RET-02: consume and strip any customer-supplied return
          // shipping price BEFORE the native body validator runs (see
          // docstring above). The native workflow then resolves the
          // shipping cost server-side from the option's calculated price.
          const body = (req as unknown as { body?: unknown }).body
          const returnShipping =
            body &&
            typeof body === "object" &&
            !Array.isArray(body) &&
            "return_shipping" in body
              ? (body as { return_shipping?: unknown }).return_shipping
              : undefined

          if (returnShipping && typeof returnShipping === "object") {
            delete (returnShipping as { price?: unknown }).price
          }

          // T-RET-01: require customer authentication (REQ-RET-002). No
          // guest email path for returns.
          const authContext = (req as unknown as {
            auth_context?: { actor_id?: string }
          }).auth_context
          const actorId = authContext?.actor_id
          if (!actorId) {
            throw new MedusaError(
              MedusaError.Types.UNAUTHORIZED,
              "You must be authenticated to create a return"
            )
          }

          const orderId =
            body && typeof body === "object" && !Array.isArray(body)
              ? (body as { order_id?: unknown }).order_id
              : undefined

          if (typeof orderId !== "string" || orderId.length === 0) {
            // Missing/invalid order_id: defer to the native validator (400).
            return next()
          }

          const orderModule = req.scope.resolve(Modules.ORDER)

          let order: { customer_id?: string | null } | undefined
          try {
            order = await orderModule.retrieveOrder(orderId, {
              select: ["id", "customer_id"],
            })
          } catch (error) {
            // Non-existent order: defer to the native workflow (404). Never
            // surface ownership semantics for unknown IDs.
            return next()
          }

          const decision = decideReturnAccess({ order, actorId })

          if (decision.outcome === "allow") {
            return next()
          }

          // FORBIDDEN (403) per the returns error model (mirrors T-CC-01 /
          // T-ORD-09): a customer without a verified ownership credential is
          // rejected without revealing the order's existence.
          // (NOT_ALLOWED would map to 400.)
          throw new MedusaError(
            MedusaError.Types.FORBIDDEN,
            "You do not have access to create a return for this order"
          )
        },
      ],
    },
    {
      matcher: "/admin/uploads",
      methods: ["POST"],
      middlewares: [
        (req, _res, next) => {
          const files = (req as unknown as { files?: UploadedFile[] }).files ?? []
          for (const file of files) {
            if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
              throw new MedusaError(
                MedusaError.Types.INVALID_DATA,
                `File type "${file.mimetype}" is not allowed. Allowed types: ${[
                  ...ALLOWED_UPLOAD_MIME_TYPES,
                ].join(", ")}`
              )
            }
            if (file.size > getMaxUploadSizeBytes()) {
              throw new MedusaError(
                MedusaError.Types.INVALID_DATA,
                `File "${file.originalname}" exceeds the maximum upload size of ${getMaxUploadSizeBytes() / (1024 * 1024)} MB`
              )
            }
          }
          next()
        },
      ],
    },
  ],
})