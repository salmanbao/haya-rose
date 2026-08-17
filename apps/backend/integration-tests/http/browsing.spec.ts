import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"

import initialDataSeed from "../../src/migration-scripts/initial-data-seed"
import seedMarkets from "../../src/migration-scripts/seed-markets"
import seedInventory from "../../src/migration-scripts/seed-inventory"
import seedCatalog from "../../src/migration-scripts/seed-catalog"

jest.setTimeout(120 * 1000)

const BROWSE_URL = "/store/products/browse"

const TEE_HANDLE = "baby-cotton-t-shirt"
const DRESS_HANDLE = "girls-cotton-dress"
const SHIRT_HANDLE = "boys-short-sleeve-shirt"
const SLEEPSUIT_HANDLE = "unisex-cotton-sleepsuit"

const SEED_PRODUCT_COUNT = 4

const pkrRegionId = async (container: any) => {
  const regionModule = container.resolve(Modules.REGION)
  const [region] = await regionModule.listRegions({ currency_code: "pkr" })
  if (!region) {
    throw new Error("No PKR region found; seed-markets must run first")
  }
  return region.id
}

const getOptionValueId = async (
  container: any,
  productId: string,
  optionTitle: string,
  value: string
) => {
  const productModule = container.resolve(Modules.PRODUCT)
  const variants = await productModule.listProductVariants(
    { product_id: productId },
    { relations: ["options", "options.option"] }
  )
  for (const variant of variants) {
    for (const variantOption of variant.options ?? []) {
      if (variantOption.option?.title === optionTitle && variantOption.value === value) {
        return variantOption.id
      }
    }
  }
  throw new Error(`Option value ${optionTitle}/${value} not found on product ${productId}`)
}

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
      await seedInventory({ container })
      await seedCatalog({ container })
      await utils.waitWorkflowExecutions()
    }

    const getPublishableKeyForDefaultChannel = async () => {
      const container = getContainer()
      const apiKeyModule = container.resolve(Modules.API_KEY)
      const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
      const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
      const keyChannelLinkService = remoteLink.getLinkModule(
        Modules.API_KEY,
        "publishable_key_id",
        Modules.SALES_CHANNEL,
        "sales_channel_id"
      )!

      const [defaultChannel] = await salesChannelModule.listSalesChannels({
        name: "Default Sales Channel",
      })
      const publishableKeys = await apiKeyModule.listApiKeys(
        { type: "publishable" },
        { take: null }
      )
      for (const key of publishableKeys) {
        const links = (await keyChannelLinkService.list({
          publishable_key_id: key.id,
        })) as { publishable_key_id: string; sales_channel_id: string }[]
        if (
          links.some((link) => link.sales_channel_id === defaultChannel.id)
        ) {
          return key
        }
      }
      throw new Error("No publishable key linked to the default channel")
    }

    const getDefaultSalesChannel = async () => {
      const container = getContainer()
      const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
      const [channel] = await salesChannelModule.listSalesChannels({
        name: "Default Sales Channel",
      })
      if (!channel) {
        throw new Error("Default sales channel not found")
      }
      return channel
    }

    const getSeededCatalog = async () => {
      const container = getContainer()
      const productModule = container.resolve(Modules.PRODUCT)
      const products = await productModule.listProducts(
        { handle: [TEE_HANDLE, DRESS_HANDLE, SHIRT_HANDLE, SLEEPSUIT_HANDLE] },
        {
          relations: [
            "variants",
            "variants.options",
            "variants.options.option",
            "categories",
            "tags",
            "collection",
            "options",
            "options.values",
          ],
          take: null,
        }
      )
      const byHandle = Object.fromEntries(
        products.map((product) => [product.handle, product])
      )
      return { container, productModule, products, byHandle }
    }

    let publishableKey: { token: string }
    let regionId: string
    let headers: Record<string, string>

    beforeAll(async () => {
      await runSeeds()
      publishableKey = await getPublishableKeyForDefaultChannel()
      regionId = await pkrRegionId(getContainer())
      headers = {
        "x-publishable-api-key": publishableKey.token,
      }
    })

    const browse = async (query: Record<string, unknown> = {}) => {
      const searchParams = new URLSearchParams({
        region_id: regionId,
      })
      for (const [key, value] of Object.entries(query)) {
        const values = Array.isArray(value) ? value : [value]
        for (const entry of values) {
          searchParams.append(key, String(entry))
        }
      }
      return api.get(`${BROWSE_URL}?${searchParams.toString()}`, {
        headers,
        validateStatus: () => true,
      })
    }

