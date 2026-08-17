import { Module } from "@medusajs/framework/utils"

import PaymentConfigModuleService, { PAYMENT_CONFIG_MODULE } from "./service"

export default Module(PAYMENT_CONFIG_MODULE, {
  service: PaymentConfigModuleService,
})

export { PAYMENT_CONFIG_MODULE, PaymentConfigModuleService }
