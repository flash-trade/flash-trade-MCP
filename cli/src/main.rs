use anyhow::Result;
use clap::Parser;

mod cli;
mod commands;
mod core;
mod enrichment;
mod error;
mod output;

use cli::{App, Command};
use core::config::{Config, Settings};
use core::wallet::WalletManager;
use output::formatter::Formatter;

#[tokio::main]
async fn main() -> Result<()> {
    let app = App::parse();
    let settings = Config::load().unwrap_or_default();

    let formatter = Formatter::new(app.format);

    let effective_settings = if let Some(cluster) = &app.cluster {
        let cluster_str = match cluster {
            cli::Cluster::Mainnet => "mainnet-beta",
            cli::Cluster::Devnet => "devnet",
        };
        let mut s = settings.clone();
        s.cluster = cluster_str.to_string();
        s
    } else {
        settings
    };

    run_command(
        app.command,
        &effective_settings,
        &formatter,
        app.key.as_deref(),
    )
    .await
}

async fn run_command(
    command: Command,
    settings: &Settings,
    formatter: &Formatter,
    key_override: Option<&str>,
) -> Result<()> {
    match command {
        Command::Config { command } => handle_config(command, formatter).await,
        Command::Keys { command } => handle_keys(command, formatter).await,
        Command::Price { symbol, watch } => handle_price(&symbol, watch, settings, formatter).await,
        Command::Version => {
            println!("flash-cli v{}", env!("CARGO_PKG_VERSION"));
            println!("flash-sdk v0.1.0");
            println!("solana-sdk v2.2");
            println!("anchor-lang v0.32.1");
            Ok(())
        }
        Command::Perps { command } => {
            handle_perps(command, key_override, settings, formatter).await
        }
        Command::Orders { command } => {
            handle_orders(command, key_override, settings, formatter).await
        }
        Command::Earn { command } => handle_earn(command, key_override, settings, formatter).await,
    }
}

async fn handle_perps(
    command: cli::PerpsCommand,
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    match command {
        cli::PerpsCommand::Positions { address } => {
            commands::positions::list_positions(
                address.as_deref(),
                key_override,
                settings,
                formatter,
            )
            .await
        }
        cli::PerpsCommand::Position { pubkey } => {
            commands::positions::show_position(&pubkey, settings, formatter).await
        }
        cli::PerpsCommand::Markets { pool } => {
            commands::markets::list_markets(pool.as_deref(), settings, formatter).await
        }
        cli::PerpsCommand::Market { symbol } => {
            commands::markets::show_market(&symbol, settings, formatter).await
        }
        cli::PerpsCommand::Portfolio => {
            commands::portfolio::show_portfolio(key_override, settings, formatter).await
        }
        cli::PerpsCommand::Open {
            symbol,
            side,
            collateral_usd,
            leverage,
            collateral_token,
            slippage,
        } => {
            commands::open_position::execute(
                &symbol,
                &side,
                collateral_usd,
                leverage,
                &collateral_token,
                slippage,
                key_override,
                settings,
                formatter,
            )
            .await
        }
        cli::PerpsCommand::Close {
            position,
            percent,
            slippage,
        } => {
            commands::close_position::execute(
                &position,
                percent,
                slippage,
                key_override,
                settings,
                formatter,
            )
            .await
        }
        cli::PerpsCommand::Increase {
            position,
            usd_amount,
            slippage,
        } => {
            commands::increase_size::execute(
                &position,
                usd_amount,
                slippage,
                key_override,
                settings,
                formatter,
            )
            .await
        }
        cli::PerpsCommand::Decrease {
            position,
            usd_amount,
            slippage,
        } => {
            commands::decrease_size::execute(
                &position,
                usd_amount,
                slippage,
                key_override,
                settings,
                formatter,
            )
            .await
        }
        cli::PerpsCommand::AddCollateral { position, amount } => {
            commands::add_collateral::execute(&position, amount, key_override, settings, formatter)
                .await
        }
        cli::PerpsCommand::RemoveCollateral { position, amount } => {
            commands::remove_collateral::execute(
                &position,
                amount,
                key_override,
                settings,
                formatter,
            )
            .await
        }
    }
}

