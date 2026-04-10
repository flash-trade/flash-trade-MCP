use clap::Subcommand;

#[derive(Subcommand)]
pub enum OrdersCommand {
    /// List all orders
    List {
        /// View orders for a specific wallet address (read-only)
        #[arg(long)]
        address: Option<String>,
    },

    /// Place a limit order
    Limit {
        /// Market symbol (e.g., SOL, BTC, ETH)
        symbol: String,

        /// Trade direction
        side: super::perps::Side,

        /// Order size in USD
        size_usd: f64,

        /// Trigger price in USD
        #[arg(long)]
        price: f64,

        /// Position leverage multiplier
        #[arg(long)]
        leverage: f64,

        /// Collateral token symbol (default: USDC)
        #[arg(long, default_value = "USDC")]
        collateral_token: String,
    },

    /// Edit an existing limit order
    EditLimit {
        /// Order account pubkey
        order: String,

        /// New trigger price in USD
        #[arg(long)]
        price: Option<f64>,

        /// New size in USD
        #[arg(long)]
        size: Option<f64>,
    },

    /// Place a take-profit or stop-loss trigger order
    Trigger {
        /// Position account pubkey
        position: String,

        /// Trigger type
        #[arg(long, rename_all = "lower")]
        r#type: TriggerType,

        /// Trigger price in USD
        #[arg(long)]
        price: f64,

        /// Quantity as percent of position (default: 100)
        #[arg(long, default_value = "100")]
        quantity: u8,
    },

    /// Edit an existing trigger order
    EditTrigger {
        /// Order account pubkey
        order: String,

        /// New trigger price in USD
        #[arg(long)]
        price: Option<f64>,

        /// New quantity percent
        #[arg(long)]
        quantity: Option<u8>,
    },

    /// Cancel a single order
    Cancel {
        /// Order account pubkey
        order: String,

        /// Order type (tp or sl)
        #[arg(long)]
        r#type: TriggerType,
    },

    /// Cancel all orders for a market
    CancelAll {
        /// Market symbol (e.g., SOL)
        symbol: String,
    },
}

#[derive(Clone, clap::ValueEnum)]
pub enum TriggerType {
    Tp,
    Sl,
}
