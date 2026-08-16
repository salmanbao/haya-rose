import { resolveCartSalesChannel } from "./resolve-cart-sales-channel"

describe("resolveCartSalesChannel", () => {
  it("returns the sales channel id stored in the region metadata", () => {
    const region = { metadata: { sales_channel_id: "sc_pk" } }
    expect(resolveCartSalesChannel(region)).toBe("sc_pk")
  })

  it("returns undefined when the region has no metadata", () => {
    expect(resolveCartSalesChannel({ metadata: null })).toBeUndefined()
    expect(resolveCartSalesChannel({})).toBeUndefined()
  })

  it("returns undefined when metadata lacks the sales_channel_id key", () => {
    expect(resolveCartSalesChannel({ metadata: { other: "value" } })).toBeUndefined()
  })

  it("returns undefined for non-string sales_channel_id values", () => {
    expect(
      resolveCartSalesChannel({ metadata: { sales_channel_id: 123 } })
    ).toBeUndefined()
  })

  it("returns undefined for an empty string", () => {
    expect(
      resolveCartSalesChannel({ metadata: { sales_channel_id: "" } })
    ).toBeUndefined()
  })

  it("handles null/undefined regions safely", () => {
    expect(resolveCartSalesChannel(null)).toBeUndefined()
    expect(resolveCartSalesChannel(undefined)).toBeUndefined()
  })
})
