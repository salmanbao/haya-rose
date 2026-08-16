import { HttpTypes } from "@medusajs/types"
import { categoryMatchesPath, findCategoryInTree } from "./category-path"

const category = (
  handle: string,
  parent?: HttpTypes.StoreProductCategory
): HttpTypes.StoreProductCategory =>
  ({
    id: `pc_${handle}`,
    handle,
    name: handle,
    parent_category: parent ?? null,
    category_children: [] as HttpTypes.StoreProductCategory[],
  }) as HttpTypes.StoreProductCategory

const categoryWithChildren = (
  handle: string,
  children: HttpTypes.StoreProductCategory[]
): HttpTypes.StoreProductCategory =>
  ({
    id: `pc_${handle}`,
    handle,
    name: handle,
    parent_category: null,
    category_children: children,
  }) as HttpTypes.StoreProductCategory

describe("categoryMatchesPath", () => {
  it("matches a single-segment leaf category", () => {
    const leaf = category("boys-t-shirts")

    expect(categoryMatchesPath(["boys-t-shirts"], leaf)).toBe(true)
  })

  it("matches a full ancestor chain", () => {
    const babyClothing = category("baby-clothing")
    const boys = category("boys", babyClothing)
    const leaf = category("boys-t-shirts", boys)

    expect(categoryMatchesPath(["baby-clothing", "boys", "boys-t-shirts"], leaf)).toBe(
      true
    )
  })

  it("matches a flat leaf url of a nested category", () => {
    const babyClothing = category("baby-clothing")
    const boys = category("boys", babyClothing)
    const leaf = category("boys-t-shirts", boys)

    expect(categoryMatchesPath(["boys-t-shirts"], leaf)).toBe(true)
  })

  it("rejects when an ancestor handle differs from the path", () => {
    const babyClothing = category("baby-clothing")
    const girls = category("girls", babyClothing)
    const leaf = category("girls-dresses", girls)

    expect(categoryMatchesPath(["baby-clothing", "boys", "girls-dresses"], leaf)).toBe(
      false
    )
  })

  it("rejects when the path has more segments than the chain", () => {
    const babyClothing = category("baby-clothing")
    const boys = category("boys", babyClothing)
    const leaf = category("boys-t-shirts", boys)

    expect(
      categoryMatchesPath(["baby-clothing", "boys", "boys-t-shirts", "extra"], leaf)
    ).toBe(false)
  })

  it("rejects when the chain has more segments than the path and it is not a flat leaf url", () => {
    const babyClothing = category("baby-clothing")
    const boys = category("boys", babyClothing)
    const leaf = category("boys-t-shirts", boys)

    expect(categoryMatchesPath(["boys", "boys-t-shirts"], leaf)).toBe(false)
  })

  it("rejects an empty path", () => {
    const leaf = category("boys-t-shirts")

    expect(categoryMatchesPath([], leaf)).toBe(false)
  })

  it("rejects when the chain cannot be resolved past a missing parent", () => {
    const babyClothing = category("baby-clothing")
    const leaf = category("boys-t-shirts", babyClothing)

    expect(categoryMatchesPath(["baby-clothing", "boys", "boys-t-shirts"], leaf)).toBe(
      false
    )
  })
})

describe("findCategoryInTree", () => {
  it("finds a deep leaf and returns its full chain", () => {
    const babyClothing = categoryWithChildren("baby-clothing", [
      categoryWithChildren("girls", [category("girls-dresses")]),
      categoryWithChildren("boys", [category("boys-t-shirts")]),
    ])

    const result = findCategoryInTree([babyClothing], "boys-t-shirts")

    expect(result?.category.handle).toBe("boys-t-shirts")
    expect(result?.chain.map((c) => c.handle)).toEqual([
      "baby-clothing",
      "boys",
      "boys-t-shirts",
    ])
  })

  it("returns a single-node chain for a root category", () => {
    const babyClothing = categoryWithChildren("baby-clothing", [])

    const result = findCategoryInTree([babyClothing], "baby-clothing")

    expect(result?.chain.map((c) => c.handle)).toEqual(["baby-clothing"])
  })

  it("returns null when the handle is not in the tree", () => {
    const babyClothing = categoryWithChildren("baby-clothing", [
      categoryWithChildren("girls", [category("girls-dresses")]),
    ])

    expect(findCategoryInTree([babyClothing], "does-not-exist")).toBeNull()
  })

  it("returns null for an empty tree", () => {
    expect(findCategoryInTree([], "boys-t-shirts")).toBeNull()
  })

  it("does not recurse into a cyclic tree", () => {
    const self = {} as HttpTypes.StoreProductCategory
    self.category_children = [self]
    ;(self as { handle: string }).handle = "cycle"

    const result = findCategoryInTree([self], "missing")

    expect(result).toBeNull()
  })

  it("prefers the deepest chain when a handle appears at multiple depths", () => {
    const babyClothing = categoryWithChildren("baby-clothing", [
      categoryWithChildren("girls", [category("girls-dresses")]),
    ])
    const flatGirls = categoryWithChildren("girls", [category("girls-dresses")])

    const result = findCategoryInTree([babyClothing, flatGirls], "girls-dresses")

    expect(result?.chain.map((c) => c.handle)).toEqual([
      "baby-clothing",
      "girls",
      "girls-dresses",
    ])
  })
})
