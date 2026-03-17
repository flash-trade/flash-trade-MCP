import { Command } from "commander";
import { PublicKey } from "@solana/web3.js";
import { isVariant, Side, Privilege, OraclePrice } from "flash-sdk";
import BN from "bn.js";
import { FlashClient } from "../lib/FlashClient.js";
import { Output } from "../lib/Output.js";
import { PriceService } from "../lib/PriceService.js";
import { NumberConverter } from "../lib/NumberConverter.js";
import { ErrorHandler } from "../lib/ErrorHandler.js";
import { Config } from "../lib/Config.js";
import { Signer } from "../lib/Signer.js";
import { TxExecutor } from "../lib/TxExecutor.js";

export class PerpsCommand {
  static register(program: Command): void {
    const cmd = program.command("perps").description("Perpetual trading");

    // ─── perps markets ───
    cmd
      .command("markets")
      .description("List all available perpetual markets")
      .option("--pool <name>", "Filter by pool name")
      .option("--asset <symbol>", "Filter by asset symbol")
      .action(async (opts) => {
        try {
          const client = await FlashClient.createReadOnly();
          const rows: Record<string, unknown>[] = [];

          for (const pc of client.getPoolConfigs()) {
            if (opts.pool && pc.poolName !== opts.pool) continue;

            // Fetch all prices for this pool
            const prices = await PriceService.getAllPoolPrices(pc);

            for (const market of pc.markets) {
              const targetCustody = pc.custodies.find(c =>
                c.custodyAccount.equals(market.targetCustody)
              );
              if (!targetCustody) continue;

              const token = pc.tokens.find(t => t.mintKey.equals(targetCustody.mintKey));
              if (!token) continue;
              if (opts.asset && token.symbol.toUpperCase() !== opts.asset.toUpperCase()) continue;

              const side = isVariant(market.side, "long") ? "long" : "short";
              const price = prices.get(token.symbol);
              const priceUsd = price ? parseFloat(price.toUiPrice(2)) : 0;

              // Determine collateral token for this market
              const collateralCustody = pc.custodies.find((c: any) =>
                c.custodyAccount.equals(market.collateralCustody)
              );
              const collateralToken = collateralCustody
                ? pc.tokens.find((t: any) => t.mintKey.equals(collateralCustody.mintKey))
                : null;

              rows.push({
                asset: token.symbol,
                pool: pc.poolName,
                side,
                collateral: collateralToken?.symbol ?? "?",
                priceUsd,
                maxLeverage: targetCustody.isVirtual ? 200 : 100,
                marketPubkey: market.marketAccount.toBase58(),
              });
            }
          }

          if (Output.isJson()) {
            console.log(JSON.stringify(rows, null, 2));
          } else {
            Output.print(
              rows.map(r => ({
                Asset: r.asset,
                Pool: r.pool,
                Side: Output.formatSide(r.side as string),
                Collateral: r.collateral,
                Price: Output.formatDollar(r.priceUsd as number),
                "Max Lev": `${r.maxLeverage}x`,
              })),
              [
                { key: "Asset", header: "Asset" },
                { key: "Pool", header: "Pool" },
                { key: "Side", header: "Side" },
                { key: "Collateral", header: "Collateral" },
                { key: "Price", header: "Price" },
                { key: "Max Lev", header: "Max Lev" },
              ],
            );
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "list markets"));
          process.exit(1);
        }
      });

