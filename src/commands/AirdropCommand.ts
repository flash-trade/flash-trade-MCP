import { Command } from "commander";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { FlashClient } from "../lib/FlashClient.js";
import { Output } from "../lib/Output.js";
import { ErrorHandler } from "../lib/ErrorHandler.js";
import { Config } from "../lib/Config.js";
import { Signer } from "../lib/Signer.js";

export class AirdropCommand {
  static register(program: Command): void {
    const cmd = program
      .command("airdrop")
      .description("Devnet token utilities")
      .hook("preAction", () => {
        if (Config.get("cluster") !== "devnet") {
          Output.printError("Airdrop is only available on devnet. Run: flash config set cluster devnet");
          process.exit(1);
        }
      });

    // ─── airdrop claim ───
    cmd
      .command("claim")
      .description("Request devnet SOL airdrop")
      .option("--amount <n>", "SOL amount to request", "2")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified. Use --key <name> or set active key.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.createReadOnly();

          const amount = parseFloat(opts.amount);
          if (isNaN(amount) || amount <= 0 || amount > 5) {
            throw new Error("Amount must be between 0 and 5 SOL");
          }

          Output.printMessage(`Requesting ${amount} SOL airdrop to ${signer.address}...`);

          const signature = await client.connection.requestAirdrop(
            signer.publicKey,
            amount * LAMPORTS_PER_SOL,
          );

          // Wait for confirmation
          const { blockhash, lastValidBlockHeight } =
            await client.connection.getLatestBlockhash("confirmed");
          await client.connection.confirmTransaction(
            { signature, blockhash, lastValidBlockHeight },
            "confirmed",
          );

          const newBalance = await client.connection.getBalance(signer.publicKey);
          const balanceSol = newBalance / LAMPORTS_PER_SOL;

          if (Output.isJson()) {
            console.log(JSON.stringify({
              amount,
              wallet: signer.address,
              newBalance: balanceSol,
              signature,
            }));
          } else {
            Output.printMessage(`\n  Airdrop successful!`);
            Output.printMessage(`  Amount: ${amount} SOL`);
            Output.printMessage(`  New balance: ${balanceSol.toFixed(4)} SOL`);
            Output.printMessage(`  Signature: ${Output.formatSignature(signature)}`);
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "airdrop"));
          process.exit(1);
        }
      });
  }
}
