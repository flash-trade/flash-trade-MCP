import { Connection, PublicKey, type Commitment } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  PerpetualsClient,
  PoolConfig,
  OraclePrice,
  isVariant,
  type CustodyConfig,
  type MarketConfig,
} from "flash-sdk";
import BN from "bn.js";
import { Config } from "./Config.js";
import { RpcManager } from "./RpcManager.js";
import { Asset } from "./Asset.js";
import { PriceService } from "./PriceService.js";
import { NumberConverter } from "./NumberConverter.js";
import type { Signer } from "./Signer.js";

const POOL_NAMES_MAINNET = [
  "Crypto.1", "Virtual.1", "Governance.1", "Community.1", "Community.2",
  "Trump.1", "Ore.1", "Remora.1",
];
const POOL_NAMES_DEVNET = [
  "devnet.1", "devnet.2", "devnet.3", "devnet.4", "devnet.5",
  "Trump.1", "Remora.1", "Ore.1",
];

export class FlashClient {
  readonly perpClient: PerpetualsClient;
  readonly connection: Connection;
  readonly provider: AnchorProvider;
  readonly poolConfigs: PoolConfig[];

  private constructor(
    perpClient: PerpetualsClient,
    connection: Connection,
    provider: AnchorProvider,
    poolConfigs: PoolConfig[],
  ) {
    this.perpClient = perpClient;
    this.connection = connection;
    this.provider = provider;
    this.poolConfigs = poolConfigs;
  }

  // ─── Construction ───

  static async create(signer: Signer): Promise<FlashClient> {
    const cluster = Config.get("cluster");
    const rpcUrl = Config.get("rpcUrl");
    const connection = RpcManager.getConnection(rpcUrl);
    const provider = signer.toAnchorProvider(connection);

    const poolNames = cluster === "mainnet-beta" ? POOL_NAMES_MAINNET : POOL_NAMES_DEVNET;
    const poolConfigs: PoolConfig[] = [];

    for (const name of poolNames) {
      try {
        poolConfigs.push(PoolConfig.fromIdsByName(name, cluster));
      } catch {
        // Some pools may not exist on devnet — skip silently
      }
    }

    if (poolConfigs.length === 0) {
      throw new Error(`No pools found for cluster: ${cluster}`);
    }

    const programId = poolConfigs[0].programId;

    const perpClient = new PerpetualsClient(
      provider,
      programId,
      programId, // composabilityProgramId (unused backward compat)
      poolConfigs[0].fbNftRewardProgramId, // unused
      poolConfigs[0].rewardDistributionProgram.programId, // unused
      { prioritizationFee: 50000 },
    );

    // Initialize Asset module with pool tokens
    Asset.initialize(poolConfigs);

    // Pre-load ALTs (non-blocking, errors are non-fatal for read ops)
    for (const pc of poolConfigs) {
      try {
        await perpClient.getOrLoadAddressLookupTable(pc);
      } catch { /* ALT load failure is non-fatal for read commands */ }
    }

    return new FlashClient(perpClient, connection, provider, poolConfigs);
  }

  /**
   * Create a read-only client (no signer required).
   * Uses a dummy keypair — only for querying on-chain state.
   */
  static async createReadOnly(): Promise<FlashClient> {
    const cluster = Config.get("cluster");
    const rpcUrl = Config.get("rpcUrl");
    const connection = RpcManager.getConnection(rpcUrl);

    const { Keypair } = await import("@solana/web3.js");
    const dummyKeypair = Keypair.generate();
    const wallet = new Wallet(dummyKeypair);
    const provider = new AnchorProvider(connection, wallet, {
      commitment: Config.get("confirmationCommitment") as Commitment,
    });

    const poolNames = cluster === "mainnet-beta" ? POOL_NAMES_MAINNET : POOL_NAMES_DEVNET;
    const poolConfigs: PoolConfig[] = [];
    for (const name of poolNames) {
      try {
        poolConfigs.push(PoolConfig.fromIdsByName(name, cluster));
      } catch { }
    }

    const programId = poolConfigs[0].programId;
    const perpClient = new PerpetualsClient(
      provider, programId, programId,
      poolConfigs[0].fbNftRewardProgramId,
      poolConfigs[0].rewardDistributionProgram.programId,
      { prioritizationFee: 0 },
    );

    Asset.initialize(poolConfigs);

    return new FlashClient(perpClient, connection, provider, poolConfigs);
  }

  // ─── Pool Discovery ───

  getPoolConfigs(): PoolConfig[] {
    return this.poolConfigs;
  }