async fn handle_orders(
    command: cli::OrdersCommand,
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    match command {
        cli::OrdersCommand::List { address } => {
            commands::orders_view::list_orders(
                address.as_deref(),
                key_override,
                settings,
                formatter,
            )
            .await
        }
        cli::OrdersCommand::Limit {
            symbol,
            side,
            size_usd,
            price,
            leverage,
            collateral_token,
        } => {
            commands::place_limit_order::execute(
                &symbol,
                &side,
                size_usd,
                price,
                leverage,
                &collateral_token,
                key_override,
                settings,
                formatter,
            )
            .await
        }
        cli::OrdersCommand::EditLimit { order, price, size } => {
            commands::edit_limit_order::execute(
                &order,
                price,
                size,
                key_override,
                settings,
                formatter,
            )
            .await
        }
        cli::OrdersCommand::Trigger {
            position,
            r#type,
            price,
            quantity,
        } => {
            commands::place_trigger_order::execute(
                &position,
                &r#type,
                price,
                quantity,
                key_override,
                settings,
                formatter,
            )
            .await
        }
        cli::OrdersCommand::EditTrigger {
            order,
            price,
            quantity,
        } => {
            commands::edit_trigger_order::execute(
                &order,
                price,
                quantity,
                key_override,
                settings,
                formatter,
            )
            .await
        }
        cli::OrdersCommand::Cancel { order } => {
            commands::cancel_trigger_order::cancel_single(&order, key_override, settings, formatter)
                .await
        }
        cli::OrdersCommand::CancelAll { symbol } => {
            commands::cancel_trigger_order::cancel_all(&symbol, key_override, settings, formatter)
                .await
        }
    }
}

async fn handle_earn(
    command: cli::EarnCommand,
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    match command {
        cli::EarnCommand::Pools => commands::pools::list_pools(settings, formatter).await,
        cli::EarnCommand::Pool { name } => {
            commands::pools::show_pool(&name, settings, formatter).await
        }
        cli::EarnCommand::AddLiquidity {
            pool,
            token,
            amount,
        } => {
            commands::add_liquidity::execute(
                &pool,
                &token,
                amount,
                key_override,
                settings,
                formatter,
            )
            .await
        }
        cli::EarnCommand::RemoveLiquidity {
            pool,
            token,
            amount,
        } => {
            commands::remove_liquidity::execute(
                &pool,
                &token,
                amount,
                key_override,
                settings,
                formatter,
            )
            .await
        }
        cli::EarnCommand::Stake { pool, amount } => {
            commands::stake::execute(&pool, amount, key_override, settings, formatter).await
        }
        cli::EarnCommand::Unstake {
            pool,
            amount,
            instant,
        } => {
            commands::unstake::execute(&pool, amount, instant, key_override, settings, formatter)
                .await
        }
        cli::EarnCommand::Claim { pool } => {
            commands::collect_fees::execute(&pool, key_override, settings, formatter).await
        }
        cli::EarnCommand::Stakes { address } => {
            // Stakes view — uses positions-like RPC query for stake accounts
            println!("Stakes view not yet implemented (requires FLP stake account parsing)");
            let _ = address;
            Ok(())
        }
    }
}

async fn handle_config(command: cli::ConfigCommand, formatter: &Formatter) -> Result<()> {
    match command {
        cli::ConfigCommand::List => {
            let settings = Config::load()?;
            let pairs = vec![
                ("active_key".to_string(), settings.active_key),
                ("output_format".to_string(), settings.output_format),
                ("cluster".to_string(), settings.cluster),
                (
                    "rpc_url".to_string(),
                    settings.rpc_url.unwrap_or_else(|| "(default)".to_string()),
                ),
                (
                    "default_slippage_bps".to_string(),
                    settings.default_slippage_bps.to_string(),
                ),
                ("commitment".to_string(), settings.commitment),
                (
                    "priority_fee".to_string(),
                    settings.priority_fee.to_string(),
                ),
            ];
            println!("{}", formatter.settings(&pairs));
        }
        cli::ConfigCommand::Set { key, value } => {
            Config::set(&key, &value)?;
            println!("{}", formatter.success(&format!("Set {key} = {value}")));
        }
        cli::ConfigCommand::Reset => {
            Config::reset()?;
            println!("{}", formatter.success("Settings reset to defaults"));
        }
    }
    Ok(())
}

