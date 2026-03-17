import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { KeyPair } from "../../src/lib/KeyPair";
import { Config } from "../../src/lib/Config";
import { existsSync, rmSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { Keypair } from "@solana/web3.js";

const TEST_DIR = join(import.meta.dir, ".test-keys");

describe("KeyPair", () => {
  beforeEach(() => {
    // @ts-ignore
    Config.DIR = TEST_DIR;
    // @ts-ignore
    Config.KEYS_DIR = join(TEST_DIR, "keys");
    // @ts-ignore
    Config.FILE = join(TEST_DIR, "settings.json");
    // @ts-ignore
    Config.AUDIT_FILE = join(TEST_DIR, "history.jsonl");
    Config.ensureDir();
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("generates a valid keypair with mnemonic", () => {
    const { keypair, mnemonic } = KeyPair.generate("test");
    expect(keypair.publicKey).toBeTruthy();
    expect(keypair.publicKey.length).toBeGreaterThan(30);
    expect(mnemonic.split(" ").length).toBe(24);
  });

  it("recovers the same keypair from mnemonic", () => {
    const { keypair, mnemonic } = KeyPair.generate("test1");
    const recovered = KeyPair.fromMnemonic("test2", mnemonic);
    expect(recovered.publicKey).toBe(keypair.publicKey);
  });

  it("saves and loads a key (plaintext)", () => {
    const { keypair } = KeyPair.generate("test");
    keypair.save("none");

    const loaded = KeyPair.load("test");
    expect(loaded.publicKey).toBe(keypair.publicKey);
  });

  it("sets file permissions to 600", () => {
    const { keypair } = KeyPair.generate("test");
    keypair.save("none");

    const filePath = join(Config.KEYS_DIR, "test.json");
    const stats = statSync(filePath);
    const mode = (stats.mode & 0o777).toString(8);
    expect(mode).toBe("600");
  });

  it("lists keys", () => {
    KeyPair.generate("key1").keypair.save("none");
    KeyPair.generate("key2").keypair.save("none");

    const list = KeyPair.list();
    expect(list.length).toBe(2);
    expect(list.map(k => k.name).sort()).toEqual(["key1", "key2"]);
  });

  it("deletes a key", () => {
    KeyPair.generate("test").keypair.save("none");
    expect(KeyPair.exists("test")).toBe(true);

    KeyPair.delete("test");
    expect(KeyPair.exists("test")).toBe(false);
  });

  it("imports Solana CLI keypair format", () => {
    const solKeypair = Keypair.generate();
    const tempFile = join(TEST_DIR, "solana-key.json");
    writeFileSync(tempFile, JSON.stringify(Array.from(solKeypair.secretKey)));

    const imported = KeyPair.fromSolanaKeypairFile("imported", tempFile);
    expect(imported.publicKey).toBe(solKeypair.publicKey.toBase58());
  });

  it("throws on non-existent key load", () => {
    expect(() => KeyPair.load("nonexistent")).toThrow('Key "nonexistent" not found');
  });
});
