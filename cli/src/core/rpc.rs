// ClientError is 264 bytes (Solana's type) — every closure returning it triggers clippy::result_large_err.
// We can't shrink a third-party type; suppress for this module.
#![allow(clippy::result_large_err)]

use anyhow::{Context, Result};
use solana_account_decoder::UiAccountEncoding;
use solana_client::client_error::{ClientError, ClientErrorKind};
use solana_client::rpc_client::RpcClient;
use solana_client::rpc_config::{
    RpcAccountInfoConfig, RpcProgramAccountsConfig, RpcSendTransactionConfig,
};
use solana_client::rpc_filter::{Memcmp, RpcFilterType};
use solana_sdk::account::Account;
use solana_sdk::address_lookup_table::AddressLookupTableAccount;
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::hash::Hash;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Signature;
use solana_sdk::transaction::VersionedTransaction;

use std::sync::atomic::{AtomicBool, Ordering};

use crate::core::config::{redact_url, Config, Settings};

/// Solana Labs official mainnet RPC — hardcoded last-resort fallback.
const SOLANA_MAINNET_RPC: &str = "https://api.mainnet-beta.solana.com";
const SOLANA_DEVNET_RPC: &str = "https://api.devnet.solana.com";

pub struct RpcManager {
    /// Ordered list of (url, client) pairs. First = primary, rest = fallbacks.
    clients: Vec<(String, RpcClient)>,
    /// How many endpoints are trusted for transaction sends (primary + hardcoded Solana Labs).
    /// User-configured fallbacks are used for reads only — they never receive signed transactions.
    send_trusted_count: usize,
    /// Suppresses repeated fallback warnings after the first one per session.
    warned: AtomicBool,
}

impl RpcManager {
    pub fn new(settings: &Settings) -> Result<Self> {
        let commitment = match settings.commitment.as_str() {
            "processed" => CommitmentConfig::processed(),
            "finalized" => CommitmentConfig::finalized(),
            _ => CommitmentConfig::confirmed(),
        };

        let mut endpoints: Vec<String> = Vec::new();

        // Primary: user's configured RPC (or cluster default)
        let primary = Config::rpc_url(settings);
        endpoints.push(primary);

        let mut solana_labs_added = false;

        if settings.rpc_failover {
            // User-configured fallbacks (reads only — NOT trusted for signed tx sends)
            for fb in &settings.rpc_fallbacks {
                let trimmed = fb.trim().to_string();
                if !trimmed.is_empty() && !endpoints.contains(&trimmed) {
                    endpoints.push(trimmed);
                }
            }

            // Hardcoded last-resort: Solana Labs official (cluster-aware, deduped)
            let default_rpc = match settings.cluster.as_str() {
                "devnet" => SOLANA_DEVNET_RPC,
                _ => SOLANA_MAINNET_RPC,
            };
            if !endpoints.iter().any(|u| u == default_rpc) {
                endpoints.push(default_rpc.to_string());
                solana_labs_added = true;
            }
        }

        // Validate all endpoints are HTTPS (localhost exempt for dev)
        for url in &endpoints {
            Self::validate_endpoint_scheme(url)?;
        }

        // Trusted for sends: primary (idx 0) + Solana Labs (last idx, if added).
        // User-configured fallbacks are used for reads only.
        let send_trusted_count = if solana_labs_added { 2 } else { 1 };

        let clients = endpoints
            .into_iter()
            .map(|url| {
                let client = RpcClient::new_with_commitment(url.clone(), commitment);
                (url, client)
            })
            .collect();

        Ok(Self {
            clients,
            send_trusted_count,
            warned: AtomicBool::new(false),
        })
    }

    /// Reject non-HTTPS endpoints to prevent MITM attacks that could intercept
    /// signed transactions or return fake account data. Localhost is exempt for dev.
    fn validate_endpoint_scheme(url: &str) -> Result<()> {
        if url.starts_with("https://") {
            return Ok(());
        }
        // Allow localhost / 127.0.0.1 for development
        if url.starts_with("http://localhost") || url.starts_with("http://127.0.0.1") {
            return Ok(());
        }
        anyhow::bail!(
            "Refusing non-HTTPS RPC endpoint: {}\n\
             HTTPS is required to prevent interception of signed transactions.\n\
             If this is a local dev endpoint, use http://localhost or http://127.0.0.1.",
            redact_url(url)
        )
    }

    // ── Failover core ──

