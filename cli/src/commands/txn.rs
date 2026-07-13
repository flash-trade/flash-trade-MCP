// ─────────────────────────────────────────────────────────────────────────────
// txn.rs — transaction-building commands. Each builds a request body, POSTs to a
// /transaction-builder/* endpoint, prints the preview the API returns, then hands
// the unsigned (partially-signed) tx to handle_built, which prints it or — with
// --submit — signs and routes it to the correct chain (trading→ER, setup/
// withdrawal→base). Bodies mirror the hosted V2 API DTOs verbatim (incl. the
// `youRecieveUsdUi` misspelling). This file never signs or submits directly.
// ─────────────────────────────────────────────────────────────────────────────

use crate::core::api::ApiClient;
use crate::core::config::Settings;
use crate::core::network::Network;
use crate::core::wallet::WalletManager;
use crate::output::colors::format_price;
use anyhow::{anyhow, Result};
use serde_json::{json, Value};
use solana_sdk::signer::Signer;

use super::{handle_built, resolve_owner};

/// Normalize a user-supplied side to the API's LONG/SHORT enum.
fn norm_side(side: &str) -> Result<&'static str> {
    match side.to_lowercase().as_str() {
        "long" | "l" => Ok("LONG"),
        "short" | "s" => Ok("SHORT"),
        _ => Err(anyhow!("side must be 'long' or 'short' (got '{side}')")),
    }
}

/// String field accessor for API response Values.
fn sv<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("")
}

/// Resolve the owner pubkey from the active/override key WITHOUT erroring when no
/// key exists — used by quote-capable commands (open) to fall back to quote mode.
fn optional_owner(key_override: Option<&str>, settings: &Settings) -> Option<String> {
    WalletManager::resolve(key_override, settings).ok().map(|kp| kp.pubkey().to_string())
}

// ── Account setup (base chain) ───────────────────────────────────────────────

pub async fn setup_status(api: &ApiClient, owner: &str) -> Result<()> {
    let snap = api.owner(owner).await?;
    println!("=== Setup status — {owner} ===");
    match snap.get("basketPubkey").and_then(|b| b.as_str()) {
        Some(pk) if !pk.is_empty() => {
            println!("[x] Step 1  init-basket        basket {pk}");
            println!("[?] Step 2  init-deposit-ledger (not directly reported by the snapshot)");
            println!("[?] Step 3  delegate-basket     (not directly reported by the snapshot)");
            println!("[?] Step 4  deposit-direct       fund collateral, then trade");
            let positions = snap.get("positionMetrics").and_then(|p| p.as_object()).map(|m| m.len()).unwrap_or(0);
            println!("\nBasket exists — setup was started. Open positions: {positions}.");
            println!("If trading fails with account-not-found errors, re-run init-deposit-ledger / delegate-basket, then deposit.");
        }
        _ => {
            println!("[ ] Step 1  init-basket        NOT DONE");
            println!("[ ] Step 2  init-deposit-ledger");
            println!("[ ] Step 3  delegate-basket");
            println!("[ ] Step 4  deposit-direct");
            println!("\nNo basket yet. Start with: flash setup init-basket --submit");
        }
    }
    Ok(())
}

pub async fn init_basket(
    api: &ApiClient,
    net: &Network,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let owner = resolve_owner(None, key_override, settings)?;
    let resp = api.build("init-basket", json!({ "owner": owner })).await?;
    println!("=== Init Basket (step 1/4) — base chain ===\nOwner: {owner}");
    handle_built(net, "init-basket", &resp, submit, key_override, settings)
}

pub async fn init_ledger(
    api: &ApiClient,
    net: &Network,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let owner = resolve_owner(None, key_override, settings)?;
    let resp = api.build("init-deposit-ledger", json!({ "owner": owner })).await?;
    println!("=== Init Deposit Ledger (step 2/4) — base chain ===\nOwner: {owner}");
    handle_built(net, "init-deposit-ledger", &resp, submit, key_override, settings)
}

