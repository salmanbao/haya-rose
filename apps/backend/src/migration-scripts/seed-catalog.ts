import { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils"
import {
  createCollectionsWorkflow,
  createProductCategoriesWorkflow,
  createProductTagsWorkflow,
  createProductsWorkflow,
  deleteProductOptionsWorkflow,
  deleteProductsWorkflow,
} from "@medusajs/medusa/core-flows"

/**
 * Baby-clothing catalog seed.
 *
 * REPLACES the starter demo catalog (Medusa T-Shirt & friends) with the
 * baby-clothing catalog, per the capability matrix ("seed data replaced by
 * baby-clothing catalog"). Idempotent: re-runs resolve existing records and
 * change nothing.
 *
 * Taxonomy (approved in AGENTS.md §8):
 *   Baby Clothing → Girls (Dresses, Tops, Bottoms, Sets, Sleepwear, Outerwear)
 *                 → Boys  (Shirts, T-Shirts, Bottoms, Sets, Sleepwear, Outerwear)
 *
 * Technical notes:
 * - product_category.handle has a GLOBAL unique index, so categories that
 *   share a display name across branches (Bottoms, Sets, Sleepwear,
 *   Outerwear) use namespaced handles (e.g. "girls-bottoms"); display names
 *   stay exactly as approved. Names are NOT unique — only handles are.
 * - Gender is a product attribute (product.metadata.gender), NEVER a
 *   category; no "Unisex" category exists. A product can sit in a Boys/Girls
 *   category while carrying gender = "unisex" (AGENTS.md §8).
 * - Product attributes map to native fields (material, origin_country) and
 *   product.metadata (gender, brand, season, care_instructions, SEO); no
 *   custom persistence (AGENTS.md §8).
 * - Size IS the age range for baby clothing: the Size option values are the
 *   age/size chart (0-3M … 18-24M) carried by every variant.
 * - Variants are the sellable unit: every variant has its own SKU, EAN,
 *   prices (pkr/aed markets + eur/usd mirroring the existing store
 *   configuration), and an inventory item stocked at the Karachi and Dubai
 *   demo warehouses (quantity 100, mirroring seed-inventory).
 * - Product images are intentionally NOT seeded: real photography is
 *   business content to be uploaded through the admin API (file module).
 * - Demo content only; amounts are DEMO prices (pkr/aed aligned with
 *   seed-markets' 2500/45 baseline). Real pricing is a business decision.
 */

const STARTER_PRODUCT_HANDLES = [
  "t-shirt",
  "sweatshirt",
  "sweatpants",
  "shorts",
]

type CategoryNode = {
  name: string
  handle: string
  children?: CategoryNode[]
}

const TAXONOMY: CategoryNode = {
  name: "Baby Clothing",
  handle: "baby-clothing",
  children: [
    {
      name: "Girls",
      handle: "girls",
      children: [
        { name: "Dresses", handle: "girls-dresses" },
        { name: "Tops", handle: "girls-tops" },
        { name: "Bottoms", handle: "girls-bottoms" },
        { name: "Sets", handle: "girls-sets" },
        { name: "Sleepwear", handle: "girls-sleepwear" },
        { name: "Outerwear", handle: "girls-outerwear" },
      ],
    },
    {
      name: "Boys",
      handle: "boys",
      children: [
        { name: "Shirts", handle: "boys-shirts" },
        { name: "T-Shirts", handle: "boys-t-shirts" },
        { name: "Bottoms", handle: "boys-bottoms" },
        { name: "Sets", handle: "boys-sets" },
        { name: "Sleepwear", handle: "boys-sleepwear" },
        { name: "Outerwear", handle: "boys-outerwear" },
      ],
    },
  ],
}

const SIZES = ["0-3M", "3-6M", "6-12M", "12-18M", "18-24M"]

const COLLECTION = {
  title: "Newborn Essentials",
  handle: "newborn-essentials",
}

const TAGS = ["cotton", "newborn"]

const BABY_BASE = {
  material: "100% cotton",
  origin_country: "PK",
  weight: 200,
  season: "all-season",
  brand: "Baby Store",
  care_instructions: "Machine wash cold. Do not bleach. Tumble dry low.",
}

const PRODUCTS: {
  title: string
  handle: string
  description: string
  gender: "girls" | "boys" | "unisex"
  categoryHandles: string[]
  sizes: string[]
  colors: string[]
  tagValues: string[]
  inCollection: boolean
  skuPrefix: string
  eanPrefix: string
  prices: { pkr: number; aed: number; eur: number; usd: number }
}[] = [
  {
    title: "Baby Cotton T-Shirt",
    handle: "baby-cotton-t-shirt",
    description:
      "Soft organic-feel cotton t-shirt for babies, gentle on delicate skin.",
    gender: "unisex",
    categoryHandles: ["boys-t-shirts"],
    sizes: SIZES,
    colors: ["White", "Blue"],
    tagValues: ["cotton", "newborn"],
    inCollection: true,
    skuPrefix: "BABY-TEE",
    eanPrefix: "89012345",
    prices: { pkr: 2500, aed: 45, eur: 12, usd: 15 },
  },
  {
    title: "Girls' Cotton Dress",
    handle: "girls-cotton-dress",
    description:
      "Everyday cotton dress for baby girls with a comfortable, roomy fit.",
    gender: "girls",
    categoryHandles: ["girls-dresses"],
    sizes: ["0-3M", "3-6M", "6-12M", "12-18M"],
    colors: ["Pink"],
    tagValues: ["cotton"],
    inCollection: false,
    skuPrefix: "BABY-DRESS",
    eanPrefix: "89012346",
    prices: { pkr: 4500, aed: 80, eur: 22, usd: 26 },
  },
  {
    title: "Boys' Short-Sleeve Shirt",
    handle: "boys-short-sleeve-shirt",
    description:
      "Breathable short-sleeve cotton shirt for baby boys, easy to layer.",
    gender: "boys",
    categoryHandles: ["boys-shirts"],
    sizes: SIZES,
    colors: ["White", "Blue"],
    tagValues: ["cotton"],
    inCollection: false,
    skuPrefix: "BABY-SHIRT",
    eanPrefix: "89012347",
    prices: { pkr: 2800, aed: 50, eur: 13, usd: 16 },
  },
  {
    title: "Unisex Cotton Sleepsuit",
    handle: "unisex-cotton-sleepsuit",
    description:
      "Soft all-in-one cotton sleepsuit for newborns, designed for safe sleep.",
    gender: "unisex",
    categoryHandles: ["girls-sleepwear", "boys-sleepwear"],
    sizes: ["0-3M", "3-6M", "6-12M"],
    colors: ["White", "Grey"],
    tagValues: ["cotton", "newborn"],
    inCollection: true,
    skuPrefix: "BABY-SLEEPSUIT",
    eanPrefix: "89012348",
    prices: { pkr: 2200, aed: 40, eur: 11, usd: 14 },
  },
]

const formatSku = (prefix: string, size: string, color: string) =>
  `${prefix}-${size}-${color.toUpperCase()}`

const formatEan = (prefix: string, index: number) =>
  `${prefix}${String(index + 1).padStart(5, "0")}`

export default async function seed_catalog({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const productModule = container.resolve(Modules.PRODUCT)
  const inventoryModule = container.resolve(Modules.INVENTORY)
  const stockLocationModule = container.resolve(Modules.STOCK_LOCATION)
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK)

  logger.info("Seeding baby-clothing catalog...")

  // --- 1. Replace the starter demo catalog ---------------------------------
  const { data: starterProducts } = await query.graph({
    entity: "product",
    fields: ["id"],
    filters: { handle: STARTER_PRODUCT_HANDLES },
  })
  if (starterProducts.length) {
    logger.info(
      `Removing starter demo catalog (${starterProducts.length} products)...`
    )
    await deleteProductsWorkflow(container).run({
      input: { ids: starterProducts.map((product) => product.id) },
    })
  }

  const starterCategoryHandles = ["shirts", "sweatshirts", "pants", "merch"]
  const { data: starterCategories } = await query.graph({
    entity: "product_category",
    fields: ["id"],
    filters: { handle: starterCategoryHandles },
  })
  if (starterCategories.length) {
    await productModule.deleteProductCategories(
      starterCategories.map((category) => category.id)
    )
  }

  const { data: productsWithOptions } = await query.graph({
    entity: "product",
    fields: ["options.id"],
  })
  const usedOptionIds = new Set(
    productsWithOptions.flatMap((product) =>
      product.options.map((option) => option.id)
    )
  )
  const { data: unusedOptions } = await query.graph({
    entity: "product_option",
    fields: ["id"],
    filters: { id: { $nin: Array.from(usedOptionIds) } },
  })
  if (unusedOptions.length) {
    await deleteProductOptionsWorkflow(container).run({
      input: { ids: unusedOptions.map((option) => option.id) },
    })
  }

  // --- 2. Category hierarchy (approved taxonomy) ----------------------------
  const categoryFields = [
    "id",
    "name",
    "handle",
    "rank",
    "parent_category_id",
  ]
  const categoryIdsByHandle: Record<string, string> = {}
  const existingCategories = await productModule.listProductCategories(
    {},
    { select: categoryFields, take: null }
  )
  existingCategories.forEach((category: any) => {
    categoryIdsByHandle[category.handle] = category.id
  })

  const ensureCategory = async (
    node: CategoryNode,
    parentCategoryId?: string,
    rank = 0
  ): Promise<string> => {
    const existingId = categoryIdsByHandle[node.handle]
    if (existingId) {
      return existingId
    }
    const { result: created } = await createProductCategoriesWorkflow(container)
      .run({
        input: {
          product_categories: [
            {
              name: node.name,
              handle: node.handle,
              parent_category_id: parentCategoryId,
              rank,
              is_active: true,
              is_internal: false,
            },
          ],
        },
      })
    const createdId = created[0].id
    categoryIdsByHandle[node.handle] = createdId
    return createdId
  }

  const rootCategoryId = await ensureCategory(TAXONOMY)
  for (const [branchRank, branch] of TAXONOMY.children!.entries()) {
    const branchId = await ensureCategory(branch, rootCategoryId, branchRank)
    for (const [childRank, child] of branch.children!.entries()) {
      await ensureCategory(child, branchId, childRank)
    }
  }

  // --- 3. Tags and collection ----------------------------------------------
  const existingTags = await productModule.listProductTags({}, { take: null })
  const tagIdsByValue: Record<string, string> = Object.fromEntries(
    existingTags.map((tag: any) => [tag.value, tag.id])
  )
  const missingTags = TAGS.filter((value) => !tagIdsByValue[value])
  if (missingTags.length) {
    const { result: createdTags } = await createProductTagsWorkflow(container)
      .run({
        input: {
          product_tags: missingTags.map((value) => ({ value })),
        },
      })
    createdTags.forEach((tag) => {
      tagIdsByValue[tag.value] = tag.id
    })
  }

  const existingCollections = await productModule.listProductCollections(
    {},
    { take: null }
  )
  let collectionId = existingCollections.find(
    (collection: any) => collection.handle === COLLECTION.handle
  )?.id
  if (!collectionId) {
    const { result: createdCollection } =
      await createCollectionsWorkflow(container).run({
        input: {
          collections: [COLLECTION],
        },
      })
    collectionId = createdCollection[0].id
  }

  // --- 4. Products, variants, prices ---------------------------------------
  const [shippingProfile] = await fulfillmentModule.listShippingProfiles({
    type: "default",
  })

  const salesChannels = await salesChannelModule.listSalesChannels(
    {},
    { take: null }
  )

  const existingCatalogProducts = await productModule.listProducts(
    { handle: PRODUCTS.map((product) => product.handle) },
    { take: null }
  )
  const existingHandles = new Set(
    existingCatalogProducts.map((product: any) => product.handle)
  )

  const productsToCreate = PRODUCTS.filter(
    (product) => !existingHandles.has(product.handle)
  ).map((product) => {
    let variantIndex = 0
    return {
      title: product.title,
      handle: product.handle,
      description: product.description,
      material: BABY_BASE.material,
      origin_country: BABY_BASE.origin_country,
      weight: BABY_BASE.weight,
      status: ProductStatus.PUBLISHED,
      shipping_profile_id: shippingProfile.id,
      collection_id: product.inCollection ? collectionId : undefined,
      category_ids: product.categoryHandles.map(
        (handle) => categoryIdsByHandle[handle]
      ),
      tag_ids: product.tagValues.map((value) => tagIdsByValue[value]),
      metadata: {
        gender: product.gender,
        brand: BABY_BASE.brand,
        season: BABY_BASE.season,
        care_instructions: BABY_BASE.care_instructions,
        seo_title: product.title,
        seo_description: product.description,
      },
      options: [
        { title: "Size", values: product.sizes },
        { title: "Color", values: product.colors },
      ],
      variants: product.sizes.flatMap((size) =>
        product.colors.map((color) => {
          const ean = formatEan(product.eanPrefix, variantIndex++)
          return {
            title: `${size} / ${color}`,
            sku: formatSku(product.skuPrefix, size, color),
            ean,
            manage_inventory: true,
            options: {
              Size: size,
              Color: color,
            },
            prices: [
              { amount: product.prices.pkr, currency_code: "pkr" },
              { amount: product.prices.aed, currency_code: "aed" },
              { amount: product.prices.eur, currency_code: "eur" },
              { amount: product.prices.usd, currency_code: "usd" },
            ],
          }
        })
      ),
      sales_channels: salesChannels.map((channel) => ({ id: channel.id })),
    }
  })

  if (productsToCreate.length) {
    await createProductsWorkflow(container).run({
      input: { products: productsToCreate },
    })
  }

  // --- 5. Inventory: stock levels at the market warehouses -----------------
  const locations = await stockLocationModule.listStockLocations(
    { name: ["Karachi Warehouse", "Dubai Warehouse"] },
    { take: null }
  )
  const locationIds = locations.map((location: any) => location.id)

  const catalogProducts = await productModule.listProducts(
    { handle: PRODUCTS.map((product) => product.handle) },
    { relations: ["variants"], take: null }
  )
  const catalogVariants = catalogProducts.flatMap((product) => product.variants)

  const variantLinkService = remoteLink.getLinkModule(
    Modules.PRODUCT,
    "variant_id",
    Modules.INVENTORY,
    "inventory_item_id"
  )!

  for (const variant of catalogVariants) {
    const [link] = (await variantLinkService.list({
      variant_id: variant.id,
    })) as { variant_id: string; inventory_item_id: string }[]

    if (!link) {
      continue
    }

    const existingLevels = await inventoryModule.listInventoryLevels(
      { inventory_item_id: link.inventory_item_id },
      { take: null }
    )
    const coveredLocationIds = new Set(
      existingLevels.map((level: any) => level.location_id)
    )

    const levelsToCreate = locationIds
      .filter((locationId) => !coveredLocationIds.has(locationId))
      .map((locationId) => ({
        inventory_item_id: link.inventory_item_id,
        location_id: locationId,
        stocked_quantity: 100,
        reserved_quantity: 0,
      }))

    if (levelsToCreate.length) {
      await inventoryModule.createInventoryLevels(levelsToCreate)
    }
  }

  const categoryCount =
    1 +
    TAXONOMY.children!.length +
    TAXONOMY.children!.reduce(
      (acc, branch) => acc + branch.children!.length,
      0
    )
  logger.info(
    `Finished seeding catalog: ${PRODUCTS.length} products, ${categoryCount} categories, collection "${COLLECTION.title}", tags [${TAGS.join(", ")}].`
  )
}