import chalk from "chalk";
import Table from "cli-table3";
import { Config } from "./Config.js";

// Allow global override from --output flag
let formatOverride: "table" | "json" | null = null;

export class Output {
  static setFormatOverride(format: "table" | "json"): void {
    formatOverride = format;
  }

  static isJson(): boolean {
    return (formatOverride ?? Config.get("outputFormat")) === "json";
  }

  // ─── Core Output ───

  static print(data: Record<string, unknown>[], columns?: { key: string; header: string }[]): void {
    if (Output.isJson()) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (data.length === 0) {
      console.log(chalk.dim("  No data to display."));
      return;
    }

    const cols = columns ?? Object.keys(data[0]).map(k => ({ key: k, header: k }));
    const table = new Table({
      head: cols.map(c => chalk.bold(c.header)),
      style: { head: [], border: [] },
    });

    for (const row of data) {
      table.push(cols.map(c => String(row[c.key] ?? "")));
    }

    console.log(table.toString());
  }

  static printSingle(data: Record<string, unknown>): void {
    if (Output.isJson()) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const table = new Table({ style: { head: [], border: [] } });
    for (const [key, value] of Object.entries(data)) {
      table.push({ [chalk.bold(key)]: String(value ?? "") });
    }
    console.log(table.toString());
  }

  static printMessage(message: string): void {
    if (Output.isJson()) return; // Suppress messages in JSON mode
    console.log(message);
  }

  static printError(error: string): void {
    if (Output.isJson()) {
      console.log(JSON.stringify({ error }));
    } else {
      console.error(chalk.red(`Error: ${error}`));
    }
  }

  // ─── Formatters ───

  static formatDollar(value: number | string, opts?: { decimals?: number }): string {
    const n = typeof value === "string" ? parseFloat(value) : value;
    if (isNaN(n)) return "$0.00";
    const d = opts?.decimals ?? (Math.abs(n) < 1000 ? 2 : 0);
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  static formatDollarChange(value: number): string {
    const formatted = Output.formatDollar(Math.abs(value));
    if (value > 0) return chalk.green(`+${formatted}`);
    if (value < 0) return chalk.red(`-${formatted}`);
    return formatted;
  }

  static formatPercentage(value: number): string {
    const formatted = `${Math.abs(value).toFixed(2)}%`;
    if (value > 0.5) return chalk.green(`+${formatted}`);
    if (value < -0.5) return chalk.red(`-${formatted}`);
    return formatted;
  }

  static formatSide(side: string): string {
    const s = side.toUpperCase();
    return s === "LONG" ? chalk.green(s) : s === "SHORT" ? chalk.red(s) : s;
  }

  static formatLeverage(value: number): string {
    return `${value.toFixed(1)}x`;
  }

  static formatSignature(sig: string): string {
    if (sig.length <= 12) return sig;
    return `${sig.slice(0, 6)}...${sig.slice(-4)}`;
  }

  static formatTimestamp(iso: string): string {
    const d = new Date(iso);
    return d.toISOString().replace("T", " ").slice(0, 16);
  }

  static formatSol(value: number): string {
    return `${value.toFixed(4)} SOL`;
  }
}
