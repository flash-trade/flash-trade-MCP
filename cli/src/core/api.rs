// ─────────────────────────────────────────────────────────────────────────────
// api.rs — typed REST client for the hosted Flash V2 API. One get()/post()
// funnel normalizes the four error channels (body-err in a 200, 400 text,
// 422 text, empty 500) and throws `err`-in-a-200 for you. Transaction builders
// return PARTIALLY-SIGNED base64 txs; this client never signs or submits.
// ─────────────────────────────────────────────────────────────────────────────

use crate::core::network::Network;
use crate::error::FlashCliError;
use serde::Deserialize;
use serde_json::Value;

type ApiResult<T> = Result<T, FlashCliError>;

#[derive(Debug, Deserialize)]
pub struct TokenInfo {
    pub symbol: String,
    pub mint: String,
    pub decimals: u8,
    #[serde(default, rename = "isStable")]
    pub is_stable: bool,
    #[serde(default, rename = "isVirtual")]
    pub is_virtual: bool,
    #[serde(default, rename = "isToken2022")]
    pub is_token2022: bool,
}

pub struct ApiClient {
    http: reqwest::Client,
    base: String,
}

impl ApiClient {
    pub fn new(net: &Network) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("reqwest client");
        ApiClient { http, base: net.api_base.clone() }
    }

    async fn get(&self, path: &str) -> ApiResult<Value> {
        let url = format!("{}{}", self.base, path);
        let resp = self
            .http
            .get(&url)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|e| FlashCliError::ApiConnection(path.to_string(), e.to_string()))?;
        Self::handle(path, resp).await
    }

    async fn post(&self, path: &str, body: &Value) -> ApiResult<Value> {
        let url = format!("{}{}", self.base, path);
        let resp = self
            .http
            .post(&url)
            .json(body)
            .send()
            .await
            .map_err(|e| FlashCliError::ApiConnection(path.to_string(), e.to_string()))?;
        Self::handle(path, resp).await
    }

    /// Normalize the four error channels; on 200, throw `err`-in-body.
    async fn handle(path: &str, resp: reqwest::Response) -> ApiResult<Value> {
        let status = resp.status();
        if status.is_success() {
            let v: Value = resp
                .json()
                .await
                .map_err(|e| FlashCliError::ApiConnection(path.to_string(), e.to_string()))?;
            if let Some(err) = v.get("err").and_then(|e| e.as_str()) {
                if !err.is_empty() {
                    return Err(FlashCliError::ApiBodyErr(path.to_string(), err.to_string()));
                }
            }
            Ok(v)
        } else {
            let code = status.as_u16();
            let text = resp.text().await.unwrap_or_default();
            let text = text.trim().to_string();
            Err(match code {
                400 => FlashCliError::ApiBadRequest(path.to_string(), text),
                422 => FlashCliError::ApiUnprocessable(path.to_string(), text),
                500 => FlashCliError::ApiServerError(path.to_string()),
                _ => FlashCliError::ApiOther(
                    path.to_string(),
                    code,
                    if text.is_empty() { "no body".to_string() } else { text },
                ),
            })
        }
    }

    // ── Reads ──
    pub async fn health(&self) -> ApiResult<Value> {
        self.get("/health").await
    }
    pub async fn tokens(&self) -> ApiResult<Vec<TokenInfo>> {
        let v = self.get("/tokens").await?;
        serde_json::from_value(v).map_err(|e| FlashCliError::Other(format!("parse tokens: {e}")))
    }
    pub async fn prices(&self) -> ApiResult<Value> {
        self.get("/prices").await
    }
    pub async fn price(&self, symbol: &str) -> ApiResult<Value> {
        self.get(&format!("/prices/{}", symbol)).await
    }
    pub async fn markets(&self) -> ApiResult<Value> {
        self.get("/raw/markets").await
    }
    pub async fn pool_data(&self) -> ApiResult<Value> {
        self.get("/pool-data").await
    }
    pub async fn owner(&self, owner: &str) -> ApiResult<Value> {
        self.get(&format!("/owner/{}", owner)).await
    }

    /// Resolve a token symbol to its mint (setup/withdrawal endpoints need mints).
    pub async fn resolve_mint(&self, symbol: &str) -> ApiResult<String> {
        let tokens = self.tokens().await?;
        tokens
            .into_iter()
            .find(|t| t.symbol.eq_ignore_ascii_case(symbol))
            .map(|t| t.mint)
            .ok_or_else(|| FlashCliError::Other(format!("token '{symbol}' not found in the active pool")))
    }

    // ── Transaction builders + previews (generic) ──
    pub async fn build(&self, builder_path: &str, body: Value) -> ApiResult<Value> {
        self.post(&format!("/transaction-builder/{}", builder_path), &body).await
    }
    pub async fn preview(&self, preview_path: &str, body: Value) -> ApiResult<Value> {
        self.post(&format!("/preview/{}", preview_path), &body).await
    }
}

/// Extract the unsigned base64 transaction from a builder response, if present.
pub fn extract_tx(v: &Value) -> Option<String> {
    v.get("transactionBase64")
        .and_then(|t| t.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}
