import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { FlashClient } from "../lib/FlashClient.js";
import { Output } from "../lib/Output.js";
import { PriceService } from "../lib/PriceService.js";
import { NumberConverter } from "../lib/NumberConverter.js";
import { ErrorHandler } from "../lib/ErrorHandler.js";
import { Config } from "../lib/Config.js";
import { Signer } from "../lib/Signer.js";
import { TxExecutor } from "../lib/TxExecutor.js";

export class EarnCommand {
  static register(program: Command): void {
    const cmd = program.command("earn").description("FLP yield and liquidity");

    // ─── earn pools ───
    cmd
      .command("pools")
      .description("Show FLP pool information")
      .option("--pool <name>", "Filter by specific pool")
      .action(async (opts) => {
        try {
          const client = await FlashClient.createReadOnly();
          const rows: Record<string, unknown>[] = [];

          for (const pc of client.getPoolConfigs()) {
            if (opts.pool && pc.poolName !== opts.pool) continue;

            let tvlUsd = 0;
            try {
              const prices = await PriceService.getAllPoolPrices(pc);
              for (const custody of pc.custodies) {
                if (custody.isVirtual) continue;
                const token = pc.tokens.find(t => t.mintKey.equals(custody.mintKey));
                if (!token) continue;
                const price = prices.get(token.symbol);
                if (!price) continue;
                try {
                  const custodyAccount = await (client.perpClient.program.account as any).custody.fetch(custody.custodyAccount);
                  const assets = (custodyAccount as any).assets;
                  if (assets?.owned) {
                    tvlUsd += NumberConverter.toDisplayNumber(
                      price.getAssetAmountUsd(assets.owned, custody.decimals), 6
                    );
                  }
                } catch { }
              }
            } catch { }

            let yourStakeUsd = 0;
            const activeKey = Config.get("activeKey");
            if (activeKey) {
              try {
                const signer = Signer.fromName(activeKey);
                const stake = await client.getFlpStakeAccount(signer.publicKey, pc);
                if (stake?.stakeStats?.activeAmount) {
                  yourStakeUsd = NumberConverter.toDisplayNumber(stake.stakeStats.activeAmount, 6);
                }
              } catch { }
            }

            rows.push({
              pool: pc.poolName,
              tvlUsd: parseFloat(tvlUsd.toFixed(0)),
              yourStakeUsd: parseFloat(yourStakeUsd.toFixed(2)),
              poolAddress: pc.poolAddress.toBase58(),
            });
          }

          if (Output.isJson()) {
            console.log(JSON.stringify(rows, null, 2));
          } else {
            Output.print(
              rows.map(r => ({
                Pool: r.pool,
                TVL: r.tvlUsd ? Output.formatDollar(r.tvlUsd as number) : "—",
                "Your Stake": (r.yourStakeUsd as number) > 0 ? Output.formatDollar(r.yourStakeUsd as number) : "—",
              })),
              [
                { key: "Pool", header: "Pool" },
                { key: "TVL", header: "TVL" },
                { key: "Your Stake", header: "Your Stake" },
              ],
            );
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "fetch pools"));
          process.exit(1);
        }
      });

