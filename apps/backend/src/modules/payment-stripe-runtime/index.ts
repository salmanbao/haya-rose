import { ModuleProvider, Modules } from "@medusajs/framework/utils"

import { StripeRuntimeProviderService } from "./service"

const services = [StripeRuntimeProviderService]

export default ModuleProvider(Modules.PAYMENT, {
  services,
})

export { StripeRuntimeProviderService }
