import { InventoryTypes } from "@medusajs/framework/types"

/**
 * Metadata key on `inventory_level.metadata` holding the per-level low-stock
 * threshold (BD-I-03). The value is a non-negative integer: when the level's
 * available quantity (stocked − reserved) is at or below this threshold, the
 * level is considered low-stock.
 *
 * Stored in the native `inventory_level.metadata` JSONB column (verified on the
 * InventoryLevel model in @medusajs/inventory@2.19.0) — no custom persistence.
 * The notification channel is deferred to the Notifications specification; this
 * module only exposes the trigger condition (REQ-INV-017).
 */
export const LOW_STOCK_THRESHOLD_KEY = "low_stock_threshold"

/**
 * Reads the configured low-stock threshold from an inventory level's metadata.
 * Returns `undefined` when no valid threshold is configured (missing key,
 * non-finite, negative, or non-numeric value). A zero threshold is valid.
 */
export function getLowStockThreshold(
  level: Pick<InventoryTypes.InventoryLevelDTO, "metadata">
): number | undefined {
  const metadata = level.metadata ?? {}
  const value = metadata[LOW_STOCK_THRESHOLD_KEY]
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined
  }
  return value
}

/**
 * Whether the level is at or below its configured low-stock threshold.
 * `available_quantity` (stocked − reserved) is the authoritative trigger basis
 * (REQ-INV-013/017). Levels without a configured threshold are never low-stock.
 */
export function isAtOrBelowLowStockThreshold(
  level: Pick<
    InventoryTypes.InventoryLevelDTO,
    "available_quantity" | "metadata"
  >
): boolean {
  const threshold = getLowStockThreshold(level)
  if (threshold === undefined) {
    return false
  }
  const available = Number(level.available_quantity ?? 0)
  if (!Number.isFinite(available)) {
    return false
  }
  return available <= threshold
}
