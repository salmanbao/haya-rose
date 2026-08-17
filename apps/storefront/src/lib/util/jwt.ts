export type DecodedJwtPayload = {
  actor_id?: string
  user_metadata?: { email?: string }
}

/**
 * Decodes a JWT payload (base64url, unverified).
 *
 * Used by the Google OAuth callback to learn whether the Medusa-issued token
 * already carries an actor and to read the provider's user_metadata. The
 * token is issued by Medusa itself; this is never a trust boundary — the
 * authoritative customer check happens via `/store/customers/me`. Malformed
 * input yields `{}`.
 */
export function decodeJwtPayload(token: string): DecodedJwtPayload {
  const encoded = token.split(".")[1]
  if (!encoded) {
    return {}
  }
  try {
    const decoded = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf-8")
    ) as unknown
    if (typeof decoded !== "object" || decoded === null) {
      return {}
    }
    const payload = decoded as Record<string, unknown>
    const email =
      typeof payload.user_metadata === "object" &&
      payload.user_metadata !== null
        ? (payload.user_metadata as Record<string, unknown>).email
        : undefined

    return {
      ...(typeof payload.actor_id === "string"
        ? { actor_id: payload.actor_id }
        : {}),
      ...(typeof email === "string" ? { user_metadata: { email } } : {}),
    }
  } catch {
    return {}
  }
}