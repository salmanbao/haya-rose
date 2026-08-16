import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"

import initialDataSeed from "../../src/migration-scripts/initial-data-seed"
import seedMarkets from "../../src/migration-scripts/seed-markets"
import seedInventory from "../../src/migration-scripts/seed-inventory"
import seedCatalog from "../../src/migration-scripts/seed-catalog"

const TEE_HANDLE = "baby-cotton-t-shirt"
const DRESS_HANDLE = "girls-cotton-dress"
const SHIRT_HANDLE = "boys-short-sleeve-shirt"
const SLEEPSUIT_HANDLE = "unisex-cotton-sleepsuit"

const TEE_SIZES = ["0-3M", "3-6M", "6-12M", "12-18M", "18-24M"]
const TEE_COLORS = ["White", "Blue"]
const TEE_VARIANT_COUNT = TEE_SIZES.length * TEE_COLORS.length

const APPROVED_SUBCATEGORIES: Record<string, string[]> = {
  girls: ["Dresses", "Tops", "Bottoms", "Sets", "Sleepwear", "Outerwear"],
  boys: ["Shirts", "T-Shirts", "Bottoms", "Sets", "Sleepwear", "Outerwear"],
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

    const getVariantPriceAmounts = async (variantId: string) => {
      const container = getContainer()
      const pricingModule = container.resolve(Modules.PRICING)
      const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
      const variantLinkService = remoteLink.getLinkModule(
        Modules.PRODUCT,
        "variant_id",
        Modules.PRICING,
        "price_set_id"
      )!
      const [variantLink] = (await variantLinkService.list({
        variant_id: variantId,
      })) as { variant_id: string; price_set_id: string }[]
      if (!variantLink) return {}
      const [priceSet] = await pricingModule.listPriceSets(
        { id: [variantLink.price_set_id] },
        { relations: ["prices"] }
      )
      return Object.fromEntries(
        (priceSet?.prices ?? []).map((price: any) => [
          price.currency_code,
          Number(price.amount.toString()),
        ])
      )
    }

    const getVariantInventory = async (variantId: string) => {
      const container = getContainer()
      const inventoryModule = container.resolve(Modules.INVENTORY)
      const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)
      const variantLinkService = remoteLink.getLinkModule(
        Modules.PRODUCT,
        "variant_id",
        Modules.INVENTORY,
        "inventory_item_id"
      )!
      const [variantLink] = (await variantLinkService.list({
        variant_id: variantId,
      })) as { variant_id: string; inventory_item_id: string }[]
      if (!variantLink) return { item: undefined, levels: [] }
      const [item] = await inventoryModule.listInventoryItems({
        id: variantLink.inventory_item_id,
      })
      const levels = await inventoryModule.listInventoryLevels(
        { inventory_item_id: item.id },
        { take: null }
      )
      return { item, levels }
    }

    const getMarketLocationIds = async () => {
      const container = getContainer()
      const stockLocationModule = container.resolve(Modules.STOCK_LOCATION)
      const locations = await stockLocationModule.listStockLocations(
        { name: ["Karachi Warehouse", "Dubai Warehouse"] },
        { take: null }
      )
      const byName = Object.fromEntries(
        locations.map((location: any) => [location.name, location.id])
      )
      return { byName, container }
    }

    beforeAll(async () => {
      await runSeeds()
    })

    describe("Catalog & Categories seed", () => {
      it("replaces the starter demo catalog (products, categories, options, inventory)", async () => {
        const container = getContainer()
        const productModule = container.resolve(Modules.PRODUCT)
        const inventoryModule = container.resolve(Modules.INVENTORY)

        const starterProducts = await productModule.listProducts(
          { handle: ["t-shirt", "sweatshirt", "sweatpants", "shorts"] },
          { take: null }
        )
        expect(starterProducts).toHaveLength(0)

        const starterCategories = await productModule.listProductCategories(
          { handle: ["shirts", "sweatshirts", "pants", "merch"] },
          { take: null }
        )
        expect(starterCategories).toHaveLength(0)

        const starterSizeValues = await productModule.listProductOptionValues(
          { value: ["S", "M", "L", "XL"] },
          { take: null }
        )
        expect(starterSizeValues).toHaveLength(0)

        const starterItems = await inventoryModule.listInventoryItems(
          { sku: "SHIRT-S-BLACK" },
          { take: null }
        )
        expect(starterItems).toHaveLength(0)

        const { byName } = await getMarketLocationIds()
        expect(byName["Karachi Warehouse"]).toBeDefined()
        expect(byName["Dubai Warehouse"]).toBeDefined()
      })

      it("creates the approved category hierarchy with the exact initial taxonomy", async () => {
        const { container } = await getSeededCatalog()
        const productModule = container.resolve(Modules.PRODUCT)

        const [babyClothing] = await productModule.listProductCategories(
          { handle: "baby-clothing" },
          {
            select: ["name", "handle", "is_active", "is_internal"],
            take: null,
          }
        )
        expect(babyClothing).toBeDefined()
        expect(babyClothing.is_active).toBe(true)
        expect(babyClothing.is_internal).toBe(false)

        const [babyWithChildren] = await productModule.listProductCategories(
          { handle: "baby-clothing" },
          {
            select: ["name", "handle", "parent_category_id"],
            relations: ["category_children"],
            take: null,
          }
        )
        const childHandles = babyWithChildren.category_children
          .map((child: any) => child.handle)
          .sort()
        expect(childHandles).toEqual(["boys", "girls"])

        for (const [parentHandle, children] of Object.entries(
          APPROVED_SUBCATEGORIES
        )) {
          const [parent] = await productModule.listProductCategories(
            { handle: parentHandle },
            {
              select: ["name", "handle", "parent_category_id"],
              relations: ["category_children"],
              take: null,
            }
          )
          expect(parent).toBeDefined()
          const childNames = parent.category_children
            .map((child: any) => child.name)
            .sort()
          expect(childNames).toEqual([...children].sort())
          for (const child of parent.category_children) {
            expect(child.is_active).toBe(true)
            expect(child.is_internal).toBe(false)
          }
        }

        const allCategories = await productModule.listProductCategories(
          {},
          {
            select: ["name", "handle", "is_active", "is_internal"],
            take: null,
          }
        )
        expect(allCategories).toHaveLength(15)
      })

      it("keeps gender as a product attribute separate from the category taxonomy", async () => {
        const { container, byHandle } = await getSeededCatalog()
        const productModule = container.resolve(Modules.PRODUCT)

        const unisexCategories = await productModule.listProductCategories(
          { name: "Unisex" },
          { select: ["id"], take: null }
        )
        expect(unisexCategories).toHaveLength(0)

        const tee = byHandle[TEE_HANDLE]
        expect(tee.metadata?.gender).toBe("unisex")
        const teeCategoryNames = (tee.categories ?? []).map((c: any) => c.name)
        expect(teeCategoryNames).toContain("T-Shirts")

        const dress = byHandle[DRESS_HANDLE]
        expect(dress.metadata?.gender).toBe("girls")
        const dressCategoryNames = (dress.categories ?? []).map(
          (c: any) => c.name
        )
        expect(dressCategoryNames).toContain("Dresses")

        const sleepsuit = byHandle[SLEEPSUIT_HANDLE]
        expect(sleepsuit.metadata?.gender).toBe("unisex")
        const sleepsuitCategoryNames = (sleepsuit.categories ?? []).map(
          (c: any) => c.name
        )
        expect(sleepsuitCategoryNames).toContain("Sleepwear")
      })

      it("creates products with size and color variants, each with its own SKU and EAN", async () => {
        const { byHandle } = await getSeededCatalog()

        const tee = byHandle[TEE_HANDLE]
        expect(tee).toBeDefined()
        expect(tee.variants).toHaveLength(TEE_VARIANT_COUNT)

        const skus = tee.variants.map((v: any) => v.sku)
        expect(new Set(skus).size).toBe(skus.length)
        expect(tee.variants.every((v: any) => v.ean)).toBe(true)
        expect(tee.variants.every((v: any) => v.manage_inventory)).toBe(true)

        const [whiteVariant] = tee.variants.filter(
          (v: any) => v.sku === "BABY-TEE-0-3M-WHITE"
        )
        expect(whiteVariant).toBeDefined()
        const optionMap = Object.fromEntries(
          whiteVariant.options.map((o: any) => [o.option?.title, o.value])
        )
        expect(optionMap.Size).toBe("0-3M")
        expect(optionMap.Color).toBe("White")

        const optionTitles = tee.options
          .map((o: any) => o.title)
          .sort()
        expect(optionTitles).toEqual(["Color", "Size"])
        const sizeValues = tee.options
          .find((o: any) => o.title === "Size")!
          .values.map((v: any) => v.value)
        expect(sizeValues).toEqual(TEE_SIZES)
      })

      it("prices every variant in the market currencies and resolves region-correct store prices", async () => {
        const { container, byHandle, products } = await getSeededCatalog()

        for (const product of products) {
          for (const variant of product.variants) {
            const amounts = await getVariantPriceAmounts(variant.id)
            expect(amounts.pkr).toBeDefined()
            expect(amounts.aed).toBeDefined()
            expect(amounts.eur).toBeDefined()
            expect(amounts.usd).toBeDefined()
          }
        }

        const regionModule = container.resolve(Modules.REGION)
        const [pakistan] = await regionModule.listRegions({
          name: "Pakistan",
        })
        const storefrontKey = await getPublishableKeyForDefaultChannel()

        const response = await api.get(
          `/store/products?region_id=${pakistan.id}`,
          { headers: { "x-publishable-api-key": storefrontKey.token } }
        )
        expect(response.status).toBe(200)
        const handles = response.data.products.map(
          (product: any) => product.handle
        )
        expect(handles).toContain(TEE_HANDLE)
        const tee = response.data.products.find(
          (product: any) => product.handle === TEE_HANDLE
        )
        const variant = tee.variants[0]
        expect(variant.calculated_price.currency_code).toBe("pkr")
        expect(variant.calculated_price.calculated_amount).toBe(2500)
      })

      it("links every variant to inventory items stocked at the market warehouses", async () => {
        const { products } = await getSeededCatalog()
        const { byName } = await getMarketLocationIds()
        const karachiId = byName["Karachi Warehouse"]
        const dubaiId = byName["Dubai Warehouse"]

        for (const product of products) {
          for (const variant of product.variants) {
            const { item, levels } = await getVariantInventory(variant.id)
            expect(item).toBeDefined()
            const byLocation = Object.fromEntries(
              levels.map((level: any) => [
                level.location_id,
                Number(level.stocked_quantity.toString()),
              ])
            )
            expect(Object.keys(byLocation).sort()).toEqual(
              [karachiId, dubaiId].sort()
            )
            expect(byLocation[karachiId]).toBe(100)
            expect(byLocation[dubaiId]).toBe(100)
            expect(
              levels.every((level: any) =>
                Number(level.reserved_quantity.toString()) === 0
              )
            ).toBe(true)
          }
        }
      })

      it("assigns products to the demo collection and carries tags", async () => {
        const { byHandle, products } = await getSeededCatalog()

        const tee = byHandle[TEE_HANDLE]
        expect(tee.collection).toBeDefined()
        expect(tee.collection?.title).toBe("Newborn Essentials")

        const sleepsuit = byHandle[SLEEPSUIT_HANDLE]
        expect(sleepsuit.collection?.id).toBe(tee.collection?.id)

        const collectionProductIds = products
          .filter((p: any) => p.collection?.id === tee.collection?.id)
          .map((p: any) => p.handle)
        expect(collectionProductIds).toContain(TEE_HANDLE)
        expect(collectionProductIds).toContain(SLEEPSUIT_HANDLE)

        const tagValues = products.flatMap((p: any) =>
          (p.tags ?? []).map((t: any) => t.value)
        )
        expect(tagValues).toContain("cotton")
        expect(tagValues).toContain("newborn")
      })

      it("stores attributes in native fields and metadata (no custom persistence)", async () => {
        const { byHandle } = await getSeededCatalog()

        const tee = byHandle[TEE_HANDLE]
        expect(tee.material).toBe("100% cotton")
        expect(tee.origin_country).toBe("PK")
        expect(tee.metadata?.gender).toBeDefined()
        expect(tee.metadata?.brand).toBeDefined()
        expect(tee.metadata?.season).toBeDefined()
        expect(tee.metadata?.care_instructions).toBeDefined()
        expect(tee.metadata?.seo_title).toBeDefined()
        expect(tee.metadata?.seo_description).toBeDefined()
      })

      it("serves the full category tree and category-filtered products through the store API", async () => {
        const container = getContainer()
        const productModule = container.resolve(Modules.PRODUCT)
        const storefrontKey = await getPublishableKeyForDefaultChannel()

        const treeResponse = await api.get(
          "/store/product-categories?include_descendants_tree=true",
          { headers: { "x-publishable-api-key": storefrontKey.token } }
        )
        expect(treeResponse.status).toBe(200)
        const tree = treeResponse.data.product_categories
        const babyClothing = tree.find(
          (category: any) => category.handle === "baby-clothing"
        )
        expect(babyClothing).toBeDefined()
        const girls = babyClothing.category_children.find(
          (child: any) => child.handle === "girls"
        )
        expect(girls).toBeDefined()
        expect(girls.category_children.length).toBe(6)

        const [teeCategory] = await productModule.listProductCategories(
          { handle: "boys-t-shirts" },
          { select: ["id"], take: null }
        )
        const filtered = await api.get(
          `/store/products?category_id=${teeCategory.id}&fields=id,title,handle`,
          { headers: { "x-publishable-api-key": storefrontKey.token } }
        )
        expect(filtered.status).toBe(200)
        expect(
          filtered.data.products.some((p: any) => p.handle === TEE_HANDLE)
        ).toBe(true)
      })

      it("is idempotent — running the catalog seed again changes nothing", async () => {
        const { container, products } = await getSeededCatalog()
        const productModule = container.resolve(Modules.PRODUCT)
        const inventoryModule = container.resolve(Modules.INVENTORY)
        const regionModule = container.resolve(Modules.REGION)

        const levelCountBefore = (
          await inventoryModule.listInventoryLevels({}, { take: null })
        ).length
        const itemCountBefore = (
          await inventoryModule.listInventoryItems({}, { take: null })
        ).length
        const regionCountBefore = (
          await regionModule.listRegions({}, { take: null })
        ).length

        await seedCatalog({ container })
        await utils.waitWorkflowExecutions()

        const productsAfter = await productModule.listProducts(
          { handle: [TEE_HANDLE, DRESS_HANDLE, SHIRT_HANDLE, SLEEPSUIT_HANDLE] },
          { take: null }
        )
        expect(productsAfter).toHaveLength(products.length)

        const categoriesAfter = await productModule.listProductCategories(
          {},
          { select: ["id"], take: null }
        )
        expect(categoriesAfter).toHaveLength(15)

        const itemsAfter = await inventoryModule.listInventoryItems(
          {},
          { take: null }
        )
        expect(itemsAfter.length).toBe(itemCountBefore)

        const levelsAfter = await inventoryModule.listInventoryLevels(
          {},
          { take: null }
        )
        expect(levelsAfter.length).toBe(levelCountBefore)

        const regionsAfter = await regionModule.listRegions({}, { take: null })
        expect(regionsAfter.length).toBe(regionCountBefore)
      })
    })
  },
})

jest.setTimeout(120 * 1000)