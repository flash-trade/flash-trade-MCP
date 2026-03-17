import { OraclePrice, type PoolConfig } from "flash-sdk";
import { BN } from "bn.js";
import { Asset } from "./Asset.js";

interface HermesParsedFeed {
  id: string;
  price: { price: string; conf: string; expo: number; publish_time: number };
  ema_price: { price: string; conf: string; expo: number; publish_time: number };
}

const CACHE_TTL = 5000; // 5 seconds

export class PriceService {
  private static hermesUrl = process.env.HERMES_URL ?? "https://hermes.pyth.network";
  private static cache: Map<string, { price: OraclePrice; ema: OraclePrice; timestamp: number }> = new Map();

  static setHermesUrl(url: string): void {
    PriceService.hermesUrl = url;
  }

  static async getPrice(symbol: string): Promise<OraclePrice> {
    const { price } = await PriceService.fetchPriceAndEma(symbol);
    return price;
  }

  static async getEmaPrice(symbol: string): Promise<OraclePrice> {
    const { ema } = await PriceService.fetchPriceAndEma(symbol);
    return ema;
  }

  static async getPriceAndEma(symbol: string): Promise<{ price: OraclePrice; ema: OraclePrice }> {
    return PriceService.fetchPriceAndEma(symbol);
  }

  private static async fetchPriceAndEma(symbol: string): Promise<{ price: OraclePrice; ema: OraclePrice }> {
    const asset = Asset.resolve(symbol);
    const priceIdClean = asset.pythPriceId.replace(/^0x/, "");
    const cached = PriceService.cache.get(priceIdClean);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return { price: cached.price, ema: cached.ema };
    }

    // Strip 0x prefix if present — Hermes API expects hex without prefix
    const priceId = asset.pythPriceId.replace(/^0x/, "");
    const url = `${PriceService.hermesUrl}/v2/updates/price/latest?ids[]=${priceId}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Hermes API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { parsed: HermesParsedFeed[] };
    if (!data.parsed?.length) {
      throw new Error(`No price data for ${symbol} (pythId: ${asset.pythPriceId})`);
    }

    const feed = data.parsed[0];

    const price = OraclePrice.from({
      price: new BN(feed.price.price),
      exponent: new BN(feed.price.expo),
      confidence: new BN(feed.price.conf),
      timestamp: new BN(feed.price.publish_time),
    });

    const ema = OraclePrice.from({
      price: new BN(feed.ema_price.price),
      exponent: new BN(feed.ema_price.expo),
      confidence: new BN(feed.ema_price.conf),
      timestamp: new BN(feed.ema_price.publish_time),
    });

    PriceService.cache.set(priceIdClean, { price, ema, timestamp: Date.now() });
    return { price, ema };
  }

  /** Fetch prices for all tokens in a pool (batch) */
  static async getAllPoolPrices(poolConfig: PoolConfig): Promise<Map<string, OraclePrice>> {
    const ids = poolConfig.tokens
      .map(t => t.pythPriceId?.replace(/^0x/, ""))
      .filter(Boolean);

    if (ids.length === 0) return new Map();

    const params = ids.map(id => `ids[]=${id}`).join("&");
    const url = `${PriceService.hermesUrl}/v2/updates/price/latest?${params}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Hermes API error: ${response.status}`);
    }

    const data = await response.json() as { parsed: HermesParsedFeed[] };
    const prices = new Map<string, OraclePrice>();

    for (const feed of data.parsed ?? []) {
      const token = poolConfig.tokens.find(t => t.pythPriceId?.replace(/^0x/, "") === feed.id);
      if (token) {
        const price = OraclePrice.from({
          price: new BN(feed.price.price),
          exponent: new BN(feed.price.expo),
          confidence: new BN(feed.price.conf),
          timestamp: new BN(feed.price.publish_time),
        });
        prices.set(token.symbol, price);
        // Also update cache
        const ema = OraclePrice.from({
          price: new BN(feed.ema_price.price),
          exponent: new BN(feed.ema_price.expo),
          confidence: new BN(feed.ema_price.conf),
          timestamp: new BN(feed.ema_price.publish_time),
        });
        PriceService.cache.set(feed.id, { price, ema, timestamp: Date.now() });
      }
    }

    return prices;
  }

  /** Clear the price cache */
  static clearCache(): void {
    PriceService.cache.clear();
  }
}
