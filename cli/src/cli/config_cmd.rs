use clap::Subcommand;

#[derive(Subcommand)]
pub enum ConfigCommand {
    /// Show all settings
    List,

    /// Update a setting
    Set {
        /// Setting key (e.g., cluster, output_format, rpc_url, default_slippage_bps, priority_fee)
        key: String,

        /// Setting value
        value: String,
    },

    /// Reset all settings to defaults
    Reset,
}
