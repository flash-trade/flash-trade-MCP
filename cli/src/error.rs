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

    // ── Four API error channels (see V2-ALIGNMENT.md §3) ──
    #[error("[body-err] {0}: {1}")]
    ApiBodyErr(String, String),
    #[error("[http-400] {0}: {1} (a trigger/limit price is invalid vs the oracle)")]
    ApiBadRequest(String, String),
    #[error("[http-422] {0}: {1} (a required field is missing or malformed)")]
    ApiUnprocessable(String, String),
    #[error("[http-500] {0}: setup/withdrawal server error — verify token MINT (not symbol), lifecycle order, pool match")]
    ApiServerError(String),
    #[error("[http-{1}] {0}: {2}")]
    ApiOther(String, u16, String),

    #[error("Failed to reach Flash API at {0}: {1}")]
    ApiConnection(String, String),

    #[error("Transaction send failed on {0}: {1}")]
    SendFailed(String, String),

    // Boxed: ClientError is large; inlining it bloats every FlashCliError value.
    #[error("RPC error: {0}")]
    Rpc(#[from] Box<solana_client::client_error::ClientError>),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("{0}")]
    Other(String),
}
