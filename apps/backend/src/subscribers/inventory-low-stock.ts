import {
  SubscriberArgs,
  SubscriberConfig,
  MedusaContainer,
} from "@medusajs/framework"
import { ContainerRegistrationKeys, InventoryEvents, Modules } from "@medusajs/framework/utils"
import {
  getLowStockThreshold,
  isAtOrBelowLowStockThreshold,
} from "../inventory/low-stock"

/**
 * Custom domain event emitted when an inventory level is at or below its
 * configured low-stock threshold (BD-I-03). Consumers: the Notifications
 * boundary (merchant email recipient; channel selection deferred to the
 * Notifications specification). This trigger never mutates inventory
 * (REQ-INV-017).
 */
export const INVENTORY_LOW_STOCK_EVENT = "inventory.low_stock"

async function handleInventoryLevelChange({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const inventoryModule = container.resolve(Modules.INVENTORY)

  let level
  try {
    level = await inventoryModule.retrieveInventoryLevel(event.data.id)
  } catch (error) {
    // The level may have been deleted concurrently; nothing to evaluate.
    logger.debug(
      `inventory.low_stock: level ${event.data.id} not found — skipping`
    )
    return
  }

  if (!isAtOrBelowLowStockThreshold(level)) {
    return
  }

  const threshold = getLowStockThreshold(level)!
  const eventBus = container.resolve(Modules.EVENT_BUS)

  await eventBus.emit({
    name: INVENTORY_LOW_STOCK_EVENT,
    data: {
      level_id: level.id,
      inventory_item_id: level.inventory_item_id,
      location_id: level.location_id,
      available_quantity: Number(level.available_quantity ?? 0),
      stocked_quantity: Number(level.stocked_quantity ?? 0),
      threshold,
    },
  })
}

export default handleInventoryLevelChange

export const config: SubscriberConfig = {
  // Spec §19 (REQ-INV-017) names InventoryEvents as the trigger source. The
  // module events fire on every module-service mutation (seed, workflows,
  // Admin routes all funnel through the module); the workflow events fire only
  // for workflow-driven paths, and subscribing to both would double-emit since
  // workflow steps call the module service (which also emits the module event).
  /* eslint-disable @medusajs/prefer-workflow-event-over-module-event */
  event: [
    InventoryEvents.INVENTORY_LEVEL_UPDATED,
    InventoryEvents.INVENTORY_LEVEL_CREATED,
  ],
  /* eslint-enable @medusajs/prefer-workflow-event-over-module-event */
  context: {
    subscriberId: "inventory-low-stock-trigger",
  },
}
