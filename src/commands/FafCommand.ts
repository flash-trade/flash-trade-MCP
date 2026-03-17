import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { FlashClient } from "../lib/FlashClient.js";
import { Output } from "../lib/Output.js";
import { NumberConverter } from "../lib/NumberConverter.js";
import { ErrorHandler } from "../lib/ErrorHandler.js";
import { Config } from "../lib/Config.js";
import { Signer } from "../lib/Signer.js";
import { TxExecutor } from "../lib/TxExecutor.js";

const FAF_DECIMALS = 6;

const VIP_TIERS = [
  { tier: 0, required: 0, feeDiscount: 0, referralRebate: 0, yieldBooster: 0 },
  { tier: 1, required: 20000, feeDiscount: 2.5, referralRebate: 2.5, yieldBooster: 2.5 },
  { tier: 2, required: 40000, feeDiscount: 3.5, referralRebate: 3.0, yieldBooster: 4.0 },
  { tier: 3, required: 100000, feeDiscount: 5.0, referralRebate: 4.0, yieldBooster: 6.0 },
  { tier: 4, required: 200000, feeDiscount: 7.0, referralRebate: 5.5, yieldBooster: 8.5 },
  { tier: 5, required: 1000000, feeDiscount: 9.5, referralRebate: 7.5, yieldBooster: 11.5 },
  { tier: 6, required: 2000000, feeDiscount: 12.0, referralRebate: 10.0, yieldBooster: 15.0 },
];

function getTier(stakedAmount: number): typeof VIP_TIERS[number] {
  for (let i = VIP_TIERS.length - 1; i >= 0; i--) {
    if (stakedAmount >= VIP_TIERS[i].required) return VIP_TIERS[i];
  }
  return VIP_TIERS[0];
}

