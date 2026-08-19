import { decideOrderAccess } from "../ownership"

describe("decideOrderAccess (T-ORD-09, B-ORD-01)", () => {
  it("allows an unauthenticated guest whose email matches the order email (case-insensitive)", () => {
    expect(
      decideOrderAccess({
        order: { email: "Guest@Example.com" },
        actorId: undefined,
        guestEmail: "guest@example.com",
      })
    ).toEqual({ outcome: "allow" })
  })

  it("rejects a guest without an email credential (never order-ID alone)", () => {
    expect(
      decideOrderAccess({
        order: { email: "guest@example.com" },
        actorId: undefined,
        guestEmail: undefined,
      })
    ).toEqual({ outcome: "forbidden" })
  })

  it("rejects a guest whose email does not match the order email", () => {
    expect(
      decideOrderAccess({
        order: { email: "guest@example.com" },
        actorId: undefined,
        guestEmail: "other@example.com",
      })
    ).toEqual({ outcome: "forbidden" })
  })

  it("rejects a guest when the order has no email recorded", () => {
    expect(
      decideOrderAccess({
        order: {},
        actorId: undefined,
        guestEmail: "guest@example.com",
      })
    ).toEqual({ outcome: "forbidden" })
  })

  it("allows the owning authenticated customer to access their order", () => {
    expect(
      decideOrderAccess({
        order: { customer_id: "cus_abc" },
        actorId: "cus_abc",
      })
    ).toEqual({ outcome: "allow" })
  })

  it("rejects another authenticated customer accessing a customer-owned order (403)", () => {
    expect(
      decideOrderAccess({
        order: { customer_id: "cus_abc" },
        actorId: "cus_other",
      })
    ).toEqual({ outcome: "forbidden" })
  })

  it("allows an authenticated customer whose id matches the guest order's customer record", () => {
    // A guest order created with an email carries the auto-created guest
    // customer record (native findOrCreateCustomerStep). After the guest
    // registers and the account resolves to that same customer, ownership
    // matches and access is allowed (B-ORD-19 association).
    expect(
      decideOrderAccess({
        order: { customer_id: "cus_guest", email: "guest@example.com" },
        actorId: "cus_guest",
      })
    ).toEqual({ outcome: "allow" })
  })

  it("rejects an authenticated customer when the order has no customer_id", () => {
    expect(
      decideOrderAccess({
        order: { email: "guest@example.com" },
        actorId: "cus_abc",
      })
    ).toEqual({ outcome: "forbidden" })
  })

  it("treats an empty-string actor as unauthenticated (guest email path)", () => {
    expect(
      decideOrderAccess({
        order: { email: "guest@example.com" },
        actorId: "",
        guestEmail: "guest@example.com",
      })
    ).toEqual({ outcome: "allow" })
  })

  it("does not let an authenticated customer fall back to the guest email path", () => {
    // Authenticated path is ownership-only (B-ORD-01): a matching email is
    // never a substitute for customer_id ownership.
    expect(
      decideOrderAccess({
        order: { customer_id: "cus_abc", email: "guest@example.com" },
        actorId: "cus_other",
        guestEmail: "guest@example.com",
      })
    ).toEqual({ outcome: "forbidden" })
  })

  it("trims surrounding whitespace before comparing guest emails", () => {
    expect(
      decideOrderAccess({
        order: { email: "  guest@example.com  " },
        actorId: undefined,
        guestEmail: "guest@example.com",
      })
    ).toEqual({ outcome: "allow" })
  })
})