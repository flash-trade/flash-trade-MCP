use anyhow::Result;

use crate::core::config::Settings;
use crate::core::pool_config::PoolConfigManager;
use crate::output::formatter::Formatter;

pub struct PoolSummary {
    pub name: String,
    pub address: String,
    pub num_custodies: usize,
    pub num_markets: usize,
    pub lp_symbol: String,
    pub deprecated: bool,
}

pub async fn list_pools(settings: &Settings, formatter: &Formatter) -> Result<()> {
    let configs = PoolConfigManager::load(&settings.cluster)?;

    let summaries: Vec<PoolSummary> = configs
        .iter()
        .map(|p| PoolSummary {
            name: p.pool_name.clone(),
            address: p.pool_address.to_string(),
            num_custodies: p.custodies.len(),
            num_markets: p.markets.len(),
            lp_symbol: p.staked_lp_token_symbol.clone(),
            deprecated: p.is_deprecated,
        })
        .collect();

    println!("{}", formatter.pools(&summaries));
    Ok(())
}

pub async fn show_pool(name: &str, settings: &Settings, formatter: &Formatter) -> Result<()> {
    let configs = PoolConfigManager::load(&settings.cluster)?;
    let pool = PoolConfigManager::find_pool(&configs, name)?;

    let summary = PoolSummary {
        name: pool.pool_name.clone(),
        address: pool.pool_address.to_string(),
        num_custodies: pool.custodies.len(),
        num_markets: pool.markets.len(),
        lp_symbol: pool.staked_lp_token_symbol.clone(),
        deprecated: pool.is_deprecated,
    };

    println!("{}", formatter.pool_detail(&summary, pool));
    Ok(())
}