export class FafCommand {
  static register(program: Command): void {
    const cmd = program.command("faf").description("FAF token staking and VIP tiers");

    // ─── faf status ───
    cmd
      .command("status")
      .description("Show FAF staking status and VIP tier")
      .option("--key <name>", "Keypair name")
      .option("--address <address>", "Wallet address")
      .action(async (_opts, cmd) => {
        try {
          const owner = resolveOwnerFromCommand(cmd);
          const client = await FlashClient.createReadOnly();
          const stakeAccount = await client.getTokenStakeAccount(owner);

          if (!stakeAccount) {
            Output.printMessage("No FAF stake account found. Use 'flash faf deposit' to create one.");
            if (Output.isJson()) {
              console.log(JSON.stringify({ stakedAmount: 0, currentTier: 0, feeDiscount: 0 }));
            }
            return;
          }

          const stakedBN = stakeAccount.activeAmount ?? stakeAccount.stakeAmount ?? new BN(0);
          const stakedAmount = NumberConverter.toDisplayNumber(stakedBN, FAF_DECIMALS);
          const tier = getTier(stakedAmount);

          const pendingUnstakeBN = stakeAccount.unstakeAmount ?? new BN(0);
          const pendingUnstake = NumberConverter.toDisplayNumber(pendingUnstakeBN, FAF_DECIMALS);

          const result = {
            stakedAmount: parseFloat(stakedAmount.toFixed(2)),
            pendingUnstake: parseFloat(pendingUnstake.toFixed(2)),
            currentTier: tier.tier,
            feeDiscount: tier.feeDiscount,
            referralRebate: tier.referralRebate,
            yieldBooster: tier.yieldBooster,
            nextTier: tier.tier < 6 ? VIP_TIERS[tier.tier + 1] : null,
          };

          if (Output.isJson()) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            Output.printSingle({
              "FAF Staked": `${result.stakedAmount.toLocaleString()} FAF`,
              "VIP Tier": `Tier ${result.currentTier}`,
              "Fee Discount": `${result.feeDiscount}%`,
              "Referral Rebate": `${result.referralRebate}%`,
              "Yield Booster": `${result.yieldBooster}%`,
              "Pending Unstake": result.pendingUnstake > 0 ? `${result.pendingUnstake.toLocaleString()} FAF` : "—",
              "Next Tier": result.nextTier
                ? `Tier ${result.nextTier.tier} (need ${result.nextTier.required.toLocaleString()} FAF)`
                : "Max tier reached",
            });
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "fetch FAF status"));
          process.exit(1);
        }
      });

    // ─── faf deposit ───
    cmd
      .command("deposit")
      .description("Deposit FAF tokens to stake")
      .requiredOption("--amount <n>", "FAF amount to deposit")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);
          const poolConfig = client.getPoolConfigs()[0]; // FAF uses first pool config
          const depositAmount = NumberConverter.toNative(opts.amount, FAF_DECIMALS);

          const bundle = await client.perpClient.depositTokenStake(
            signer.publicKey, signer.publicKey, depositAmount, poolConfig,
          );

          const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
          const dryRun = parentOpts.dryRun ?? false;
          const yesFlag = parentOpts.yes ?? false;

          const signature = await TxExecutor.execute(
            { ...bundle, addressLookupTables }, client.connection, signer,
            {
              action: `Deposit ${opts.amount} FAF`,
              dryRun, yesFlag,
              poolAddress: poolConfig.poolAddress.toBase58(),
              auditData: { type: "faf.deposit", amount: opts.amount },
            },
          );

          if (signature === "DRY_RUN" || signature === "CANCELLED") return;

          if (Output.isJson()) {
            console.log(JSON.stringify({ depositedAmount: parseFloat(opts.amount), signature }));
          } else {
            Output.printMessage(`\n  Deposited ${opts.amount} FAF`);
            Output.printMessage(`  Signature: ${Output.formatSignature(signature)}`);
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "deposit FAF"));
          process.exit(1);
        }
      });

    // ─── faf unstake ───
    cmd
      .command("unstake")
      .description("Request FAF token unstake (subject to cooldown)")
      .requiredOption("--amount <n>", "FAF amount to unstake")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);
          const poolConfig = client.getPoolConfigs()[0];
          const unstakeAmount = NumberConverter.toNative(opts.amount, FAF_DECIMALS);

          const bundle = await client.perpClient.unstakeTokenRequest(
            signer.publicKey, unstakeAmount, poolConfig,
          );

          const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
          const dryRun = parentOpts.dryRun ?? false;
          const yesFlag = parentOpts.yes ?? false;

          const signature = await TxExecutor.execute(
            { ...bundle, addressLookupTables }, client.connection, signer,
            {
              action: `Unstake request: ${opts.amount} FAF`,
              dryRun, yesFlag,
              poolAddress: poolConfig.poolAddress.toBase58(),
              auditData: { type: "faf.unstake", amount: opts.amount },
            },
          );

          if (signature === "DRY_RUN" || signature === "CANCELLED") return;

          if (Output.isJson()) {
            console.log(JSON.stringify({ unstakedAmount: parseFloat(opts.amount), signature }));
          } else {
            Output.printMessage(`\n  Unstake request submitted: ${opts.amount} FAF`);
            Output.printMessage("  Subject to cooldown period before withdrawal.");
            Output.printMessage(`  Signature: ${Output.formatSignature(signature)}`);
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "unstake FAF"));
          process.exit(1);
        }
      });

    // ─── faf cancel-unstake ───
    cmd
      .command("cancel-unstake")
      .description("Cancel a pending FAF unstake request")
      .option("--request-id <n>", "Withdraw request ID", "0")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);
          const poolConfig = client.getPoolConfigs()[0];
          const requestId = parseInt(opts.requestId, 10);

          const bundle = await (client.perpClient as any).cancelUnstakeTokenRequest(
            signer.publicKey, requestId, poolConfig,
          );

          const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
          const dryRun = parentOpts.dryRun ?? false;

          const signature = await TxExecutor.execute(
            { ...bundle, addressLookupTables }, client.connection, signer,
            {
              action: "Cancel FAF unstake request",
              dryRun, yesFlag: parentOpts.yes ?? false,
              poolAddress: poolConfig.poolAddress.toBase58(),
              auditData: { type: "faf.cancel-unstake" },
            },
          );

          if (signature === "DRY_RUN" || signature === "CANCELLED") return;

          if (Output.isJson()) {
            console.log(JSON.stringify({ action: "cancel-unstake", signature }));
          } else {
            Output.printMessage(`\n  Unstake request cancelled.`);
            Output.printMessage(`  Signature: ${Output.formatSignature(signature)}`);
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "cancel FAF unstake"));
          process.exit(1);
        }
      });

    // ─── faf withdraw ───
    cmd
      .command("withdraw")
      .description("Withdraw unstaked FAF tokens (after cooldown)")
      .option("--request-id <n>", "Withdraw request ID", "0")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);
          const poolConfig = client.getPoolConfigs()[0];
          const requestId = parseInt(opts.requestId, 10);

          const bundle = await (client.perpClient as any).withdrawToken(
            signer.publicKey, requestId, poolConfig,
          );

          const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
          const dryRun = parentOpts.dryRun ?? false;

          const signature = await TxExecutor.execute(
            { ...bundle, addressLookupTables }, client.connection, signer,
            {
              action: "Withdraw FAF tokens",
              dryRun, yesFlag: parentOpts.yes ?? false,
              poolAddress: poolConfig.poolAddress.toBase58(),
              auditData: { type: "faf.withdraw" },
            },
          );

          if (signature === "DRY_RUN" || signature === "CANCELLED") return;

          if (Output.isJson()) {
            console.log(JSON.stringify({ action: "withdraw", signature }));
          } else {
            Output.printMessage(`\n  FAF tokens withdrawn.`);
            Output.printMessage(`  Signature: ${Output.formatSignature(signature)}`);
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "withdraw FAF"));
          process.exit(1);
        }
      });

    // ─── faf claim ───
    cmd
      .command("claim")
      .description("Claim FAF staking rewards")
      .option("--compound", "Restake claimed rewards")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);
          const poolConfig = client.getPoolConfigs()[0];

          const claimBundle = await client.perpClient.collectTokenReward(
            signer.publicKey, poolConfig,
          );

          let instructions = [...claimBundle.instructions];
          let additionalSigners = [...claimBundle.additionalSigners];

          // If compounding, also deposit the claimed amount back
          if (opts.compound) {
            // We don't know the exact claimed amount ahead of time,
            // so we compose claim + deposit(0) which creates the account
            // For full compound, the frontend does claim then reads balance then deposits
            // In CLI, we'll just claim. User can then deposit manually.
            Output.printMessage("  Note: Compound mode claims rewards. Deposit manually after to restake.");
          }

          const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
          const dryRun = parentOpts.dryRun ?? false;

          const signature = await TxExecutor.execute(
            { instructions, additionalSigners, addressLookupTables },
            client.connection, signer,
            {
              action: "Claim FAF rewards",
              dryRun, yesFlag: parentOpts.yes ?? false,
              poolAddress: poolConfig.poolAddress.toBase58(),
              auditData: { type: "faf.claim" },
            },
          );

          if (signature === "DRY_RUN" || signature === "CANCELLED") return;

          if (Output.isJson()) {
            console.log(JSON.stringify({ action: "claim", signature }));
          } else {
            Output.printMessage(`\n  FAF rewards claimed!`);
            Output.printMessage(`  Signature: ${Output.formatSignature(signature)}`);
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "claim FAF rewards"));
          process.exit(1);
        }
      });

    // ─── faf claim-revenue ───
    cmd
      .command("claim-revenue")
      .description("Claim protocol revenue share (USDC)")
      .option("--reward-token <symbol>", "Revenue token", "USDC")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);
          const poolConfig = client.getPoolConfigs()[0];

          const bundle = await (client.perpClient as any).collectRevenue(
            signer.publicKey, opts.rewardToken, poolConfig,
          );

          const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
          const dryRun = parentOpts.dryRun ?? false;

          const signature = await TxExecutor.execute(
            { ...bundle, addressLookupTables }, client.connection, signer,
            {
              action: `Claim ${opts.rewardToken} revenue`,
              dryRun, yesFlag: parentOpts.yes ?? false,
              poolAddress: poolConfig.poolAddress.toBase58(),
              auditData: { type: "faf.claim-revenue", token: opts.rewardToken },
            },
          );

          if (signature === "DRY_RUN" || signature === "CANCELLED") return;

          if (Output.isJson()) {
            console.log(JSON.stringify({ action: "claim-revenue", rewardToken: opts.rewardToken, signature }));
          } else {
            Output.printMessage(`\n  ${opts.rewardToken} revenue claimed!`);
            Output.printMessage(`  Signature: ${Output.formatSignature(signature)}`);
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "claim revenue"));
          process.exit(1);
        }
      });
  }
}

function resolveOwnerFromCommand(cmd: any): PublicKey {
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
