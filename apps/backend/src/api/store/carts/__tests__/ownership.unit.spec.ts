import { decideCartOwnership } from "../ownership"

describe("decideCartOwnership (T-CC-01)", () => {
  it("allows access to a guest cart (no customer_id) without authentication", () => {
    expect(decideCartOwnership({ cart: {}, actorId: undefined })).toEqual({
      outcome: "allow",
    })
  })

  it("allows access to a guest cart when an authenticated customer is present", () => {
    expect(decideCartOwnership({ cart: {}, actorId: "cus_abc" })).toEqual({
      outcome: "allow",
    })
  })

  it("allows the owning customer to access their cart", () => {
    expect(
      decideCartOwnership({
        cart: { customer_id: "cus_abc" },
        actorId: "cus_abc",
      })
    ).toEqual({ outcome: "allow" })
  })

  it("allows unauthenticated ID-based access to a customer-owned cart (guest bearer model)", () => {
    // Approved guest checkout with email creates customer-owned carts via
    // native findOrCreateCustomerStep; unauthenticated sessions rely on the
    // unguessable cart ID as the credential (REQ-CC-003 / BD-G-01).
    expect(
      decideCartOwnership({ cart: { customer_id: "cus_abc" }, actorId: undefined })
    ).toEqual({ outcome: "allow" })
  })

  it("treats an empty-string actor as unauthenticated (guest model)", () => {
    expect(
      decideCartOwnership({ cart: { customer_id: "cus_abc" }, actorId: "" })
    ).toEqual({ outcome: "allow" })
  })

  it("rejects another customer accessing a customer-owned cart (403)", () => {
    expect(
      decideCartOwnership({
        cart: { customer_id: "cus_abc" },
        actorId: "cus_other",
      })
    ).toEqual({ outcome: "forbidden" })
  })

  it("treats a cart with an empty-string customer_id as a guest cart", () => {
    expect(
      decideCartOwnership({ cart: { customer_id: "" }, actorId: "cus_abc" })
    ).toEqual({ outcome: "allow" })
  })
})
