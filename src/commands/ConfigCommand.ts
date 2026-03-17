import { Command } from "commander";
import { Config } from "../lib/Config.js";
import { Output } from "../lib/Output.js";
import type { FlashConfig } from "../types/index.js";

export class ConfigCommand {
  static register(program: Command): void {
    const cmd = program.command("config").description("Manage CLI configuration");

    cmd
      .command("list")
      .description("Show all configuration values")
      .action(() => {
        const config = Config.load();
        if (Output.isJson()) {
          console.log(JSON.stringify(config, null, 2));
        } else {
          const entries = Object.entries(config).map(([key, value]) => ({
            Setting: key,
            Value: Array.isArray(value) ? value.join(", ") || "(none)" : String(value),
          }));
          Output.print(entries, [
            { key: "Setting", header: "Setting" },
            { key: "Value", header: "Value" },
          ]);
        }
      });

    cmd
      .command("set <key> <value>")
      .description("Set a configuration value")
      .action((key: string, value: string) => {
        const result = Config.validate(key, value);
        if (!result.valid) {
          Output.printError(`Invalid value for "${key}": ${result.error}`);
          process.exit(1);
        }

        Config.set(key as keyof FlashConfig, result.parsed as any);
        Output.printMessage(`Set ${key} = ${JSON.stringify(result.parsed)}`);
      });
  }
}
