use anyhow::{Context, Result};
use flash_sdk::pool_config::{CustodyConfig, MarketConfig, Side, Token};
use flash_sdk::PoolConfig;
use solana_sdk::pubkey::Pubkey;

pub struct MarketMatch {
    pub pool_config: PoolConfig,
    pub market_config: MarketConfig,
    pub target_custody: CustodyConfig,
    pub collateral_custody: CustodyConfig,
    pub target_token: Token,
    pub collateral_token: Token,
}

#[derive(Clone)]
pub struct MarketSummary {
    pub symbol: String,
    pub pool_name: String,
    pub side: Side,
    pub collateral_symbol: String,
    pub max_leverage: u64,
    pub market_pubkey: Pubkey,
}

pub struct PoolConfigManager;

impl PoolConfigManager {
    pub fn load(cluster: &str) -> Result<Vec<PoolConfig>> {
        match cluster {
            "devnet" => PoolConfig::devnet()
                .map_err(|e| anyhow::anyhow!("Failed to load devnet pool configs: {e}")),
            _ => PoolConfig::mainnet()
                .map_err(|e| anyhow::anyhow!("Failed to load mainnet pool configs: {e}")),
        }
    }

    pub fn find_pool<'a>(configs: &'a [PoolConfig], name: &str) -> Result<&'a PoolConfig> {
        configs
            .iter()
            .find(|p| p.pool_name.eq_ignore_ascii_case(name))
            .with_context(|| {
                format!(
                    "Pool '{name}' not found. Available pools: {}",
                    configs
                        .iter()
                        .map(|p| p.pool_name.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            })
    }

    pub fn find_market(configs: &[PoolConfig], symbol: &str, side: Side) -> Result<MarketMatch> {
        // Try all available collateral options by scanning markets directly
        for pool in configs {
            let target_custody = match pool.get_custody_by_symbol(symbol) {
                Some(c) => c,
                None => continue,
            };
            for market in &pool.markets {
                if market.target_custody == target_custody.custody_account && market.side == side {
                    let collateral_sym = pool
                        .custodies
                        .iter()
                        .find(|c| c.custody_account == market.collateral_custody)
                        .map(|c| c.symbol.as_str())
                        .unwrap_or("???");
                    if let Ok(m) = Self::find_market_explicit(configs, symbol, collateral_sym, side)
                    {
                        return Ok(m);
                    }
                }
            }
        }
        anyhow::bail!(
            "Market '{symbol}' ({:?}) not found. Run `flash perps markets` to see available markets.",
            side
        )
    }

    pub fn find_market_explicit(
        configs: &[PoolConfig],
        target_symbol: &str,
        collateral_symbol: &str,
        side: Side,
    ) -> Result<MarketMatch> {
        for pool in configs {
            let target_custody = match pool.get_custody_by_symbol(target_symbol) {
                Some(c) => c,
                None => continue,
            };
            let collateral_custody = match pool.get_custody_by_symbol(collateral_symbol) {
                Some(c) => c,
                None => continue,
            };
            let market = match pool.get_market(
                &target_custody.custody_account,
                &collateral_custody.custody_account,
                side,
            ) {
                Some(m) => m,
                None => continue,
            };
            let target_token = pool.get_token_by_symbol(target_symbol).with_context(|| {
                format!(
                    "Token '{target_symbol}' not found in pool {}",
                    pool.pool_name
                )
            })?;
            let collateral_token =
                pool.get_token_by_symbol(collateral_symbol)
                    .with_context(|| {
                        format!(
                            "Token '{collateral_symbol}' not found in pool {}",
                            pool.pool_name
                        )
                    })?;

            return Ok(MarketMatch {
                pool_config: pool.clone(),
                market_config: market.clone(),
                target_custody: target_custody.clone(),
                collateral_custody: collateral_custody.clone(),
                target_token: target_token.clone(),
                collateral_token: collateral_token.clone(),
            });
        }

        anyhow::bail!(
            "Market '{target_symbol}/{collateral_symbol}' ({:?}) not found in any pool",
            side
        )
    }

    pub fn find_token<'a>(configs: &'a [PoolConfig], symbol: &str) -> Result<&'a Token> {
        for pool in configs {
            if let Some(token) = pool.get_token_by_symbol(symbol) {
                return Ok(token);
            }
        }
        anyhow::bail!("Token '{symbol}' not found in any pool config")
    }

    pub fn list_markets(configs: &[PoolConfig]) -> Vec<MarketSummary> {
        let mut markets = Vec::new();
        for pool in configs {
            if pool.is_deprecated {
                continue;
            }
            for market in &pool.markets {
                let target_sym = pool
                    .custodies
                    .iter()
                    .find(|c| c.custody_account == market.target_custody)
                    .map(|c| c.symbol.clone())
                    .unwrap_or_else(|| "???".to_string());
                let collateral_sym = pool
                    .custodies
                    .iter()
                    .find(|c| c.custody_account == market.collateral_custody)
                    .map(|c| c.symbol.clone())
                    .unwrap_or_else(|| "???".to_string());

                markets.push(MarketSummary {
                    symbol: target_sym,
                    pool_name: pool.pool_name.clone(),
                    side: market.side,
                    collateral_symbol: collateral_sym,
                    max_leverage: market.max_lev,
                    market_pubkey: market.market_account,
                });
            }
        }
        markets
    }

    pub fn get_alts(pool: &PoolConfig) -> Vec<Pubkey> {
        pool.address_lookup_table_addresses.clone()
    }
}
