import { Metadata } from "next"
import { notFound } from "next/navigation"
import { listProducts } from "@lib/data/products"
import { listCategories } from "@lib/data/categories"
import { getRegion, listRegions } from "@lib/data/regions"
import { getBaseURL } from "@lib/util/env"
import { buildCanonicalUrl } from "@lib/seo/canonical"
import {
  breadcrumbJsonLd,
  productJsonLd,
} from "@lib/seo/json-ld"
import { getSiteConfig } from "@lib/seo/site-config"
import { resolveCategoryPath } from "@lib/seo/sitemap"
import ProductTemplate from "@modules/products/templates"
import { HttpTypes } from "@medusajs/types"

const siteConfig = getSiteConfig()

type Props = {
  params: Promise<{ countryCode: string; handle: string }>
  searchParams: Promise<{ v_id?: string }>
}

export async function generateStaticParams() {
  try {
    const countryCodes = await listRegions().then((regions) =>
      regions?.map((r) => r.countries?.map((c) => c.iso_2)).flat()
    )

    if (!countryCodes) {
      return []
    }

    const promises = countryCodes.map(async (country) => {
      const { response } = await listProducts({
        countryCode: country,
        queryParams: { limit: 100, fields: "handle" },
      })

      return {
        country,
        products: response.products,
      }
    })

    const countryProducts = await Promise.all(promises)

    return countryProducts
      .flatMap((countryData) =>
        countryData.products.map((product) => ({
          countryCode: countryData.country,
          handle: product.handle,
        }))
      )
      .filter((param) => param.handle)
  } catch (error) {
    console.error(
      `Failed to generate static paths for product pages: ${
        error instanceof Error ? error.message : "Unknown error"
      }.`
    )
    return []
  }
}

function getImagesForVariant(
  product: HttpTypes.StoreProduct,
  selectedVariantId?: string
) {
  if (!selectedVariantId || !product.variants) {
    return product.images
  }

  const variant = product.variants!.find((v) => v.id === selectedVariantId)
  if (!variant || !variant.images?.length) {
    return product.images
  }

  const imageIdsMap = new Map(variant.images!.map((i) => [i.id, true]))
  return product.images?.filter((i) => imageIdsMap.has(i.id)) ?? null
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const { handle } = params
  const searchParams = await props.searchParams
  const region = await getRegion(params.countryCode)

  if (!region) {
    notFound()
  }

  const product = await listProducts({
    countryCode: params.countryCode,
    queryParams: { handle },
  }).then(({ response }) => response.products[0])

  if (!product) {
    notFound()
  }

  const canonical = buildCanonicalUrl({
    baseUrl: getBaseURL(),
    countryCode: params.countryCode,
    path: ["products", handle],
    params: searchParams,
  })

  return {
    title: product.title,
    description: product.description ?? undefined,
    alternates: {
      canonical,
    },
    openGraph: {
      title: product.title,
      description: product.description ?? undefined,
      images: product.thumbnail ? [product.thumbnail] : [],
    },
  }
}

export default async function ProductPage(props: Props) {
  const params = await props.params
  const region = await getRegion(params.countryCode)
  const searchParams = await props.searchParams

  const selectedVariantId = searchParams.v_id

  if (!region) {
    notFound()
  }

  const pricedProduct = await listProducts({
    countryCode: params.countryCode,
    queryParams: { handle: params.handle },
  }).then(({ response }) => response.products[0])

  const images = getImagesForVariant(pricedProduct, selectedVariantId)

  if (!pricedProduct) {
    notFound()
  }

  const canonical = buildCanonicalUrl({
    baseUrl: getBaseURL(),
    countryCode: params.countryCode,
    path: ["products", params.handle],
    params: searchParams,
  })

  const categoryTree = await listCategories()

  const productCategory = pricedProduct.categories?.[0]

  const categoryPath = productCategory
    ? resolveCategoryPath(categoryTree, productCategory.handle)
    : null

  const breadcrumbItems = [
    {
      name: siteConfig.name,
      url: `${getBaseURL().replace(/\/+$/, "")}/${params.countryCode}`,
    },
    ...(categoryPath
      ? categoryPath.handles.map((handle, index) => ({
          name: categoryPath.names[index],
          url: `${getBaseURL().replace(/\/+$/, "")}/${params.countryCode}/categories/${categoryPath.handles
            .slice(0, index + 1)
            .join("/")}`,
        }))
      : []),
    {
      name: pricedProduct.title,
      url: canonical,
    },
  ]

  const jsonLd = productJsonLd({
    product: pricedProduct,
    region,
    baseUrl: getBaseURL(),
    countryCode: params.countryCode,
    handle: params.handle,
    selectedVariantId,
  })

  const breadcrumbJsonLdValue = breadcrumbJsonLd(breadcrumbItems)

  return (
    <>
      {breadcrumbJsonLdValue ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLdValue) }}
        />
      ) : null}
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      <ProductTemplate
        product={pricedProduct}
        region={region}
        countryCode={params.countryCode}
        images={images ?? []}
      />
    </>
  )
}
