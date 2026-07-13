use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "flash", version, about = "Flash Trade V2 CLI — MagicBlock Ephemeral Rollup, REST + local signing")]
pub struct App {
    /// Keypair name to use (overrides the active key). See `flash keys`.
    #[arg(long, global = true)]
    pub key: Option<String>,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand)]
pub enum Command {
    /// API health + which pool config is live (program, env, account counts)
    Health,
    /// List tokens with MINT addresses + Token-2022 flags (deposits need mints)
    Tokens { symbol: Option<String> },
    /// Live oracle price for one symbol
    Price {
        symbol: String,
        #[arg(long)]
        watch: bool,
    },
    /// All live oracle prices
    Prices,
    /// List markets (symbol, side, max leverage, pool)
    Markets,
    /// Owner snapshot: setup status + positions (mark-price PnL) + orders
    Account { owner: Option<String> },
    /// One-time account setup (base chain): basket -> ledger -> delegate -> deposit
    Setup {
        #[command(subcommand)]
        command: SetupCommand,
    },
    /// Trading (Ephemeral Rollup): open/close/reverse/collateral/triggers/limits
    Perps {
        #[command(subcommand)]
        command: PerpsCommand,
    },
    /// Withdrawals (base chain), two steps: request -> execute
    Withdraw {
        #[command(subcommand)]
        command: WithdrawCommand,
    },
    /// Manage local keypairs
    Keys {
        #[command(subcommand)]
        command: KeysCommand,
    },
    /// Manage CLI settings
    Config {
        #[command(subcommand)]
        command: ConfigCommand,
    },
}

#[derive(Subcommand)]
pub enum SetupCommand {
    /// Show which lifecycle step is missing for an owner
    Status { owner: Option<String> },
    /// Step 1: create the Basket PDA
    InitBasket {
        #[arg(long)]
        submit: bool,
    },
    /// Step 2: create the deposit ledger
    InitLedger {
        #[arg(long)]
        submit: bool,
    },
    /// Step 3: delegate the basket to the MagicBlock validator
    Delegate {
        #[arg(long)]
        submit: bool,
    },
    /// Step 4: deposit collateral (takes a token SYMBOL, resolved to its mint)
    Deposit {
        token: String,
        amount: String,
        #[arg(long)]
        submit: bool,
    },
}

#[derive(Subcommand)]
pub enum PerpsCommand {
    /// Open (or quote) a position. Omit --submit to print the unsigned tx.
    Open {
        symbol: String,
        side: String,
        collateral_usd: String,
        leverage: String,
        #[arg(long, default_value = "USDC")]
        collateral_token: String,
        #[arg(long)]
        submit: bool,
    },
    /// Close a position by market symbol + side ("0" or >=97% of size = full)
    Close {
        symbol: String,
        side: String,
        #[arg(long, default_value = "0")]
        usd: String,
        #[arg(long, default_value = "USDC")]
        withdraw_token: String,
        #[arg(long)]
        submit: bool,
    },
    /// Flip LONG<->SHORT atomically (2% haircut on proceeds)
    Reverse {
        symbol: String,
        side: String,
        leverage: String,
        #[arg(long)]
        submit: bool,
    },
    /// Add collateral to a position
    AddCollateral {
        symbol: String,
        side: String,
        amount: String,
        #[arg(long, default_value = "USDC")]
        token: String,
        #[arg(long)]
        submit: bool,
    },
    /// Remove collateral from a position
    RemoveCollateral {
        symbol: String,
        side: String,
        usd: String,
        #[arg(long, default_value = "USDC")]
        token: String,
        #[arg(long)]
        submit: bool,
    },
    /// Place a TP and/or SL bracket in one atomic transaction
    TpSl {
        symbol: String,
        side: String,
        size: String,
        #[arg(long)]
        tp: Option<String>,
        #[arg(long)]
        sl: Option<String>,
        #[arg(long)]
        submit: bool,
    },
    /// Trigger-order management (TP/SL)
    Trigger {
        #[command(subcommand)]
        command: TriggerCommand,
    },
    /// Limit-order management
    Limit {
        #[command(subcommand)]
        command: LimitCommand,
    },
}

#[derive(Subcommand)]
pub enum TriggerCommand {
    /// Place one TP or SL
    Place {
        symbol: String,
        side: String,
        price: String,
        size: String,
        #[arg(long)]
        stop_loss: bool,
        #[arg(long)]
        submit: bool,
    },
    /// Edit a trigger slot (both price and size required)
    Edit {
        symbol: String,
        side: String,
        order_id: u8,
        price: String,
        size: String,
        #[arg(long)]
        stop_loss: bool,
        #[arg(long)]
        submit: bool,
    },
    /// Cancel one trigger (order_id 0-4) or all (255)
    Cancel {
        symbol: String,
        side: String,
        order_id: u8,
        #[arg(long)]
        stop_loss: bool,
        #[arg(long)]
        submit: bool,
    },
    /// Cancel all triggers for a market + side
    CancelAll {
        symbol: String,
        side: String,
        #[arg(long)]
        submit: bool,
    },
}

#[derive(Subcommand)]
pub enum LimitCommand {
    /// Edit a resting limit order (omitted fields keep existing)
    Edit {
        symbol: String,
        side: String,
        order_id: u8,
        #[arg(long)]
        price: Option<String>,
        #[arg(long)]
        size: Option<String>,
        #[arg(long)]
        submit: bool,
    },
    /// Cancel a resting limit order
    Cancel {
        symbol: String,
        side: String,
        order_id: u8,
        #[arg(long)]
        submit: bool,
    },
}

#[derive(Subcommand)]
pub enum WithdrawCommand {
    /// Step 1: escrow + schedule settlement (takes a token SYMBOL -> mint)
    Request {
        token: String,
        amount: String,
        #[arg(long)]
        submit: bool,
    },
    /// Step 2: move settled funds to the wallet (retry if 0xbc4 timing state)
    Execute {
        token: String,
        #[arg(long)]
        submit: bool,
    },
}

#[derive(Subcommand)]
pub enum KeysCommand {
    List,
    Generate { name: String },
    Add {
        name: String,
        #[arg(long)]
        file: Option<String>,
    },
    Delete { name: String },
    Use { name: String },
    Show { name: String },
}

#[derive(Subcommand)]
pub enum ConfigCommand {
    List,
    Set { key: String, value: String },
    Reset,
}
