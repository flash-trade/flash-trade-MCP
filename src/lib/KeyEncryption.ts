import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { readFileSync, writeFileSync, chmodSync } from "fs";

export class KeyEncryption {
  // ─── Tier 1: Passphrase encryption (scrypt + AES-256-GCM) ───

  static encrypt(secretKey: Uint8Array, passphrase: string): string {
    const salt = randomBytes(32);
    const key = scryptSync(passphrase, salt, 32, { N: 2 ** 14, r: 8, p: 1 });
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(secretKey), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Format: salt(32) + iv(12) + authTag(16) + ciphertext
    return Buffer.concat([salt, iv, authTag, encrypted]).toString("base64");
  }

  static decrypt(ciphertext: string, passphrase: string): Uint8Array {
    const buf = Buffer.from(ciphertext, "base64");
    const salt = buf.subarray(0, 32);
    const iv = buf.subarray(32, 44);
    const authTag = buf.subarray(44, 60);
    const encrypted = buf.subarray(60);
    const key = scryptSync(passphrase, salt, 32, { N: 2 ** 14, r: 8, p: 1 });
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return new Uint8Array(Buffer.concat([decipher.update(encrypted), decipher.final()]));
  }

  // ─── Tier 2: OS Keychain (lazy-loaded keytar) ───

  static async storeInKeychain(name: string, secretKey: Uint8Array): Promise<void> {
    const keytar = await import("keytar");
    await keytar.setPassword("flash-trade-cli", name, Buffer.from(secretKey).toString("base64"));
  }

  static async loadFromKeychain(name: string): Promise<Uint8Array> {
    const keytar = await import("keytar");
    const stored = await keytar.getPassword("flash-trade-cli", name);
    if (!stored) throw new Error(`Key "${name}" not found in OS keychain`);
    return new Uint8Array(Buffer.from(stored, "base64"));
  }

  static async deleteFromKeychain(name: string): Promise<void> {
    const keytar = await import("keytar");
    await keytar.deletePassword("flash-trade-cli", name);
  }

  static async isKeychainAvailable(): Promise<boolean> {
    try {
      await import("keytar");
      return true;
    } catch {
      return false;
    }
  }

  // ─── Tier 3: Plaintext (for automation) ───

  static storePlaintext(filePath: string, secretKey: Uint8Array): void {
    writeFileSync(filePath, JSON.stringify(Array.from(secretKey)));
    chmodSync(filePath, 0o600);
  }

  static loadPlaintext(filePath: string): Uint8Array {
    const raw = readFileSync(filePath, "utf-8");
    return new Uint8Array(JSON.parse(raw));
  }
}