  getPoolByName(name: string): PoolConfig {
    const pc = this.poolConfigs.find(p => p.poolName === name);
    if (!pc) throw new Error(`Pool "${name}" not found. Available: ${this.poolConfigs.map(p => p.poolName).join(", ")}`);
    return pc;
  }

  resolveMarket(asset: string, side: "long" | "short", preferredCollateral?: string): { poolConfig: PoolConfig; marketConfig: MarketConfig } {
    const assetInfo = Asset.resolve(asset);
    const mintKey = new PublicKey(assetInfo.mintAddress);

    // Special case: SOL long prefers JitoSOL collateral market (matches frontend behavior)
    // See: main-flash-ui/utils/tokens.ts:473-475
    const preferCollateral = preferredCollateral
      ?? (asset.toUpperCase() === "SOL" && side === "long" ? "JitoSOL" : undefined);

    for (const pc of this.poolConfigs) {
      const markets = pc.markets.filter((m: any) =>
        m.targetMint.equals(mintKey) && isVariant(m.side, side)
      );

      if (markets.length === 0) continue;

      // If preferred collateral specified, find that specific market
      if (preferCollateral) {
        const preferredMint = Asset.isKnown(preferCollateral)
          ? new PublicKey(Asset.resolve(preferCollateral).mintAddress) : null;
        if (preferredMint) {
          const preferred = markets.find((m: any) => {
            const cc = pc.custodies.find((c: any) => c.custodyAccount.equals(m.collateralCustody));
            return cc && cc.mintKey.equals(preferredMint);
          });
          if (preferred) return { poolConfig: pc, marketConfig: preferred };
        }
      }

      // Otherwise return first match
      return { poolConfig: pc, marketConfig: markets[0] };
    }

    throw new Error(`No market found for ${asset} ${side}. Check available markets with: flash perps markets`);
  }

  getCustody(poolConfig: PoolConfig, symbol: string): CustodyConfig {
    const mint = Asset.getMint(symbol);
    const custody = poolConfig.custodies.find(c => c.mintKey.equals(mint));
    if (!custody) throw new Error(`Custody for ${symbol} not found in pool ${poolConfig.poolName}`);
    return custody;
  }

  // ─── Position & Order Reading ───

  async getPositions(owner: PublicKey): Promise<any[]> {
    // getUserPositionsMultiPool exists at runtime but TS types may not expose it
    const client = this.perpClient as any;
    if (typeof client.getUserPositionsMultiPool === "function") {
      const positions = await client.getUserPositionsMultiPool(owner, this.poolConfigs);
      return positions.filter((p: any) => p.isActive && !p.sizeAmount?.isZero());
    }
    // Fallback: fetch per-pool
    const allPositions: any[] = [];
    for (const pc of this.poolConfigs) {
      try {
        const positions = await client.getUserPositions(owner, pc);
        allPositions.push(...positions.filter((p: any) => p.isActive && !p.sizeAmount?.isZero()));
      } catch { }
    }
    return allPositions;
  }

  async getOrders(owner: PublicKey): Promise<any[]> {
    const client = this.perpClient as any;
    if (typeof client.getUserOrderAccountsMultiPool === "function") {
      const orders = await client.getUserOrderAccountsMultiPool(owner, this.poolConfigs);
      return orders.filter((o: any) => o.isActive);
    }
    const allOrders: any[] = [];
    for (const pc of this.poolConfigs) {
      try {
        const orders = await client.getUserOrderAccounts(owner, pc);
        allOrders.push(...orders.filter((o: any) => o.isActive));
      } catch { }
    }
    return allOrders;
  }

  // ─── Position Enrichment (calculate PnL, leverage, liq price) ───

