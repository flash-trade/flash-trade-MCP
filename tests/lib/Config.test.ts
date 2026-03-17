import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Config } from "../../src/lib/Config";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";

// Override Config paths for testing
const TEST_DIR = join(import.meta.dir, ".test-config");
const origDir = Config.DIR;

describe("Config", () => {
  beforeEach(() => {
    // @ts-ignore - override for testing
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
    // @ts-ignore
    Config.DIR = origDir;
  });

  it("creates config directory and default settings", () => {
    expect(existsSync(TEST_DIR)).toBe(true);
    expect(existsSync(join(TEST_DIR, "settings.json"))).toBe(true);
  });

  it("loads defaults when no config exists", () => {
    const config = Config.load();
    expect(config.cluster).toBe("mainnet-beta");
    expect(config.outputFormat).toBe("table");
    expect(config.slippageBps).toBe(100);
  });

  it("sets and gets individual values", () => {
    Config.set("cluster", "devnet");
    expect(Config.get("cluster")).toBe("devnet");
  });

  it("validates cluster values", () => {
    expect(Config.validate("cluster", "mainnet-beta").valid).toBe(true);
    expect(Config.validate("cluster", "devnet").valid).toBe(true);
    expect(Config.validate("cluster", "invalid").valid).toBe(false);
  });

  it("validates rpcUrl requires https", () => {
    expect(Config.validate("rpcUrl", "https://api.example.com").valid).toBe(true);
    expect(Config.validate("rpcUrl", "http://api.example.com").valid).toBe(false);
  });

  it("validates numeric bounds", () => {
    expect(Config.validate("maxPriorityFee", "0.05").valid).toBe(true);
    expect(Config.validate("maxPriorityFee", "0.2").valid).toBe(false);
    expect(Config.validate("slippageBps", "500").valid).toBe(true);
    expect(Config.validate("slippageBps", "1500").valid).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(Config.validate("unknownKey", "value").valid).toBe(false);
  });
});
