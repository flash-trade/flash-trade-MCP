import { Command } from "commander";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { FlashClient } from "../lib/FlashClient.js";
import { Output } from "../lib/Output.js";
import { Asset } from "../lib/Asset.js";
import { PriceService } from "../lib/PriceService.js";
import { ErrorHandler } from "../lib/ErrorHandler.js";
import { Config } from "../lib/Config.js";
import { Signer } from "../lib/Signer.js";

export class SpotCommand {
  static register(program: Command): void {
    const cmd = program.command("spot").description("Token swaps and portfolio");

    // ─── spot tokens ───
    cmd
      .command("tokens")
      .description("List available tokens with prices")
      .option("--search <query>", "Filter by symbol")
      .option("--pool <name>", "Show tokens in a specific pool")
      .action(async (opts) => {
        try {
          await FlashClient.createReadOnly(); // initializes Asset module
          let tokens = Asset.list();

          if (opts.search) {
            const q = opts.search.toUpperCase();
            tokens = tokens.filter(t =>
              t.symbol.toUpperCase().includes(q) || t.mintAddress.includes(opts.search)
            );
          }

          if (opts.pool) {
            tokens = tokens.filter(t => t.poolName === opts.pool);
          }

          // Fetch prices for display
          const priceMap = new Map<string, number>();
          for (const t of tokens) {
            try {
              const price = await PriceService.getPrice(t.symbol);
              priceMap.set(t.symbol, parseFloat(price.toUiPrice(2)));
            } catch {
              priceMap.set(t.symbol, 0);
            }
          }

          const rows = tokens.map(t => ({
            symbol: t.symbol,
            priceUsd: priceMap.get(t.symbol) ?? 0,
            decimals: t.decimals,
            mintAddress: t.mintAddress,
            isStable: t.isStable,
            isVirtual: t.isVirtual,
            pool: t.poolName,
          }));

          if (Output.isJson()) {
            console.log(JSON.stringify(rows, null, 2));
          } else {
            Output.print(
              rows.map(r => ({
                Symbol: r.symbol,
                Price: r.priceUsd > 0 ? Output.formatDollar(r.priceUsd) : "—",
                Decimals: r.decimals,
                Pool: r.pool,
                Type: r.isStable ? "Stable" : r.isVirtual ? "Virtual" : "Crypto",
              })),
              [
                { key: "Symbol", header: "Symbol" },
                { key: "Price", header: "Price" },
                { key: "Decimals", header: "Dec" },
                { key: "Pool", header: "Pool" },
                { key: "Type", header: "Type" },
              ],
            );
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "list tokens"));
          process.exit(1);
        }
      });

