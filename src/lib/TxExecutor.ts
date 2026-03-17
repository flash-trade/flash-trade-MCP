/**
 * Transaction execution pipeline.
 * Builds VersionedTransaction from instruction bundle, simulates, signs, sends, confirms.
 */
import {
  TransactionMessage,
  VersionedTransaction,
  type Signer as SolSigner,
  type Connection,
} from "@solana/web3.js";
import { createBackupOracleInstruction } from "flash-sdk";
import { Config } from "./Config.js";
import { Output } from "./Output.js";
import { ErrorHandler } from "./ErrorHandler.js";
import { AuditLog } from "./AuditLog.js";
import { Confirmation } from "./Confirmation.js";
import type { Signer } from "./Signer.js";
import type { TxBundle } from "../types/index.js";

export class TxExecutor {
  /**
   * Execute a transaction bundle: simulate → confirm prompt → send → wait → audit log.
   *
   * @param bundle - Instructions + additionalSigners + ALTs
   * @param connection - Solana RPC connection
   * @param signer - User's keypair signer
   * @param opts - Execution options
   * @returns Transaction signature
   */
  static async execute(
    bundle: TxBundle,
    connection: Connection,
    signer: Signer,
    opts: {
      action: string;        // Human description: "Open 10x Long SOL"
      amountUsd?: number;    // For confirmation prompt threshold
      dryRun?: boolean;      // Simulate only, don't send
      yesFlag?: boolean;     // Skip confirmation prompt
      poolAddress?: string;  // For backup oracle (optional)
      auditData?: Record<string, unknown>; // Extra data for audit log
    },
  ): Promise<string> {
    const { instructions, additionalSigners, addressLookupTables } = bundle;
    const allInstructions = [...instructions];

    // Optional: prepend backup oracle instruction
    if (Config.get("backupOracle") && opts.poolAddress) {
      try {
        const oracleIx = await createBackupOracleInstruction(opts.poolAddress);
        if (oracleIx && oracleIx.length > 0) {
          allInstructions.unshift(oracleIx[0]);
        }
      } catch {
        // Non-fatal: backup oracle is optional
      }
    }

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    // Build V0 message with ALTs
    const messageV0 = new TransactionMessage({
      payerKey: signer.publicKey,
      recentBlockhash: blockhash,
      instructions: allInstructions,
    }).compileToV0Message(addressLookupTables);

    const tx = new VersionedTransaction(messageV0);

    // Sign with user keypair + any additional signers from SDK
    const signers: SolSigner[] = [signer.toSolanaKeypair()];
    for (const s of additionalSigners) {
      signers.push(s as SolSigner);
    }
    tx.sign(signers);

    // Simulate
    const sim = await connection.simulateTransaction(tx, { commitment: "confirmed" });
    if (sim.value.err) {
      const code = ErrorHandler.extractCode(sim.value.err);
      const message = ErrorHandler.getMessage(code);
      throw new Error(`Simulation failed: ${message} (code: ${code ?? "unknown"})`);
    }

    // Dry-run mode: return early after successful simulation
    if (opts.dryRun) {
      Output.printMessage("Dry run — simulation passed. Transaction NOT sent.");
      if (Output.isJson()) {
        console.log(JSON.stringify({
          status: "dry_run",
          simulation: "passed",
          computeUnits: sim.value.unitsConsumed ?? 0,
        }));
      }
      return "DRY_RUN";
    }

    // Confirmation prompt (if above threshold)
    if (opts.amountUsd) {
      const proceed = await Confirmation.maybePrompt({
        action: opts.action,
        amountUsd: opts.amountUsd,
        yesFlag: opts.yesFlag,
      });
      if (!proceed) {
        Output.printMessage("Transaction cancelled.");
        return "CANCELLED";
      }
    }

    // Send
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true, // Already simulated
      maxRetries: 3,
    });

    // Confirm
    const commitment = Config.get("confirmationCommitment");
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      commitment,
    );

    // Audit log
    AuditLog.record({
      action: opts.action,
      signature,
      amountUsd: opts.amountUsd,
      ...opts.auditData,
    });

    return signature;
  }
}
