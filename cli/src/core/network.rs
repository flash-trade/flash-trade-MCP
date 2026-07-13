// ─────────────────────────────────────────────────────────────────────────────
// network.rs — the V2 two-chain model. Trading txs submit to the Ephemeral
// Rollup RPC; setup + withdrawal txs submit to the base-chain Solana RPC.
// The API base serves the V2 surface at ROOT (the /v2 edge prefix is not
// deployed). Env overrides: FLASH_API_URL, ER_RPC_URL, SOLANA_RPC_URL — all
// three are HTTPS-enforced (localhost exempt) so a plaintext override can't let
// a network attacker substitute the transaction you sign.
// ─────────────────────────────────────────────────────────────────────────────

use anyhow::{anyhow, bail, Result};

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
    /// Resolve from the environment, falling back to verified defaults. Every
    /// endpoint is HTTPS-enforced; a plaintext non-loopback override is rejected.
    pub fn resolve() -> Result<Self> {
        let d = Network::default();
        Ok(Network {
            api_base: require_https("FLASH_API_URL", std::env::var("FLASH_API_URL").unwrap_or(d.api_base))?,
            er_rpc: require_https("ER_RPC_URL", std::env::var("ER_RPC_URL").unwrap_or(d.er_rpc))?,
            base_rpc: require_https("SOLANA_RPC_URL", std::env::var("SOLANA_RPC_URL").unwrap_or(d.base_rpc))?,
        })
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

/// Enforce https:// on an endpoint (localhost/127.0.0.1 exempt), returning the
/// URL with any trailing slash trimmed. Rejects plaintext non-loopback endpoints
/// so a hostile override can't redirect the transaction you sign. Host is parsed
/// carefully (userinfo/port stripped) so `http://localhost.evil.com` is NOT exempt.
pub fn require_https(name: &str, url: String) -> Result<String> {
    let trimmed = url.trim_end_matches('/').to_string();
    let (scheme, rest) = trimmed
        .split_once("://")
        .ok_or_else(|| anyhow!("{name} must be an http(s) URL, got: {trimmed}"))?;
    let host = rest
        .split(['/', '?', '#'])
        .next()
        .unwrap_or("")
        .rsplit('@')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("");
    let is_loopback = host == "localhost" || host == "127.0.0.1";
    match scheme.to_ascii_lowercase().as_str() {
        "https" => Ok(trimmed),
        "http" if is_loopback => Ok(trimmed),
        "http" => bail!(
            "{name} must use https:// — plaintext lets a network attacker substitute the transaction you sign. Only localhost is exempt. Got: {trimmed}"
        ),
        other => bail!("{name} must be an http(s) URL (got scheme '{other}'): {trimmed}"),
    }
}
