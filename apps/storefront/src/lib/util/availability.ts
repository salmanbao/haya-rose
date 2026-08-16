import { HttpTypes } from "@medusajs/types"

export const isVariantAvailable = (
  variant: HttpTypes.StoreProductVariant | null | undefined
): boolean => {
  if (!variant) {
    return false
  }

  if (!variant.manage_inventory) {
    return true
  }

  if (variant.allow_backorder) {
    return true
  }

  return (variant.inventory_quantity || 0) > 0
}