    /// Execute an RPC operation with failover across the endpoint chain.
    /// On failover-eligible errors, tries the next endpoint. On domain errors
    /// (program errors, signing errors, etc.), returns immediately.
    #[allow(clippy::result_large_err)] // ClientError is 264 bytes — Solana's type, not ours
    fn with_failover<T, F>(&self, op_name: &str, op: F) -> Result<T>
    where
        F: Fn(&RpcClient) -> std::result::Result<T, ClientError>,
    {
        let mut last_err = None;

        for (i, (url, client)) in self.clients.iter().enumerate() {
            match op(client) {
                Ok(val) => return Ok(val),
                Err(e) => {
                    if !Self::is_failover_eligible(&e) {
                        // Domain/program error — return immediately, don't rotate
                        return Err(e).with_context(|| format!("{op_name} on {}", redact_url(url)));
                    }
                    // Failover-eligible: warn on first occurrence, then try next
                    if i == 0 {
                        self.warn_failover(url, &e);
                    }
                    last_err = Some((url.clone(), e));
                }
            }
        }

        // All endpoints exhausted
        match last_err {
            Some((url, e)) => {
                if Self::is_gpa_method_disabled(&e) {
                    anyhow::bail!(
                        "All RPC endpoints failed. The Solana Labs fallback does not support \
                         getProgramAccounts (used by positions/orders listing).\n\
                         Add an RPC that supports it:\n  \
                         flash config set rpc_url <your-rpc-url>\n  \
                         or: flash config set rpc_fallbacks <url1>,<url2>"
                    );
                }
                Err(e).with_context(|| {
                    format!("All {} RPC endpoints failed. Last: {}", self.clients.len(), redact_url(&url))
                })
            }
            None => anyhow::bail!("No RPC endpoints configured"),
        }
    }

    /// Classify whether a `ClientError` should trigger rotation to the next endpoint.
    fn is_failover_eligible(e: &ClientError) -> bool {
        match &e.kind {
            ClientErrorKind::Reqwest(re) => {
                if let Some(status) = re.status() {
                    matches!(status.as_u16(), 401 | 403 | 429 | 500..=599)
                } else {
                    // No HTTP status → network-level failure (timeout, DNS, connect)
                    true
                }
            }
            ClientErrorKind::Io(_) => true,
            // Everything else is a domain/program error — don't rotate
            ClientErrorKind::TransactionError(_)
            | ClientErrorKind::RpcError(_)
            | ClientErrorKind::SigningError(_)
            | ClientErrorKind::SerdeJson(_)
            | ClientErrorKind::Custom(_)
            | ClientErrorKind::Middleware(_) => false,
        }
    }

    /// Detect "method not found" / gPA-disabled on the Solana Labs fallback.
    fn is_gpa_method_disabled(e: &ClientError) -> bool {
        let msg = e.to_string();
        msg.contains("Method not found")
            || msg.contains("method not found")
            || msg.contains("-32601")
    }

    /// Print a one-time warning to stderr when the primary endpoint fails over.
    /// URL is redacted to avoid leaking API keys in stderr (CI logs, screen recordings).
    fn warn_failover(&self, failed_url: &str, err: &ClientError) {
        if !self.warned.swap(true, Ordering::Relaxed) {
            let safe_url = redact_url(failed_url);
            eprintln!(
                "WARNING: Primary RPC ({safe_url}) failed: {err}\n\
                 Falling back to next endpoint. \
                 Run `flash config set rpc_url <new-url>` to fix permanently, \
                 or `flash config set rpc_failover off` to disable fallback."
            );
        }
    }

    // ── Public RPC methods (all routed through with_failover) ──

    pub fn get_account(&self, pubkey: &Pubkey) -> Result<Account> {
        let pk = *pubkey;
        self.with_failover("get_account", move |client| client.get_account(&pk))
    }

    pub fn get_multiple_accounts(&self, pubkeys: &[Pubkey]) -> Result<Vec<Option<Account>>> {
        let pks = pubkeys.to_vec();
        self.with_failover("get_multiple_accounts", move |client| {
            client.get_multiple_accounts(&pks)
        })
    }

    pub fn get_program_accounts_by_owner(
        &self,
        program_id: &Pubkey,
        owner: &Pubkey,
        discriminator: &[u8; 8],
    ) -> Result<Vec<(Pubkey, Account)>> {
        let prog = *program_id;
        let own = *owner;
        let disc = *discriminator;
        self.with_failover("get_program_accounts", move |client| {
            let filters = vec![
                RpcFilterType::Memcmp(Memcmp::new_raw_bytes(0, disc.to_vec())),
                RpcFilterType::Memcmp(Memcmp::new_raw_bytes(8, own.to_bytes().to_vec())),
            ];
            let config = RpcProgramAccountsConfig {
                filters: Some(filters),
                account_config: RpcAccountInfoConfig {
                    encoding: Some(UiAccountEncoding::Base64),
                    commitment: Some(client.commitment()),
                    ..Default::default()
                },
                ..Default::default()
            };
            client.get_program_accounts_with_config(&prog, config)
        })
    }

    pub fn simulate(
        &self,
        tx: &VersionedTransaction,
    ) -> Result<solana_client::rpc_response::RpcSimulateTransactionResult> {
        // Simulation can fail over — it's a read-only probe
        let tx_clone = tx.clone();
        let result = self.with_failover("simulate", move |client| {
            client.simulate_transaction(&tx_clone)
        })?;
        Ok(result.value)
    }

    pub fn send_and_confirm(&self, tx: &VersionedTransaction) -> Result<Signature> {
        self.send_and_confirm_inner(tx, false)
    }

    pub fn send_and_confirm_skip_preflight(&self, tx: &VersionedTransaction) -> Result<Signature> {
        self.send_and_confirm_inner(tx, true)
    }

