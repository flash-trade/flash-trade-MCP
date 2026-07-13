// ─────────────────────────────────────────────────────────────────────────────
// flash — a V2-only CLI for Flash Trade (MagicBlock Ephemeral Rollup perps).
// Talks to the hosted V2 REST API for reads + unsigned transaction building,
// signs locally, and routes each transaction to the correct chain (trading→ER,
// setup/withdrawal→base). No SDK, no on-chain instruction building, no V1.
// ─────────────────────────────────────────────────────────────────────────────

use anyhow::Result;
use clap::Parser;

use flash_cli::cli::{self, App, Command};
use flash_cli::commands;
use flash_cli::core::api::ApiClient;
use flash_cli::core::config::{Config, Settings};
use flash_cli::core::network::{self, Network};
use flash_cli::core::wallet::WalletManager;

#[tokio::main]
async fn main() -> Result<()> {
    let app = App::parse();

    let settings = Config::load().unwrap_or_else(|e| {
        eprintln!(
            "WARNING: failed to load settings ({e}); using defaults. Run `flash config list` to inspect."
        );
        Settings::default()
    });

    // Two-chain network: API base + ER RPC + base RPC (env overrides, verified
    // defaults). A configured settings.rpc_url stands in for the base RPC when no
    // SOLANA_RPC_URL env override is set.
    let mut net = Network::resolve()?;
    if std::env::var("SOLANA_RPC_URL").is_err() {
        if let Some(url) = &settings.rpc_url {
            net.base_rpc = network::require_https("rpc_url (settings)", url.clone())?;
        }
    }

    let api = ApiClient::new(&net);
    let key = app.key.as_deref();

    match app.command {
        Command::Health => commands::reads::health(&api).await,
        Command::Tokens { symbol } => commands::reads::tokens(&api, symbol.as_deref()).await,
        Command::Price { symbol, watch } => commands::reads::price(&api, &symbol, watch).await,
        Command::Prices => commands::reads::prices(&api).await,
        Command::Markets => commands::reads::markets(&api).await,
        Command::Account { owner } => {
            let owner = commands::resolve_owner(owner.as_deref(), key, &settings)?;
            commands::reads::account(&api, &net, &owner).await
        }
        Command::Setup { command } => handle_setup(command, &api, &net, key, &settings).await,
        Command::Perps { command } => handle_perps(command, &api, &net, key, &settings).await,
        Command::Withdraw { command } => handle_withdraw(command, &api, &net, key, &settings).await,
        Command::Keys { command } => handle_keys(command).await,
        Command::Config { command } => handle_config(command).await,
    }
}

async fn handle_setup(
    command: cli::SetupCommand,
    api: &ApiClient,
    net: &Network,
    key: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    use cli::SetupCommand::*;
    match command {
        Status { owner } => {
            let owner = commands::resolve_owner(owner.as_deref(), key, settings)?;
            commands::txn::setup_status(api, &owner).await
        }
        InitBasket { submit } => commands::txn::init_basket(api, net, submit, key, settings).await,
        InitLedger { submit } => commands::txn::init_ledger(api, net, submit, key, settings).await,
        Delegate { submit } => commands::txn::delegate(api, net, submit, key, settings).await,
        Deposit { token, amount, submit } => {
            commands::txn::deposit(api, net, &token, &amount, submit, key, settings).await
        }
    }
}

async fn handle_perps(
    command: cli::PerpsCommand,
    api: &ApiClient,
    net: &Network,
    key: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    use cli::PerpsCommand::*;
    match command {
        Open { symbol, side, collateral_usd, leverage, collateral_token, submit } => {
            commands::txn::open(api, net, &symbol, &side, &collateral_usd, &leverage, &collateral_token, submit, key, settings).await
        }
        Close { symbol, side, usd, withdraw_token, submit } => {
            commands::txn::close(api, net, &symbol, &side, &usd, &withdraw_token, submit, key, settings).await
        }
        Reverse { symbol, side, leverage, submit } => {
            commands::txn::reverse(api, net, &symbol, &side, &leverage, submit, key, settings).await
        }
        AddCollateral { symbol, side, amount, token, submit } => {
            commands::txn::add_collateral(api, net, &symbol, &side, &amount, &token, submit, key, settings).await
        }
        RemoveCollateral { symbol, side, usd, token, submit } => {
            commands::txn::remove_collateral(api, net, &symbol, &side, &usd, &token, submit, key, settings).await
        }
        TpSl { symbol, side, size, tp, sl, submit } => {
            commands::txn::tp_sl(api, net, &symbol, &side, &size, tp.as_deref(), sl.as_deref(), submit, key, settings).await
        }
        Trigger { command } => handle_trigger(command, api, net, key, settings).await,
        Limit { command } => handle_limit(command, api, net, key, settings).await,
    }
}

