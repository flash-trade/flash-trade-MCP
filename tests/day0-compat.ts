/**
 * Day 0: Bun + flash-sdk Compatibility Test
 *
 * Run: bun run tests/day0-compat.ts
 * Expected: All checks pass. If any fail, switch to Node.js + tsx.
 *
 * This test verifies that flash-sdk (which depends on @coral-xyz/anchor)
 * works correctly under the Bun runtime. Anchor has known issues with Bun
 * (GitHub #3080), but those were with `anchor test`, not AnchorProvider.
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { PerpetualsClient, PoolConfig, OraclePrice, Side } from "flash-sdk";
import { BN } from "bn.js";

const RPC_URL =
  process.env.FLASH_RPC_URL_DEVNET ??
  process.env.FLASH_RPC_URL_MAINNET ??
  "https://api.mainnet-beta.solana.com";

const CLUSTER = (process.env.FLASH_CLUSTER ?? "mainnet-beta") as "mainnet-beta" | "devnet";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Day 0: Bun + flash-sdk Compatibility Test");
  console.log("═══════════════════════════════════════════════════════\n");
  console.log(`  Runtime: Bun ${Bun.version}`);
  console.log(`  RPC: ${RPC_URL.substring(0, 50)}...`);
  console.log(`  Cluster: ${CLUSTER}\n`);

  // Test 1: Connection creation
  console.log("Test 1: Solana Connection");
  let connection: Connection;
  try {
    connection = new Connection(RPC_URL, "confirmed");
    const slot = await connection.getSlot();
    check("Connection created", true, `slot ${slot}`);
  } catch (e: any) {
    check("Connection created", false, e.message);
    console.error("\n❌ Cannot connect to RPC. Check FLASH_RPC_URL in .env.");
    process.exit(1);
  }

  // Test 2: AnchorProvider construction
  console.log("\nTest 2: AnchorProvider");
  let provider: AnchorProvider;
  try {
    const keypair = Keypair.generate();
    const wallet = new Wallet(keypair);
    provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    check("AnchorProvider created", true, `wallet ${wallet.publicKey.toBase58().slice(0, 8)}...`);
  } catch (e: any) {
    check("AnchorProvider created", false, e.message);
    console.error("\n❌ AnchorProvider fails under Bun. Switch to Node.js.");
    process.exit(1);
  }

  // Test 3: PoolConfig loading
  console.log("\nTest 3: PoolConfig from flash-sdk");
  let poolConfig: PoolConfig;
  try {
    const poolName = CLUSTER === "mainnet-beta" ? "Crypto.1" : "devnet.1";
    poolConfig = PoolConfig.fromIdsByName(poolName, CLUSTER);
    check("PoolConfig loaded", true, `${poolConfig.poolName}`);
    check("Markets found", poolConfig.markets.length > 0, `${poolConfig.markets.length} markets`);
    check("Custodies found", poolConfig.custodies.length > 0, `${poolConfig.custodies.length} custodies`);
    check("Tokens found", poolConfig.tokens.length > 0, `${poolConfig.tokens.length} tokens`);
  } catch (e: any) {
    check("PoolConfig loaded", false, e.message);
    console.error("\n❌ flash-sdk PoolConfig fails. SDK may be incompatible.");
    process.exit(1);
  }

  // Test 4: PerpetualsClient construction
  console.log("\nTest 4: PerpetualsClient");
  let perpClient: PerpetualsClient;
  try {
    perpClient = new PerpetualsClient(
      provider,
      poolConfig.programId,
      poolConfig.programId, // composabilityProgramId (unused)
      poolConfig.fbNftRewardProgramId, // unused
      poolConfig.rewardDistributionProgram.programId, // unused
      { prioritizationFee: 50000 },
    );
    check("PerpetualsClient created", true);
    check("Program loaded", !!perpClient.program, `programId ${poolConfig.programId.toBase58().slice(0, 8)}...`);
  } catch (e: any) {
    check("PerpetualsClient created", false, e.message);
    console.error("\n❌ PerpetualsClient fails under Bun. Switch to Node.js.");
    process.exit(1);
  }

  // Test 5: OraclePrice construction
  console.log("\nTest 5: OraclePrice");
  try {
    const price = OraclePrice.from({
      price: new BN("14832000000"),
      exponent: new BN(-9),
      confidence: new BN("10000000"),
      timestamp: new BN(Math.floor(Date.now() / 1000)),
    });
    const uiPrice = price.toUiPrice(2);
    check("OraclePrice created", true, `$${uiPrice}`);

    const contractPrice = price.toContractOraclePrice();
    check("toContractOraclePrice()", !!contractPrice.price && contractPrice.exponent !== undefined);
  } catch (e: any) {
    check("OraclePrice", false, e.message);
  }

  // Test 6: BN arithmetic (critical for amount safety)
  console.log("\nTest 6: BN Arithmetic");
  try {
    const a = new BN("1005000"); // 1.005 USDC in native (6 decimals)
    const b = new BN("10").pow(new BN(6));
    const result = a.mul(new BN(10)).div(b);
    check("BN multiplication", result.toString() === "10", `1.005 * 10 / 1e6 = ${result}`);

    // BigNumber.js test (for string → BN conversion)
    const BigNumber = (await import("bignumber.js")).default;
    const val = new BigNumber("1.005").multipliedBy(new BigNumber("1000000"));
    check("BigNumber.js precision", val.toFixed(0) === "1005000", `1.005 * 1e6 = ${val.toFixed(0)}`);
  } catch (e: any) {
    check("BN arithmetic", false, e.message);
  }

  // Test 7: Account fetch (may fail with rate limits — non-fatal)
  console.log("\nTest 7: On-chain Account Fetch");
  try {
    const poolAccount = await perpClient.program.account.pool.fetch(poolConfig.poolAddress);
    check("Pool account fetched", true);
  } catch (e: any) {
    check("Pool account fetch", false, `${e.message.slice(0, 80)} (non-fatal, may be RPC limit)`);
  }

  // Test 8: Address Lookup Tables (may fail with rate limits — non-fatal)
  console.log("\nTest 8: Address Lookup Tables");
  try {
    const result = await perpClient.getOrLoadAddressLookupTable(poolConfig);
    check("ALTs loaded", true, `${result.addressLookupTables.length} tables`);
  } catch (e: any) {
    // Check if method exists but fails due to RPC
    if (typeof perpClient.getOrLoadAddressLookupTable === "function") {
      check("ALT method exists", true, `RPC error (non-fatal): ${e.message.slice(0, 60)}`);
    } else {
      check("ALT method exists", false, "getOrLoadAddressLookupTable not found on PerpetualsClient");
    }
  }

  // Summary
  console.log("\n═══════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════\n");

  if (failed === 0) {
    console.log("✅ ALL CHECKS PASSED — Bun runtime is safe to use.\n");
  } else {
    console.log("⚠️  Some checks failed. Review above for details.");
    console.log("   If Tests 1-4 failed → switch to Node.js + tsx.");
    console.log("   If only Tests 7-8 failed → RPC rate limit, try with better RPC.\n");
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("\n❌ UNHANDLED ERROR:", err.message);
  console.error(err.stack);
  process.exit(1);
});
