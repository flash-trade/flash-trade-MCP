import { type Connection } from "@solana/web3.js";
import { createInterface } from "readline";
import { Config } from "./Config.js";
import { Output } from "./Output.js";

export class Confirmation {
  /**
   * Prompt user for confirmation if trade exceeds threshold.
   * Returns true to proceed, false to abort.
   * Skipped in JSON mode, when --yes is passed, or below threshold.
   */
  static async maybePrompt(params: {
    action: string;
    amountUsd: number;
    estimatedFee?: number;
    yesFlag?: boolean;
  }): Promise<boolean> {
    if (params.yesFlag) return true;
    if (Output.isJson()) return true;
    if (params.amountUsd < Config.get("confirmPromptThreshold")) return true;

    const feeStr = params.estimatedFee ? ` Fee: ~${params.estimatedFee.toFixed(6)} SOL.` : "";
    const question = `${params.action} ($${params.amountUsd.toFixed(2)}).${feeStr} Proceed? [y/N] `;

    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const answer = await new Promise<string>(resolve => {
      rl.question(question, resolve);
    });
    rl.close();

    return answer.trim().toLowerCase() === "y";
  }

  /**
   * Prompt user to type a key name to confirm deletion.
   * NOT bypassed by --yes (intentional for safety).
   */
  static async confirmKeyDeletion(keyName: string): Promise<boolean> {
    if (Output.isJson()) return false; // Can't prompt in JSON mode — refuse

    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const answer = await new Promise<string>(resolve => {
      rl.question(`Type "${keyName}" to confirm deletion: `, resolve);
    });
    rl.close();

    return answer.trim() === keyName;
  }

  /** Estimate priority fee from recent transactions */
  static async estimatePriorityFee(connection: Connection): Promise<number> {
    try {
      const fees = await connection.getRecentPrioritizationFees();
      if (fees.length === 0) return 50000; // Default 50k microlamports

      const sorted = fees.map(f => f.prioritizationFee).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];

      // Cap at max from config
      const maxFeeSol = Config.get("maxPriorityFee");
      const maxFeeMicroLamports = maxFeeSol * 1e9 * 1e6; // SOL → lamports → microlamports
      return Math.min(median, maxFeeMicroLamports);
    } catch {
      return 50000; // Default on error
    }
  }
}
