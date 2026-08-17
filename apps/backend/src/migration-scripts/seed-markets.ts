import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PricingTypes } from "@medusajs/framework/types"
import {
  linkSalesChannelsToApiKeyWorkflow,
  updateRegionsWorkflow,
} from "@medusajs/medusa/core-flows"

const MARKETS = [
  {
    name: "Pakistan",
    currency_code: "pkr",
    countries: ["PK"],
  },
  {
    name: "United Arab Emirates",
    currency_code: "aed",
    countries: ["AE"],
  },
] as const

const DEMO_PRICES = {
  pkr: 2500,
  aed: 45,
} as const

/**
 * Approved per-market tax rates (user decision 2026-08-16): PK GST 17%,
 * AE VAT 5%. Configured via native tax regions + tax rates.
 */
const TAX_RATES: Record<string, { rate: number; code: string; name: string }> = {
  pk: { rate: 17, code: "GST", name: "Pakistan GST" },
  ae: { rate: 5, code: "VAT", name: "UAE VAT" },
} as const

const SALES_CHANNEL_NAME = "Default Sales Channel"
const PUBLISHABLE_KEY_TITLE = "Default Publishable API Key"

// Stripe (UAE/AED) provider key: `pp_{identifier}_{id}` → `pp_stripe_stripe`
// (verified in @medusajs/payment loaders). Bound to the AE region only when
// the provider is actually registered (PAYMENT_PROVIDER=stripe).
const STRIPE_PROVIDER_ID = "pp_stripe_stripe"

// Native system provider (test/dev only — real gateways replace it per market).
const SYSTEM_PROVIDER_ID = "pp_system_default"

