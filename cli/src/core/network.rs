// ─────────────────────────────────────────────────────────────────────────────
// network.rs — the V2 two-chain model. Trading txs submit to the Ephemeral
// Rollup RPC; setup + withdrawal txs submit to the base-chain Solana RPC.
// The API base serves the V2 surface at ROOT (the /v2 edge prefix is not
// deployed). Env overrides: FLASH_API_URL, ER_RPC_URL, SOLANA_RPC_URL.
// ─────────────────────────────────────────────────────────────────────────────

/// Which chain a built transaction must be submitted to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Chain {
    /// Ephemeral Rollup — trading transactions.
    Er,
    /// Base-chain Solana — setup + withdrawal transactions.
    Base,
}

impl Chain {
    pub fn label(self) -> &'static str {
        match self {
            Chain::Er => "Ephemeral Rollup",
            Chain::Base => "base chain",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Network {
    /// Hosted V2 REST base (root, no trailing slash).
    pub api_base: String,
    /// Ephemeral Rollup RPC — trading tx submission.
    pub er_rpc: String,
    /// Base-chain Solana RPC — setup + withdrawal tx submission.
    pub base_rpc: String,
}

impl Default for Network {
    fn default() -> Self {
        Network {
            api_base: "https://flashapi.trade".to_string(),
            er_rpc: "https://flash.magicblock.xyz".to_string(),
            base_rpc: "https://api.mainnet-beta.solana.com".to_string(),
        }
    }
}

impl Network {
    /// Resolve from the environment, falling back to verified defaults.
    pub fn resolve() -> Self {
        let d = Network::default();
        Network {
            api_base: std::env::var("FLASH_API_URL")
                .map(|s| s.trim_end_matches('/').to_string())
                .unwrap_or(d.api_base),
            er_rpc: std::env::var("ER_RPC_URL").unwrap_or(d.er_rpc),
            base_rpc: std::env::var("SOLANA_RPC_URL").unwrap_or(d.base_rpc),
        }
    }

    /// The RPC endpoint for a given chain.
    pub fn rpc_for(&self, chain: Chain) -> &str {
        match chain {
            Chain::Er => &self.er_rpc,
            Chain::Base => &self.base_rpc,
        }
    }
}

/// The routing table: which chain each transaction-builder endpoint targets.
/// Single source of truth; the routing test asserts it.
pub fn chain_for(builder_path: &str) -> Chain {
    match builder_path {
        // Trading — Ephemeral Rollup
        "open-position" | "close-position" | "reverse-position" | "add-collateral"
        | "remove-collateral" | "place-tp-sl" | "place-trigger-order" | "edit-trigger-order"
        | "cancel-trigger-order" | "cancel-all-trigger-orders" | "edit-limit-order"
        | "cancel-limit-order" => Chain::Er,
        // Account setup + withdrawal — base chain
        "init-basket" | "init-deposit-ledger" | "delegate-basket" | "deposit-direct"
        | "request-withdrawal" | "execute-withdrawal" => Chain::Base,
        // Default to base for anything unrecognized (safest for setup-like ops).
        _ => Chain::Base,
    }
}
