// ─────────────────────────────────────────────────────────────────────────────
// signer.rs — sign the API's PARTIALLY-SIGNED transactions and submit them to
// the RIGHT chain. The backend pre-filled its own signature slots and chose the
// blockhash for the target chain; we add ONLY the owner's signature (never
// touch the blockhash) and submit to network.rpc_for(chain). Trading → ER,
// setup/withdrawal → base. This is the ONLY place the CLI moves funds.
// ─────────────────────────────────────────────────────────────────────────────

use crate::core::network::{Chain, Network};
use crate::error::FlashCliError;
use base64::Engine as _;
use solana_client::rpc_client::RpcClient;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::signature::Keypair;
use solana_sdk::signer::Signer;
use solana_sdk::transaction::VersionedTransaction;
use std::time::{Duration, Instant};

type Result<T> = std::result::Result<T, FlashCliError>;

/// Decode a base64 transaction into a VersionedTransaction (signatures intact).
pub fn decode_tx(b64: &str) -> Result<VersionedTransaction> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.trim())
        .map_err(|e| FlashCliError::Other(format!("base64 decode: {e}")))?;
    bincode::deserialize::<VersionedTransaction>(&bytes)
        .map_err(|e| FlashCliError::Other(format!("transaction decode: {e}")))
}

/// Add ONLY this keypair's signature, preserving the server's pre-filled slots.
/// Never replaces the blockhash. Errors if the keypair is not a required signer.
pub fn partial_sign(tx: &mut VersionedTransaction, keypair: &Keypair) -> Result<()> {
    let msg_bytes = tx.message.serialize();
    let keys = tx.message.static_account_keys();
    let pos = keys
        .iter()
        .position(|k| k == &keypair.pubkey())
        .ok_or_else(|| FlashCliError::Other(
            "the transaction was built for a different wallet — this keypair is not a required signer".to_string(),
        ))?;
    if pos >= tx.signatures.len() {
        return Err(FlashCliError::Other("signer index out of range for transaction".to_string()));
    }
    tx.signatures[pos] = keypair.sign_message(&msg_bytes);
    Ok(())
}

/// Sign and submit to the chain's RPC, then poll for confirmation. Polling
/// (rather than send_and_confirm) works identically on the ER and the base chain.
pub fn sign_and_submit(
    net: &Network,
    chain: Chain,
    b64: &str,
    keypair: &Keypair,
) -> Result<String> {
    let mut tx = decode_tx(b64)?;
    partial_sign(&mut tx, keypair)?;

    let rpc = RpcClient::new_with_commitment(net.rpc_for(chain).to_string(), CommitmentConfig::confirmed());
    let sig = rpc
        .send_transaction(&tx)
        .map_err(|e| FlashCliError::SendFailed(chain.label().to_string(), decorate(&e.to_string(), chain)))?;

    // Poll signature status until confirmed/finalized (works on both chains).
    let started = Instant::now();
    loop {
        if let Ok(statuses) = rpc.get_signature_statuses(&[sig]) {
            if let Some(Some(status)) = statuses.value.into_iter().next() {
                if let Some(err) = status.err {
                    return Err(FlashCliError::SendFailed(chain.label().to_string(), format!("on-chain error: {err}")));
                }
                if status.satisfies_commitment(CommitmentConfig::confirmed()) {
                    return Ok(sig.to_string());
                }
            }
        }
        if started.elapsed() > Duration::from_secs(60) {
            return Err(FlashCliError::SendFailed(
                chain.label().to_string(),
                format!("confirmation timeout (sent {sig})"),
            ));
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

/// Add an actionable hint to common send failures.
fn decorate(msg: &str, chain: Chain) -> String {
    if msg.contains("AccountNotInitialized") || msg.contains("0xbc4") || msg.contains("settlement_receipt") {
        format!("{msg}\nThis is 0xbc4 / AccountNotInitialized(settlement_receipt) — settlement has not crossed from the rollup yet (~30–90s after request-withdrawal). A TIMING state, not a failure: wait and re-run execute-withdrawal.")
    } else if msg.contains("Blockhash not found") || msg.contains("block height exceeded") {
        "the blockhash expired (~60s). Re-build the transaction and submit immediately.".to_string()
    } else if chain == Chain::Er {
        format!("{msg}\n(Confirm this is a trading transaction — setup/withdrawal txs must submit to the base chain.)")
    } else {
        msg.to_string()
    }
}
