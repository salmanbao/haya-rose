import { HttpTypes } from "@medusajs/types"

export const buildCategoryChain = (
  category: HttpTypes.StoreProductCategory | null | undefined
): HttpTypes.StoreProductCategory[] => {
  if (!category) {
    return []
  }

  const parents = buildCategoryChain(category.parent_category)
  return [...parents, category]
}

export const pathMatchesChain = (
  path: string[],
  chain: HttpTypes.StoreProductCategory[]
): boolean => {
  if (path.length === 0) {
    return false
  }

  const isFullPath =
    chain.length === path.length &&
    chain.every((c, index) => c.handle === path[index])

  const isFlatLeaf =
    path.length === 1 && chain[chain.length - 1].handle === path[0]

  return isFullPath || isFlatLeaf
}

export const categoryMatchesPath = (
  path: string[],
  category: HttpTypes.StoreProductCategory
): boolean => pathMatchesChain(path, buildCategoryChain(category))

export const findCategoryInTree = (
  categories: HttpTypes.StoreProductCategory[],
  handle: string,
  chain: HttpTypes.StoreProductCategory[] = [],
  visited: Set<string> = new Set(),
  best: {
    category: HttpTypes.StoreProductCategory
    chain: HttpTypes.StoreProductCategory[]
  } | null = null
): { category: HttpTypes.StoreProductCategory; chain: HttpTypes.StoreProductCategory[] } | null => {
  for (const category of categories) {
    if (visited.has(category.id)) {
      continue
    }

    const nextChain = [...chain, category]
    const nextVisited = new Set(visited).add(category.id)

    if (category.handle === handle) {
      if (!best || nextChain.length > best.chain.length) {
        best = { category, chain: nextChain }
      }
    }

    if (category.category_children?.length) {
      const found = findCategoryInTree(
        category.category_children,
        handle,
        nextChain,
        nextVisited,
        best
      )

      if (found && (!best || found.chain.length > best.chain.length)) {
        best = found
      }
    }
  }

  return best
}
