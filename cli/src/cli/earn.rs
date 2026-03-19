use clap::Subcommand;

#[derive(Subcommand)]
pub enum EarnCommand {
    /// List all liquidity pools
    Pools,

    /// View pool detail (AUM, APY, custody ratios)
    Pool {
        /// Pool name (e.g., Crypto.1)
        name: String,
    },

    /// Add liquidity to a pool
    AddLiquidity {
        /// Pool name (e.g., Crypto.1)
        pool: String,

        /// Token symbol to deposit (e.g., USDC)
        token: String,

        /// Amount to deposit
        amount: f64,
    },

    /// Remove liquidity from a pool
    RemoveLiquidity {
        /// Pool name (e.g., Crypto.1)
        pool: String,

        /// Token symbol to receive (e.g., USDC)
        token: String,

        /// FLP amount to redeem
        amount: f64,
    },

    /// Stake FLP tokens
    Stake {
        /// Pool name (e.g., Crypto.1)
        pool: String,

        /// FLP amount to stake
        amount: f64,
    },

    /// Unstake FLP tokens
    Unstake {
        /// Pool name (e.g., Crypto.1)
        pool: String,

        /// FLP amount to unstake
        amount: f64,

        /// Instant unstake (pays fee instead of time-lock)
        #[arg(long)]
        instant: bool,
    },

    /// Collect staking rewards
    Claim {
        /// Pool name (e.g., Crypto.1)
        pool: String,
    },

    /// View stake positions
    Stakes {
        /// View stakes for a specific wallet address (read-only)
        #[arg(long)]
        address: Option<String>,
    },
}
