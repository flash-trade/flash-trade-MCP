use clap::Subcommand;

#[derive(Subcommand)]
pub enum PerpsCommand {
    /// List open positions
    Positions {
        /// View positions for a specific wallet address (read-only)
        #[arg(long)]
        address: Option<String>,
    },

    /// View single position detail
    Position {
        /// Position account pubkey
        pubkey: String,
    },

    /// List available markets
    Markets {
        /// Filter by pool name (e.g., Crypto.1)
        #[arg(long)]
        pool: Option<String>,
    },

    /// View single market detail
    Market {
        /// Market symbol (e.g., SOL, BTC, ETH)
        symbol: String,
    },

    /// Open a new position
    Open {
        /// Market symbol (e.g., SOL, BTC, ETH)
        symbol: String,

        /// Trade direction
        side: Side,

        /// Collateral amount in USD
        collateral_usd: f64,

        /// Position leverage multiplier
        #[arg(long)]
        leverage: f64,

        /// Collateral token symbol (default: USDC)
        #[arg(long, default_value = "USDC")]
        collateral_token: String,

        /// Slippage tolerance in basis points
        #[arg(long)]
        slippage: Option<u16>,
    },

    /// Close an existing position
    Close {
        /// Position account pubkey
        position: String,

        /// Percentage to close (1-100, default: 100)
        #[arg(long, default_value = "100")]
        percent: u8,

        /// Slippage tolerance in basis points
        #[arg(long)]
        slippage: Option<u16>,
    },

    /// Increase position size
    Increase {
        /// Position account pubkey
        position: String,

        /// Additional size in USD
        usd_amount: f64,

        /// Slippage tolerance in basis points
        #[arg(long)]
        slippage: Option<u16>,
    },

    /// Decrease position size
    Decrease {
        /// Position account pubkey
        position: String,

        /// Size to remove in USD
        usd_amount: f64,

        /// Slippage tolerance in basis points
        #[arg(long)]
        slippage: Option<u16>,
    },

    /// Add collateral to position
    AddCollateral {
        /// Position account pubkey
        position: String,

        /// Amount of collateral to add
        amount: f64,
    },

    /// Remove collateral from position
    RemoveCollateral {
        /// Position account pubkey
        position: String,

        /// Amount of collateral to remove
        amount: f64,
    },

    /// Aggregated position summary
    Portfolio,
}

#[derive(Clone, clap::ValueEnum)]
pub enum Side {
    Long,
    Short,
}
