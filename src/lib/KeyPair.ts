import { Keypair } from "@solana/web3.js";
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { HDKey } from "@scure/bip32";
import { wordlist } from "@scure/bip39/wordlists/english";
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync, chmodSync } from "fs";
import { join } from "path";
import { Config } from "./Config.js";
import { KeyEncryption } from "./KeyEncryption.js";
import type { KeyPairData } from "../types/index.js";

const DEFAULT_PATH = "m/44'/501'/0'/0'";

export class KeyPair {
  readonly name: string;
  readonly publicKey: string;
  private _secretKey: Uint8Array;

  private constructor(name: string, publicKey: string, secretKey: Uint8Array) {
    this.name = name;
    this.publicKey = publicKey;
    this._secretKey = secretKey;
  }

  // ─── Factory Methods ───

  static generate(name: string): { keypair: KeyPair; mnemonic: string } {
    const mnemonic = generateMnemonic(wordlist, 256); // 24 words
    const keypair = KeyPair.fromMnemonic(name, mnemonic, 0);
    return { keypair, mnemonic };
  }

  static fromMnemonic(name: string, mnemonic: string, index: number = 0): KeyPair {
    if (!validateMnemonic(mnemonic, wordlist)) {
      throw new Error("Invalid mnemonic phrase");
    }
    const seed = mnemonicToSeedSync(mnemonic);
    const path = index === 0 ? DEFAULT_PATH : `m/44'/501'/${index}'/0'`;
    const hd = HDKey.fromMasterSeed(seed);
    const derived = hd.derive(path);
    if (!derived.privateKey) throw new Error("Failed to derive private key");

    const solKeypair = Keypair.fromSeed(derived.privateKey);
    return new KeyPair(name, solKeypair.publicKey.toBase58(), solKeypair.secretKey);
  }

  static fromSecretKey(name: string, secretKey: Uint8Array): KeyPair {
    let keypair: Keypair;
    if (secretKey.length === 64) {
      keypair = Keypair.fromSecretKey(secretKey);
    } else if (secretKey.length === 32) {
      keypair = Keypair.fromSeed(secretKey);
    } else {
      throw new Error(`Invalid secret key length: ${secretKey.length} (expected 32 or 64)`);
    }
    return new KeyPair(name, keypair.publicKey.toBase58(), keypair.secretKey);
  }

  static fromSolanaKeypairFile(name: string, filePath: string): KeyPair {
    if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    const raw = readFileSync(filePath, "utf-8");
    const bytes = new Uint8Array(JSON.parse(raw));
    return KeyPair.fromSecretKey(name, bytes);
  }

  // ─── Persistence ───

  save(encryption: "passphrase" | "keychain" | "none" = "none", passphrase?: string): void {
    const filePath = join(Config.KEYS_DIR, `${this.name}.json`);
    const data: KeyPairData = {
      name: this.name,
      publicKey: this.publicKey,
      derivationPath: DEFAULT_PATH,
      createdAt: new Date().toISOString(),
    };

    if (encryption === "passphrase") {
      if (!passphrase) throw new Error("Passphrase required for encrypted storage");
      data.encryptedSecretKey = KeyEncryption.encrypt(this._secretKey, passphrase);
    } else if (encryption === "keychain") {
      data.keychainStored = true;
      // Keychain storage is async — caller must handle separately
    } else {
      data.secretKey = Array.from(this._secretKey);
    }

    writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
    chmodSync(filePath, 0o600);
  }

  static load(name: string, passphrase?: string): KeyPair {
    const filePath = join(Config.KEYS_DIR, `${name}.json`);
    if (!existsSync(filePath)) throw new Error(`Key "${name}" not found`);

    const raw = readFileSync(filePath, "utf-8");
    const data: KeyPairData = JSON.parse(raw);

    let secretKey: Uint8Array;
    if (data.encryptedSecretKey) {
      if (!passphrase) throw new Error(`Key "${name}" is encrypted. Passphrase required.`);
      secretKey = KeyEncryption.decrypt(data.encryptedSecretKey, passphrase);
    } else if (data.secretKey) {
      secretKey = new Uint8Array(data.secretKey);
    } else if (data.keychainStored) {
      throw new Error(`Key "${name}" is in OS keychain. Use async load.`);
    } else {
      throw new Error(`Key "${name}" has no secret key data`);
    }

    return new KeyPair(data.name, data.publicKey, secretKey);
  }

  static async loadAsync(name: string, passphrase?: string): Promise<KeyPair> {
    const filePath = join(Config.KEYS_DIR, `${name}.json`);
    if (!existsSync(filePath)) throw new Error(`Key "${name}" not found`);

    const raw = readFileSync(filePath, "utf-8");
    const data: KeyPairData = JSON.parse(raw);

    let secretKey: Uint8Array;
    if (data.keychainStored) {
      secretKey = await KeyEncryption.loadFromKeychain(name);
    } else if (data.encryptedSecretKey) {
      if (!passphrase) throw new Error(`Key "${name}" is encrypted. Passphrase required.`);
      secretKey = KeyEncryption.decrypt(data.encryptedSecretKey, passphrase);
    } else if (data.secretKey) {
      secretKey = new Uint8Array(data.secretKey);
    } else {
      throw new Error(`Key "${name}" has no secret key data`);
    }

    return new KeyPair(data.name, data.publicKey, secretKey);
  }

  static delete(name: string): void {
    const filePath = join(Config.KEYS_DIR, `${name}.json`);
    if (!existsSync(filePath)) throw new Error(`Key "${name}" not found`);
    unlinkSync(filePath);
    // If active key was deleted, clear it
    if (Config.get("activeKey") === name) {
      Config.set("activeKey", "");
    }
  }

  static list(): { name: string; publicKey: string; createdAt: string; encryption: string }[] {
    if (!existsSync(Config.KEYS_DIR)) return [];
    const files = readdirSync(Config.KEYS_DIR).filter(f => f.endsWith(".json"));
    return files.map(f => {
      const raw = readFileSync(join(Config.KEYS_DIR, f), "utf-8");
      const data: KeyPairData = JSON.parse(raw);
      let encryption = "none";
      if (data.encryptedSecretKey) encryption = "passphrase";
      else if (data.keychainStored) encryption = "keychain";
      return {
        name: data.name,
        publicKey: data.publicKey,
        createdAt: data.createdAt,
        encryption,
      };
    });
  }

  static exists(name: string): boolean {
    return existsSync(join(Config.KEYS_DIR, `${name}.json`));
  }

  // ─── Conversion ───

  toSolanaKeypair(): Keypair {
    return Keypair.fromSecretKey(this._secretKey);
  }

  get secretKeyBytes(): Uint8Array {
    return this._secretKey;
  }
}
