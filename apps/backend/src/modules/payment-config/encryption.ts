/**
 * AES-256-GCM encryption for payment-provider secrets at rest.
 *
 * Security model (approved architecture 2026-08-17): provider credentials are
 * stored encrypted in PostgreSQL via this module. The master key is NOT stored
 * in the database — it stays in the deployment environment
 * (`PAYMENT_CONFIG_ENCRYPTION_KEY`, 64 hex chars = 32 bytes) and is passed in
 * from `env.ts`/module options. Secrets are decrypted only server-side, on
 * demand, by the payment-config module service; they are never returned by
 * Admin/store APIs and never logged.
 *
 * Format: `v1:<iv_b64>:<auth_tag_b64>:<ciphertext_b64>`
 * - iv: 12 random bytes (recommended for GCM)
 * - auth tag: 16 bytes (GCM default)
 * - No use of raw secrets as keys; no custom cryptography — node's crypto
 *   primitives only (AGENTS.md: "no custom cryptography when a trusted
 *   library/Medusa capability exists"; node:crypto is the platform primitive).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const KEY_BYTES = 32 // aes-256
const VERSION = "v1"

export class PaymentConfigEncryptionError extends Error {}

/**
 * Derives the 32-byte AES-256 key from the environment variable. Accepts a
 * 64-character lowercase/uppercase hex string (the format documented in
 * `.env.example`). Throws a clear error for any other format — the backend
 * must fail fast rather than silently encrypt with a weak key.
 */
export function deriveEncryptionKey(
  hexKey: string | undefined
): Buffer {
  if (!hexKey || hexKey.length !== KEY_BYTES * 2) {
    throw new PaymentConfigEncryptionError(
      "PAYMENT_CONFIG_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) " +
        "for AES-256-GCM. Generate one with: openssl rand -hex 32"
    )
  }
  const key = Buffer.from(hexKey, "hex")
  if (key.length !== KEY_BYTES) {
    throw new PaymentConfigEncryptionError(
      "PAYMENT_CONFIG_ENCRYPTION_KEY is not a valid 64-character hex string."
    )
  }
  return key
}

/** Encrypts a plaintext secret value. Returns `v1:iv:tag:ciphertext` (base64). */
export function encryptSecret(value: string, key: Buffer): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new PaymentConfigEncryptionError(
      "Cannot encrypt an empty or non-string secret value."
    )
  }
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  if (tag.length !== AUTH_TAG_LENGTH) {
    throw new PaymentConfigEncryptionError("Unexpected GCM auth tag length.")
  }
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":")
}

/**
 * Decrypts a `v1:iv:tag:ciphertext` payload. Throws on malformed payloads and
 * on authentication failures (tampered ciphertext) — a failed decryption
 * never yields a partial/incorrect secret.
 */
export function decryptSecret(payload: string, key: Buffer): string {
  const parts = payload.split(":")
  if (
    parts.length !== 4 ||
    parts[0] !== VERSION ||
    !parts[1] ||
    !parts[2] ||
    !parts[3]
  ) {
    throw new PaymentConfigEncryptionError(
      "Stored secret payload is malformed or uses an unsupported version."
    )
  }
  const [, ivB64, tagB64, dataB64] = parts
  let iv: Buffer
  let tag: Buffer
  let data: Buffer
  try {
    iv = Buffer.from(ivB64, "base64")
    tag = Buffer.from(tagB64, "base64")
    data = Buffer.from(dataB64, "base64")
  } catch {
    throw new PaymentConfigEncryptionError(
      "Stored secret payload contains invalid base64."
    )
  }
  if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH) {
    throw new PaymentConfigEncryptionError(
      "Stored secret payload has invalid IV/auth-tag lengths."
    )
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([
      decipher.update(data),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    throw new PaymentConfigEncryptionError(
      "Stored secret could not be decrypted (wrong key or tampered data)."
    )
  }
}

/** Returns true when the payload looks like a valid encrypted value. */
export function isEncryptedPayload(payload: unknown): boolean {
  return (
    typeof payload === "string" &&
    payload.split(":").length === 4 &&
    payload.startsWith(`${VERSION}:`)
  )
}