async fn handle_trigger(
    command: cli::TriggerCommand,
    api: &ApiClient,
    net: &Network,
    key: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    use cli::TriggerCommand::*;
    match command {
        Place { symbol, side, price, size, stop_loss, submit } => {
            commands::txn::trigger_place(api, net, &symbol, &side, &price, &size, stop_loss, submit, key, settings).await
        }
        Edit { symbol, side, order_id, price, size, stop_loss, submit } => {
            commands::txn::trigger_edit(api, net, &symbol, &side, order_id, &price, &size, stop_loss, submit, key, settings).await
        }
        Cancel { symbol, side, order_id, stop_loss, submit } => {
            commands::txn::trigger_cancel(api, net, &symbol, &side, order_id, stop_loss, submit, key, settings).await
        }
        CancelAll { symbol, side, submit } => {
            commands::txn::trigger_cancel_all(api, net, &symbol, &side, submit, key, settings).await
        }
    }
}

async fn handle_limit(
    command: cli::LimitCommand,
    api: &ApiClient,
    net: &Network,
    key: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    use cli::LimitCommand::*;
    match command {
        Edit { symbol, side, order_id, price, size, submit } => {
            commands::txn::limit_edit(api, net, &symbol, &side, order_id, price.as_deref(), size.as_deref(), submit, key, settings).await
        }
        Cancel { symbol, side, order_id, submit } => {
            commands::txn::limit_cancel(api, net, &symbol, &side, order_id, submit, key, settings).await
        }
    }
}

async fn handle_withdraw(
    command: cli::WithdrawCommand,
    api: &ApiClient,
    net: &Network,
    key: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    use cli::WithdrawCommand::*;
    match command {
        Request { token, amount, submit } => {
            commands::txn::withdraw_request(api, net, &token, &amount, submit, key, settings).await
        }
        Execute { token, submit } => {
            commands::txn::withdraw_execute(api, net, &token, submit, key, settings).await
        }
    }
}

async fn handle_keys(command: cli::KeysCommand) -> Result<()> {
    use cli::KeysCommand::*;
    match command {
        List => {
            let names = WalletManager::list()?;
            if names.is_empty() {
                println!("No keypairs found. Run `flash keys generate <name>` to create one.");
                return Ok(());
            }
            let active = Config::load().map(|s| s.active_key).unwrap_or_default();
            for name in &names {
                let pubkey = WalletManager::pubkey_for(name)
                    .map(|pk| pk.to_string())
                    .unwrap_or_else(|_| "(error reading)".to_string());
                let marker = if *name == active { "*" } else { " " };
                println!("{marker} {name:<16} {pubkey}");
            }
            println!("\n(* = active key. Set with `flash keys use <name>`.)");
        }
        Generate { name } => {
            let pubkey = WalletManager::generate(&name)?;
            println!("Generated keypair '{name}': {pubkey}");
            println!(
                "WARNING: keys are stored UNENCRYPTED under {}. Fund only what you can afford to lose.",
                Config::keys_dir().display()
            );
        }
        Add { name, file } => {
            match file {
                Some(path) => WalletManager::import_file(&name, std::path::Path::new(&path))?,
                None => WalletManager::import_solana_default(&name)?,
            }
            let pubkey = WalletManager::pubkey_for(&name)?;
            println!("Imported keypair '{name}': {pubkey}");
        }
        Delete { name } => {
            WalletManager::delete(&name)?;
            println!("Deleted keypair '{name}'");
        }
        Use { name } => {
            if !WalletManager::exists(&name) {
                anyhow::bail!("Keypair '{name}' not found. Run `flash keys list` to see available keys.");
            }
            Config::set("active_key", &name)?;
            println!("Active keypair set to '{name}'");
        }
        Show { name } => {
            let pubkey = WalletManager::pubkey_for(&name)?;
            println!("{pubkey}");
        }
    }
    Ok(())
}

async fn handle_config(command: cli::ConfigCommand) -> Result<()> {
    use cli::ConfigCommand::*;
    use flash_cli::core::config::redact_url;
    match command {
        List => {
            let settings = Config::load()?;
            println!("=== settings ===");
            println!("active_key            {}", settings.active_key);
            println!("cluster               {}", settings.cluster);
            println!(
                "rpc_url               {}",
                settings.rpc_url.as_deref().map(redact_url).unwrap_or_else(|| "(default)".to_string())
            );

            let net = Network::resolve()?;
            println!("\n=== network (env: FLASH_API_URL / ER_RPC_URL / SOLANA_RPC_URL) ===");
            println!("api_base   {}", redact_url(&net.api_base));
            println!("er_rpc     {}   (trading)", redact_url(&net.er_rpc));
            println!("base_rpc   {}   (setup + withdrawal)", redact_url(&net.base_rpc));
        }
        Set { key, value } => {
            Config::set(&key, &value)?;
            let display = match key.as_str() {
                "rpc_url" => redact_url(&value),
                _ => value,
            };
            println!("Set {key} = {display}");
        }
        Reset => {
            Config::reset()?;
            println!("Settings reset to defaults");
        }
    }
    Ok(())
}
