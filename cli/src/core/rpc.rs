use anyhow::{Context, Result};
use solana_account_decoder::UiAccountEncoding;
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

use crate::core::config::{Config, Settings};

pub struct RpcManager {
    client: RpcClient,
}

impl RpcManager {
    pub fn new(settings: &Settings) -> Result<Self> {
        let url = Config::rpc_url(settings);
        let commitment = match settings.commitment.as_str() {
            "processed" => CommitmentConfig::processed(),
            "finalized" => CommitmentConfig::finalized(),
            _ => CommitmentConfig::confirmed(),
        };
        let client = RpcClient::new_with_commitment(url, commitment);
        Ok(Self { client })
    }

    pub fn get_account(&self, pubkey: &Pubkey) -> Result<Account> {
        self.client
            .get_account(pubkey)
            .with_context(|| format!("Failed to fetch account: {pubkey}"))
    }

    pub fn get_multiple_accounts(&self, pubkeys: &[Pubkey]) -> Result<Vec<Option<Account>>> {
        self.client
            .get_multiple_accounts(pubkeys)
            .with_context(|| "Failed to fetch multiple accounts")
    }

    pub fn get_program_accounts_by_owner(
        &self,
        program_id: &Pubkey,
        owner: &Pubkey,
        discriminator: &[u8; 8],
    ) -> Result<Vec<(Pubkey, Account)>> {
        let filters = vec![
            RpcFilterType::Memcmp(Memcmp::new_raw_bytes(0, discriminator.to_vec())),
            RpcFilterType::Memcmp(Memcmp::new_raw_bytes(8, owner.to_bytes().to_vec())),
        ];

        let config = RpcProgramAccountsConfig {
            filters: Some(filters),
            account_config: RpcAccountInfoConfig {
                encoding: Some(UiAccountEncoding::Base64),
                commitment: Some(self.client.commitment()),
                ..Default::default()
            },
            ..Default::default()
        };

        self.client
            .get_program_accounts_with_config(program_id, config)
            .with_context(|| format!("Failed to fetch program accounts for owner: {owner}"))
    }

    pub fn simulate(
        &self,
        tx: &VersionedTransaction,
    ) -> Result<solana_client::rpc_response::RpcSimulateTransactionResult> {
        let result = self
            .client
            .simulate_transaction(tx)
            .with_context(|| "Transaction simulation failed")?;
        Ok(result.value)
    }

    pub fn send_and_confirm(&self, tx: &VersionedTransaction) -> Result<Signature> {
        self.send_and_confirm_inner(tx, false)
    }

    pub fn send_and_confirm_skip_preflight(&self, tx: &VersionedTransaction) -> Result<Signature> {
        self.send_and_confirm_inner(tx, true)
    }

    fn send_and_confirm_inner(
        &self,
        tx: &VersionedTransaction,
        skip_preflight: bool,
    ) -> Result<Signature> {
        let config = RpcSendTransactionConfig {
            skip_preflight,
            ..Default::default()
        };
        let sig = self
            .client
            .send_transaction_with_config(tx, config)
            .with_context(|| "Failed to send transaction")?;

        self.client
            .confirm_transaction_with_spinner(
                &sig,
                &self.client.get_latest_blockhash()?,
                self.client.commitment(),
            )
            .with_context(|| format!("Transaction not confirmed: {sig}"))?;

        Ok(sig)
    }

    pub fn get_latest_blockhash(&self) -> Result<Hash> {
        self.client
            .get_latest_blockhash()
            .with_context(|| "Failed to get latest blockhash")
    }

    pub fn get_sol_balance(&self, pubkey: &Pubkey) -> Result<u64> {
        self.client
            .get_balance(pubkey)
            .with_context(|| format!("Failed to get SOL balance for {pubkey}"))
    }

    pub fn get_token_balance(&self, ata: &Pubkey) -> Result<u64> {
        let balance = self
            .client
            .get_token_account_balance(ata)
            .with_context(|| format!("Failed to get token balance for {ata}"))?;
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
        self.client
            .get_health()
            .with_context(|| "RPC health check failed")?;
        Ok(())
    }

    pub fn client(&self) -> &RpcClient {
        &self.client
    }
}
