import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

import initialDataSeed from "../../src/migration-scripts/initial-data-seed"
import seedMarkets from "../../src/migration-scripts/seed-markets"

const DEMO_PKR_AMOUNT = 2500
const DEMO_AED_AMOUNT = 45

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer, utils }) => {
    const runSeeds = async () => {
      const container = getContainer()

      const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
      const [defaultShippingProfile] =
        await fulfillmentModule.listShippingProfiles({ type: "default" })
      if (!defaultShippingProfile) {
        await fulfillmentModule.createShippingProfiles({
          name: "Default Shipping Profile",
          type: "default",
        })
      }

      await initialDataSeed({ container })
      await seedMarkets({ container })
      await utils.waitWorkflowExecutions()
    }

    const getVariantPriceSetIds = async () => {
      const container = getContainer()
      const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
      const variantLinkService = remoteLink.getLinkModule(
        Modules.PRODUCT,
        "variant_id",
        Modules.PRICING,
        "price_set_id"
      )!
      const variantLinks = (await variantLinkService.list(
        {},
        { select: ["variant_id", "price_set_id"] }
      )) as { variant_id: string; price_set_id: string }[]
      return {
        container,
        priceSetIds: variantLinks.map((link) => link.price_set_id),
      }
    }

    const getMarketsSeed = async () => {
      const container = getContainer()
      const regionModule = container.resolve(Modules.REGION)
      const regions = await regionModule.listRegions(
        {},
        { relations: ["countries"], take: null }
      )
      const pakistan = regions.find((region) => region.name === "Pakistan")
      const uae = regions.find((region) => region.name === "United Arab Emirates")
      if (!pakistan || !uae) {
        throw new Error("Markets seed did not create the expected regions")
      }
      return { container, pakistan, uae }
    }

    beforeAll(async () => {
      await runSeeds()
    })

    describe("Markets & Pricing seed", () => {
      it("creates the Pakistan (pkr) and United Arab Emirates (aed) regions with their countries", async () => {
        const { pakistan, uae } = await getMarketsSeed()

        expect(pakistan).toBeDefined()
        expect(pakistan.currency_code).toBe("pkr")
        expect(pakistan.countries.map((country) => country.iso_2)).toContain("pk")

        expect(uae).toBeDefined()
        expect(uae.currency_code).toBe("aed")
        expect(uae.countries.map((country) => country.iso_2)).toContain("ae")
      })

      it("creates tax regions for pk and ae with the approved rates (17% GST / 5% VAT)", async () => {
        const container = getContainer()
        const taxModule = container.resolve(Modules.TAX)
        const taxRegions = await taxModule.listTaxRegions({}, { take: null })

        const pkTaxRegion = taxRegions.find((region) => region.country_code === "pk")
        const aeTaxRegion = taxRegions.find((region) => region.country_code === "ae")

        expect(pkTaxRegion).toBeDefined()
        expect(aeTaxRegion).toBeDefined()

        if (!pkTaxRegion || !aeTaxRegion) {
          throw new Error("Markets seed did not create the expected tax regions")
        }

        const pkRates = await taxModule.listTaxRates(
          { tax_region_id: pkTaxRegion.id },
          { take: null }
        )
        const aeRates = await taxModule.listTaxRates(
          { tax_region_id: aeTaxRegion.id },
          { take: null }
        )

        const pkRate = pkRates[0]
        const aeRate = aeRates[0]
        expect(pkRate).toBeDefined()
        expect(aeRate).toBeDefined()
        expect(Number(pkRate.rate)).toBe(17)
        expect(Number(aeRate.rate)).toBe(5)
        expect(pkRate.code).toBe("GST")
        expect(aeRate.code).toBe("VAT")
      })

      it("binds the native system payment provider to pk and ae so dev checkout lists a payment method", async () => {
        const container = getContainer()
        const regionModule = container.resolve(Modules.REGION)
        const apiKeyModule = container.resolve(Modules.API_KEY)
        const regions = await regionModule.listRegions({}, { take: null })

        const pakistan = regions.find((region) => region.name === "Pakistan")
        const uae = regions.find(
          (region) => region.name === "United Arab Emirates"
        )
        expect(pakistan).toBeDefined()
        expect(uae).toBeDefined()

        const [publishableKey] = await apiKeyModule.listApiKeys({
          type: "publishable",
        })
        expect(publishableKey).toBeDefined()
        const headers = {
          "x-publishable-api-key": publishableKey!.token,
        }

        // The link is observable through the store payment-providers listing
        // (same verification as REQ-PAY-003) — region.payment_providers is a
        // link, not a region model relation.
        for (const region of [pakistan, uae]) {
          const res = await api.get(
            `/store/payment-providers?region_id=${region!.id}`,
            { headers, validateStatus: () => true }
          )
          expect(res.status).toBe(200)
          const providerIds = (res.data.payment_providers ?? []).map(
            (provider: { id: string }) => provider.id
          )
          expect(providerIds).toContain("pp_system_default")
        }
      })

      it("links a publishable API key to the sales channel", async () => {
        const container = getContainer()
        const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
        const linkService = remoteLink.getLinkModule(
          Modules.API_KEY,
          "publishable_key_id",
          Modules.SALES_CHANNEL,
          "sales_channel_id"
        )!
        const links = await linkService.list({})

        expect(links.length).toBeGreaterThanOrEqual(1)
      })

      it("adds pkr and aed prices with region rules to every product variant, preserving existing prices", async () => {
        const { container, priceSetIds } = await getVariantPriceSetIds()
        const pricingModule = container.resolve(Modules.PRICING)
        const { pakistan, uae } = await getMarketsSeed()

        expect(priceSetIds).toHaveLength(20)

        const newPrices = await pricingModule.listPrices(
          {
            currency_code: ["pkr", "aed"],
            price_set_id: priceSetIds,
          },
          { relations: ["price_rules"], take: null }
        )
        expect(newPrices).toHaveLength(40)

        for (const price of newPrices) {
          const expectedRegionId =
            price.currency_code === "pkr" ? pakistan.id : uae.id
          expect(price.price_rules).toEqual([
            expect.objectContaining({
              attribute: "region_id",
              value: expectedRegionId,
            }),
          ])
        }

        const existingPrices = await pricingModule.listPrices(
          {
            currency_code: ["eur", "usd"],
            price_set_id: priceSetIds,
          },
          { take: null }
        )
        expect(existingPrices).toHaveLength(40)
      })

      it("resolves region-correct calculated prices through the store API", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)

        const { data: productChannelLinks } = await query.graph({
          entity: "product_sales_channel",
          fields: ["sales_channel_id"],
        })
        const channelIdsWithProducts = new Set(
          productChannelLinks.map((link) => link.sales_channel_id)
        )

        const apiKeyModule = container.resolve(Modules.API_KEY)
        const publishableKeys = await apiKeyModule.listApiKeys(
          { type: "publishable" },
          { take: null }
        )
        const keyChannelLinkService = remoteLink.getLinkModule(
          Modules.API_KEY,
          "publishable_key_id",
          Modules.SALES_CHANNEL,
          "sales_channel_id"
        )!

        let storefrontKey
        for (const key of publishableKeys) {
          const links = (await keyChannelLinkService.list({
            publishable_key_id: key.id,
          })) as { publishable_key_id: string; sales_channel_id: string }[]
          if (links.some((link) => channelIdsWithProducts.has(link.sales_channel_id))) {
            storefrontKey = key
            break
          }
        }
        expect(storefrontKey).toBeDefined()

        const { pakistan, uae } = await getMarketsSeed()

        const pakistanResponse = await api.get(
          `/store/products?region_id=${pakistan.id}`,
          { headers: { "x-publishable-api-key": storefrontKey.token } }
        )
        expect(pakistanResponse.status).toBe(200)
        expect(pakistanResponse.data.products.length).toBeGreaterThan(0)
        const pakistanVariant = pakistanResponse.data.products[0].variants[0]
        expect(pakistanVariant.calculated_price.currency_code).toBe("pkr")
        expect(pakistanVariant.calculated_price.calculated_amount).toBe(
          DEMO_PKR_AMOUNT
        )

        const uaeResponse = await api.get(`/store/products?region_id=${uae.id}`, {
          headers: { "x-publishable-api-key": storefrontKey.token },
        })
        expect(uaeResponse.status).toBe(200)
        expect(uaeResponse.data.products.length).toBeGreaterThan(0)
        const uaeVariant = uaeResponse.data.products[0].variants[0]
        expect(uaeVariant.calculated_price.currency_code).toBe("aed")
        expect(uaeVariant.calculated_price.calculated_amount).toBe(
          DEMO_AED_AMOUNT
        )
      })

      it("is idempotent — running the markets seed again creates no duplicates", async () => {
        const container = getContainer()
        const regionModule = container.resolve(Modules.REGION)
        const pricingModule = container.resolve(Modules.PRICING)
        const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
        const apiKeyModule = container.resolve(Modules.API_KEY)
        const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
        const linkService = remoteLink.getLinkModule(
          Modules.API_KEY,
          "publishable_key_id",
          Modules.SALES_CHANNEL,
          "sales_channel_id"
        )!
        const { priceSetIds } = await getVariantPriceSetIds()

        const snapshot = async () => ({
          regions: (await regionModule.listRegions({}, { take: null })).length,
          pkrPrices: (
            await pricingModule.listPrices(
              { currency_code: "pkr", price_set_id: priceSetIds },
              { take: null }
            )
          ).length,
          aedPrices: (
            await pricingModule.listPrices(
              { currency_code: "aed", price_set_id: priceSetIds },
              { take: null }
            )
          ).length,
          channels: (await salesChannelModule.listSalesChannels({}, { take: null }))
            .length,
          keys: (await apiKeyModule.listApiKeys({}, { take: null })).length,
          links: (await linkService.list({})).length,
        })

        const before = await snapshot()

        await seedMarkets({ container })
        await utils.waitWorkflowExecutions()

        const after = await snapshot()

        expect(before.regions).toBe(3)
        expect(before.pkrPrices).toBe(20)
        expect(before.aedPrices).toBe(20)
        expect(after).toEqual(before)
      })
    })
  },
})

jest.setTimeout(120 * 1000)