  async enrichPosition(position: any): Promise<Record<string, unknown>> {
    // Find the market config for this position
    let marketConfig: MarketConfig | null = null;
    let poolConfig: PoolConfig | null = null;
    let targetCustody: CustodyConfig | null = null;
    let collateralCustody: CustodyConfig | null = null;

    for (const pc of this.poolConfigs) {
      const mc = pc.markets.find(m => m.marketAccount.equals(position.market));
      if (mc) {
        marketConfig = mc;
        poolConfig = pc;
        targetCustody = pc.custodies.find(c => c.custodyAccount.equals(mc.targetCustody)) ?? null;
        collateralCustody = pc.custodies.find(c => c.custodyAccount.equals(mc.collateralCustody)) ?? null;
        break;
      }
    }

    if (!marketConfig || !poolConfig || !targetCustody || !collateralCustody) {
      return {
        positionPubkey: position.pubkey?.toBase58() ?? "unknown",
        asset: "unknown",
        side: "unknown",
        sizeUsd: NumberConverter.fromNativeUsd(position.sizeUsd ?? new BN(0)),
        error: "Market config not found",
      };
    }

    const targetToken = poolConfig.tokens.find(t => t.mintKey.equals(targetCustody!.mintKey));
    const side = isVariant(marketConfig.side, "long") ? "long" : "short";

    // Fetch prices
    let targetPrice: OraclePrice;

    try {
      const targetData = await PriceService.getPriceAndEma(targetToken?.symbol ?? "SOL");
      targetPrice = targetData.price;
    } catch {
      return {
        positionPubkey: position.pubkey?.toBase58() ?? "unknown",
        asset: targetToken?.symbol ?? "unknown",
        side,
        sizeUsd: NumberConverter.fromNativeUsd(position.sizeUsd ?? new BN(0)),
        collateralUsd: NumberConverter.fromNativeUsd(position.collateralUsd ?? new BN(0)),
        error: "Price fetch failed",
      };
    }

    const sizeUsd = NumberConverter.toDisplayNumber(position.sizeUsd ?? new BN(0), 6);
    const collateralUsd = NumberConverter.toDisplayNumber(position.collateralUsd ?? new BN(0), 6);

    // Entry price from position data
    // ContractOraclePrice has exponent as number, OraclePrice needs BN
    let entryPrice = 0;
    try {
      const epRaw = position.entryPrice;
      if (epRaw && epRaw.price && !epRaw.price.isZero()) {
        const ep = OraclePrice.from({
          price: epRaw.price,
          exponent: new BN(epRaw.exponent),
          confidence: new BN(0),
          timestamp: new BN(0),
        });
        entryPrice = parseFloat(ep.toUiPrice(2));
      }
    } catch { }

    const currentPrice = parseFloat(targetPrice.toUiPrice(2));

    // Basic PnL from price change (entry vs current)
    let pnlUsd = 0;
    if (entryPrice > 0 && currentPrice > 0 && sizeUsd > 0) {
      const priceChange = side === "long"
        ? (currentPrice - entryPrice) / entryPrice
        : (entryPrice - currentPrice) / entryPrice;
      pnlUsd = sizeUsd * priceChange;
    }

    // Leverage from size / collateral
    const leverage = collateralUsd > 0 ? sizeUsd / collateralUsd : 0;

    // Liquidation price estimate (simplified — full calc needs custody account data)
    let liquidationPrice = 0;
    if (leverage > 0 && entryPrice > 0) {
      const liqThreshold = 1 / leverage * 0.9; // ~90% of collateral
      liquidationPrice = side === "long"
        ? entryPrice * (1 - liqThreshold)
        : entryPrice * (1 + liqThreshold);
    }
    const pnlPct = collateralUsd > 0 ? (pnlUsd / collateralUsd) * 100 : 0;

    return {
      asset: targetToken?.symbol ?? "unknown",
      pool: poolConfig.poolName,
      side,
      sizeUsd: parseFloat(sizeUsd.toFixed(2)),
      collateralUsd: parseFloat(collateralUsd.toFixed(2)),
      entryPrice,
      currentPrice,
      pnlUsd: parseFloat(pnlUsd.toFixed(2)),
      pnlPct: parseFloat(pnlPct.toFixed(2)),
      leverage: parseFloat(leverage.toFixed(1)),
      liquidationPrice,
      positionPubkey: position.pubkey.toBase58(),
    };
  }

  // ─── FAF / Token Stake ───

  async getTokenStakeAccount(owner: PublicKey): Promise<any | null> {
    const programId = this.poolConfigs[0].programId;
    const [tokenStakePk] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_stake"), owner.toBuffer()],
      programId,
    );

    try {
      const accountInfo = await this.connection.getAccountInfo(tokenStakePk);
      if (!accountInfo) return null;
      const decoded = (this.perpClient.program.account as any).tokenStake.coder.accounts.decode(
        "tokenStake", accountInfo.data
      );
      return { pubkey: tokenStakePk, ...(decoded as any) };
    } catch {
      return null;
    }
  }

  // ─── FLP Stake ───

  async getFlpStakeAccount(owner: PublicKey, poolConfig: PoolConfig): Promise<any | null> {
    const [stakePk] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), owner.toBuffer(), poolConfig.poolAddress.toBuffer()],
      poolConfig.programId,
    );

    try {
      const accountInfo = await this.connection.getAccountInfo(stakePk);
      if (!accountInfo) return null;
      const decoded = (this.perpClient.program.account as any).flpStake.coder.accounts.decode(
        "flpStake", accountInfo.data
      );
      return { pubkey: stakePk, ...(decoded as any) };
    } catch {
      return null;
    }
  }
}
