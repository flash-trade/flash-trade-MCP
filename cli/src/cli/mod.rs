pub mod config_cmd;
pub mod earn;
pub mod keys;
pub mod orders;
pub mod perps;

pub use config_cmd::ConfigCommand;
pub use earn::EarnCommand;
pub use keys::KeysCommand;
pub use orders::OrdersCommand;
pub use perps::PerpsCommand;

use clap::{Parser, Subcommand, ValueEnum};

#[derive(Parser)]
#[command(
    name = "flash",
    version,
    about = "CLI tool for Flash Trade perpetuals protocol"
)]
pub struct App {
    /// Output format
    #[arg(long, global = true, default_value = "table")]
    pub format: OutputFormat,

    /// Solana cluster
    #[arg(long, global = true)]
    pub cluster: Option<Cluster>,

    /// Keypair name from keystore
    #[arg(long, global = true)]
    pub key: Option<String>,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand)]
pub enum Command {
    /// Perpetuals trading commands
    Perps {
        #[command(subcommand)]
        command: PerpsCommand,
    },

    /// Order management commands
    Orders {
        #[command(subcommand)]
        command: OrdersCommand,
    },

    /// Liquidity and staking commands
    Earn {
        #[command(subcommand)]
        command: EarnCommand,
    },

    /// Configuration management
    Config {
        #[command(subcommand)]
        command: ConfigCommand,
    },

    /// Keypair management
    Keys {
        #[command(subcommand)]
        command: KeysCommand,
    },

    /// Get current price for a token
    Price {
        /// Token symbol (e.g., SOL, BTC, ETH)
        symbol: String,

        /// Watch price with live updates (5s refresh)
        #[arg(long)]
        watch: bool,
    },

    /// Show CLI and SDK versions
    Version,
}

#[derive(Clone, Copy, ValueEnum)]
pub enum OutputFormat {
    Table,
    Json,
}

#[derive(Clone, Copy, ValueEnum)]
pub enum Cluster {
    Mainnet,
    Devnet,
}