pub async fn delegate(
    api: &ApiClient,
    net: &Network,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let owner = resolve_owner(None, key_override, settings)?;
    // payer defaults to owner; commitFrequency/validator are protocol-fixed server-side.
    let resp = api
        .build("delegate-basket", json!({ "owner": owner, "payer": owner }))
        .await?;
    println!("=== Delegate Basket (step 3/4) — base chain ===\nOwner: {owner}\nPayer: {owner}");
    handle_built(net, "delegate-basket", &resp, submit, key_override, settings)
}

pub async fn deposit(
    api: &ApiClient,
    net: &Network,
    token: &str,
    amount: &str,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let owner = resolve_owner(None, key_override, settings)?;
    let mint = api.resolve_mint(token).await?;
    let resp = api
        .build("deposit-direct", json!({ "owner": owner, "tokenMint": mint, "amount": amount }))
        .await?;
    println!("=== Deposit {amount} {} (step 4/4) — base chain ===\nOwner: {owner}\nMint:  {mint}", token.to_uppercase());
    println!("This moves REAL funds. Review before signing.");
    handle_built(net, "deposit-direct", &resp, submit, key_override, settings)
}

// ── Trading (Ephemeral Rollup) ───────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
pub async fn open(
    api: &ApiClient,
    net: &Network,
    symbol: &str,
    side: &str,
    collateral_usd: &str,
    leverage: &str,
    collateral_token: &str,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let trade_type = norm_side(side)?;
    let lev: f64 = leverage
        .parse()
        .map_err(|_| anyhow!("leverage must be a number (got '{leverage}')"))?;
    let owner = optional_owner(key_override, settings);

    let mut body = json!({
        "inputTokenSymbol": collateral_token,
        "outputTokenSymbol": symbol,
        "inputAmountUi": collateral_usd,
        "leverage": lev,
        "tradeType": trade_type,
    });
    if let Some(o) = &owner {
        body["owner"] = json!(o);
    }

    let res = api.build("open-position", body).await?;

    println!("=== Open {trade_type} {}/USD ===", symbol.to_uppercase());
    println!("Entry price:        ${}", sv(&res, "newEntryPrice"));
    println!("Effective size:     ${} ({} {})", sv(&res, "youRecieveUsdUi"), sv(&res, "outputAmountUi"), symbol.to_uppercase());
    println!("Collateral:         ${} {}", sv(&res, "youPayUsdUi"), collateral_token.to_uppercase());
    println!("Leverage:           {}x", sv(&res, "newLeverage"));
    println!("Liquidation price:  ${}", sv(&res, "newLiquidationPrice"));
    println!("Entry fee:          ${} ({}%)", sv(&res, "entryFee"), sv(&res, "openPositionFeePercent"));
    println!("Hourly borrow rate: {}%", sv(&res, "marginFeePercentage"));
    println!("Available liquidity:${}", sv(&res, "availableLiquidity"));
    if res.get("oldEntryPrice").and_then(|x| x.as_str()).is_some() {
        println!("Increasing existing — old entry ${}, old leverage {}x", sv(&res, "oldEntryPrice"), sv(&res, "oldLeverage"));
    }
    if res.get("passesMaxPositionSize").and_then(|x| x.as_bool()) == Some(false) {
        println!("WARNING: exceeds max position size (${}).", sv(&res, "maxPositionSizeUsd"));
    }

    match owner {
        None => println!("\n(Quote only — no wallet key available, so no transaction was built. Add a key with `flash keys`, or pass one with --key.)"),
        Some(_) => handle_built(net, "open-position", &res, submit, key_override, settings)?,
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub async fn close(
    api: &ApiClient,
    net: &Network,
    symbol: &str,
    side: &str,
    usd: &str,
    withdraw_token: &str,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let trade_type = norm_side(side)?;
    let owner = resolve_owner(None, key_override, settings)?;
    let res = api
        .build(
            "close-position",
            json!({
                "marketSymbol": symbol,
                "side": trade_type,
                "inputUsdUi": usd,
                "withdrawTokenSymbol": withdraw_token,
                "owner": owner,
            }),
        )
        .await?;

    let full = usd == "0" || sv(&res, "newSize") == "0";
    println!("=== Close {trade_type} {} ({}) ===", symbol.to_uppercase(), if full { "FULL" } else { "partial" });
    println!("Receive:     {} {} (${})", sv(&res, "receiveTokenAmountUi"), sv(&res, "receiveTokenSymbol"), sv(&res, "receiveTokenAmountUsdUi"));
    println!("Mark: ${} | Entry: ${}", sv(&res, "markPrice"), sv(&res, "entryPrice"));
    println!("Settled PnL: ${}", sv(&res, "settledPnl"));
    println!("Fees:        ${}", sv(&res, "fees"));
    println!("Size:        {} -> {} | Collateral: ${} -> ${}", sv(&res, "existingSize"), sv(&res, "newSize"), sv(&res, "existingCollateral"), sv(&res, "newCollateral"));
    handle_built(net, "close-position", &res, submit, key_override, settings)
}

#[allow(clippy::too_many_arguments)]
pub async fn reverse(
    api: &ApiClient,
    net: &Network,
    symbol: &str,
    side: &str,
    leverage: &str,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let trade_type = norm_side(side)?;
    let lev: f64 = leverage
        .parse()
        .map_err(|_| anyhow!("leverage must be a number (got '{leverage}')"))?;
    let owner = resolve_owner(None, key_override, settings)?;
    let res = api
        .build(
            "reverse-position",
            json!({
                "marketSymbol": symbol,
                "side": trade_type,
                "leverage": lev,
                "owner": owner,
            }),
        )
        .await?;

    println!("=== Reverse {trade_type} {} -> {} ===", symbol.to_uppercase(), sv(&res, "newSide"));
    println!("Close proceeds: ${} | Close fees: ${} | Settled PnL: ${}", sv(&res, "closeReceiveUsd"), sv(&res, "closeFees"), sv(&res, "closeSettledPnl"));
    println!("New {}: ${} ({}) @ ${}, {}x", sv(&res, "newSide"), sv(&res, "newSizeUsd"), sv(&res, "newSizeAmountUi"), sv(&res, "newEntryPrice"), sv(&res, "newLeverage"));
    println!("New collateral (post-2% haircut): ${} | Open fee: ${}", sv(&res, "newCollateralUsd"), sv(&res, "openEntryFee"));
    println!("New liquidation: ${}", sv(&res, "newLiquidationPrice"));
    handle_built(net, "reverse-position", &res, submit, key_override, settings)
}

#[allow(clippy::too_many_arguments)]
pub async fn add_collateral(
    api: &ApiClient,
    net: &Network,
    symbol: &str,
    side: &str,
    amount: &str,
    token: &str,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let trade_type = norm_side(side)?;
    let owner = resolve_owner(None, key_override, settings)?;
    let res = api
        .build(
            "add-collateral",
            json!({
                "marketSymbol": symbol,
                "side": trade_type,
                "depositAmountUi": amount,
                "depositTokenSymbol": token,
                "owner": owner,
            }),
        )
        .await?;

    println!("=== Add Collateral — {trade_type} {} ===", symbol.to_uppercase());
    println!("Collateral:  ${} -> ${}", sv(&res, "existingCollateralUsd"), sv(&res, "newCollateralUsd"));
    println!("Leverage:    {}x -> {}x", sv(&res, "existingLeverage"), sv(&res, "newLeverage"));
    println!("Liquidation: ${} -> ${}", sv(&res, "existingLiquidationPrice"), sv(&res, "newLiquidationPrice"));
    println!("Deposit value: ${} (max addable ${})", sv(&res, "depositUsdValue"), sv(&res, "maxAddableUsd"));
    handle_built(net, "add-collateral", &res, submit, key_override, settings)
}

#[allow(clippy::too_many_arguments)]
pub async fn remove_collateral(
    api: &ApiClient,
    net: &Network,
    symbol: &str,
    side: &str,
    usd: &str,
    token: &str,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let trade_type = norm_side(side)?;
    let owner = resolve_owner(None, key_override, settings)?;
    let res = api
        .build(
            "remove-collateral",
            json!({
                "marketSymbol": symbol,
                "side": trade_type,
                "withdrawAmountUsdUi": usd,
                "withdrawTokenSymbol": token,
                "owner": owner,
            }),
        )
        .await?;

    println!("=== Remove Collateral — {trade_type} {} ===", symbol.to_uppercase());
    println!("Collateral:  ${} -> ${}", sv(&res, "existingCollateralUsd"), sv(&res, "newCollateralUsd"));
    println!("Leverage:    {}x -> {}x", sv(&res, "existingLeverage"), sv(&res, "newLeverage"));
    println!("Liquidation: ${} -> ${}", sv(&res, "existingLiquidationPrice"), sv(&res, "newLiquidationPrice"));
    println!("Receive:     {} (${}) | max withdrawable ${}", sv(&res, "receiveAmountUi"), sv(&res, "receiveAmountUsdUi"), sv(&res, "maxWithdrawableUsd"));
    handle_built(net, "remove-collateral", &res, submit, key_override, settings)
}

#[allow(clippy::too_many_arguments)]
pub async fn tp_sl(
    api: &ApiClient,
    net: &Network,
    symbol: &str,
    side: &str,
    size: &str,
    tp: Option<&str>,
    sl: Option<&str>,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    if tp.is_none() && sl.is_none() {
        return Err(anyhow!("provide at least one of --tp or --sl"));
    }
    let trade_type = norm_side(side)?;
    let owner = resolve_owner(None, key_override, settings)?;
    let mut body = json!({
        "marketSymbol": symbol,
        "side": trade_type,
        "sizeAmountUi": size,
        "owner": owner,
    });
    if let Some(v) = tp {
        body["takeProfitUi"] = json!(v);
    }
    if let Some(v) = sl {
        body["stopLossUi"] = json!(v);
    }
    let res = api.build("place-tp-sl", body).await?;
    let parts: Vec<String> = [tp.map(|v| format!("TP ${v}")), sl.map(|v| format!("SL ${v}"))]
        .into_iter()
        .flatten()
        .collect();
    println!("=== Place Bracket ({}) — {trade_type} {} ===", parts.join(" + "), symbol.to_uppercase());
    handle_built(net, "place-tp-sl", &res, submit, key_override, settings)
}

// ── Trigger-order management (ER) ────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
pub async fn trigger_place(
    api: &ApiClient,
    net: &Network,
    symbol: &str,
    side: &str,
    price: &str,
    size: &str,
    stop_loss: bool,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let trade_type = norm_side(side)?;
    let owner = resolve_owner(None, key_override, settings)?;
    let res = api
        .build(
            "place-trigger-order",
            json!({
                "marketSymbol": symbol,
                "side": trade_type,
                "triggerPriceUi": price,
                "sizeAmountUi": size,
                "isStopLoss": stop_loss,
                "owner": owner,
            }),
        )
        .await?;
    let kind = if stop_loss { "Stop-Loss" } else { "Take-Profit" };
    println!("=== Place {kind} — {trade_type} {} @ {} ===", symbol.to_uppercase(), format_price(price.parse().unwrap_or(0.0)));
    handle_built(net, "place-trigger-order", &res, submit, key_override, settings)
}

#[allow(clippy::too_many_arguments)]
pub async fn trigger_edit(
    api: &ApiClient,
    net: &Network,
    symbol: &str,
    side: &str,
    order_id: u8,
    price: &str,
    size: &str,
    stop_loss: bool,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let trade_type = norm_side(side)?;
    let owner = resolve_owner(None, key_override, settings)?;
    // Both price and size are REQUIRED for edit-trigger (no keep-existing).
    let res = api
        .build(
            "edit-trigger-order",
            json!({
                "marketSymbol": symbol,
                "side": trade_type,
                "orderId": order_id,
                "triggerPriceUi": price,
                "sizeAmountUi": size,
                "isStopLoss": stop_loss,
                "owner": owner,
            }),
        )
        .await?;
    println!("=== Edit Trigger #{order_id} — {trade_type} {} ===", symbol.to_uppercase());
    handle_built(net, "edit-trigger-order", &res, submit, key_override, settings)
}

#[allow(clippy::too_many_arguments)]
pub async fn trigger_cancel(
    api: &ApiClient,
    net: &Network,
    symbol: &str,
    side: &str,
    order_id: u8,
    stop_loss: bool,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let trade_type = norm_side(side)?;
    let owner = resolve_owner(None, key_override, settings)?;
    let res = api
        .build(
            "cancel-trigger-order",
            json!({
                "marketSymbol": symbol,
                "side": trade_type,
                "orderId": order_id,
                "isStopLoss": stop_loss,
                "owner": owner,
            }),
        )
        .await?;
    let label = if order_id == 255 { "ALL triggers".to_string() } else { format!("trigger #{order_id}") };
    println!("=== Cancel {label} — {trade_type} {} ===", symbol.to_uppercase());
    handle_built(net, "cancel-trigger-order", &res, submit, key_override, settings)
}

pub async fn trigger_cancel_all(
    api: &ApiClient,
    net: &Network,
    symbol: &str,
    side: &str,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let trade_type = norm_side(side)?;
    let owner = resolve_owner(None, key_override, settings)?;
    let res = api
        .build(
            "cancel-all-trigger-orders",
            json!({
                "marketSymbol": symbol,
                "side": trade_type,
                "owner": owner,
            }),
        )
        .await?;
    println!("=== Cancel All Triggers — {trade_type} {} ===", symbol.to_uppercase());
    handle_built(net, "cancel-all-trigger-orders", &res, submit, key_override, settings)
}

// ── Limit-order management (ER) ──────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
pub async fn limit_edit(
    api: &ApiClient,
    net: &Network,
    symbol: &str,
    side: &str,
    order_id: u8,
    price: Option<&str>,
    size: Option<&str>,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let trade_type = norm_side(side)?;
    let owner = resolve_owner(None, key_override, settings)?;
    // Omitted fields mean KEEP EXISTING (opposite of edit-trigger).
    let mut body = json!({
        "marketSymbol": symbol,
        "side": trade_type,
        "orderId": order_id,
        "owner": owner,
    });
    if let Some(v) = price {
        body["limitPriceUi"] = json!(v);
    }
    if let Some(v) = size {
        body["sizeAmountUi"] = json!(v);
    }
    let res = api.build("edit-limit-order", body).await?;
    println!("=== Edit Limit Order #{order_id} — {trade_type} {} ===", symbol.to_uppercase());
    handle_built(net, "edit-limit-order", &res, submit, key_override, settings)
}

#[allow(clippy::too_many_arguments)]
pub async fn limit_cancel(
    api: &ApiClient,
    net: &Network,
    symbol: &str,
    side: &str,
    order_id: u8,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let trade_type = norm_side(side)?;
    let owner = resolve_owner(None, key_override, settings)?;
    let res = api
        .build(
            "cancel-limit-order",
            json!({
                "marketSymbol": symbol,
                "side": trade_type,
                "orderId": order_id,
                "owner": owner,
            }),
        )
        .await?;
    println!("=== Cancel Limit Order #{order_id} — {trade_type} {} ===", symbol.to_uppercase());
    handle_built(net, "cancel-limit-order", &res, submit, key_override, settings)
}

// ── Withdrawal (base chain, two steps) ───────────────────────────────────────

pub async fn withdraw_request(
    api: &ApiClient,
    net: &Network,
    token: &str,
    amount: &str,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let owner = resolve_owner(None, key_override, settings)?;
    let mint = api.resolve_mint(token).await?;
    let res = api
        .build("request-withdrawal", json!({ "owner": owner, "tokenMint": mint, "amount": amount }))
        .await?;
    println!("=== Request Withdrawal {amount} {} (step 1/2) — base chain ===\nOwner: {owner}\nMint:  {mint}", token.to_uppercase());
    handle_built(net, "request-withdrawal", &res, submit, key_override, settings)?;
    println!("\nNext: after ~30-90s (settlement crossing the rollup), run: flash withdraw execute {token} --submit");
    Ok(())
}

pub async fn withdraw_execute(
    api: &ApiClient,
    net: &Network,
    token: &str,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let owner = resolve_owner(None, key_override, settings)?;
    let mint = api.resolve_mint(token).await?;
    let res = api
        .build("execute-withdrawal", json!({ "owner": owner, "tokenMint": mint }))
        .await?;
    println!("=== Execute Withdrawal {} (step 2/2) — base chain ===\nOwner: {owner}\nMint:  {mint}", token.to_uppercase());
    println!("If this fails with 0xbc4 / AccountNotInitialized(settlement_receipt), settlement has not crossed yet — wait ~30-90s and retry (safe to re-run).");
    handle_built(net, "execute-withdrawal", &res, submit, key_override, settings)
}
