#![allow(unused_imports)]
use anyhow::Result;

use crate::core::config::Settings;
use crate::core::pool_config::PoolConfigManager;
use crate::core::prices::PriceClient;
use crate::core::rpc::RpcManager;
use crate::enrichment::position_enrichment::EnrichedPosition;
use crate::output::formatter::Formatter;

pub struct PortfolioSummary {
    pub wallet: String,
    pub sol_balance: f64,
    pub num_positions: usize,
    pub total_size_usd: f64,
    pub total_collateral_usd: f64,
    pub total_pnl_usd: f64,
    pub total_pnl_percent: f64,
    #[allow(dead_code)]
    pub positions: Vec<EnrichedPosition>,
}

pub async fn show_portfolio(
    key_override: Option<&str>,
    settings: &Settings,
    formatter: &Formatter,
) -> Result<()> {
    let keypair = crate::core::wallet::WalletManager::resolve(key_override, settings)?;
    let owner = solana_sdk::signer::Signer::pubkey(&keypair);
    let rpc = RpcManager::new(settings)?;

    let sol_balance = rpc.get_sol_balance(&owner)? as f64 / 1_000_000_000.0;

    let _configs = PoolConfigManager::load(settings)?;
    let _price_client = PriceClient::new();
    let program_id = crate::commands::positions::resolve_program_id_pub(&settings.cluster);

    let position_discriminator: [u8; 8] = [170, 188, 143, 228, 122, 64, 247, 208];
    let accounts =
        rpc.get_program_accounts_by_owner(&program_id, &owner, &position_discriminator)?;

    let mut positions = Vec::new();
    for (pubkey, _account) in &accounts {
        // Reuse the position enrichment from the positions command
        // For now just count them
        positions.push(EnrichedPosition {
            pubkey: pubkey.to_string(),
            market_symbol: "".into(),
            side: "".into(),
            size_usd: 0.0,
            collateral_usd: 0.0,
            collateral_token: "".into(),
            entry_price: 0.0,
            mark_price: 0.0,
            pnl_usd: 0.0,
            pnl_percent: 0.0,
            leverage: 0.0,
            liquidation_price: 0.0,
        });
    }

    let total_size: f64 = positions.iter().map(|p| p.size_usd).sum();
    let total_collateral: f64 = positions.iter().map(|p| p.collateral_usd).sum();
    let total_pnl: f64 = positions.iter().map(|p| p.pnl_usd).sum();
    let total_pnl_pct = if total_collateral > 0.0 {
        (total_pnl / total_collateral) * 100.0
    } else {
        0.0
    };

    let summary = PortfolioSummary {
        wallet: owner.to_string(),
        sol_balance,
        num_positions: accounts.len(),
        total_size_usd: total_size,
        total_collateral_usd: total_collateral,
        total_pnl_usd: total_pnl,
        total_pnl_percent: total_pnl_pct,
        positions,
    };

    println!("{}", formatter.portfolio(&summary));
    Ok(())
}
