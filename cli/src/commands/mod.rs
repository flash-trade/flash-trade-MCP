pub mod reads;
pub mod txn;

use crate::core::config::Settings;
use crate::core::network::{self, Chain, Network};
use crate::core::{api, signer};
use crate::core::wallet::WalletManager;
use anyhow::Result;
use serde_json::Value;
use solana_sdk::signer::Signer;

/// Resolve the owner pubkey: an explicit arg, else the active/override keypair.
pub fn resolve_owner(explicit: Option<&str>, key_override: Option<&str>, settings: &Settings) -> Result<String> {
    if let Some(o) = explicit {
        return Ok(o.to_string());
    }
    let kp = WalletManager::resolve(key_override, settings)?;
    Ok(kp.pubkey().to_string())
}

/// Given a builder response, either print the unsigned tx + chain routing, or
/// (with `submit`) sign it with the local keypair and send it to the right chain.
pub fn handle_built(
    net: &Network,
    builder_path: &str,
    resp: &Value,
    submit: bool,
    key_override: Option<&str>,
    settings: &Settings,
) -> Result<()> {
    let chain = network::chain_for(builder_path);
    match api::extract_tx(resp) {
        None => {
            println!("No transaction was built (quote only).");
        }
        Some(b64) => {
            if submit {
                let kp = WalletManager::resolve(key_override, settings)?;
                println!("Submitting to the {} ...", chain.label());
                let sig = signer::sign_and_submit(net, chain, &b64, &kp)?;
                println!("Confirmed on the {}: {}", chain.label(), sig);
                if chain == Chain::Base {
                    println!("Explorer: https://solscan.io/tx/{sig}");
                }
            } else {
                let net_arg = match chain {
                    Chain::Er => "er",
                    Chain::Base => "base",
                };
                println!("\nUnsigned transaction (targets the {}):", chain.label());
                println!("{b64}");
                println!(
                    "\nRe-run with --submit to sign + send (chain={net_arg}), or sign this base64 with your own wallet."
                );
            }
        }
    }
    Ok(())
}
