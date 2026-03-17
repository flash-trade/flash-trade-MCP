import { appendFileSync, existsSync, readFileSync } from "fs";
import { Config } from "./Config.js";
import type { AuditEntry } from "../types/index.js";

export class AuditLog {
  static record(entry: Omit<AuditEntry, "timestamp">): void {
    if (!Config.get("auditLog")) return;
    const line = JSON.stringify({ ...entry, timestamp: new Date().toISOString() });
    appendFileSync(Config.AUDIT_FILE, line + "\n");
  }

  static read(limit: number = 50): AuditEntry[] {
    if (!existsSync(Config.AUDIT_FILE)) return [];
    const lines = readFileSync(Config.AUDIT_FILE, "utf-8")
      .split("\n")
      .filter(Boolean);
    return lines
      .slice(-limit)
      .map(line => JSON.parse(line) as AuditEntry)
      .reverse();
  }
}
