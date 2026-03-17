import { Command } from "commander";
import { FlashClient } from "../lib/FlashClient.js";
import { Output } from "../lib/Output.js";
import { ErrorHandler } from "../lib/ErrorHandler.js";
import { AuditLog } from "../lib/AuditLog.js";
import { Config } from "../lib/Config.js";
import { Signer } from "../lib/Signer.js";
import { TxExecutor } from "../lib/TxExecutor.js";

export class RewardsCommand {
  static register(program: Command): void {
    const cmd = program.command("rewards").description("Raffle and distribution rewards");

    // ─── rewards claim ───
    cmd
      .command("claim")
      .description("Claim raffle/distribution rewards")
      .option("--key <name>", "Keypair to use")
      .action(async (_opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = _opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);
          const poolConfig = client.getPoolConfigs()[0];

          // Fetch reward vaults to find claimable rewards
          const rewardVaults = await (client.perpClient as any).programRewardDistribution?.account?.rewardVault?.all();

          if (!rewardVaults || rewardVaults.length === 0) {
            Output.printMessage("No reward vaults found.");
            if (Output.isJson()) console.log(JSON.stringify({ rewards: [] }));
            return;
          }

          const signatures: string[] = [];
          for (const vault of rewardVaults) {
            try {
              const bundle = await (client.perpClient as any).collectReward(
                vault.publicKey, signer.publicKey, poolConfig,
              );

              const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
              const dryRun = parentOpts.dryRun ?? false;

              const sig = await TxExecutor.execute(
                { ...bundle, addressLookupTables }, client.connection, signer,
                {
                  action: "Claim reward",
                  dryRun, yesFlag: parentOpts.yes ?? false,
                  poolAddress: poolConfig.poolAddress.toBase58(),
                  auditData: { type: "rewards.claim" },
                },
              );
              if (sig !== "DRY_RUN" && sig !== "CANCELLED") signatures.push(sig);
            } catch {
              // Skip vaults with no claimable rewards
            }
          }

          if (signatures.length === 0) {
            Output.printMessage("No claimable rewards found.");
            if (Output.isJson()) console.log(JSON.stringify({ claimed: 0, signatures: [] }));
            return;
          }

          if (Output.isJson()) {
            console.log(JSON.stringify({ claimed: signatures.length, signatures }));
          } else {
            Output.printMessage(`\n  Claimed ${signatures.length} reward(s)!`);
            for (const sig of signatures) {
              Output.printMessage(`  Signature: ${Output.formatSignature(sig)}`);
            }
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "claim rewards"));
          process.exit(1);
        }
      });

    // ─── rewards history ───
    cmd
      .command("history")
      .description("View reward claim history (from audit log)")
      .option("--limit <n>", "Max results", "20")
      .action(async (opts) => {
        try {
          const limit = parseInt(opts.limit, 10);
          let entries = AuditLog.read(limit * 3);
          entries = entries.filter(e =>
            e.action.includes("reward") || e.action.includes("Claim") ||
            (e.details as any)?.type?.startsWith("rewards.")
          );
          entries = entries.slice(0, limit);

          if (entries.length === 0) {
            Output.printMessage("No reward history found.");
            if (Output.isJson()) console.log("[]");
            return;
          }

          if (Output.isJson()) {
            console.log(JSON.stringify(entries, null, 2));
          } else {
            Output.print(
              entries.map(e => ({
                Time: Output.formatTimestamp(e.timestamp),
                Action: e.action,
                Signature: Output.formatSignature(e.signature),
              })),
              [
                { key: "Time", header: "Time" },
                { key: "Action", header: "Action" },
                { key: "Signature", header: "Signature" },
              ],
            );
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "fetch reward history"));
          process.exit(1);
        }
      });
  }
}
