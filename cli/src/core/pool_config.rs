use anyhow::{Context, Result};
use flash_sdk::pool_config::{CustodyConfig, MarketConfig, Side, Token};
use flash_sdk::PoolConfig;
use solana_sdk::pubkey::Pubkey;
use std::str::FromStr;

use crate::core::config::Settings;

/// Known-good Flash Trade program IDs. Remote pool configs with any other program ID
/// are rejected to prevent fund-redirection attacks via poisoned config URLs.
const MAINNET_PROGRAM_ID: &str = "FLASH6Lo6h3iasJKWDs2F8TkW2UKf3s15C8PMGuVfgBn";
const DEVNET_PROGRAM_ID: &str = "FTPP4jEWW1n8s2FEccwVfS9KCPjpndaswg7Nkkuz4ER4";

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
    /// Load pool configs: try remote URL first (if configured), fall back to bundled JSON.
    pub fn load(settings: &Settings) -> Result<Vec<PoolConfig>> {
        Self::load_with_remote(&settings.cluster, settings.pool_config_url.as_deref())
    }

    /// Load pool configs with an optional remote URL for fresh data.
    pub fn load_with_remote(cluster: &str, remote_url: Option<&str>) -> Result<Vec<PoolConfig>> {
        // Try remote fetch if a URL is provided
        if let Some(url) = remote_url {
            match Self::fetch_remote(url, cluster) {
                Ok(configs) if !configs.is_empty() => {
                    // Integrity check: reject configs with unknown program IDs
                    if let Err(e) = Self::validate_program_ids(&configs, cluster) {
                        eprintln!(
                            "WARNING: Remote pool config from {url} failed integrity check: {e}\n\
                             Falling back to bundled data for safety."
                        );
                    } else {
                        return Ok(configs);
                    }
                }
                Ok(_) => {
                    eprintln!(
                        "WARNING: Remote pool config from {url} returned no configs for '{cluster}'. \
                         Falling back to bundled data (may be stale)."
                    );
                }
                Err(e) => {
                    eprintln!(
                        "WARNING: Failed to fetch pool config from {url}: {e}. \
                         Falling back to bundled data (may be stale)."
                    );
                }
            }
        }

        // Bundled JSON fallback (always works, may be stale)
        match cluster {
            "devnet" => PoolConfig::devnet()
                .map_err(|e| anyhow::anyhow!("Failed to load devnet pool configs: {e}")),
            _ => PoolConfig::mainnet()
                .map_err(|e| anyhow::anyhow!("Failed to load mainnet pool configs: {e}")),
        }
    }

    /// Verify that all pool configs reference a known Flash Trade program ID.
    /// Rejects configs where programId doesn't match the expected value for the
    /// cluster — prevents fund-redirection attacks via poisoned remote configs.
    fn validate_program_ids(configs: &[PoolConfig], cluster: &str) -> Result<()> {
        let expected_str = match cluster {
            "devnet" => DEVNET_PROGRAM_ID,
            _ => MAINNET_PROGRAM_ID,
        };
        let expected = Pubkey::from_str(expected_str)
            .map_err(|e| anyhow::anyhow!("Invalid hardcoded program ID: {e}"))?;

        for config in configs {
            if config.program_id != expected {
                anyhow::bail!(
                    "Pool '{}' has unexpected program_id {} (expected {}). \
                     This may indicate a tampered remote config.",
                    config.pool_name,
                    config.program_id,
                    expected
                );
            }
        }
        Ok(())
    }

    /// Fetch pool configs from a remote URL. Returns an error on any failure
    /// (caller decides whether to fall back).
    fn fetch_remote(url: &str, cluster: &str) -> Result<Vec<PoolConfig>> {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .with_context(|| "Failed to create HTTP client for pool config fetch")?;

        let resp = client
            .get(url)
            .header("Accept", "application/json")
            .send()
            .with_context(|| format!("Failed to fetch pool config from {url}"))?;

        if !resp.status().is_success() {
            anyhow::bail!("Pool config fetch returned HTTP {}", resp.status());
        }

        let json = resp
            .text()
            .with_context(|| "Failed to read pool config response body")?;

        let all_configs = PoolConfig::from_json(&json)
            .map_err(|e| anyhow::anyhow!("Failed to parse remote pool config: {e}"))?;

        // Filter by cluster, same as the bundled loaders do
        let cluster_str = cluster.to_string();
        Ok(all_configs
            .into_iter()
            .filter(|c| c.cluster == cluster_str)
            .collect())
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
