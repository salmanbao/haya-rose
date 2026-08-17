import { ModuleProvider, Modules } from "@medusajs/framework/utils"

import { SafepayProviderService } from "./service"

const services = [SafepayProviderService]

export default ModuleProvider(Modules.PAYMENT, {
  services,
})

export { SafepayProviderService }
