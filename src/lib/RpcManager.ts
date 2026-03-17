import { Connection, type Commitment } from "@solana/web3.js";
import { Config } from "./Config.js";
import { Output } from "./Output.js";

export class RpcManager {
  private static connections: Connection[] = [];
  private static activeIndex = 0;

  static reset(): void {
    RpcManager.connections = [];
    RpcManager.activeIndex = 0;
  }

  static getConnection(rpcOverride?: string): Connection {
    if (rpcOverride) {
      return new Connection(rpcOverride, {
        commitment: Config.get("confirmationCommitment") as Commitment,
      });
    }

    if (RpcManager.connections.length === 0) {
      const primary = Config.get("rpcUrl");
      const fallbacks = Config.get("rpcFallbacks");
      const commitment = Config.get("confirmationCommitment") as Commitment;

      RpcManager.connections = [primary, ...fallbacks].map(
        url => new Connection(url, { commitment })
      );
    }
    return RpcManager.connections[RpcManager.activeIndex];
  }

  static async withRetry<T>(
    fn: (conn: Connection) => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn(RpcManager.getConnection());
      } catch (err: any) {
        lastError = err;
        // Try next RPC endpoint if available
        if (RpcManager.connections.length > 1) {
          RpcManager.activeIndex = (RpcManager.activeIndex + 1) % RpcManager.connections.length;
          Output.printMessage(`RPC failed, switching to fallback (attempt ${attempt + 1}/${maxRetries})...`);
        }
        // Exponential backoff
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
        }
      }
    }

    throw lastError ?? new Error("All RPC endpoints failed");
  }
}