const handlesOf = (products: any[]) =>
  products.map((product: any) => product.handle)

const mustFind = <T>(items: T[], predicate: (item: T) => boolean, message: string): T => {
  const found = items.find(predicate)
  if (!found) {
    throw new Error(message)
  }
  return found
}

    describe("validation", () => {
      it("returns 400 when no publishable key is sent", async () => {
        const response = await api.get(
          `${BROWSE_URL}?region_id=${regionId}`,
          { validateStatus: () => true }
        )
        expect(response.status).toBe(400)
        expect(response.data.message).toContain(
          "Publishable API key required in the request header"
        )
      })

      it("returns 400 when region_id is missing", async () => {
        const response = await api.get(BROWSE_URL, {
          headers,
          validateStatus: () => true,
        })
        expect(response.status).toBe(400)
        expect(response.data.type).toBe("invalid_data")
      })

      it("returns 400 when region_id does not exist", async () => {
        const response = await api.get(`${BROWSE_URL}?region_id=reg_missing`, {
          headers,
          validateStatus: () => true,
        })
        expect(response.status).toBe(400)
        expect(response.data.message).toContain("not found when populating the pricing context")
      })

      it("returns 400 for an invalid sort_by", async () => {
        const response = await browse({ sort_by: "sideways" })
        expect(response.status).toBe(400)
        expect(response.data.type).toBe("invalid_data")
      })

      it("returns 400 for min_price above max_price", async () => {
        const response = await browse({ min_price: 5000, max_price: 1000 })
        expect(response.status).toBe(400)
        expect(response.data.type).toBe("invalid_data")
      })

      it("returns 400 for a negative min_price", async () => {
        const response = await browse({ min_price: -1 })
        expect(response.status).toBe(400)
        expect(response.data.type).toBe("invalid_data")
      })

      it("returns 400 for limit above 100", async () => {
        const response = await browse({ limit: 101 })
        expect(response.status).toBe(400)
        expect(response.data.type).toBe("invalid_data")
      })

      it("returns 400 for an invalid availability value", async () => {
        const response = await browse({ availability: "maybe" })
        expect(response.status).toBe(400)
        expect(response.data.type).toBe("invalid_data")
      })
    })

    describe("listing", () => {
      it("returns all published products with store shape, prices and inventory", async () => {
        const response = await browse()
        expect(response.status).toBe(200)
        expect(response.data.count).toBe(SEED_PRODUCT_COUNT)
        expect(response.data.products).toHaveLength(SEED_PRODUCT_COUNT)
        expect(response.data.limit).toBe(50)
        expect(response.data.offset).toBe(0)

        const tee = response.data.products.find(
          (product: any) => product.handle === TEE_HANDLE
        )
        expect(tee).toBeDefined()
        expect(tee.status).toBe(ProductStatus.PUBLISHED)
        expect(tee.categories.length).toBeGreaterThan(0)
        expect(tee.tags.length).toBeGreaterThan(0)
        expect(tee.variants.length).toBeGreaterThan(0)
        expect(tee.variants[0].calculated_price.currency_code).toBe("pkr")
        expect(tee.variants[0].calculated_price.calculated_amount).toBe(2500)
        expect(tee.variants[0].inventory_quantity).toBeDefined()
        expect(tee.metadata).toBeUndefined()
      })

      it("excludes products that are not in the publishable key's sales channels", async () => {
        const container = getContainer()
        const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
        const productModule = container.resolve(Modules.PRODUCT)
        const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)

        const [otherChannel] = await salesChannelModule.createSalesChannels([
          { name: "Other Channel" },
        ])
        const [hiddenProduct] = await productModule.createProducts([
          {
            title: "Hidden Channel Product",
            handle: "hidden-channel-product",
            status: ProductStatus.PUBLISHED,
            options: [{ title: "Size", values: ["0-3M"] }],
            variants: [
              {
                title: "0-3M",
                options: { Size: "0-3M" },
              },
            ],
          },
        ])

        await remoteLink.create([
          {
            [Modules.PRODUCT]: { product_id: hiddenProduct.id },
            [Modules.SALES_CHANNEL]: { sales_channel_id: otherChannel.id },
          },
        ])

        const response = await browse()
        expect(response.status).toBe(200)
        expect(response.data.count).toBe(SEED_PRODUCT_COUNT)
        expect(handlesOf(response.data.products)).not.toContain(
          "hidden-channel-product"
        )
      })
    })

    describe("filters", () => {
      it("filters by gender via metadata", async () => {
        const response = await browse({ gender: "girls" })
        expect(response.status).toBe(200)
        const handles = handlesOf(response.data.products)
        expect(handles).toContain(DRESS_HANDLE)
        expect(handles).not.toContain(TEE_HANDLE)
        expect(handles).not.toContain(SHIRT_HANDLE)
      })

      it("filters by brand via metadata", async () => {
        const response = await browse({ brand: "Baby Store" })
        expect(response.status).toBe(200)
        expect(response.data.count).toBe(SEED_PRODUCT_COUNT)

        const none = await browse({ brand: "Nonexistent Brand" })
        expect(none.status).toBe(200)
        expect(none.data.count).toBe(0)
      })

      it("filters by season via metadata", async () => {
        const response = await browse({ season: "all-season" })
        expect(response.status).toBe(200)
        expect(response.data.count).toBe(SEED_PRODUCT_COUNT)

        const none = await browse({ season: "winter" })
        expect(none.status).toBe(200)
        expect(none.data.count).toBe(0)
      })

      it("filters by material (native product field)", async () => {
        const response = await browse({ material: "100% cotton" })
        expect(response.status).toBe(200)
        expect(response.data.count).toBe(SEED_PRODUCT_COUNT)

        const none = await browse({ material: "wool" })
        expect(none.status).toBe(200)
        expect(none.data.count).toBe(0)
      })

      it("filters by option_value_id for size", async () => {
        const { container, byHandle } = await getSeededCatalog()
        const sizeValueId = await getOptionValueId(
          container,
          byHandle[TEE_HANDLE].id,
          "Size",
          "0-3M"
        )
        const response = await browse({ option_value_id: sizeValueId })
        expect(response.status).toBe(200)
        // Option values are per-product: the tee's own "0-3M" value id only
        // matches the tee (every product creates its own Size option values).
        expect(handlesOf(response.data.products)).toEqual([TEE_HANDLE])
        for (const product of response.data.products) {
          const hasSize = product.variants.some((variant: any) =>
            (variant.options ?? []).some(
              (option: any) => option.value === "0-3M"
            )
          )
          expect(hasSize).toBe(true)
        }
      })

      it("filters by option_value_id for color", async () => {
        const { container, byHandle } = await getSeededCatalog()
        const pinkValueId = await getOptionValueId(
          container,
          byHandle[DRESS_HANDLE].id,
          "Color",
          "Pink"
        )
        const response = await browse({ option_value_id: pinkValueId })
        expect(response.status).toBe(200)
        expect(handlesOf(response.data.products)).toEqual([DRESS_HANDLE])
      })

      it("filters by category_id", async () => {
        const { container, byHandle } = await getSeededCatalog()
        const dressesCategory = mustFind(
          byHandle[DRESS_HANDLE].categories ?? [],
          (category: any) => category.handle === "girls-dresses",
          "girls-dresses category not found"
        )
        const response = await browse({ category_id: dressesCategory.id })
        expect(response.status).toBe(200)
        expect(handlesOf(response.data.products)).toEqual([DRESS_HANDLE])

        const teesCategory = mustFind(
          byHandle[TEE_HANDLE].categories ?? [],
          (category: any) => category.handle === "boys-t-shirts",
          "boys-t-shirts category not found"
        )
        const tees = await browse({ category_id: teesCategory.id })
        expect(tees.status).toBe(200)
        expect(handlesOf(tees.data.products)).toContain(TEE_HANDLE)
      })

      it("filters by tag_id", async () => {
        const { container, byHandle } = await getSeededCatalog()
        const newbornTag = mustFind(
          byHandle[TEE_HANDLE].tags,
          (tag: any) => tag.value === "newborn",
          "newborn tag not found"
        )
        const response = await browse({ tag_id: newbornTag.id })
        expect(response.status).toBe(200)
        const handles = handlesOf(response.data.products)
        expect(handles).toContain(TEE_HANDLE)
        for (const product of response.data.products) {
          const hasTag = (product.tags ?? []).some(
            (tag: any) => tag.id === newbornTag.id
          )
          expect(hasTag).toBe(true)
        }
      })

      it("filters by q", async () => {
        const response = await browse({ q: "dress" })
        expect(response.status).toBe(200)
        expect(handlesOf(response.data.products)).toEqual([DRESS_HANDLE])

        const none = await browse({ q: "zzzz-no-match" })
        expect(none.status).toBe(200)
        expect(none.data.count).toBe(0)
      })

      it("filters by handle (PDP lookup path)", async () => {
        const exact = await browse({ handle: TEE_HANDLE })
        expect(exact.status).toBe(200)
        expect(handlesOf(exact.data.products)).toEqual([TEE_HANDLE])
        expect(exact.data.count).toBe(1)

        const none = await browse({ handle: "zzzz-no-such-handle" })
        expect(none.status).toBe(200)
        expect(none.data.count).toBe(0)

        const multi = await browse({
          handle: [DRESS_HANDLE, TEE_HANDLE],
        })
        expect(multi.status).toBe(200)
        expect(handlesOf(multi.data.products)).toEqual(
          expect.arrayContaining([DRESS_HANDLE, TEE_HANDLE])
        )
      })

      it("filters by id (product-actions availability path)", async () => {
        const { byHandle } = await getSeededCatalog()
        const teeId = byHandle[TEE_HANDLE].id
        const response = await browse({ id: teeId })
        expect(response.status).toBe(200)
        expect(handlesOf(response.data.products)).toEqual([TEE_HANDLE])

        const none = await browse({ id: "prod_zzzz-no-such-id" })
        expect(none.status).toBe(200)
        expect(none.data.count).toBe(0)
      })

      it("filters by price range on the lowest variant price", async () => {
        const response = await browse({ min_price: 2400, max_price: 2900 })
        expect(response.status).toBe(200)
        const handles = handlesOf(response.data.products)
        expect(handles).toContain(TEE_HANDLE)
        expect(handles).toContain(SHIRT_HANDLE)
        expect(handles).not.toContain(SLEEPSUIT_HANDLE)
        expect(handles).not.toContain(DRESS_HANDLE)
        for (const product of response.data.products) {
          const minPrice = Math.min(
            ...product.variants.map(
              (variant: any) => variant.calculated_price.calculated_amount
            )
          )
          expect(minPrice).toBeGreaterThanOrEqual(2400)
          expect(minPrice).toBeLessThanOrEqual(2900)
        }
      })

      it("combines filters with AND semantics", async () => {
        const { container, byHandle } = await getSeededCatalog()
        const newbornTag = mustFind(
          byHandle[TEE_HANDLE].tags,
          (tag: any) => tag.value === "newborn",
          "newborn tag not found"
        )
        const response = await browse({
          gender: "unisex",
          tag_id: newbornTag.id,
          min_price: 2300,
          max_price: 3000,
        })
        expect(response.status).toBe(200)
        // AND semantics: the sleepsuit (pkr 2200) matches gender and tag but
        // is excluded by the price floor — only the tee remains.
        expect(handlesOf(response.data.products)).toEqual([TEE_HANDLE])
      })
    })

    describe("availability", () => {
      it("returns all products for availability=all by default", async () => {
        const response = await browse()
        expect(response.data.count).toBe(SEED_PRODUCT_COUNT)
      })

      it("returns nothing for out_of_stock when everything is in stock", async () => {
        const response = await browse({ availability: "out_of_stock" })
        expect(response.status).toBe(200)
        expect(response.data.count).toBe(0)
      })

      it("returns everything for in_stock when everything is in stock", async () => {
        const response = await browse({ availability: "in_stock" })
        expect(response.status).toBe(200)
        expect(response.data.count).toBe(SEED_PRODUCT_COUNT)
      })

      it("respects inventory levels after stock is zeroed", async () => {
        const container = getContainer()
        const { byHandle } = await getSeededCatalog()
        const dress = byHandle[DRESS_HANDLE]
        const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
        const variantLinkService = remoteLink.getLinkModule(
          Modules.PRODUCT,
          "variant_id",
          Modules.INVENTORY,
          "inventory_item_id"
        )!

        const inventoryModule = container.resolve(Modules.INVENTORY)
        for (const dressVariant of dress.variants) {
          const variantLinks = (await variantLinkService.list({
            variant_id: dressVariant.id,
          })) as { variant_id: string; inventory_item_id: string }[]
          const dressItem = mustFind(
            variantLinks,
            (link) => link.variant_id === dressVariant.id,
            "Dress variant has no inventory item"
          )
          const levels = await inventoryModule.listInventoryLevels(
            { inventory_item_id: dressItem.inventory_item_id },
            { take: null }
          )
          await inventoryModule.updateInventoryLevels(
            levels.map((level) => ({
              inventory_item_id: dressItem.inventory_item_id,
              location_id: level.location_id,
              stocked_quantity: 0,
            }))
          )
        }

        const inStock = await browse({ availability: "in_stock" })
        expect(inStock.status).toBe(200)
        expect(handlesOf(inStock.data.products)).not.toContain(DRESS_HANDLE)

        const outOfStock = await browse({ availability: "out_of_stock" })
        expect(outOfStock.status).toBe(200)
        expect(handlesOf(outOfStock.data.products)).toContain(DRESS_HANDLE)
      })
    })

    describe("sorting", () => {
      it("sorts by price ascending", async () => {
        const response = await browse({ sort_by: "price_asc" })
        expect(response.status).toBe(200)
        const handles = handlesOf(response.data.products)
        expect(handles.indexOf(SLEEPSUIT_HANDLE)).toBeLessThan(
          handles.indexOf(TEE_HANDLE)
        )
        expect(handles.indexOf(TEE_HANDLE)).toBeLessThan(
          handles.indexOf(DRESS_HANDLE)
        )
        const prices = response.data.products.map((product: any) =>
          Math.min(
            ...product.variants.map(
              (variant: any) => variant.calculated_price.calculated_amount
            )
          )
        )
        for (let i = 1; i < prices.length; i++) {
          expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1])
        }
      })

      it("sorts by price descending", async () => {
        const response = await browse({ sort_by: "price_desc" })
        expect(response.status).toBe(200)
        const handles = handlesOf(response.data.products)
        expect(handles.indexOf(DRESS_HANDLE)).toBeLessThan(
          handles.indexOf(TEE_HANDLE)
        )
        const prices = response.data.products.map((product: any) =>
          Math.min(
            ...product.variants.map(
              (variant: any) => variant.calculated_price.calculated_amount
            )
          )
        )
        for (let i = 1; i < prices.length; i++) {
          expect(prices[i]).toBeLessThanOrEqual(prices[i - 1])
        }
      })

      it("sorts by title ascending", async () => {
        const response = await browse({ sort_by: "title" })
        expect(response.status).toBe(200)
        const titles = response.data.products.map((product: any) => product.title)
        const sorted = [...titles].sort((a, b) => a.localeCompare(b))
        expect(titles).toEqual(sorted)
      })

      it("sorts by best_selling with order quantities", async () => {
        const container = getContainer()
        const orderModule = container.resolve(Modules.ORDER)
        const { byHandle } = await getSeededCatalog()
        const defaultChannel = await getDefaultSalesChannel()

        const tee = byHandle[TEE_HANDLE]
        const dress = byHandle[DRESS_HANDLE]

        await orderModule.createOrders([
          {
            email: "best-seller@example.com",
            region_id: regionId,
            currency_code: "pkr",
            sales_channel_id: defaultChannel.id,
            items: [
              {
                title: tee.title,
                quantity: 2,
                product_id: tee.id,
                variant_id: tee.variants[0].id,
                unit_price: 2500,
              },
            ],
          },
          {
            email: "best-seller@example.com",
            region_id: regionId,
            currency_code: "pkr",
            sales_channel_id: defaultChannel.id,
            items: [
              {
                title: dress.title,
                quantity: 5,
                product_id: dress.id,
                variant_id: dress.variants[0].id,
                unit_price: 4500,
              },
            ],
          },
        ])

        const response = await browse({ sort_by: "best_selling" })
        expect(response.status).toBe(200)
        const handles = handlesOf(response.data.products)
        expect(handles.indexOf(DRESS_HANDLE)).toBeLessThan(
          handles.indexOf(TEE_HANDLE)
        )
        expect(handles.indexOf(TEE_HANDLE)).toBeLessThan(
          handles.indexOf(SLEEPSUIT_HANDLE)
        )
      })

      it("sorts by relevance with a query", async () => {
        const response = await browse({
          q: "sleepsuit",
          sort_by: "relevance",
        })
        expect(response.status).toBe(200)
        expect(response.data.products[0].handle).toBe(SLEEPSUIT_HANDLE)
      })
    })

    describe("pagination", () => {
      it("paginates with an exact count", async () => {
        const first = await browse({ limit: 2, offset: 0 })
        expect(first.status).toBe(200)
        expect(first.data.products).toHaveLength(2)
        expect(first.data.count).toBe(SEED_PRODUCT_COUNT)

        const second = await browse({ limit: 2, offset: 2 })
        expect(second.status).toBe(200)
        expect(second.data.products).toHaveLength(2)
        expect(second.data.count).toBe(SEED_PRODUCT_COUNT)

        const last = await browse({ limit: 2, offset: 4 })
        expect(last.status).toBe(200)
        expect(last.data.products).toHaveLength(SEED_PRODUCT_COUNT - 4)
        expect(last.data.count).toBe(SEED_PRODUCT_COUNT)
      })

      it("keeps count consistent when combined with filters", async () => {
        const full = await browse({ material: "100% cotton" })
        expect(full.status).toBe(200)
        expect(full.data.count).toBe(SEED_PRODUCT_COUNT)

        const page = await browse({
          material: "100% cotton",
          limit: 2,
          offset: 1,
        })
        expect(page.status).toBe(200)
        expect(page.data.count).toBe(full.data.count)
        expect(page.data.products).toHaveLength(2)
        expect(page.data.products[0].id).not.toBe(full.data.products[0].id)
      })

      it("returns an empty page past the end of results", async () => {
        const response = await browse({ limit: 10, offset: 100 })
        expect(response.status).toBe(200)
        expect(response.data.products).toHaveLength(0)
        expect(response.data.count).toBe(SEED_PRODUCT_COUNT)
      })
    })
  },
})