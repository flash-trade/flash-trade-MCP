import type { TransactionInstruction, AddressLookupTableAccount, Signer as SolSigner } from "@solana/web3.js";

export interface TxBundle {
  instructions: TransactionInstruction[];
  additionalSigners: SolSigner[];
  addressLookupTables: AddressLookupTableAccount[];
}

export interface AuditEntry {
  timestamp: string;
  action: string;
  signature: string;
  asset?: string;
  side?: string;
  amountUsd?: number;
  pool?: string;
  details?: Record<string, unknown>;
}

export interface FlashConfig {
  activeKey: string;
  cluster: "mainnet-beta" | "devnet";
  rpcUrl: string;
  rpcFallbacks: string[];
  outputFormat: "table" | "json";
  confirmationCommitment: "confirmed" | "finalized";
  maxPriorityFee: number;
  confirmPromptThreshold: number;
  slippageBps: number;
  backupOracle: boolean;
  keyEncryption: "passphrase" | "keychain" | "none";
  auditLog: boolean;
}

export interface AssetInfo {
  symbol: string;
  mintAddress: string;
  decimals: number;
  isStable: boolean;
  isVirtual: boolean;
  pythPriceId: string;
  poolName: string;
}

export interface KeyPairData {
  name: string;
  publicKey: string;
  encryptedSecretKey?: string;
  secretKey?: number[];
  keychainStored?: boolean;
  derivationPath: string;
  createdAt: string;
}