    // ─── earn deposit ───
    cmd
      .command("deposit")
      .description("Add liquidity to an FLP pool")
      .requiredOption("--pool <name>", "Pool name")
      .requiredOption("--amount <n>", "Amount to deposit (in token units)")
      .requiredOption("--token <symbol>", "Deposit token (USDC, SOL, etc.)")
      .option("--compounding", "Use compounding FLP (cFLP) instead of staked FLP")
      .option("--no-auto-stake", "Don't auto-stake (only for non-compounding)")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);
          const poolConfig = client.getPoolByName(opts.pool);
          const tokenDecimals = poolConfig.getTokenFromSymbol(opts.token).decimals;
          const amountIn = NumberConverter.toNative(opts.amount, tokenDecimals);

          // Calculate min LP out with slippage
          const slippageBps = Config.get("slippageBps");
          const slippageFactor = (10000 - slippageBps) / 10000;
          // Rough estimate: 1:1 USD value, apply slippage
          const minOut = new BN(amountIn.muln(Math.floor(slippageFactor * 10000)).divn(10000).toString());

          let bundle;
          if (opts.compounding) {
            // Use compounding liquidity (cFLP)
            const usdcCustody = poolConfig.custodies.find(c => c.symbol === "USDC");
            const rewardMint = usdcCustody?.mintKey ?? poolConfig.tokens.find(t => t.symbol === "USDC")!.mintKey;

            bundle = await (client.perpClient as any).addCompoundingLiquidity(
              amountIn, minOut, opts.token, rewardMint, poolConfig,
              true, // skipBalanceChecks
            );
          } else if (opts.autoStake === false) {
            // Add liquidity without staking
            bundle = await (client.perpClient as any).addLiquidity(
              opts.token, amountIn, minOut, poolConfig, true,
            );
          } else {
            // Default: add liquidity and auto-stake (sFLP)
            bundle = await client.perpClient.addLiquidityAndStake(
              opts.token, amountIn, minOut, poolConfig, true,
            );
          }

          const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
          const dryRun = parentOpts.dryRun ?? false;
          const yesFlag = parentOpts.yes ?? false;

          // Estimate USD value for prompt
          let amountUsd = parseFloat(opts.amount);
          if (opts.token !== "USDC") {
            try {
              const price = await PriceService.getPrice(opts.token);
              amountUsd = parseFloat(opts.amount) * parseFloat(price.toUiPrice(2));
            } catch { }
          }

          const signature = await TxExecutor.execute(
            { ...bundle, addressLookupTables }, client.connection, signer,
            {
              action: `Deposit ${opts.amount} ${opts.token} into ${opts.pool}${opts.compounding ? " (compounding)" : ""}`,
              amountUsd, dryRun, yesFlag,
              poolAddress: poolConfig.poolAddress.toBase58(),
              auditData: { pool: opts.pool, token: opts.token, type: opts.compounding ? "compounding" : "staked" },
            },
          );

          if (signature === "DRY_RUN" || signature === "CANCELLED") return;

          if (Output.isJson()) {
            console.log(JSON.stringify({
              pool: opts.pool, depositedAmount: parseFloat(opts.amount),
              depositedToken: opts.token, type: opts.compounding ? "compounding" : "staked",
              signature,
            }));
          } else {
            Output.printMessage("\n  Liquidity added!");
            Output.printSingle({
              Pool: opts.pool, Amount: `${opts.amount} ${opts.token}`,
              Type: opts.compounding ? "Compounding (cFLP)" : "Staked (sFLP)",
              Signature: Output.formatSignature(signature),
            });
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "deposit liquidity"));
          process.exit(1);
        }
      });

    // ─── earn withdraw ───
    cmd
      .command("withdraw")
      .description("Remove liquidity from an FLP pool")
      .requiredOption("--pool <name>", "Pool name")
      .requiredOption("--amount <n>", "FLP amount to withdraw")
      .requiredOption("--output-token <symbol>", "Token to receive (USDC, SOL, etc.)")
      .option("--compounding", "Withdraw from compounding (cFLP)")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);
          const poolConfig = client.getPoolByName(opts.pool);

          const lpDecimals = 6; // LP_DECIMALS = 6
          const lpAmount = NumberConverter.toNative(opts.amount, lpDecimals);
          const minOut = new BN(0); // Allow any output for now — user should set slippage

          let bundle;
          if (opts.compounding) {
            bundle = await (client.perpClient as any).removeCompoundingLiquidity(
              opts.outputToken, lpAmount, minOut, poolConfig, true,
            );
          } else {
            bundle = await (client.perpClient as any).removeLiquidity(
              opts.outputToken, lpAmount, minOut, poolConfig,
            );
          }

          const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
          const dryRun = parentOpts.dryRun ?? false;
          const yesFlag = parentOpts.yes ?? false;

          const signature = await TxExecutor.execute(
            { ...bundle, addressLookupTables }, client.connection, signer,
            {
              action: `Withdraw ${opts.amount} FLP from ${opts.pool} as ${opts.outputToken}`,
              dryRun, yesFlag,
              poolAddress: poolConfig.poolAddress.toBase58(),
              auditData: { pool: opts.pool, outputToken: opts.outputToken },
            },
          );

          if (signature === "DRY_RUN" || signature === "CANCELLED") return;

          if (Output.isJson()) {
            console.log(JSON.stringify({
              pool: opts.pool, flpWithdrawn: parseFloat(opts.amount),
              receivedToken: opts.outputToken, signature,
            }));
          } else {
            Output.printMessage("\n  Liquidity withdrawn!");
            Output.printSingle({
              Pool: opts.pool, "FLP Withdrawn": opts.amount,
              "Receive Token": opts.outputToken,
              Signature: Output.formatSignature(signature),
            });
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "withdraw liquidity"));
          process.exit(1);
        }
      });

    // ─── earn stake ───
    cmd
      .command("stake")
      .description("Stake FLP tokens")
      .requiredOption("--pool <name>", "Pool name")
      .option("--amount <n>", "FLP amount to stake (default: all available)")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);
          const poolConfig = client.getPoolByName(opts.pool);

          // If amount not specified, stake all available FLP tokens
          let stakeAmount: BN;
          if (opts.amount) {
            stakeAmount = NumberConverter.toNative(opts.amount, 6); // LP_DECIMALS = 6
          } else {
            // Fetch LP token balance
            const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
            const lpTokenAccount = getAssociatedTokenAddressSync(
              poolConfig.stakedLpTokenMint, signer.publicKey, true,
            );
            const balance = await client.connection.getTokenAccountBalance(lpTokenAccount);
            stakeAmount = new BN(balance.value.amount);
            if (stakeAmount.isZero()) throw new Error("No FLP tokens available to stake.");
          }

          const bundle = await client.perpClient.depositStake(
            signer.publicKey, signer.publicKey, stakeAmount, poolConfig,
          );

          const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
          const dryRun = parentOpts.dryRun ?? false;
          const yesFlag = parentOpts.yes ?? false;

          const stakeAmountUi = NumberConverter.fromNative(stakeAmount, 6, 2);

          const signature = await TxExecutor.execute(
            { ...bundle, addressLookupTables }, client.connection, signer,
            {
              action: `Stake ${stakeAmountUi} FLP in ${opts.pool}`,
              dryRun, yesFlag,
              poolAddress: poolConfig.poolAddress.toBase58(),
              auditData: { pool: opts.pool, amount: stakeAmountUi },
            },
          );

          if (signature === "DRY_RUN" || signature === "CANCELLED") return;

          if (Output.isJson()) {
            console.log(JSON.stringify({ pool: opts.pool, stakedAmount: parseFloat(stakeAmountUi), signature }));
          } else {
            Output.printMessage(`\n  Staked ${stakeAmountUi} FLP in ${opts.pool}`);
            Output.printMessage(`  Signature: ${Output.formatSignature(signature)}`);
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "stake FLP"));
          process.exit(1);
        }
      });

    // ─── earn unstake ───
    cmd
      .command("unstake")
      .description("Unstake FLP tokens")
      .requiredOption("--pool <name>", "Pool name")
      .option("--amount <n>", "FLP amount to unstake (default: all)")
      .option("--instant", "Instant unstake with fee")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);
          const poolConfig = client.getPoolByName(opts.pool);

          let unstakeAmount: BN;
          if (opts.amount) {
            unstakeAmount = NumberConverter.toNative(opts.amount, 6);
          } else {
            // Fetch staked amount — check both active and pendingActivation
            const stake = await client.getFlpStakeAccount(signer.publicKey, poolConfig);
            if (!stake) throw new Error("No stake account found. Deposit liquidity first.");
            const active = stake.stakeStats?.activeAmount ?? new BN(0);
            const pending = stake.stakeStats?.pendingActivation ?? new BN(0);
            unstakeAmount = active.add(pending);
            if (unstakeAmount.isZero()) throw new Error("No staked FLP to unstake.");
          }

          let bundle;
          if (opts.instant) {
            bundle = await client.perpClient.unstakeInstant("USDC", unstakeAmount, poolConfig);
          } else {
            // Withdraw stake (pending activation + deactivated)
            bundle = await (client.perpClient as any).withdrawStake(poolConfig, true, true);
          }

          const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
          const dryRun = parentOpts.dryRun ?? false;
          const yesFlag = parentOpts.yes ?? false;

          const unstakeAmountUi = NumberConverter.fromNative(unstakeAmount, 6, 2);

          const signature = await TxExecutor.execute(
            { ...bundle, addressLookupTables }, client.connection, signer,
            {
              action: `${opts.instant ? "Instant unstake" : "Unstake"} ${unstakeAmountUi} FLP from ${opts.pool}`,
              dryRun, yesFlag,
              poolAddress: poolConfig.poolAddress.toBase58(),
              auditData: { pool: opts.pool, amount: unstakeAmountUi, instant: !!opts.instant },
            },
          );

          if (signature === "DRY_RUN" || signature === "CANCELLED") return;

          if (Output.isJson()) {
            console.log(JSON.stringify({
              pool: opts.pool, unstakedAmount: parseFloat(unstakeAmountUi),
              instant: !!opts.instant, signature,
            }));
          } else {
            Output.printMessage(`\n  ${opts.instant ? "Instant unstaked" : "Unstaked"} ${unstakeAmountUi} FLP from ${opts.pool}`);
            Output.printMessage(`  Signature: ${Output.formatSignature(signature)}`);
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "unstake FLP"));
          process.exit(1);
        }
      });

    // ─── earn claim ───
    cmd
      .command("claim")
      .description("Claim staking rewards and fees")
      .requiredOption("--pool <name>", "Pool name")
      .option("--reward-token <symbol>", "Reward token to claim", "USDC")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);
          const poolConfig = client.getPoolByName(opts.pool);

          // Check if user has a FAF token stake account (for boosted rewards)
          let tokenStakeAccount: PublicKey | undefined;
          try {
            const tokenStake = await client.getTokenStakeAccount(signer.publicKey);
            if (tokenStake) tokenStakeAccount = tokenStake.pubkey;
          } catch { }

          const bundle = await client.perpClient.collectStakeFees(
            opts.rewardToken, poolConfig, tokenStakeAccount,
          );

          const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
          const dryRun = parentOpts.dryRun ?? false;
          const yesFlag = parentOpts.yes ?? false;

          const signature = await TxExecutor.execute(
            { ...bundle, addressLookupTables }, client.connection, signer,
            {
              action: `Claim ${opts.rewardToken} rewards from ${opts.pool}`,
              dryRun, yesFlag,
              poolAddress: poolConfig.poolAddress.toBase58(),
              auditData: { pool: opts.pool, rewardToken: opts.rewardToken },
            },
          );

          if (signature === "DRY_RUN" || signature === "CANCELLED") return;

          if (Output.isJson()) {
            console.log(JSON.stringify({ pool: opts.pool, rewardToken: opts.rewardToken, signature }));
          } else {
            Output.printMessage(`\n  Rewards claimed from ${opts.pool}!`);
            Output.printMessage(`  Signature: ${Output.formatSignature(signature)}`);
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "claim rewards"));
          process.exit(1);
        }
      });

    // ─── earn convert ───
    cmd
      .command("convert")
      .description("Convert between staked FLP (sFLP) and compounding FLP (cFLP)")
      .requiredOption("--pool <name>", "Pool name")
      .requiredOption("--from <type>", "Source type: sflp or cflp")
      .requiredOption("--to <type>", "Target type: sflp or cflp")
      .requiredOption("--amount <n>", "Amount to convert")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified.");

          if (opts.from === opts.to) throw new Error("--from and --to must be different.");
          if (!["sflp", "cflp"].includes(opts.from)) throw new Error("--from must be 'sflp' or 'cflp'");
          if (!["sflp", "cflp"].includes(opts.to)) throw new Error("--to must be 'sflp' or 'cflp'");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);
          const poolConfig = client.getPoolByName(opts.pool);

          const amount = NumberConverter.toNative(opts.amount, 6); // LP_DECIMALS
          const usdcMint = poolConfig.tokens.find(t => t.symbol === "USDC")!.mintKey;

          // First set LP token price (required before migration)
          const setPriceBundle = await (client.perpClient as any).setLpTokenPrice(poolConfig);

          let migrateBundle;
          if (opts.from === "sflp" && opts.to === "cflp") {
            // sFLP → cFLP: migrateStake
            migrateBundle = await (client.perpClient as any).migrateStake(amount, usdcMint, poolConfig);
          } else {
            // cFLP → sFLP: migrateFlp
            migrateBundle = await (client.perpClient as any).migrateFlp(amount, usdcMint, poolConfig);
          }

          // Compose: setLpTokenPrice + migrate in one TX
          const allInstructions = [
            ...(setPriceBundle?.instructions ?? []),
            ...migrateBundle.instructions,
          ];
          const allSigners = [
            ...(setPriceBundle?.additionalSigners ?? []),
            ...migrateBundle.additionalSigners,
          ];

          const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
          const dryRun = parentOpts.dryRun ?? false;
          const yesFlag = parentOpts.yes ?? false;

          const signature = await TxExecutor.execute(
            { instructions: allInstructions, additionalSigners: allSigners, addressLookupTables },
            client.connection, signer,
            {
              action: `Convert ${opts.amount} ${opts.from.toUpperCase()} → ${opts.to.toUpperCase()} in ${opts.pool}`,
              dryRun, yesFlag,
              poolAddress: poolConfig.poolAddress.toBase58(),
              auditData: { pool: opts.pool, from: opts.from, to: opts.to, amount: opts.amount },
            },
          );

          if (signature === "DRY_RUN" || signature === "CANCELLED") return;

          if (Output.isJson()) {
            console.log(JSON.stringify({
              pool: opts.pool, from: opts.from, to: opts.to,
              amount: parseFloat(opts.amount), signature,
            }));
          } else {
            Output.printMessage(`\n  Converted ${opts.amount} ${opts.from.toUpperCase()} → ${opts.to.toUpperCase()}`);
            Output.printMessage(`  Signature: ${Output.formatSignature(signature)}`);
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "convert FLP"));
          process.exit(1);
        }
      });
  }
}
