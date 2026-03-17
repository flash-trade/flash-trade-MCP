#!/usr/bin/env bun
import { Command } from "commander";
import { Config } from "./lib/Config.js";
import { Output } from "./lib/Output.js";
import { ConfigCommand } from "./commands/ConfigCommand.js";
import { KeysCommand } from "./commands/KeysCommand.js";
import { PerpsCommand } from "./commands/PerpsCommand.js";
import { EarnCommand } from "./commands/EarnCommand.js";
import { SpotCommand } from "./commands/SpotCommand.js";
import { FafCommand } from "./commands/FafCommand.js";
import { RewardsCommand } from "./commands/RewardsCommand.js";
import { AirdropCommand } from "./commands/AirdropCommand.js";

const program = new Command();

program
  .name("flash")
  .description("Flash Trade CLI — perpetuals, yield, and swaps on Solana")
  .version("0.1.0")
  .option("--key <name>", "Use specific keypair by name")
  .option("--address <address>", "Use wallet address (read-only)")
  .option("--cluster <cluster>", "Override cluster (mainnet-beta | devnet)")
  .option("--rpc <url>", "Override RPC endpoint")
  .option("--output <format>", "Override output format (table | json)")
  .option("--yes", "Skip confirmation prompts")
  .option("--dry-run", "Simulate only, do not send transaction")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.output) Output.setFormatOverride(opts.output as "table" | "json");
    if (opts.cluster) Config.set("cluster", opts.cluster);
    if (opts.rpc) Config.set("rpcUrl", opts.rpc);
  });

// Initialize config directory
Config.ensureDir();

// Register all command groups
ConfigCommand.register(program);
KeysCommand.register(program);
PerpsCommand.register(program);
EarnCommand.register(program);
SpotCommand.register(program);
FafCommand.register(program);
RewardsCommand.register(program);
AirdropCommand.register(program);

program.parse();
