import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Config } from "./Config.js";
import { KeyPair } from "./KeyPair.js";

export class Signer {
  private keypair: KeyPair;

  private constructor(keypair: KeyPair) {
    this.keypair = keypair;
  }

  static fromConfig(passphrase?: string): Signer {
    const name = Config.get("activeKey");
    if (!name) throw new Error("No active key set. Run: flash keys use <name>");
    return new Signer(KeyPair.load(name, passphrase));
  }

  static fromName(name: string, passphrase?: string): Signer {
    return new Signer(KeyPair.load(name, passphrase));
  }

  static async fromConfigAsync(passphrase?: string): Promise<Signer> {
    const name = Config.get("activeKey");
    if (!name) throw new Error("No active key set. Run: flash keys use <name>");
    return new Signer(await KeyPair.loadAsync(name, passphrase));
  }

  get publicKey(): PublicKey {
    return this.keypair.toSolanaKeypair().publicKey;
  }

  get address(): string {
    return this.keypair.publicKey;
  }

  toSolanaKeypair(): Keypair {
    return this.keypair.toSolanaKeypair();
  }

  toNodeWallet(): Wallet {
    return new Wallet(this.toSolanaKeypair());
  }

  toAnchorProvider(connection: Connection): AnchorProvider {
    return new AnchorProvider(connection, this.toNodeWallet(), {
      commitment: Config.get("confirmationCommitment"),
      preflightCommitment: Config.get("confirmationCommitment"),
    });
  }
}
