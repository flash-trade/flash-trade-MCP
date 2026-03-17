import { Command } from "commander";
import { KeyPair } from "../lib/KeyPair.js";
import { Config } from "../lib/Config.js";
import { Output } from "../lib/Output.js";
import { Confirmation } from "../lib/Confirmation.js";
import { createInterface } from "readline";

export class KeysCommand {
  static register(program: Command): void {
    const cmd = program.command("keys").description("Manage keypairs");

    // ─── keys list ───
    cmd
      .command("list")
      .description("List all stored keypairs")
      .action(() => {
        const keys = KeyPair.list();
        if (keys.length === 0) {
          Output.printMessage("No keys found. Run: flash keys add <name>");
          return;
        }
        const activeKey = Config.get("activeKey");
        const data = keys.map(k => ({
          Name: k.name,
          "Public Key": k.publicKey,
          Active: k.name === activeKey ? "✓" : "",
          Encryption: k.encryption,
          Created: Output.formatTimestamp(k.createdAt),
        }));
        Output.print(data, [
          { key: "Name", header: "Name" },
          { key: "Public Key", header: "Public Key" },
          { key: "Active", header: "Active" },
          { key: "Encryption", header: "Encryption" },
          { key: "Created", header: "Created" },
        ]);
      });

    // ─── keys add <name> ───
    cmd
      .command("add <name>")
      .description("Generate a new keypair")
      .option("--recover", "Recover from existing mnemonic")
      .option("--index <n>", "Derivation index", "0")
      .option("--encryption <tier>", "passphrase | keychain | none", "none")
      .option("--show-mnemonic", "Display mnemonic even when piped")
      .action(async (name: string, opts: any) => {
        if (KeyPair.exists(name)) {
          Output.printError(`Key "${name}" already exists. Delete it first or choose a different name.`);
          process.exit(1);
        }

        let passphrase: string | undefined;
        if (opts.encryption === "passphrase") {
          passphrase = await promptPassphrase("Enter passphrase for key encryption: ");
          const confirm = await promptPassphrase("Confirm passphrase: ");
          if (passphrase !== confirm) {
            Output.printError("Passphrases do not match.");
            process.exit(1);
          }
        }

        if (opts.recover) {
          const mnemonic = await promptLine("Enter seed phrase: ");
          const keypair = KeyPair.fromMnemonic(name, mnemonic.trim(), parseInt(opts.index));
          keypair.save(opts.encryption, passphrase);
          Output.printMessage(`Key "${name}" recovered: ${keypair.publicKey}`);
        } else {
          const { keypair, mnemonic } = KeyPair.generate(name);
          keypair.save(opts.encryption, passphrase);

          // Display mnemonic with TTY safety check
          if (!Output.isJson()) {
            if (process.stdout.isTTY || opts.showMnemonic) {
              console.error("");
              console.error("  ⚠️  SAVE YOUR SEED PHRASE — it will NOT be shown again:");
              console.error("");
              const words = mnemonic.split(" ");
              for (let i = 0; i < words.length; i += 6) {
                console.error("  " + words.slice(i, i + 6).join(" "));
              }
              console.error("");
            } else {
              console.error("  ⚠️  Seed phrase suppressed (stdout is not a TTY). Use --show-mnemonic to display.");
            }
          }

          if (Output.isJson()) {
            console.log(JSON.stringify({
              name: keypair.publicKey,
              publicKey: keypair.publicKey,
              encryption: opts.encryption,
            }));
          } else {
            Output.printMessage(`Key "${name}" created: ${keypair.publicKey}`);
          }
        }

        // Auto-set as active if it's the first key
        if (!Config.get("activeKey")) {
          Config.set("activeKey", name);
          Output.printMessage(`Active key set to "${name}"`);
        }
      });

    // ─── keys delete <name> ───
    cmd
      .command("delete <name>")
      .description("Delete a stored keypair")
      .action(async (name: string) => {
        if (!KeyPair.exists(name)) {
          Output.printError(`Key "${name}" not found.`);
          process.exit(1);
        }

        const confirmed = await Confirmation.confirmKeyDeletion(name);
        if (!confirmed) {
          Output.printMessage("Deletion cancelled.");
          return;
        }

        KeyPair.delete(name);
        Output.printMessage(`Key "${name}" deleted.`);
      });

    // ─── keys use <name> ───
    cmd
      .command("use <name>")
      .description("Set the active keypair")
      .action((name: string) => {
        if (!KeyPair.exists(name)) {
          Output.printError(`Key "${name}" not found.`);
          process.exit(1);
        }
        Config.set("activeKey", name);
        const keys = KeyPair.list();
        const key = keys.find(k => k.name === name);
        Output.printMessage(`Active key set to "${name}" (${key?.publicKey ?? ""})`);
      });

    // ─── keys import <name> <path> ───
    cmd
      .command("import <name> <path>")
      .description("Import a Solana CLI keypair file")
      .option("--encryption <tier>", "passphrase | keychain | none", "none")
      .action(async (name: string, path: string, opts: any) => {
        if (KeyPair.exists(name)) {
          Output.printError(`Key "${name}" already exists.`);
          process.exit(1);
        }

        // Expand ~ to homedir
        const resolvedPath = path.replace(/^~/, process.env.HOME ?? "");

        let passphrase: string | undefined;
        if (opts.encryption === "passphrase") {
          passphrase = await promptPassphrase("Enter passphrase for key encryption: ");
          const confirm = await promptPassphrase("Confirm passphrase: ");
          if (passphrase !== confirm) {
            Output.printError("Passphrases do not match.");
            process.exit(1);
          }
        }

        const keypair = KeyPair.fromSolanaKeypairFile(name, resolvedPath);
        keypair.save(opts.encryption, passphrase);
        Output.printMessage(`Key "${name}" imported: ${keypair.publicKey}`);

        if (!Config.get("activeKey")) {
          Config.set("activeKey", name);
          Output.printMessage(`Active key set to "${name}"`);
        }
      });

    // ─── keys edit <name> ───
    cmd
      .command("edit <name>")
      .description("Rename a key or change encryption")
      .option("--name <newName>", "Rename the key")
      .option("--encryption <tier>", "Change encryption tier")
      .action(async (name: string, opts: any) => {
        if (!KeyPair.exists(name)) {
          Output.printError(`Key "${name}" not found.`);
          process.exit(1);
        }

        if (!opts.name && !opts.encryption) {
          Output.printError("At least one option required (--name or --encryption).");
          process.exit(1);
        }

        // Load key (may need passphrase)
        let passphrase: string | undefined;
        const keys = KeyPair.list();
        const existing = keys.find(k => k.name === name);
        if (existing?.encryption === "passphrase") {
          passphrase = await promptPassphrase("Enter current passphrase: ");
        }

        const keypair = KeyPair.load(name, passphrase);

        if (opts.name) {
          if (KeyPair.exists(opts.name)) {
            Output.printError(`Key "${opts.name}" already exists.`);
            process.exit(1);
          }
          // Save with new name, delete old
          let newPassphrase = passphrase;
          const newEncryption = opts.encryption ?? existing?.encryption ?? "none";
          if (newEncryption === "passphrase" && !newPassphrase) {
            newPassphrase = await promptPassphrase("Enter passphrase for new key: ");
          }
          const newKp = KeyPair.fromSecretKey(opts.name, keypair.secretKeyBytes);
          newKp.save(newEncryption, newPassphrase);
          KeyPair.delete(name);
          if (Config.get("activeKey") === name) {
            Config.set("activeKey", opts.name);
          }
          Output.printMessage(`Key renamed: "${name}" → "${opts.name}"`);
        } else if (opts.encryption) {
          let newPassphrase: string | undefined;
          if (opts.encryption === "passphrase") {
            newPassphrase = await promptPassphrase("Enter new passphrase: ");
            const confirm = await promptPassphrase("Confirm passphrase: ");
            if (newPassphrase !== confirm) {
              Output.printError("Passphrases do not match.");
              process.exit(1);
            }
          }
          // Re-save with new encryption
          KeyPair.delete(name);
          const newKp = KeyPair.fromSecretKey(name, keypair.secretKeyBytes);
          newKp.save(opts.encryption, newPassphrase);
          Output.printMessage(`Key "${name}" encryption changed to ${opts.encryption}`);
        }
      });
  }
}

// ─── Helpers ───

function promptLine(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise<string>(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

function promptPassphrase(question: string): Promise<string> {
  // In a real implementation, this would mask input. For now, use basic readline.
  return promptLine(question);
}
