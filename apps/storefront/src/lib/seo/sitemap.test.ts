import { HttpTypes } from "@medusajs/types"
import { buildSitemapEntries, flattenCategoryPaths, resolveCategoryPath } from "./sitemap"

const category = (
  id: string,
  name: string,
  handle: string,
  children: HttpTypes.StoreProductCategory[] = []
): HttpTypes.StoreProductCategory =>
  ({
    id,
    name,
    handle,
    category_children: children,
  }) as HttpTypes.StoreProductCategory

describe("flattenCategoryPaths", () => {
  it("flattens a category tree into full handle paths", () => {
    const tree = [
      category("root", "Baby Clothing", "baby-clothing", [
        category("girls", "Girls", "girls", [
          category("dresses", "Dresses", "girls-dresses"),
        ]),
        category("boys", "Boys", "boys"),
      ]),
    ]

    expect(flattenCategoryPaths(tree)).toEqual([
      ["baby-clothing"],
      ["baby-clothing", "girls"],
      ["baby-clothing", "girls", "girls-dresses"],
      ["baby-clothing", "boys"],
    ])
  })

  it("returns an empty array for an empty tree", () => {
    expect(flattenCategoryPaths([])).toEqual([])
  })
})

describe("resolveCategoryPath", () => {
  it("resolves a leaf category path with names and handles", () => {
    const tree = [
      category("root", "Baby Clothing", "baby-clothing", [
        category("girls", "Girls", "girls", [
          category("dresses", "Dresses", "girls-dresses"),
        ]),
      ]),
    ]

    expect(resolveCategoryPath(tree, "girls-dresses")).toEqual({
      names: ["Baby Clothing", "Girls", "Dresses"],
      handles: ["baby-clothing", "girls", "girls-dresses"],
    })
  })

  it("returns null when the handle is not in the tree", () => {
    const tree = [category("root", "Baby Clothing", "baby-clothing")]
    expect(resolveCategoryPath(tree, "missing")).toBeNull()
  })

  it("returns null for an empty tree", () => {
    expect(resolveCategoryPath([], "girls-dresses")).toBeNull()
  })
})

describe("buildSitemapEntries", () => {
  it("builds absolute URLs for every market and catalog page", () => {
    const entries = buildSitemapEntries({
      baseUrl: "https://store.example.com",
      countryCodes: ["pk", "ae"],
      categoryPaths: [["baby-clothing"], ["baby-clothing", "boys", "boys-t-shirts"]],
      collectionHandles: ["newborn-essentials"],
      productHandles: ["baby-cotton-t-shirt"],
    })

    expect(entries).toEqual([
      "https://store.example.com/pk",
      "https://store.example.com/pk/categories/baby-clothing",
      "https://store.example.com/pk/categories/baby-clothing/boys/boys-t-shirts",
      "https://store.example.com/pk/collections/newborn-essentials",
      "https://store.example.com/pk/products/baby-cotton-t-shirt",
      "https://store.example.com/ae",
      "https://store.example.com/ae/categories/baby-clothing",
      "https://store.example.com/ae/categories/baby-clothing/boys/boys-t-shirts",
      "https://store.example.com/ae/collections/newborn-essentials",
      "https://store.example.com/ae/products/baby-cotton-t-shirt",
    ])
  })

  it("returns an empty array when there are no country codes", () => {
    const entries = buildSitemapEntries({
      baseUrl: "https://store.example.com",
      countryCodes: [],
      categoryPaths: [["baby-clothing"]],
      collectionHandles: ["newborn-essentials"],
      productHandles: ["baby-cotton-t-shirt"],
    })

    expect(entries).toEqual([])
  })
})