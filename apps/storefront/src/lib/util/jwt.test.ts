import { decodeJwtPayload } from "./jwt"

// "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY3Rvcl9pZCI6ImN1c3RfMTIzIiwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6ImFAYi5jb20ifX0." payload
const TOKEN_WITH_ACTOR =
  "header.eyJhY3Rvcl9pZCI6ImN1c3RfMTIzIiwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6ImFAYi5jb20ifX0.signature"

// "eyJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsIjoiYUBiLmNvbSIsInBpY3R1cmUiOiJ4In19" payload
const TOKEN_WITHOUT_ACTOR =
  "header.eyJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsIjoiYUBiLmNvbSIsInBpY3R1cmUiOiJ4In19.signature"

describe("decodeJwtPayload", () => {
  it("decodes actor_id and user_metadata.email", () => {
    expect(decodeJwtPayload(TOKEN_WITH_ACTOR)).toEqual({
      actor_id: "cust_123",
      user_metadata: { email: "a@b.com" },
    })
  })

  it("omits actor_id when absent and keeps only the email from user_metadata", () => {
    expect(decodeJwtPayload(TOKEN_WITHOUT_ACTOR)).toEqual({
      user_metadata: { email: "a@b.com" },
    })
  })

  it("returns an empty object for a token without a payload part", () => {
    expect(decodeJwtPayload("no-payload")).toEqual({})
  })

  it("returns an empty object for a token with an invalid payload", () => {
    expect(decodeJwtPayload("header.not-valid-base64url.signature")).toEqual({})
  })

  it("returns an empty object for a non-object payload", () => {
    expect(decodeJwtPayload(`header.${Buffer.from("42").toString("base64url")}.signature`)).toEqual({})
  })

  it("returns an empty object for a payload with non-string fields", () => {
    const payload = Buffer.from(
      JSON.stringify({ actor_id: 42, user_metadata: { email: 7 } })
    ).toString("base64url")
    expect(decodeJwtPayload(`header.${payload}.signature`)).toEqual({})
  })
})