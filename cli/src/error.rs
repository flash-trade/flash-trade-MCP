use thiserror::Error;

#[derive(Error, Debug)]
pub enum FlashCliError {
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

    #[error("{0}")]
    Other(String),
}