    // ─── perps positions ───
    cmd
      .command("positions")
      .description("Show open positions")
      .option("--key <name>", "Keypair name")
      .option("--address <address>", "Wallet address (read-only)")
      .action(async (_opts: any, cmd: any) => {
        try {
          const owner = resolveOwnerFromCommand(cmd);
          const client = await FlashClient.createReadOnly();
          const positions = await client.getPositions(owner);

          if (positions.length === 0) {
            Output.printMessage("No open positions.");
            if (Output.isJson()) console.log("[]");
            return;
          }

          const enriched = await Promise.all(
            positions.map(p => client.enrichPosition(p))
          );

          if (Output.isJson()) {
            console.log(JSON.stringify(enriched, null, 2));
          } else {
            Output.print(
              enriched.map(p => ({
                Asset: p.asset,
                Side: Output.formatSide(p.side as string),
                Size: Output.formatDollar(p.sizeUsd as number),
                Entry: Output.formatDollar(p.entryPrice as number),
                Current: Output.formatDollar(p.currentPrice as number),
                PnL: Output.formatDollarChange(p.pnlUsd as number),
                "PnL%": Output.formatPercentage(p.pnlPct as number),
                Lev: Output.formatLeverage(p.leverage as number),
              })),
              [
                { key: "Asset", header: "Asset" },
                { key: "Side", header: "Side" },
                { key: "Size", header: "Size" },
                { key: "Entry", header: "Entry" },
                { key: "Current", header: "Current" },
                { key: "PnL", header: "PnL" },
                { key: "PnL%", header: "PnL%" },
                { key: "Lev", header: "Leverage" },
              ],
            );
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "fetch positions"));
          process.exit(1);
        }
      });

    // ─── perps orders ───
    cmd
      .command("orders")
      .description("Show open orders (limit + trigger)")
      .option("--key <name>", "Keypair name")
      .option("--address <address>", "Wallet address (read-only)")
      .action(async (_opts: any, cmd: any) => {
        try {
          const owner = resolveOwnerFromCommand(cmd);
          const client = await FlashClient.createReadOnly();
          const orders = await client.getOrders(owner);

          if (orders.length === 0) {
            Output.printMessage("No open orders.");
            if (Output.isJson()) console.log("[]");
            return;
          }

          const rows = orders.map((o: any) => {
            let asset = "unknown";
            let side = "unknown";
            for (const pc of client.getPoolConfigs()) {
              const mc = pc.markets.find(m => m.marketAccount.equals(o.market));
              if (mc) {
                const tc = pc.custodies.find(c => c.custodyAccount.equals(mc.targetCustody));
                const token = tc ? pc.tokens.find(t => t.mintKey.equals(tc.mintKey)) : null;
                asset = token?.symbol ?? "unknown";
                side = isVariant(mc.side, "long") ? "long" : "short";
                break;
              }
            }

            // Parse trigger orders from the order account
            // Order accounts contain: limitOrders[], takeProfitOrders[], stopLossOrders[]
            const subOrders: any[] = [];
            const addSub = (arr: any[], type: string) => {
              if (!arr) return;
              for (const so of arr) {
                if (!so || (so.sizeAmount && so.sizeAmount.isZero())) continue;
                let triggerPriceUi = 0;
                try {
                  if (so.triggerPrice && so.triggerPrice.price && !so.triggerPrice.price.isZero()) {
                    const tp = OraclePrice.from({
                      price: so.triggerPrice.price,
                      exponent: new BN(so.triggerPrice.exponent),
                      confidence: new BN(0), timestamp: new BN(0),
                    });
                    triggerPriceUi = parseFloat(tp.toUiPrice(2));
                  }
                } catch {}
                const sizeField = so.sizeUsd ?? so.sizeAmount ?? new BN(0);
                subOrders.push({
                  asset, side, type,
                  orderPubkey: o.pubkey.toBase58(),
                  sizeUsd: NumberConverter.toDisplayNumber(sizeField, 6),
                  triggerPrice: triggerPriceUi,
                });
              }
            };
            addSub(o.limitOrders, "Limit");
            addSub(o.takeProfitOrders ?? o.takeProfit, "TP");
            addSub(o.stopLossOrders ?? o.stopLoss, "SL");

            // If no sub-orders found, show the raw order
            if (subOrders.length === 0) {
              const sizeField = o.sizeUsd ?? o.openSizeUsd ?? new BN(0);
              subOrders.push({
                asset, side, type: "Order",
                orderPubkey: o.pubkey.toBase58(),
                sizeUsd: NumberConverter.toDisplayNumber(sizeField, 6),
                triggerPrice: 0,
              });
            }
            return subOrders;
          });

          const flatRows = rows.flat();

          if (Output.isJson()) {
            console.log(JSON.stringify(flatRows, null, 2));
          } else {
            Output.print(
              flatRows.map((r: any) => ({
                Type: r.type,
                Asset: r.asset,
                Side: Output.formatSide(r.side),
                Size: r.sizeUsd > 0 ? Output.formatDollar(r.sizeUsd) : "—",
                Trigger: r.triggerPrice > 0 ? Output.formatDollar(r.triggerPrice) : "—",
                "Order Key": Output.formatSignature(r.orderPubkey),
              })),
              [
                { key: "Type", header: "Type" },
                { key: "Asset", header: "Asset" },
                { key: "Side", header: "Side" },
                { key: "Size", header: "Size" },
                { key: "Trigger", header: "Trigger" },
                { key: "Order Key", header: "Order" },
              ],
            );
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "fetch orders"));
          process.exit(1);
        }
      });

    // ─── perps open ───
    cmd
      .command("open")
      .description("Open a new perpetual position")
      .requiredOption("--asset <symbol>", "Target asset (SOL, BTC, ETH, etc.)")
      .requiredOption("--side <side>", "Position side (long | short)")
      .requiredOption("--amount <usd>", "Collateral amount in USD")
      .requiredOption("--leverage <n>", "Leverage multiplier (1-100, 200 for virtual)")
      .option("--pool <name>", "Pool name (auto-resolved if omitted)")
      .option("--input-token <sym>", "Collateral token symbol", "USDC")
      .option("--slippage <bps>", "Slippage in basis points")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified. Use --key <name> or set active key.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);

          const side = opts.side.toLowerCase();
          if (side !== "long" && side !== "short") {
            throw new Error("--side must be 'long' or 'short'");
          }

          const leverage = parseFloat(opts.leverage);
          if (isNaN(leverage) || leverage < 1 || leverage > 200) {
            throw new Error("--leverage must be between 1 and 200");
          }

          if (!NumberConverter.isValidAmount(opts.amount)) {
            throw new Error("--amount must be a positive number");
          }

          const slippageBps = parseInt(opts.slippage ?? Config.get("slippageBps").toString(), 10);
          const { poolConfig } = opts.pool
            ? { poolConfig: client.getPoolByName(opts.pool) }
            : client.resolveMarket(opts.asset, side);

          const collateralSymbol = opts.inputToken;

          // Get price with slippage
          const targetPrice = await PriceService.getPrice(opts.asset);
          const priceWithSlippage = (client.perpClient as any).getPriceAfterSlippage(
            true, // isEntry
            new BN(slippageBps),
            targetPrice,
            side === "long" ? Side.Long : Side.Short,
          );

          // Calculate collateral in native token decimals
          // For USDC: $5 = 5_000_000 (6 decimals)
          // For SOL: $5 worth of SOL at current price
          const collateralDecimals = poolConfig.getTokenFromSymbol(collateralSymbol).decimals;
          let collateralNative: BN;
          if (collateralSymbol === "USDC") {
            collateralNative = NumberConverter.toNative(opts.amount, collateralDecimals);
          } else {
            const inputPrice = await PriceService.getPrice(collateralSymbol);
            const usdBN = NumberConverter.usdToNative(opts.amount);
            collateralNative = inputPrice.getTokenAmount(usdBN, collateralDecimals);
          }

          // Calculate size in TARGET token native decimals (not USD)
          // sizeUsd = collateral * leverage, then convert to target tokens
          const sizeUsd = parseFloat(opts.amount) * leverage;
          const targetDecimals = poolConfig.getTokenFromSymbol(opts.asset).decimals;
          const targetPriceUsd = parseFloat(targetPrice.toUiPrice(6));
          const sizeInTokens = sizeUsd / targetPriceUsd;
          const sizeBN = NumberConverter.toNative(sizeInTokens.toFixed(targetDecimals), targetDecimals);

          // Determine the market's actual collateral token
          // Long markets use the target token as collateral (ETH/ETH, SOL/SOL, BTC/BTC)
          // Short markets use USDC as collateral (ETH/USDC, SOL/USDC, BTC/USDC)
          const sideEnum = side === "long" ? Side.Long : Side.Short;
          const market = poolConfig.markets.find(m => {
            const tc = poolConfig.custodies.find(c => c.custodyAccount.equals(m.targetCustody));
            const token = tc ? poolConfig.tokens.find(t => t.mintKey.equals(tc.mintKey)) : null;
            return token?.symbol === opts.asset && isVariant(m.side, side);
          });
          const marketCollateralCustody = market
            ? poolConfig.custodies.find(c => c.custodyAccount.equals(market.collateralCustody))
            : null;
          const marketCollateralSymbol = marketCollateralCustody
            ? poolConfig.tokens.find(t => t.mintKey.equals(marketCollateralCustody.mintKey))?.symbol
            : collateralSymbol;

          // If user's input token differs from market's collateral, use swapAndOpen
          const needsSwap = collateralSymbol !== marketCollateralSymbol;

          let bundle;
          if (needsSwap) {
            // swapAndOpen: swap user's input token to market's collateral, then open
            // Params: targetToken, collateralToken (market's), userInputToken, amountIn, price, size, side, poolConfig, privilege
            bundle = await (client.perpClient as any).swapAndOpen(
              opts.asset,              // targetTokenSymbol
              marketCollateralSymbol,  // collateralTokenSymbol (market's native collateral)
              collateralSymbol,        // userInputTokenSymbol (what user is paying with)
              collateralNative,        // amountIn (user's input amount)
              priceWithSlippage,
              sizeBN,
              sideEnum,
              poolConfig,
              Privilege.None,
            );
          } else {
            bundle = await client.perpClient.openPosition(
              opts.asset, collateralSymbol,
              priceWithSlippage, collateralNative, sizeBN,
              sideEnum,
              poolConfig, Privilege.None,
            );
          }

          // Get ALTs
          const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);

          const dryRun = parentOpts.dryRun ?? false;
          const yesFlag = parentOpts.yes ?? false;

          const signature = await TxExecutor.execute(
            { ...bundle, addressLookupTables },
            client.connection,
            signer,
            {
              action: `Open ${leverage}x ${side.toUpperCase()} ${opts.asset}`,
              amountUsd: parseFloat(opts.amount),
              dryRun,
              yesFlag,
              poolAddress: poolConfig.poolAddress.toBase58(),
              auditData: { asset: opts.asset, side, pool: poolConfig.poolName },
            },
          );

          if (signature === "DRY_RUN" || signature === "CANCELLED") return;

          const entryPrice = parseFloat(targetPrice.toUiPrice(2));

          if (Output.isJson()) {
            console.log(JSON.stringify({
              asset: opts.asset,
              side,
              sizeUsd,
              collateralUsd: parseFloat(opts.amount),
              leverage,
              entryPrice,
              signature,
            }));
          } else {
            Output.printMessage("\n  Position opened!");
            Output.printSingle({
              Asset: opts.asset,
              Side: Output.formatSide(side),
              Size: Output.formatDollar(sizeUsd),
              Collateral: Output.formatDollar(parseFloat(opts.amount)),
              Leverage: Output.formatLeverage(leverage),
              "Entry Price": Output.formatDollar(entryPrice),
              Signature: Output.formatSignature(signature),
            });
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "open position"));
          process.exit(1);
        }
      });

    // ─── perps close ───
    cmd
      .command("close")
      .description("Close an open position")
      .option("--asset <symbol>", "Close by asset + side")
      .option("--side <side>", "Position side (required with --asset)")
      .option("--position <pubkey>", "Close by position pubkey")
      .option("--output-token <sym>", "Token to receive", "USDC")
      .option("--slippage <bps>", "Slippage in basis points")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);

          let side: string;
          let asset: string;
          let poolConfig: any;

          if (opts.position) {
            // Resolve from position pubkey — find the matching position
            const positions = await client.getPositions(signer.publicKey);
            const pos = positions.find((p: any) => p.pubkey.toBase58() === opts.position);
            if (!pos) throw new Error(`Position not found: ${opts.position}`);

            for (const pc of client.getPoolConfigs()) {
              const mc = pc.markets.find(m => m.marketAccount.equals(pos.market));
              if (mc) {
                poolConfig = pc;
                const tc = pc.custodies.find(c => c.custodyAccount.equals(mc.targetCustody));
                const token = tc ? pc.tokens.find(t => t.mintKey.equals(tc.mintKey)) : null;
                asset = token?.symbol ?? "unknown";
                side = isVariant(mc.side, "long") ? "long" : "short";
                break;
              }
            }
          } else if (opts.asset && opts.side) {
            asset = opts.asset;
            side = opts.side.toLowerCase();
            const resolved = client.resolveMarket(asset, side as "long" | "short");
            poolConfig = resolved.poolConfig;
          } else {
            throw new Error("Specify --asset <sym> --side <side> or --position <pubkey>");
          }

          const slippageBps = parseInt(opts.slippage ?? Config.get("slippageBps").toString(), 10);
          const collateralSymbol = opts.outputToken;

          // Get price with slippage (for close, isEntry=false)
          const targetPrice = await PriceService.getPrice(asset!);
          const priceWithSlippage = (client.perpClient as any).getPriceAfterSlippage(
            false,
            new BN(slippageBps),
            targetPrice,
            side! === "long" ? Side.Long : Side.Short,
          );

          // Determine market's native collateral (same logic as open)
          const closeMarket = poolConfig.markets.find((m: any) => {
            const tc = poolConfig.custodies.find((c: any) => c.custodyAccount.equals(m.targetCustody));
            const token = tc ? poolConfig.tokens.find((t: any) => t.mintKey.equals(tc.mintKey)) : null;
            return token?.symbol === asset && isVariant(m.side, side!);
          });
          const closeMarketCollateral = closeMarket
            ? poolConfig.custodies.find((c: any) => c.custodyAccount.equals(closeMarket.collateralCustody))
            : null;
          const marketCollateralSym = closeMarketCollateral
            ? poolConfig.tokens.find((t: any) => t.mintKey.equals(closeMarketCollateral.mintKey))?.symbol ?? collateralSymbol
            : collateralSymbol;

          const sideEnum = side! === "long" ? Side.Long : Side.Short;

          // Auto-cancel all trigger orders before closing (prevents orphaned orders)
          // Frontend does this at closePositionTxFallback.ts:163-178 with orderId=255
          let cancelInstructions: any[] = [];
          try {
            const orders = await client.getOrders(signer.publicKey);
            const hasOrders = orders.some((o: any) => {
              for (const pc of client.getPoolConfigs()) {
                const mc = pc.markets.find((m: any) => m.marketAccount.equals(o.market));
                if (mc) {
                  const tc = pc.custodies.find((c: any) => c.custodyAccount.equals(mc.targetCustody));
                  const token = tc ? pc.tokens.find((t: any) => t.mintKey.equals(tc.mintKey)) : null;
                  if (token?.symbol === asset && isVariant(mc.side, side!)) return true;
                }
              }
              return false;
            });
            if (hasOrders) {
              const cancelBundle = await (client.perpClient as any).cancelAllTriggerOrders(
                asset!, marketCollateralSym, sideEnum, poolConfig,
              );
              cancelInstructions = cancelBundle.instructions;
            }
          } catch { /* Non-fatal: continue with close even if cancel fails */ }

          let bundle;
          if (collateralSymbol !== marketCollateralSym) {
            bundle = await (client.perpClient as any).closeAndSwap(
              asset!, collateralSymbol, marketCollateralSym,
              priceWithSlippage, sideEnum, poolConfig, Privilege.None,
            );
          } else {
            bundle = await client.perpClient.closePosition(
              asset!, collateralSymbol, priceWithSlippage,
              sideEnum, poolConfig, Privilege.None,
            );
          }

          // Compose: cancel triggers + close in one transaction
          bundle.instructions = [...cancelInstructions, ...bundle.instructions];

          const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
          const dryRun = parentOpts.dryRun ?? false;
          const yesFlag = parentOpts.yes ?? false;

          const signature = await TxExecutor.execute(
            { ...bundle, addressLookupTables },
            client.connection,
            signer,
            {
              action: `Close ${side!.toUpperCase()} ${asset!}`,
              dryRun,
              yesFlag,
              poolAddress: poolConfig.poolAddress.toBase58(),
              auditData: { asset: asset!, side: side!, pool: poolConfig.poolName },
            },
          );

          if (signature === "DRY_RUN" || signature === "CANCELLED") return;

          if (Output.isJson()) {
            console.log(JSON.stringify({
              asset: asset!,
              side: side!,
              receivedToken: collateralSymbol,
              signature,
            }));
          } else {
            Output.printMessage("\n  Position closed!");
            Output.printSingle({
              Asset: asset!,
              Side: Output.formatSide(side!),
              "Received In": collateralSymbol,
              Signature: Output.formatSignature(signature),
            });
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "close position"));
          process.exit(1);
        }
      });

    // ─── perps set ───
    cmd
      .command("set")
      .description("Modify position (TP/SL, collateral)")
      .option("--asset <symbol>", "Target position by asset")
      .option("--side <side>", "Position side (required with --asset)")
      .option("--position <pubkey>", "Or target by position pubkey")
      .option("--take-profit <price>", "Set take-profit price")
      .option("--stop-loss <price>", "Set stop-loss price")
      .option("--add-collateral <usd>", "Add collateral in USD")
      .option("--remove-collateral <usd>", "Remove collateral in USD")
      .option("--tp-percent <n>", "TP close percentage (1-100)", "100")
      .option("--sl-percent <n>", "SL close percentage (1-100)", "100")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);

          // Resolve the position
          let asset: string;
          let side: string;
          let poolConfig: any;
          let positionPubkey: PublicKey | undefined;

          if (opts.position) {
            const positions = await client.getPositions(signer.publicKey);
            const pos = positions.find((p: any) => p.pubkey.toBase58() === opts.position);
            if (!pos) throw new Error(`Position not found: ${opts.position}`);
            positionPubkey = pos.pubkey;

            for (const pc of client.getPoolConfigs()) {
              const mc = pc.markets.find(m => m.marketAccount.equals(pos.market));
              if (mc) {
                poolConfig = pc;
                const tc = pc.custodies.find(c => c.custodyAccount.equals(mc.targetCustody));
                const token = tc ? pc.tokens.find(t => t.mintKey.equals(tc.mintKey)) : null;
                asset = token?.symbol ?? "unknown";
                side = isVariant(mc.side, "long") ? "long" : "short";
                break;
              }
            }
          } else if (opts.asset && opts.side) {
            asset = opts.asset;
            side = opts.side.toLowerCase();
            const resolved = client.resolveMarket(asset, side as "long" | "short");
            poolConfig = resolved.poolConfig;
          } else {
            throw new Error("Specify --asset <sym> --side <side> or --position <pubkey>");
          }

          const dryRun = parentOpts.dryRun ?? false;
          const yesFlag = parentOpts.yes ?? false;
          const signatures: string[] = [];

          // Handle TP
          if (opts.takeProfit) {
            const tpPriceBN = new BN(
              Math.round(parseFloat(opts.takeProfit) * 10 ** 9).toString()
            );
            const tpPrice = { price: tpPriceBN, exponent: -9 };

            // deltaSizeAmount = position size * percentage
            const positions = await client.getPositions(signer.publicKey);
            const pos = positions.find((p: any) => {
              if (positionPubkey) return p.pubkey.equals(positionPubkey);
              for (const pc of client.getPoolConfigs()) {
                const mc = pc.markets.find(m => m.marketAccount.equals(p.market));
                if (mc) {
                  const tc = pc.custodies.find(c => c.custodyAccount.equals(mc.targetCustody));
                  const token = tc ? pc.tokens.find(t => t.mintKey.equals(tc.mintKey)) : null;
                  if (token?.symbol === asset && isVariant(mc.side, side!)) return true;
                }
              }
              return false;
            });

            const deltaSizeAmount = pos
              ? pos.sizeAmount.muln(parseInt(opts.tpPercent)).divn(100)
              : new BN(0);

            const collateralSymbol = "USDC"; // Default receive token
            const bundle = await (client.perpClient as any).placeTriggerOrder(
              asset!, collateralSymbol, collateralSymbol,
              side! === "long" ? Side.Long : Side.Short,
              tpPrice, deltaSizeAmount, false, // isStopLoss = false for TP
              poolConfig,
            );

            const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
            const sig = await TxExecutor.execute(
              { ...bundle, addressLookupTables }, client.connection, signer,
              { action: `Set TP at $${opts.takeProfit} for ${asset!}`, dryRun, yesFlag,
                poolAddress: poolConfig.poolAddress.toBase58() },
            );
            if (sig !== "DRY_RUN" && sig !== "CANCELLED") signatures.push(sig);
          }

          // Handle SL
          if (opts.stopLoss) {
            const slPriceBN = new BN(
              Math.round(parseFloat(opts.stopLoss) * 10 ** 9).toString()
            );
            const slPrice = { price: slPriceBN, exponent: -9 };

            const positions = await client.getPositions(signer.publicKey);
            const pos = positions.find((p: any) => {
              if (positionPubkey) return p.pubkey.equals(positionPubkey);
              for (const pc of client.getPoolConfigs()) {
                const mc = pc.markets.find(m => m.marketAccount.equals(p.market));
                if (mc) {
                  const tc = pc.custodies.find(c => c.custodyAccount.equals(mc.targetCustody));
                  const token = tc ? pc.tokens.find(t => t.mintKey.equals(tc.mintKey)) : null;
                  if (token?.symbol === asset && isVariant(mc.side, side!)) return true;
                }
              }
              return false;
            });

            const deltaSizeAmount = pos
              ? pos.sizeAmount.muln(parseInt(opts.slPercent)).divn(100)
              : new BN(0);

            const collateralSymbol = "USDC";
            const bundle = await (client.perpClient as any).placeTriggerOrder(
              asset!, collateralSymbol, collateralSymbol,
              side! === "long" ? Side.Long : Side.Short,
              slPrice, deltaSizeAmount, true, // isStopLoss = true for SL
              poolConfig,
            );

            const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
            const sig = await TxExecutor.execute(
              { ...bundle, addressLookupTables }, client.connection, signer,
              { action: `Set SL at $${opts.stopLoss} for ${asset!}`, dryRun, yesFlag,
                poolAddress: poolConfig.poolAddress.toBase58() },
            );
            if (sig !== "DRY_RUN" && sig !== "CANCELLED") signatures.push(sig);
          }

          // Handle add collateral
          if (opts.addCollateral) {
            const collateralBN = NumberConverter.usdToNative(opts.addCollateral);
            // For addCollateral, we need the position pubkey
            if (!positionPubkey) {
              const positions = await client.getPositions(signer.publicKey);
              const pos = positions.find((p: any) => {
                for (const pc of client.getPoolConfigs()) {
                  const mc = pc.markets.find(m => m.marketAccount.equals(p.market));
                  if (mc) {
                    const tc = pc.custodies.find(c => c.custodyAccount.equals(mc.targetCustody));
                    const token = tc ? pc.tokens.find(t => t.mintKey.equals(tc.mintKey)) : null;
                    if (token?.symbol === asset && isVariant(mc.side, side!)) return true;
                  }
                }
                return false;
              });
              if (pos) positionPubkey = pos.pubkey;
            }
            if (!positionPubkey) throw new Error("Could not find position to modify.");

            // Detect if market's collateral differs from USDC (long markets use target token)
            const addMarket = poolConfig.markets.find((m: any) => {
              const tc = poolConfig.custodies.find((c: any) => c.custodyAccount.equals(m.targetCustody));
              const token = tc ? poolConfig.tokens.find((t: any) => t.mintKey.equals(tc.mintKey)) : null;
              return token?.symbol === asset && isVariant(m.side, side!);
            });
            const addMarketCollateral = addMarket
              ? poolConfig.custodies.find((c: any) => c.custodyAccount.equals(addMarket.collateralCustody))
              : null;
            const addMarketCollateralSym = addMarketCollateral
              ? poolConfig.tokens.find((t: any) => t.mintKey.equals(addMarketCollateral.mintKey))?.symbol ?? "USDC"
              : "USDC";

            let bundle;
            if (addMarketCollateralSym !== "USDC") {
              // Use swapAndAddCollateral: USDC → market collateral → add
              bundle = await (client.perpClient as any).swapAndAddCollateral(
                asset!, "USDC", addMarketCollateralSym,
                collateralBN, side! === "long" ? Side.Long : Side.Short,
                positionPubkey, poolConfig, true,
              );
            } else {
              bundle = await client.perpClient.addCollateral(
                collateralBN, asset!, "USDC",
                side! === "long" ? Side.Long : Side.Short,
                positionPubkey, poolConfig,
              );
            }

            const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
            const sig = await TxExecutor.execute(
              { ...bundle, addressLookupTables }, client.connection, signer,
              { action: `Add $${opts.addCollateral} collateral to ${asset!}`, dryRun, yesFlag,
                amountUsd: parseFloat(opts.addCollateral),
                poolAddress: poolConfig.poolAddress.toBase58() },
            );
            if (sig !== "DRY_RUN" && sig !== "CANCELLED") signatures.push(sig);
          }

          // Handle remove collateral
          if (opts.removeCollateral) {
            const collateralDeltaUsd = NumberConverter.usdToNative(opts.removeCollateral);
            if (!positionPubkey) {
              const positions = await client.getPositions(signer.publicKey);
              const pos = positions.find((p: any) => {
                for (const pc of client.getPoolConfigs()) {
                  const mc = pc.markets.find(m => m.marketAccount.equals(p.market));
                  if (mc) {
                    const tc = pc.custodies.find(c => c.custodyAccount.equals(mc.targetCustody));
                    const token = tc ? pc.tokens.find(t => t.mintKey.equals(tc.mintKey)) : null;
                    if (token?.symbol === asset && isVariant(mc.side, side!)) return true;
                  }
                }
                return false;
              });
              if (pos) positionPubkey = pos.pubkey;
            }
            if (!positionPubkey) throw new Error("Could not find position to modify.");

            const bundle = await client.perpClient.removeCollateral(
              collateralDeltaUsd, asset!, "USDC",
              side! === "long" ? Side.Long : Side.Short,
              positionPubkey, poolConfig,
            );

            const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
            const sig = await TxExecutor.execute(
              { ...bundle, addressLookupTables }, client.connection, signer,
              { action: `Remove $${opts.removeCollateral} collateral from ${asset!}`, dryRun, yesFlag,
                poolAddress: poolConfig.poolAddress.toBase58() },
            );
            if (sig !== "DRY_RUN" && sig !== "CANCELLED") signatures.push(sig);
          }

          if (signatures.length === 0 && !dryRun) {
            Output.printMessage("No modifications specified. Use --take-profit, --stop-loss, --add-collateral, or --remove-collateral.");
            return;
          }

          if (Output.isJson()) {
            console.log(JSON.stringify({ asset: asset!, side: side!, signatures }));
          } else {
            Output.printMessage("\n  Position updated!");
            for (const sig of signatures) {
              Output.printMessage(`  Signature: ${Output.formatSignature(sig)}`);
            }
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "modify position"));
          process.exit(1);
        }
      });

    // ─── perps limit ───
    cmd
      .command("limit")
      .description("Place a limit order")
      .requiredOption("--asset <symbol>", "Target asset")
      .requiredOption("--side <side>", "Position side (long | short)")
      .requiredOption("--amount <usd>", "Collateral amount in USD")
      .requiredOption("--leverage <n>", "Leverage multiplier")
      .requiredOption("--price <n>", "Trigger/limit price in USD")
      .option("--pool <name>", "Pool name")
      .option("--input-token <sym>", "Reserve token", "USDC")
      .option("--take-profit <n>", "Auto-set TP after fill")
      .option("--stop-loss <n>", "Auto-set SL after fill")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);

          const side = opts.side.toLowerCase();
          const leverage = parseFloat(opts.leverage);
          const collateralUsd = parseFloat(opts.amount);
          const sizeUsd = collateralUsd * leverage;

          const { poolConfig } = opts.pool
            ? { poolConfig: client.getPoolByName(opts.pool) }
            : client.resolveMarket(opts.asset, side as "long" | "short");

          // Resolve market's native collateral (e.g., ETH for ETH/ETH long, USDC for SOL/USDC short)
          const limitMarket = poolConfig.markets.find((m: any) => {
            const tc = poolConfig.custodies.find((c: any) => c.custodyAccount.equals(m.targetCustody));
            const token = tc ? poolConfig.tokens.find((t: any) => t.mintKey.equals(tc.mintKey)) : null;
            return token?.symbol === opts.asset && isVariant(m.side, side);
          });
          const limitMarketCollateral = limitMarket
            ? poolConfig.custodies.find((c: any) => c.custodyAccount.equals(limitMarket.collateralCustody))
            : null;
          const marketCollateralSym = limitMarketCollateral
            ? poolConfig.tokens.find((t: any) => t.mintKey.equals(limitMarketCollateral.mintKey))?.symbol ?? opts.inputToken
            : opts.inputToken;

          const reserveSymbol = opts.inputToken;
          const collateralSymbol = marketCollateralSym;  // Market's native collateral
          const receiveSymbol = opts.inputToken;          // User gets back their input token

          // Convert limit price to ContractOraclePrice
          const limitPriceBN = new BN(Math.round(parseFloat(opts.price) * 10 ** 9).toString());
          const limitPrice = { price: limitPriceBN, exponent: -9 };

          // Reserve amount in native token decimals
          const reserveDecimals = poolConfig.getTokenFromSymbol(reserveSymbol).decimals;
          const reserveAmount = NumberConverter.toNative(opts.amount, reserveDecimals);

          // Size in target token decimals
          const targetPrice = await PriceService.getPrice(opts.asset);
          const targetDecimals = poolConfig.getTokenFromSymbol(opts.asset).decimals;
          const targetPriceUsd = parseFloat(targetPrice.toUiPrice(6));
          const sizeInTokens = sizeUsd / targetPriceUsd;
          const sizeAmount = NumberConverter.toNative(sizeInTokens.toFixed(targetDecimals), targetDecimals);

          // TP/SL prices (zero = not set)
          const tpPrice = opts.takeProfit
            ? { price: new BN(Math.round(parseFloat(opts.takeProfit) * 10 ** 9).toString()), exponent: -9 }
            : { price: new BN(0), exponent: -9 };
          const slPrice = opts.stopLoss
            ? { price: new BN(Math.round(parseFloat(opts.stopLoss) * 10 ** 9).toString()), exponent: -9 }
            : { price: new BN(0), exponent: -9 };

          const bundle = await (client.perpClient as any).placeLimitOrder(
            opts.asset, collateralSymbol, reserveSymbol, receiveSymbol,
            side === "long" ? Side.Long : Side.Short,
            limitPrice, reserveAmount, sizeAmount,
            slPrice, tpPrice,
            poolConfig,
          );

          const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
          const dryRun = parentOpts.dryRun ?? false;
          const yesFlag = parentOpts.yes ?? false;

          const signature = await TxExecutor.execute(
            { ...bundle, addressLookupTables }, client.connection, signer,
            {
              action: `Limit order: ${leverage}x ${side.toUpperCase()} ${opts.asset} at $${opts.price}`,
              amountUsd: collateralUsd,
              dryRun, yesFlag,
              poolAddress: poolConfig.poolAddress.toBase58(),
              auditData: { asset: opts.asset, side, type: "limit" },
            },
          );

          if (signature === "DRY_RUN" || signature === "CANCELLED") return;

          if (Output.isJson()) {
            console.log(JSON.stringify({
              type: "limit-order",
              asset: opts.asset,
              side,
              triggerPrice: parseFloat(opts.price),
              sizeUsd,
              leverage,
              signature,
            }));
          } else {
            Output.printMessage("\n  Limit order placed!");
            Output.printSingle({
              Asset: opts.asset,
              Side: Output.formatSide(side),
              "Trigger Price": Output.formatDollar(parseFloat(opts.price)),
              Size: Output.formatDollar(sizeUsd),
              Leverage: Output.formatLeverage(leverage),
              Signature: Output.formatSignature(signature),
            });
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "place limit order"));
          process.exit(1);
        }
      });

    // ─── perps cancel ───
    cmd
      .command("cancel")
      .description("Cancel an order (limit or trigger)")
      .option("--order <pubkey>", "Order pubkey to cancel")
      .option("--asset <symbol>", "Cancel by asset + side")
      .option("--side <side>", "Position side")
      .option("--type <type>", "Order type: trigger (default)", "trigger")
      .option("--order-id <n>", "Order ID within the order account", "0")
      .option("--is-stop-loss", "Cancel a stop-loss (vs take-profit)")
      .option("--key <name>", "Keypair to use")
      .action(async (opts, cmd) => {
        try {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          const keyName = opts.key ?? parentOpts.key ?? Config.get("activeKey");
          if (!keyName) throw new Error("No key specified.");

          const signer = Signer.fromName(keyName);
          const client = await FlashClient.create(signer);

          if (!opts.asset || !opts.side) {
            throw new Error("--asset and --side are required for cancel.");
          }

          const side = opts.side.toLowerCase();
          const { poolConfig } = client.resolveMarket(opts.asset, side as "long" | "short");
          const orderId = parseInt(opts.orderId, 10);
          const isStopLoss = !!opts.isStopLoss;

          // Determine collateral symbol from the market
          const market = poolConfig.markets.find(m => {
            const tc = poolConfig.custodies.find(c => c.custodyAccount.equals(m.targetCustody));
            const token = tc ? poolConfig.tokens.find(t => t.mintKey.equals(tc.mintKey)) : null;
            return token?.symbol === opts.asset && isVariant(m.side, side);
          });
          const collateralCustody = market
            ? poolConfig.custodies.find(c => c.custodyAccount.equals(market.collateralCustody))
            : null;
          const collateralSymbol = collateralCustody
            ? poolConfig.tokens.find(t => t.mintKey.equals(collateralCustody.mintKey))?.symbol ?? "USDC"
            : "USDC";

          const bundle = await (client.perpClient as any).cancelTriggerOrder(
            opts.asset, collateralSymbol,
            side === "long" ? Side.Long : Side.Short,
            orderId, isStopLoss,
            poolConfig,
          );

          const { addressLookupTables } = await client.perpClient.getOrLoadAddressLookupTable(poolConfig);
          const dryRun = parentOpts.dryRun ?? false;
          const yesFlag = parentOpts.yes ?? false;

          const signature = await TxExecutor.execute(
            { ...bundle, addressLookupTables }, client.connection, signer,
            { action: `Cancel ${isStopLoss ? "SL" : "TP"} order for ${opts.asset}`, dryRun, yesFlag,
              poolAddress: poolConfig.poolAddress.toBase58() },
          );

          if (signature === "DRY_RUN" || signature === "CANCELLED") return;

          if (Output.isJson()) {
            console.log(JSON.stringify({ action: "cancel-order", asset: opts.asset, side, signature }));
          } else {
            Output.printMessage(`  Order cancelled. Signature: ${Output.formatSignature(signature)}`);
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "cancel order"));
          process.exit(1);
        }
      });

    // ─── perps history ───
    cmd
      .command("history")
      .description("View trade history (from audit log)")
      .option("--asset <symbol>", "Filter by asset")
      .option("--side <side>", "Filter by side")
      .option("--limit <n>", "Max results", "20")
      .action(async (opts) => {
        try {
          const { AuditLog } = await import("../lib/AuditLog.js");
          const limit = parseInt(opts.limit, 10);
          let entries = AuditLog.read(limit * 3); // read extra for filtering

          // Filter to perps actions only
          entries = entries.filter(e =>
            e.action.startsWith("Open") ||
            e.action.startsWith("Close") ||
            e.action.startsWith("Set") ||
            e.action.startsWith("Limit") ||
            e.action.startsWith("Cancel")
          );

          if (opts.asset) {
            entries = entries.filter(e =>
              (e.asset ?? "").toUpperCase() === opts.asset.toUpperCase() ||
              e.action.includes(opts.asset)
            );
          }
          if (opts.side) {
            entries = entries.filter(e =>
              (e.side ?? "").toLowerCase() === opts.side.toLowerCase() ||
              e.action.toLowerCase().includes(opts.side.toLowerCase())
            );
          }

          entries = entries.slice(0, limit);

          if (entries.length === 0) {
            Output.printMessage("No trade history found.");
            if (Output.isJson()) console.log("[]");
            return;
          }

          if (Output.isJson()) {
            console.log(JSON.stringify(entries, null, 2));
          } else {
            Output.print(
              entries.map(e => ({
                Time: Output.formatTimestamp(e.timestamp),
                Action: e.action,
                Asset: e.asset ?? "—",
                Side: e.side ? Output.formatSide(e.side) : "—",
                Amount: e.amountUsd ? Output.formatDollar(e.amountUsd) : "—",
                Signature: Output.formatSignature(e.signature),
              })),
              [
                { key: "Time", header: "Time" },
                { key: "Action", header: "Action" },
                { key: "Asset", header: "Asset" },
                { key: "Side", header: "Side" },
                { key: "Amount", header: "Amount" },
                { key: "Signature", header: "Signature" },
              ],
            );
          }
        } catch (err: any) {
          Output.printError(ErrorHandler.formatError(err, "fetch history"));
          process.exit(1);
        }
      });
  }
}

// ─── Helpers ───

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
  throw new Error("No wallet specified. Use --key <name>, --address <address>, or set an active key.");
}