async fn handle_keys(command: cli::KeysCommand, formatter: &Formatter) -> Result<()> {
    match command {
        cli::KeysCommand::List => {
            let names = WalletManager::list()?;
            if names.is_empty() {
                println!(
                    "{}",
                    formatter.success(
                        "No keypairs found. Run `flash keys generate <name>` to create one."
                    )
                );
                return Ok(());
            }
            let mut pairs = Vec::new();
            for name in &names {
                let pubkey = WalletManager::pubkey_for(name)
                    .map(|pk| pk.to_string())
                    .unwrap_or_else(|_| "(error reading)".to_string());
                pairs.push((name.clone(), pubkey));
            }
            println!("{}", formatter.keys(&pairs));
        }
        cli::KeysCommand::Add {
            name,
            file,
            private_key,
        } => {
            if let Some(path) = file {
                WalletManager::import_file(&name, std::path::Path::new(&path))?;
            } else if private_key.is_some() {
                // Read key from stdin — never from CLI arg (shell history exposure)
                eprint!("Enter base58-encoded private key: ");
                std::io::Write::flush(&mut std::io::stderr())?;
                let mut key_input = String::new();
                std::io::stdin().read_line(&mut key_input)?;
                let key = key_input.trim();
                if key.is_empty() {
                    anyhow::bail!("No private key provided");
                }
                WalletManager::import_private_key(&name, key)?;
            } else {
                WalletManager::import_solana_default(&name)?;
            }
            let pubkey = WalletManager::pubkey_for(&name)?;
            println!(
                "{}",
                formatter.success(&format!("Imported keypair '{name}': {pubkey}"))
            );
        }
        cli::KeysCommand::Delete { name } => {
            WalletManager::delete(&name)?;
            println!(
                "{}",
                formatter.success(&format!("Deleted keypair '{name}'"))
            );
        }
        cli::KeysCommand::Use { name } => {
            if !WalletManager::exists(&name) {
                anyhow::bail!(
                    "Keypair '{name}' not found. Run `flash keys list` to see available keys."
                );
            }
            Config::set("active_key", &name)?;
            println!(
                "{}",
                formatter.success(&format!("Active keypair set to '{name}'"))
            );
        }
        cli::KeysCommand::Show { name } => {
            let pubkey = WalletManager::pubkey_for(&name)?;
            println!("{}", formatter.success(&format!("{pubkey}")));
        }
        cli::KeysCommand::Generate { name } => {
            let pubkey = WalletManager::generate(&name)?;
            println!(
                "{}",
                formatter.success(&format!("Generated keypair '{name}': {pubkey}"))
            );
        }
    }
    Ok(())
}

async fn handle_price(
    symbol: &str,
    watch: bool,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    let configs = core::pool_config::PoolConfigManager::load(&settings.cluster)?;
    let token = core::pool_config::PoolConfigManager::find_token(&configs, symbol)?;

    if settings.cluster == "devnet" {
        eprintln!("Warning: Pyth prices are mainnet-only. Devnet prices may be stale or zero.");
    }

    let price_client = core::prices::PriceClient::new();

    loop {
        let price_data = price_client.get_price(&token.pyth_price_id).await?;

        if price_data.is_stale() {
            eprintln!(
                "Warning: Price for {symbol} is stale ({}s old)",
                price_data.staleness_seconds()
            );
        }

        println!(
            "{}",
            formatter.price(
                symbol,
                price_data.price,
                price_data.confidence,
                price_data.staleness_seconds()
            )
        );

        if !watch {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }

    Ok(())
}
