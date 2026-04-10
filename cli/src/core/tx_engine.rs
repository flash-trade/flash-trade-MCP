use anyhow::{Context, Result};
use flash_sdk::InstructionResult;
use solana_sdk::compute_budget::ComputeBudgetInstruction;
use solana_sdk::instruction::Instruction;
use solana_sdk::message::{v0, VersionedMessage};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{Keypair, Signature};
use solana_sdk::signer::Signer;
use solana_sdk::transaction::VersionedTransaction;

use crate::core::rpc::RpcManager;

pub struct TxEngine;

impl TxEngine {
    /// Assemble instructions + ALTs into a ready-to-sign set of components.
    /// Does NOT fetch blockhash — that happens at sign time for freshness.
    fn prepare_instructions(
        instruction_result: &InstructionResult,
        compute_units: u32,
        priority_fee: u64,
    ) -> Vec<Instruction> {
        let mut instructions: Vec<Instruction> = Vec::new();
        instructions.push(ComputeBudgetInstruction::set_compute_unit_limit(
            compute_units,
        ));
        instructions.push(ComputeBudgetInstruction::set_compute_unit_price(
            priority_fee,
        ));
        instructions.extend(instruction_result.instructions.clone());
        instructions
    }

    /// Fetch ALTs, get fresh blockhash, compile message, sign, and send.
    pub async fn execute(
        rpc: &RpcManager,
        instruction_result: &InstructionResult,
        keypair: &Keypair,
        alt_pubkeys: &[Pubkey],
        compute_units: u32,
        priority_fee: u64,
    ) -> Result<Signature> {
        let instructions =
            Self::prepare_instructions(instruction_result, compute_units, priority_fee);

        // Fetch ALTs — hard fail if any are missing. Building a transaction without
        // its expected ALTs could resolve wrong accounts, risking user funds.
        let mut alt_accounts = Vec::new();
        for alt_pk in alt_pubkeys {
            let alt = rpc.get_address_lookup_table(alt_pk)
                .with_context(|| format!(
                    "Failed to fetch Address Lookup Table {alt_pk}. \
                     Cannot safely build transaction without it — aborting."
                ))?;
            alt_accounts.push(alt);
        }

        // Get fresh blockhash right before compiling + signing
        let blockhash = rpc.get_latest_blockhash()?;

        let message = v0::Message::try_compile(
            &keypair.pubkey(),
            &instructions,
            &alt_accounts,
            blockhash,
        )
        .with_context(|| "Failed to compile V0 message")?;

        // Sign with all required signers
        let mut all_signers: Vec<&Keypair> = vec![keypair];
        let additional_refs: Vec<&Keypair> = instruction_result.additional_signers.iter().collect();
        all_signers.extend(additional_refs);

        let tx = VersionedTransaction::try_new(VersionedMessage::V0(message), &all_signers)
            .with_context(|| "Failed to sign transaction")?;

        // Send with skip_preflight to avoid stale-blockhash race on public RPCs
        rpc.send_and_confirm_skip_preflight(&tx)
    }
}

pub mod compute_units {
    pub const OPEN_POSITION: u32 = 150_000;
    #[allow(dead_code)]
    pub const OPEN_POSITION_SWAP: u32 = 420_000;
    pub const CLOSE_POSITION: u32 = 180_000;
    #[allow(dead_code)]
    pub const CLOSE_POSITION_SWAP: u32 = 435_000;
    pub const ADD_COLLATERAL: u32 = 120_000;
    #[allow(dead_code)]
    pub const ADD_COLLATERAL_SWAP: u32 = 420_000;
    pub const REMOVE_COLLATERAL: u32 = 120_000;
    #[allow(dead_code)]
    pub const REVERSE_POSITION: u32 = 350_000;
    #[allow(dead_code)]
    pub const REVERSE_POSITION_SWAP: u32 = 650_000;
    pub const PLACE_LIMIT_ORDER: u32 = 150_000;
    pub const CANCEL_ORDER: u32 = 100_000;
    pub const ADD_LIQUIDITY: u32 = 150_000;
    pub const REMOVE_LIQUIDITY: u32 = 150_000;
    pub const STAKE: u32 = 100_000;
    pub const UNSTAKE: u32 = 100_000;
    pub const COLLECT_FEES: u32 = 100_000;
}
