import { describe, it, expect } from "bun:test";
import { KeyEncryption } from "../../src/lib/KeyEncryption";
import { Keypair } from "@solana/web3.js";

describe("KeyEncryption", () => {
  const testKey = Keypair.generate().secretKey;

  describe("Tier 1: Passphrase (scrypt + AES-256-GCM)", () => {
    it("encrypts and decrypts correctly", () => {
      const passphrase = "test-passphrase-123";
      const encrypted = KeyEncryption.encrypt(testKey, passphrase);
      const decrypted = KeyEncryption.decrypt(encrypted, passphrase);

      expect(decrypted).toEqual(testKey);
    });

    it("produces different ciphertext each time (random salt+iv)", () => {
      const passphrase = "same-passphrase";
      const a = KeyEncryption.encrypt(testKey, passphrase);
      const b = KeyEncryption.encrypt(testKey, passphrase);
      expect(a).not.toBe(b);
    });

    it("fails with wrong passphrase", () => {
      const encrypted = KeyEncryption.encrypt(testKey, "correct");
      expect(() => KeyEncryption.decrypt(encrypted, "wrong")).toThrow();
    });

    it("ciphertext is base64 encoded", () => {
      const encrypted = KeyEncryption.encrypt(testKey, "test");
      // Base64 pattern: alphanumeric + /+=
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
    });
  });
});