    /// Returns the indices of endpoints trusted for sending signed transactions.
    /// Only the primary endpoint and the hardcoded Solana Labs fallback receive signed txs.
    /// User-configured fallbacks are used for reads only — they never see signed transactions.
    fn send_trusted_indices(&self) -> Vec<usize> {
        let mut indices = vec![0]; // primary is always trusted
        if self.send_trusted_count > 1 && self.clients.len() > 1 {
            indices.push(self.clients.len() - 1); // Solana Labs (last)
        }
        indices
    }

    /// Send with failover (trusted endpoints only), then confirm PINNED to the accepting endpoint.
    fn send_and_confirm_inner(
        &self,
        tx: &VersionedTransaction,
        skip_preflight: bool,
    ) -> Result<Signature> {
        let config = RpcSendTransactionConfig {
            skip_preflight,
            ..Default::default()
        };

        // Phase 1: send — only to trusted endpoints (primary + Solana Labs).
        // User-configured fallbacks NEVER receive signed transactions to prevent
        // a malicious fallback from capturing and front-running the tx.
        let trusted = self.send_trusted_indices();
        let mut sig = None;
        let mut send_client_idx = 0;
        let mut last_err = None;

        for &i in &trusted {
            let (url, client) = &self.clients[i];
            match client.send_transaction_with_config(tx, config) {
                Ok(s) => {
                    sig = Some(s);
                    send_client_idx = i;
                    break;
                }
                Err(e) => {
                    if !Self::is_failover_eligible(&e) {
                        return Err(e).with_context(|| format!("send_transaction on {}", redact_url(url)));
                    }
                    if i == 0 {
                        self.warn_failover(url, &e);
                    }
                    last_err = Some((url.clone(), e));
                }
            }
        }

        let sig = match sig {
            Some(s) => s,
            None => {
                let (url, e) = last_err.unwrap();
                return Err(e).with_context(|| {
                    format!("All {} trusted RPC endpoints failed to send. Last: {}", trusted.len(), redact_url(&url))
                });
            }
        };

        // Phase 2: confirm — PINNED to the endpoint that accepted the send
        let (confirm_url, confirm_client) = &self.clients[send_client_idx];
        let blockhash = confirm_client
            .get_latest_blockhash()
            .with_context(|| format!("Failed to get blockhash from {}", redact_url(confirm_url)))?;

        match confirm_client.confirm_transaction_with_spinner(&sig, &blockhash, confirm_client.commitment()) {
            Ok(_) => Ok(sig),
            Err(e) => {
                let safe_url = redact_url(confirm_url);
                eprintln!(
                    "WARNING: Transaction {sig} was sent but confirmation failed on {safe_url}: {e}\n\
                     The transaction may have landed — check the signature on an explorer:\n  \
                     https://solscan.io/tx/{sig}"
                );
                Err(e).with_context(|| format!("Transaction sent but not confirmed: {sig}"))
            }
        }
    }

    pub fn get_latest_blockhash(&self) -> Result<Hash> {
        self.with_failover("get_latest_blockhash", |client| {
            client.get_latest_blockhash()
        })
    }

    pub fn get_sol_balance(&self, pubkey: &Pubkey) -> Result<u64> {
        let pk = *pubkey;
        self.with_failover("get_balance", move |client| client.get_balance(&pk))
    }

    pub fn get_token_balance(&self, ata: &Pubkey) -> Result<u64> {
        let pk = *ata;
        let balance = self.with_failover("get_token_account_balance", move |client| {
            client.get_token_account_balance(&pk)
        })?;
        let amount: u64 = balance
            .amount
            .parse()
            .with_context(|| "Failed to parse token balance")?;
        Ok(amount)
    }

    pub fn get_address_lookup_table(
        &self,
        alt_pubkey: &Pubkey,
    ) -> Result<AddressLookupTableAccount> {
        let account = self.get_account(alt_pubkey)?;
        let alt = solana_address_lookup_table_interface::state::AddressLookupTable::deserialize(
            &account.data,
        )
        .map_err(|e| anyhow::anyhow!("Failed to deserialize ALT {alt_pubkey}: {e}"))?;
        Ok(AddressLookupTableAccount {
            key: *alt_pubkey,
            addresses: alt.addresses.to_vec(),
        })
    }

    pub fn health(&self) -> Result<()> {
        // Health check uses primary only — not failover (it's a diagnostic tool)
        let (url, client) = &self.clients[0];
        client
            .get_health()
            .with_context(|| format!("RPC health check failed: {url}"))?;
        Ok(())
    }

    pub fn client(&self) -> &RpcClient {
        &self.clients[0].1
    }

    /// Number of endpoints in the failover chain (for testing/display).
    pub fn endpoint_count(&self) -> usize {
        self.clients.len()
    }

    /// Primary endpoint URL (for display).
    pub fn primary_url(&self) -> &str {
        &self.clients[0].0
    }
}

// ── Error classification (pub for unit tests) ──

pub fn is_failover_eligible_error(e: &ClientError) -> bool {
    RpcManager::is_failover_eligible(e)
}
