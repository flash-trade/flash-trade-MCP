use clap::Subcommand;

#[derive(Subcommand)]
pub enum KeysCommand {
    /// List all saved keypairs
    List,

    /// Import a keypair
    Add {
        /// Name for the keypair
        name: String,

        /// Path to keypair JSON file
        #[arg(long, group = "source")]
        file: Option<String>,

        /// Base58-encoded private key
        #[arg(long, group = "source")]
        private_key: Option<String>,
    },

    /// Remove a keypair from keystore
    Delete {
        /// Keypair name
        name: String,
    },

    /// Set the active keypair
    Use {
        /// Keypair name
        name: String,
    },

    /// Show the public key for a keypair
    Show {
        /// Keypair name
        name: String,
    },

    /// Generate a new random keypair
    Generate {
        /// Name for the new keypair
        name: String,
    },
}