    // ─── spot portfolio ───
    cmd
      .command("portfolio")
      .description("Show token balances for a wallet")
      .option("--key <name>", "Keypair name")
      .option("--address <address>", "Wallet address")
      .action(async (_opts, cmd) => {
        try {
          const owner = resolveOwnerFromCommand(cmd);
          const client = await FlashClient.createReadOnly();

          // Get SOL balance
          const solBalance = await client.connection.getBalance(owner);
          const solAmount = solBalance / LAMPORTS_PER_SOL;

          // Get SPL token accounts
          const tokenAccounts = await client.connection.getParsedTokenAccountsByOwner(owner, {
            programId: TOKEN_PROGRAM_ID,
          });

          const holdings: { symbol: string; balance: number; valueUsd: number; priceUsd: number; mintAddress: string }[] = [];

          // Add SOL
          let solPrice = 0;
          try {
            const p = await PriceService.getPrice("SOL");
            solPrice = parseFloat(p.toUiPrice(2));
          } catch { }
          if (solAmount > 0.001) {
            holdings.push({
              symbol: "SOL",
              balance: solAmount,
              valueUsd: solAmount * solPrice,
              priceUsd: solPrice,
              mintAddress: "So11111111111111111111111111111111111111112",
            });
          }

          // Add SPL tokens
          const knownAssets = Asset.list();
          for (const account of tokenAccounts.value) {
            const parsed = account.account.data.parsed.info;
            const mint = parsed.mint;
            const amount = parsed.tokenAmount.uiAmount ?? 0;
            if (amount <= 0) continue;

            const asset = knownAssets.find(a => a.mintAddress === mint);
            if (!asset) continue; // Skip unknown tokens

            let price = 0;
            try {
              const p = await PriceService.getPrice(asset.symbol);
              price = parseFloat(p.toUiPrice(2));
            } catch { }

            holdings.push({
              symbol: asset.symbol,
              balance: amount,
              valueUsd: amount * price,
              priceUsd: price,
              mintAddress: mint,
            });
          }

          // Sort by value descending
          holdings.sort((a, b) => b.valueUsd - a.valueUsd);
          const totalValue = holdings.reduce((sum, h) => sum + h.valueUsd, 0);

          if (Output.isJson()) {
            console.log(JSON.stringify({ tokens: holdings, totalValueUsd: totalValue }, null, 2));
          } else {
            Output.print(
              holdings.map(h => ({
                Token: h.symbol,
                Balance: h.balance.toFixed(h.symbol === "SOL" ? 4 : 2),
                Price: Output.formatDollar(h.priceUsd),
                Value: Output.formatDollar(h.valueUsd),
              })),
              [
                { key: "Token", header: "Token" },
                { key: "Balance", header: "Balance" },
                { key: "Price", header: "Price" },
                { key: "Value", header: "Value" },
              ],
            );
            Output.printMessage(`\n  Total: ${Output.formatDollar(totalValue)}`);
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "fetch portfolio"));
          process.exit(1);
        }
      });

    // ─── spot quote ───
    cmd
      .command("quote")
      .description("Get a swap quote without executing")
      .requiredOption("--from <symbol>", "Input token symbol")
      .requiredOption("--to <symbol>", "Output token symbol")
      .requiredOption("--amount <n>", "Amount of input token")
      .action(async (opts) => {
        try {
          await FlashClient.createReadOnly(); // initializes Asset module
          const inputAsset = Asset.resolve(opts.from);
          const outputAsset = Asset.resolve(opts.to);

          const inputPrice = await PriceService.getPrice(inputAsset.symbol);
          const outputPrice = await PriceService.getPrice(outputAsset.symbol);
          const inputUsd = parseFloat(inputPrice.toUiPrice(6));
          const outputUsd = parseFloat(outputPrice.toUiPrice(6));

          const inputValueUsd = parseFloat(opts.amount) * inputUsd;
          const outputAmount = outputUsd > 0 ? inputValueUsd / outputUsd : 0;

          const result = {
            inputToken: inputAsset.symbol,
            outputToken: outputAsset.symbol,
            inputAmount: parseFloat(opts.amount),
            outputAmount: parseFloat(outputAmount.toFixed(inputAsset.decimals)),
            inputValueUsd: parseFloat(inputValueUsd.toFixed(2)),
            route: `${inputAsset.symbol} → ${outputAsset.symbol}`,
          };

          if (Output.isJson()) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            Output.printSingle({
              Input: `${opts.amount} ${inputAsset.symbol} (${Output.formatDollar(inputValueUsd)})`,
              Output: `~${outputAmount.toFixed(6)} ${outputAsset.symbol}`,
              Route: result.route,
            });
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "get quote"));
          process.exit(1);
        }
      });

    // ─── spot swap ───
    cmd
      .command("swap")
      .description("Execute a token swap")
      .requiredOption("--from <symbol>", "Input token symbol")
      .requiredOption("--to <symbol>", "Output token symbol")
      .requiredOption("--amount <n>", "Amount of input token")
      .option("--slippage <bps>", "Slippage in basis points")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const { NumberConverter } = await import("../lib/NumberConverter.js");
          const { TxExecutor } = await import("../lib/TxExecutor.js");
          const { Signer } = await import("../lib/Signer.js");
          // BN available via NumberConverter

          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified. Use --key <name> or set active key.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);

          const inputAsset = Asset.resolve(opts.from);
          const outputAsset = Asset.resolve(opts.to);

          if (!NumberConverter.isValidAmount(opts.amount)) {
            throw new Error("--amount must be a positive number");
          }

          const slippageBps = parseInt(opts.slippage ?? Config.get("slippageBps").toString(), 10);
          const amountIn = NumberConverter.toNative(opts.amount, inputAsset.decimals);

          // Calculate min amount out with slippage
          const inputPrice = await PriceService.getPrice(inputAsset.symbol);
          const outputPrice = await PriceService.getPrice(outputAsset.symbol);
          const inputUsd = parseFloat(inputPrice.toUiPrice(6));
          const outputUsd = parseFloat(outputPrice.toUiPrice(6));
          const expectedOutputAmount = (parseFloat(opts.amount) * inputUsd) / outputUsd;
          const slippageFactor = 1 - slippageBps / 10000;
          const minAmountOut = NumberConverter.toNative(
            (expectedOutputAmount * slippageFactor).toFixed(outputAsset.decimals),
            outputAsset.decimals,
          );

          // Find a pool that has both tokens
          let poolConfig = null;
          for (const pc of client.getPoolConfigs()) {
            const hasInput = pc.tokens.some(t => t.symbol === inputAsset.symbol);
            const hasOutput = pc.tokens.some(t => t.symbol === outputAsset.symbol);
            if (hasInput && hasOutput) {
              poolConfig = pc;
              break;
            }
          }
          if (!poolConfig) throw new Error(`No pool found with both ${inputAsset.symbol} and ${outputAsset.symbol}`);

          // Check whitelist status (frontend: useReferralData.tsx)
          // PDA: [Buffer.from("whitelist"), owner.toBuffer()] → programId
          let isWhitelistedUser = false;
          try {
            const { PublicKey: PK } = await import("@solana/web3.js");
            const [whitelistPk] = PK.findProgramAddressSync(
              [Buffer.from("whitelist"), signer.publicKey.toBuffer()],
              poolConfig.programId,
            );
            const whitelistInfo = await client.connection.getAccountInfo(whitelistPk);
            if (whitelistInfo) {
              // Account exists — user is whitelisted. Check isSwapFeeExempt if needed.
              isWhitelistedUser = true;
            }
          } catch { /* Not whitelisted — that's OK */ }

          const bundle = await (client.perpClient as any).swap(
            inputAsset.symbol,
            outputAsset.symbol,
            amountIn,
            minAmountOut,
            poolConfig,
            false,              // useFeesPool
            true,               // createUserATA
            false,              // unWrapSol
            true,               // skipBalanceChecks
            undefined,          // ephemeralSignerPubkey
            isWhitelistedUser,  // pass whitelist status
          );

          const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
          const dryRun = parentOpts.dryRun ?? false;
          const yesFlag = parentOpts.yes ?? false;

          const amountUsd = parseFloat(opts.amount) * inputUsd;

          const signature = await TxExecutor.execute(
            { ...bundle, addressLookupTables },
            client.connection,
            signer,
            {
              action: `Swap ${opts.amount} ${inputAsset.symbol} → ${outputAsset.symbol}`,
              amountUsd,
              dryRun,
              yesFlag,
              poolAddress: poolConfig.poolAddress.toBase58(),
              auditData: { inputToken: inputAsset.symbol, outputToken: outputAsset.symbol },
            },
          );

          if (signature === "DRY_RUN" || signature === "CANCELLED") return;

          if (Output.isJson()) {
            console.log(JSON.stringify({
              inputToken: inputAsset.symbol,
              outputToken: outputAsset.symbol,
              inputAmount: parseFloat(opts.amount),
              expectedOutput: parseFloat(expectedOutputAmount.toFixed(6)),
              signature,
            }));
          } else {
            Output.printMessage("\n  Swap executed!");
            Output.printSingle({
              Input: `${opts.amount} ${inputAsset.symbol}`,
              "Expected Output": `~${expectedOutputAmount.toFixed(6)} ${outputAsset.symbol}`,
              Signature: Output.formatSignature(signature),
            });
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "swap"));
          process.exit(1);
        }
      });
  }
}

function resolveOwnerFromCommand(cmd: any): PublicKey {
  // Check local options first, then parent (global) options
  const localOpts = cmd.opts();
  const parentOpts = cmd.parent?.parent?.opts() ?? {};
  const address = localOpts.address ?? parentOpts.address;
  const key = localOpts.key ?? parentOpts.key;

  if (address) return new PublicKey(address);
  if (key) return Signer.fromName(key).publicKey;
  const activeKey = Config.get("activeKey");
  if (activeKey) {
    try { return Signer.fromName(activeKey).publicKey; } catch { }
  }
  throw new Error("No wallet specified. Use --key <name> or --address <address>");
}
