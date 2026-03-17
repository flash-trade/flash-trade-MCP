import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { FlashConfig } from "../types/index.js";

export class Config {
  static readonly DIR = join(homedir(), ".config", "flash");
  static readonly KEYS_DIR = join(Config.DIR, "keys");
  static readonly FILE = join(Config.DIR, "settings.json");
  static readonly AUDIT_FILE = join(Config.DIR, "history.jsonl");

  static defaults(): FlashConfig {
    return {
      activeKey: "",
      cluster: "mainnet-beta",
      rpcUrl: "https://api.mainnet-beta.solana.com",
      rpcFallbacks: [],
      outputFormat: "table",
      confirmationCommitment: "confirmed",
      maxPriorityFee: 0.001,
      confirmPromptThreshold: 100,
      slippageBps: 100,
      backupOracle: false,
      keyEncryption: "passphrase",
      auditLog: true,
    };
  }

  static ensureDir(): void {
    if (!existsSync(Config.DIR)) mkdirSync(Config.DIR, { recursive: true });
    if (!existsSync(Config.KEYS_DIR)) mkdirSync(Config.KEYS_DIR, { recursive: true });
    if (!existsSync(Config.FILE)) Config.save(Config.defaults());
  }

  static load(): FlashConfig {
    if (!existsSync(Config.FILE)) return Config.defaults();
    try {
      const raw = readFileSync(Config.FILE, "utf-8");
      const parsed = JSON.parse(raw);
      return { ...Config.defaults(), ...parsed };
    } catch {
      return Config.defaults();
    }
  }

  static save(config: FlashConfig): void {
    // Ensure directories exist (but don't call ensureDir to avoid recursion)
    if (!existsSync(Config.DIR)) mkdirSync(Config.DIR, { recursive: true });
    if (!existsSync(Config.KEYS_DIR)) mkdirSync(Config.KEYS_DIR, { recursive: true });
    writeFileSync(Config.FILE, JSON.stringify(config, null, 2) + "\n");
  }

  static get<K extends keyof FlashConfig>(key: K): FlashConfig[K] {
    return Config.load()[key];
  }

  static set<K extends keyof FlashConfig>(key: K, value: FlashConfig[K]): void {
    const config = Config.load();
    config[key] = value;
    Config.save(config);
  }

  static validate(key: string, value: string): { valid: boolean; parsed: unknown; error?: string } {
    switch (key) {
      case "cluster":
        if (value !== "mainnet-beta" && value !== "devnet")
          return { valid: false, parsed: value, error: "Must be 'mainnet-beta' or 'devnet'" };
        return { valid: true, parsed: value };

      case "rpcUrl":
        if (!value.startsWith("https://"))
          return { valid: false, parsed: value, error: "Must start with https://" };
        return { valid: true, parsed: value };

      case "outputFormat":
        if (value !== "table" && value !== "json")
          return { valid: false, parsed: value, error: "Must be 'table' or 'json'" };
        return { valid: true, parsed: value };

      case "confirmationCommitment":
        if (value !== "confirmed" && value !== "finalized")
          return { valid: false, parsed: value, error: "Must be 'confirmed' or 'finalized'" };
        return { valid: true, parsed: value };

      case "keyEncryption":
        if (!["passphrase", "keychain", "none"].includes(value))
          return { valid: false, parsed: value, error: "Must be 'passphrase', 'keychain', or 'none'" };
        return { valid: true, parsed: value };

      case "maxPriorityFee": {
        const n = parseFloat(value);
        if (isNaN(n) || n < 0 || n > 0.1)
          return { valid: false, parsed: value, error: "Must be 0 to 0.1 SOL" };
        return { valid: true, parsed: n };
      }

      case "confirmPromptThreshold": {
        const n = parseFloat(value);
        if (isNaN(n) || n < 0)
          return { valid: false, parsed: value, error: "Must be >= 0" };
        return { valid: true, parsed: n };
      }

      case "slippageBps": {
        const n = parseInt(value, 10);
        if (isNaN(n) || n < 0 || n > 1000)
          return { valid: false, parsed: value, error: "Must be 0 to 1000 (basis points)" };
        return { valid: true, parsed: n };
      }

      case "backupOracle":
      case "auditLog":
        if (value !== "true" && value !== "false")
          return { valid: false, parsed: value, error: "Must be 'true' or 'false'" };
        return { valid: true, parsed: value === "true" };

      case "activeKey":
        return { valid: true, parsed: value };

      case "rpcFallbacks":
        return { valid: true, parsed: value.split(",").map(s => s.trim()).filter(Boolean) };

      default:
        return { valid: false, parsed: value, error: `Unknown config key: ${key}` };
    }
  }
}
