use anyhow::Result;

use crate::core::config::Settings;
use crate::core::pool_config::PoolConfigManager;
use crate::output::formatter::Formatter;

pub async fn list_markets(
    pool_filter: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    let configs = PoolConfigManager::load(&settings.cluster)?;
    let mut markets = PoolConfigManager::list_markets(&configs);

    if let Some(pool_name) = pool_filter {
        markets.retain(|m| m.pool_name.eq_ignore_ascii_case(pool_name));
        if markets.is_empty() {
            anyhow::bail!("No markets found in pool '{pool_name}'");
        }
    }

    markets.sort_by(|a, b| a.symbol.cmp(&b.symbol).then(a.pool_name.cmp(&b.pool_name)));
    println!("{}", formatter.markets(&markets));
    Ok(())
}

pub async fn show_market(symbol: &str, settings: &Settings, formatter: &Formatter) -> Result<()> {
    let configs = PoolConfigManager::load(&settings.cluster)?;
    let markets = PoolConfigManager::list_markets(&configs);
    let matching: Vec<_> = markets
        .into_iter()
        .filter(|m| m.symbol.eq_ignore_ascii_case(symbol))
        .collect();

    if matching.is_empty() {
        anyhow::bail!(
            "Market '{symbol}' not found. Run `flash perps markets` to see available markets."
        );
    }

    println!("{}", formatter.markets(&matching));
    Ok(())
}
