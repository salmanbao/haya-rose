import {
  PaymentConfigEncryptionError,
  decryptSecret,
  deriveEncryptionKey,
  encryptSecret,
  isEncryptedPayload,
} from "../encryption"

const VALID_HEX = "a".repeat(64)
const OTHER_HEX = "b".repeat(64)

describe("payment-config encryption (AES-256-GCM)", () => {
  describe("deriveEncryptionKey", () => {
    it("accepts a 64-character hex string", () => {
      const key = deriveEncryptionKey(VALID_HEX)
      expect(key.length).toBe(32)
    })

    it("accepts uppercase hex", () => {
      const key = deriveEncryptionKey("A".repeat(64))
      expect(key.length).toBe(32)
    })

    it("throws on a missing key", () => {
      expect(() => deriveEncryptionKey(undefined)).toThrow(
        PaymentConfigEncryptionError
      )
      expect(() => deriveEncryptionKey(undefined)).toThrow(
        "PAYMENT_CONFIG_ENCRYPTION_KEY"
      )
    })

    it("throws on a wrong-length key", () => {
      expect(() => deriveEncryptionKey("abcd")).toThrow(
        PaymentConfigEncryptionError
      )
      expect(() => deriveEncryptionKey("a".repeat(63))).toThrow(
        PaymentConfigEncryptionError
      )
    })

    it("throws on non-hex characters", () => {
      expect(() => deriveEncryptionKey("z".repeat(64))).toThrow(
        PaymentConfigEncryptionError
      )
    })
  })

  describe("encryptSecret / decryptSecret", () => {
    it("round-trips a secret value", () => {
      const key = deriveEncryptionKey(VALID_HEX)
      const payload = encryptSecret("sk_test_1234567890", key)
      expect(isEncryptedPayload(payload)).toBe(true)
      expect(payload.startsWith("v1:")).toBe(true)
      expect(payload).not.toContain("sk_test_1234567890")
      expect(decryptSecret(payload, key)).toBe("sk_test_1234567890")
    })

    it("produces a unique ciphertext per call (random IV)", () => {
      const key = deriveEncryptionKey(VALID_HEX)
      const a = encryptSecret("same-secret", key)
      const b = encryptSecret("same-secret", key)
      expect(a).not.toBe(b)
      expect(decryptSecret(a, key)).toBe(decryptSecret(b, key))
    })

    it("never embeds the plaintext in the payload", () => {
      const key = deriveEncryptionKey(VALID_HEX)
      const secret = "whsec_very-secret-value-123"
      const payload = encryptSecret(secret, key)
      expect(payload).not.toContain("very-secret")
      expect(payload).not.toContain(secret)
    })

    it("fails to decrypt with the wrong key", () => {
      const key = deriveEncryptionKey(VALID_HEX)
      const other = deriveEncryptionKey(OTHER_HEX)
      const payload = encryptSecret("sk_live_secret", key)
      expect(() => decryptSecret(payload, other)).toThrow(
        PaymentConfigEncryptionError
      )
    })

    it("detects tampered ciphertext (GCM auth tag)", () => {
      const key = deriveEncryptionKey(VALID_HEX)
      const payload = encryptSecret("sk_live_secret", key)
      const tampered = payload.slice(0, -2) + (payload.endsWith("aa") ? "bb" : "aa")
      expect(() => decryptSecret(tampered, key)).toThrow(
        PaymentConfigEncryptionError
      )
    })

    it("throws on malformed payloads", () => {
      const key = deriveEncryptionKey(VALID_HEX)
      expect(() => decryptSecret("plaintext", key)).toThrow(
        PaymentConfigEncryptionError
      )
      expect(() => decryptSecret("v2:a:b:c", key)).toThrow(
        PaymentConfigEncryptionError
      )
      expect(() => decryptSecret("", key)).toThrow(
        PaymentConfigEncryptionError
      )
    })

    it("rejects encrypting empty values", () => {
      const key = deriveEncryptionKey(VALID_HEX)
      expect(() => encryptSecret("", key)).toThrow(PaymentConfigEncryptionError)
    })
  })

  describe("isEncryptedPayload", () => {
    it("distinguishes encrypted payloads from plaintext", () => {
      expect(isEncryptedPayload("v1:abc:def:ghi")).toBe(true)
      expect(isEncryptedPayload("plaintext-secret")).toBe(false)
      expect(isEncryptedPayload(null)).toBe(false)
      expect(isEncryptedPayload(undefined)).toBe(false)
      expect(isEncryptedPayload(123)).toBe(false)
    })
  })
})