export default async function seedMarkets({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)

  const regionModule = container.resolve(Modules.REGION)
  const taxModule = container.resolve(Modules.TAX)
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  const apiKeyModule = container.resolve(Modules.API_KEY)
  const productModule = container.resolve(Modules.PRODUCT)
  const pricingModule = container.resolve(Modules.PRICING)

  const regionIdsByCurrency = new Map<string, string>()

  logger.info("Seeding markets and pricing data...")

  for (const market of MARKETS) {
    const [existingRegion] = await regionModule.listRegions({
      name: market.name,
    })

    if (existingRegion) {
      regionIdsByCurrency.set(market.currency_code, existingRegion.id)
      continue
    }

    const region = await regionModule.createRegions({
      name: market.name,
      currency_code: market.currency_code,
      countries: [...market.countries],
    })
    regionIdsByCurrency.set(market.currency_code, region.id)
  }

  for (const countryCode of Object.keys(TAX_RATES)) {
    let [taxRegion] = await taxModule.listTaxRegions({
      country_code: countryCode,
    })

    if (!taxRegion) {
      taxRegion = await taxModule.createTaxRegions({
        country_code: countryCode,
        provider_id: "tp_system",
      })
    }

    const config = TAX_RATES[countryCode]
    const [existingRate] = await taxModule.listTaxRates(
      { tax_region_id: taxRegion.id },
      { take: 1 }
    )

    if (!existingRate) {
      await taxModule.createTaxRates({
        tax_region_id: taxRegion.id,
        rate: config.rate,
        code: config.code,
        name: config.name,
        is_default: true,
      })
    }
  }

  const [salesChannel] = await salesChannelModule.listSalesChannels({
    name: SALES_CHANNEL_NAME,
  })

  if (!salesChannel) {
    await salesChannelModule.createSalesChannels({
      name: SALES_CHANNEL_NAME,
      description: "Default sales channel",
    })
  }

  // Dev checkout parity: bind the native system payment provider
  // ("pp_system_default", verified in @medusajs/payment loaders) to both
  // markets so the storefront checkout lists a payment method and the manual
  // payment flow can be exercised end-to-end. It requires no credentials and
  // is a development/test provider only — production markets must replace it
  // with the selected per-market gateways (AssanPay etc.). Idempotent: re-runs
  // skip regions that already carry the provider.
  for (const currencyCode of ["pkr", "aed"]) {
    const regionId = regionIdsByCurrency.get(currencyCode)
    if (!regionId) {
      continue
    }
    const [regionRecord] = await regionModule.listRegions({ id: regionId })
    const boundProviderIds = (regionRecord?.payment_providers ?? []).map(
      (provider: { id: string }) => provider.id
    )
    if (!boundProviderIds.includes(SYSTEM_PROVIDER_ID)) {
      await updateRegionsWorkflow(container).run({
        input: {
          selector: { id: regionId },
          update: {
            payment_providers: [...boundProviderIds, SYSTEM_PROVIDER_ID],
          },
        },
      })
    }
  }

  // Region ↔ payment-provider bindings (T-PAY-02): bind Stripe to the AE
  // region when registered. The PK region gets no Stripe binding until
  // AssanPay's contract is verified and the provider is registered.
  if (process.env.PAYMENT_PROVIDER === "stripe") {    const aeRegion = regionIdsByCurrency.get("aed")
    if (aeRegion) {
      const [aeRegionRecord] = await regionModule.listRegions({
        id: aeRegion,
      })
      const boundProviderIds = (aeRegionRecord?.payment_providers ?? []).map(
        (provider: { id: string }) => provider.id
      )
      if (!boundProviderIds.includes(STRIPE_PROVIDER_ID)) {
        await updateRegionsWorkflow(container).run({
          input: {
            selector: { id: aeRegion },
            update: {
              payment_providers: [...boundProviderIds, STRIPE_PROVIDER_ID],
            },
          },
        })
      }
    }
  }

  const [publishableKey] = await apiKeyModule.listApiKeys({
    type: "publishable",
    title: PUBLISHABLE_KEY_TITLE,
  })

  if (!publishableKey) {
    await apiKeyModule.createApiKeys({
      title: PUBLISHABLE_KEY_TITLE,
      type: "publishable",
      created_by: "",
    })
  }

  const linkService = remoteLink.getLinkModule(
    Modules.API_KEY,
    "publishable_key_id",
    Modules.SALES_CHANNEL,
    "sales_channel_id"
)!
  const [existingLink] = await linkService.list({})

  if (!existingLink && publishableKey && salesChannel) {
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: {
        id: publishableKey.id,
        add: [salesChannel.id],
      },
    })
  }

  const variants = await productModule.listProductVariants({}, { take: null })
  const variantIds = variants.map((variant) => variant.id)

  if (variantIds.length === 0) {
    logger.info("No product variants found, skipping price seeding.")
    return
  }

  const variantLinkService = remoteLink.getLinkModule(
    Modules.PRODUCT,
    "variant_id",
    Modules.PRICING,
    "price_set_id"
)!
  const variantLinks = (await variantLinkService.list(
    { variant_id: variantIds },
    { select: ["variant_id", "price_set_id"] }
  )) as { variant_id: string; price_set_id: string }[]
  const priceSetIds = variantLinks.map((link) => link.price_set_id)

  const existingPrices = await pricingModule.listPrices(
    { price_set_id: priceSetIds },
    { relations: ["price_rules"], take: null }
  )

  const rulesFromPriceRules = (
    priceRules: { attribute: string; operator?: string; value: string }[]
  ): PricingTypes.CreatePriceSetPriceRules => {
    const rules: PricingTypes.CreatePriceSetPriceRules = {}

    for (const rule of priceRules) {
      if (rule.operator === "eq" || rule.operator === undefined) {
        rules[rule.attribute] = rule.value
      } else {
        rules[rule.attribute] = [
          {
            operator: rule.operator as PricingTypes.PricingRuleOperatorValues,
            value: Number(rule.value),
          },
        ]
      }
    }

    return rules
  }

  for (const link of variantLinks) {
    const pricesForPriceSet = existingPrices.filter(
      (price) => price.price_set_id === link.price_set_id
    )

    const preservedPrices = pricesForPriceSet.map((price) => ({
      id: price.id,
      currency_code: price.currency_code as string,
      amount: Number(price.amount),
      rules: rulesFromPriceRules(price.price_rules ?? []),
    }))

    const marketPrices = Object.entries(DEMO_PRICES).map(
      ([currencyCode, amount]) => ({
        currency_code: currencyCode,
        amount,
        rules: {
          region_id: regionIdsByCurrency.get(currencyCode) as string,
        },
      })
    )

    await pricingModule.updatePriceSets(link.price_set_id, {
      prices: [...preservedPrices, ...marketPrices],
    })
  }

  logger.info("Finished seeding markets and pricing data.")
}