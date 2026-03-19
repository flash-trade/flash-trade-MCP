use anyhow::{Context, Result};
use serde::Deserialize;
use std::collections::HashMap;

use flash_sdk::oracle_price::OraclePriceFull;

#[derive(Debug, Clone)]
pub struct PriceData {
    pub price: f64,
    pub confidence: f64,
    pub timestamp: i64,
    pub expo: i32,
    pub raw_price: i64,
}

impl PriceData {
    #[allow(dead_code)]
    pub fn to_oracle_price_full(&self) -> OraclePriceFull {
        let price = if self.raw_price >= 0 {
            self.raw_price as u64
        } else {
            0
        };
        OraclePriceFull::new(
            price,
            self.expo,
            (self.confidence / 10f64.powi(self.expo)) as u64,
            self.timestamp,
        )
    }

    pub fn staleness_seconds(&self) -> u64 {
        let now = chrono::Utc::now().timestamp();
        if now > self.timestamp {
            (now - self.timestamp) as u64
        } else {
            0
        }
    }

    pub fn is_stale(&self) -> bool {
        self.staleness_seconds() > 60
    }
}

pub struct PriceClient {
    http: reqwest::Client,
}

#[derive(Deserialize)]
struct HermesResponse {
    parsed: Vec<HermesParsedEntry>,
}

#[derive(Deserialize)]
struct HermesParsedEntry {
    id: String,
    price: HermesPriceData,
}

#[derive(Deserialize)]
struct HermesPriceData {
    price: String,
    conf: String,
    expo: i32,
    publish_time: i64,
}

impl PriceClient {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::new(),
        }
    }

    pub async fn get_price(&self, pyth_price_id: &str) -> Result<PriceData> {
        let clean_id = pyth_price_id.trim_start_matches("0x");
        let url = format!("https://hermes.pyth.network/v2/updates/price/latest?ids[]={clean_id}");

        let resp: HermesResponse = self
            .http
            .get(&url)
            .send()
            .await
            .with_context(|| format!("Failed to fetch price for {clean_id}"))?
            .json()
            .await
            .with_context(|| "Failed to parse Hermes response")?;

        let entry = resp
            .parsed
            .first()
            .with_context(|| format!("No price data returned for {clean_id}"))?;

        let raw_price: i64 = entry
            .price
            .price
            .parse()
            .with_context(|| "Failed to parse price value")?;
        let raw_conf: i64 = entry
            .price
            .conf
            .parse()
            .with_context(|| "Failed to parse confidence value")?;

        let scale = 10f64.powi(entry.price.expo);
        Ok(PriceData {
            price: raw_price as f64 * scale,
            confidence: raw_conf as f64 * scale,
            timestamp: entry.price.publish_time,
            expo: entry.price.expo,
            raw_price,
        })
    }

    pub async fn get_prices(&self, pyth_price_ids: &[&str]) -> Result<HashMap<String, PriceData>> {
        if pyth_price_ids.is_empty() {
            return Ok(HashMap::new());
        }

        let ids_param: String = pyth_price_ids
            .iter()
            .map(|id| {
                let clean = id.trim_start_matches("0x");
                format!("ids[]={clean}")
            })
            .collect::<Vec<_>>()
            .join("&");

        let url = format!("https://hermes.pyth.network/v2/updates/price/latest?{ids_param}");

        let resp: HermesResponse = self
            .http
            .get(&url)
            .send()
            .await
            .with_context(|| "Failed to fetch prices from Hermes")?
            .json()
            .await
            .with_context(|| "Failed to parse Hermes batch response")?;

        let mut result = HashMap::new();
        for entry in resp.parsed {
            let raw_price: i64 = entry.price.price.parse().unwrap_or(0);
            let raw_conf: i64 = entry.price.conf.parse().unwrap_or(0);
            let scale = 10f64.powi(entry.price.expo);
            result.insert(
                entry.id.clone(),
                PriceData {
                    price: raw_price as f64 * scale,
                    confidence: raw_conf as f64 * scale,
                    timestamp: entry.price.publish_time,
                    expo: entry.price.expo,
                    raw_price,
                },
            );
        }
        Ok(result)
    }
}
