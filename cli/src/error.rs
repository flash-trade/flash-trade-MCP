use thiserror::Error;

#[derive(Error, Debug)]
#[allow(dead_code)]
pub enum FlashCliError {
    #[error("Config not found: run `flash config reset` to create defaults")]
    ConfigNotFound,

    #[error("Keypair '{0}' not found in keystore")]
    KeyNotFound(String),

    #[error("No active keypair set. Run `flash keys use <name>` or `flash keys generate default`")]
    NoActiveKey,

    #[error("Market '{0}' not found. Run `flash perps markets` to see available markets")]
    MarketNotFound(String),

    #[error("Token '{0}' not available as collateral for {1}")]
    InvalidCollateral(String, String),

    #[error("Pool '{0}' not found")]
    PoolNotFound(String),

    #[error("Price unavailable for {0}. Oracle may be stale (devnet has no Pyth feeds)")]
    PriceUnavailable(String),

    #[error("Price stale: {0} last updated {1}s ago (threshold: 60s)")]
    PriceStale(String, u64),

    #[error("Transaction simulation failed: {0}")]
    SimulationFailed(String),

    #[error("Transaction send failed: {0}")]
    SendFailed(String),

    #[error("Insufficient balance: need {need} {token}, have {have}")]
    InsufficientBalance { need: f64, have: f64, token: String },

    #[error("RPC error: {0}")]
    Rpc(#[from] solana_client::client_error::ClientError),

    #[error("SDK error: {0}")]
    Sdk(#[from] flash_sdk::error::FlashSdkError),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Other(String),
}
