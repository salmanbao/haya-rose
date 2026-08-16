import { defineMiddlewares, MedusaRequest } from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { decideCartOwnership } from "./store/carts/ownership"

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