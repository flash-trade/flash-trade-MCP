use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct EnrichedOrder {
    pub pubkey: String,
    pub market_symbol: String,
    pub order_type: String,
    pub side: String,
    pub trigger_price: f64,
    pub size_usd: f64,
    pub status: String,
}
