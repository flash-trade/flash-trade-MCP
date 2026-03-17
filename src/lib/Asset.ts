import { PublicKey } from "@solana/web3.js";
import type { PoolConfig } from "flash-sdk";
import type { AssetInfo } from "../types/index.js";

export class Asset {
  private static assets: Map<string, AssetInfo> = new Map();
  private static initialized = false;

  static initialize(poolConfigs: PoolConfig[]): void {
    Asset.assets.clear();
    for (const pc of poolConfigs) {
      for (const token of pc.tokens) {
        const key = token.symbol.toUpperCase();
        // Don't overwrite — first pool to register a token wins
        if (!Asset.assets.has(key)) {
          const custody = pc.custodies.find(c => c.mintKey.equals(token.mintKey));
          Asset.assets.set(key, {
            symbol: token.symbol,
            mintAddress: token.mintKey.toBase58(),
            decimals: token.decimals,
            isStable: custody?.isStable ?? false,
            isVirtual: custody?.isVirtual ?? false,
            pythPriceId: token.pythPriceId,
            poolName: pc.poolName,
          });
        }
      }
    }
    Asset.initialized = true;
  }

  static resolve(symbolOrMint: string): AssetInfo {
    if (!Asset.initialized) throw new Error("Asset module not initialized. Call Asset.initialize() first.");

    // Try case-insensitive symbol lookup
    const bySymbol = Asset.assets.get(symbolOrMint.toUpperCase());
    if (bySymbol) return bySymbol;

    // Try mint address lookup
    for (const asset of Asset.assets.values()) {
      if (asset.mintAddress === symbolOrMint) return asset;
    }

    throw new Error(`Unknown token: "${symbolOrMint}". Run 'flash spot tokens' to see available tokens.`);
  }

  static list(): AssetInfo[] {
    return Array.from(Asset.assets.values());
  }

  static getDecimals(symbol: string): number {
    return Asset.resolve(symbol).decimals;
  }

  static getMint(symbol: string): PublicKey {
    return new PublicKey(Asset.resolve(symbol).mintAddress);
  }

  static isKnown(symbol: string): boolean {
    return Asset.assets.has(symbol.toUpperCase());
  }
}
