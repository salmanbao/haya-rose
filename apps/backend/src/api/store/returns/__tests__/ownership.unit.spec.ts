import { decideReturnAccess } from "../ownership"

describe("decideReturnAccess (T-RET-01, REQ-RET-002/025/036)", () => {
  it("rejects an unauthenticated request (REQ-RET-002: returns require auth, no guest path)", () => {
    expect(
      decideReturnAccess({
        order: { customer_id: "cus_abc" },
        actorId: undefined,
      })
    ).toEqual({ outcome: "unauthenticated" })
  })

  it("treats an empty-string actor as unauthenticated", () => {
    expect(
      decideReturnAccess({
        order: { customer_id: "cus_abc" },
        actorId: "",
      })
    ).toEqual({ outcome: "unauthenticated" })
  })

  it("allows the owning authenticated customer to create a return on their order", () => {
    expect(
      decideReturnAccess({
        order: { customer_id: "cus_abc" },
        actorId: "cus_abc",
      })
    ).toEqual({ outcome: "allow" })
  })

  it("rejects another authenticated customer creating a return on a customer-owned order (REQ-RET-025)", () => {
    expect(
      decideReturnAccess({
        order: { customer_id: "cus_abc" },
        actorId: "cus_other",
      })
    ).toEqual({ outcome: "forbidden" })
  })

  it("rejects an authenticated customer when the order has no customer_id (nothing to match)", () => {
    // The decision input only carries `customer_id` (the middleware retrieves
    // only id/customer_id from the order) — an order without one is a guest
    // order and is always forbidden for authenticated actors.
    const guestOrder: { customer_id?: string | null; email?: string } = {
      email: "guest@example.com",
    }
    expect(
      decideReturnAccess({
        order: guestOrder,
        actorId: "cus_abc",
      })
    ).toEqual({ outcome: "forbidden" })
  })

  it("consults only customer_id: a matching email never substitutes for ownership (ownership-only, REQ-RET-025)", () => {
    // The input type structurally excludes `email`, so the function cannot
    // fall back to it — an order that carries a matching email (present only
    // via a wider runtime object) is still forbidden for a non-owner.
    const orderWithEmail = {
      customer_id: "cus_abc",
      email: "guest@example.com",
    }
    expect(
      decideReturnAccess({
        order: orderWithEmail,
        actorId: "cus_other",
      })
    ).toEqual({ outcome: "forbidden" })
  })

  it("receive_now (REQ-RET-036) cannot bypass the gate: ownership is checked regardless", () => {
    // `receive_now` is honored only by the native workflow, which runs after
    // this decision — the middleware gate is receive_now-agnostic.
    expect(
      decideReturnAccess({
        order: { customer_id: "cus_abc" },
        actorId: "cus_other",
      })
    ).toEqual({ outcome: "forbidden" })
  })
})
