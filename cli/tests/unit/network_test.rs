// The two-chain routing table is the single source of truth for where each
// transaction submits. These assertions ARE that contract: trading → ER,
// setup + withdrawal → base, unknown → base (safe default).

use flash_cli::core::network::{chain_for, Chain, Network};

#[test]
fn trading_endpoints_route_to_the_ephemeral_rollup() {
    for path in [
        "open-position",
        "close-position",
        "reverse-position",
        "add-collateral",
        "remove-collateral",
        "place-tp-sl",
        "place-trigger-order",
        "edit-trigger-order",
        "cancel-trigger-order",
        "cancel-all-trigger-orders",
        "edit-limit-order",
        "cancel-limit-order",
    ] {
        assert_eq!(chain_for(path), Chain::Er, "{path} must route to the ER");
    }
}

#[test]
fn setup_and_withdrawal_endpoints_route_to_the_base_chain() {
    for path in [
        "init-basket",
        "init-deposit-ledger",
        "delegate-basket",
        "deposit-direct",
        "request-withdrawal",
        "execute-withdrawal",
    ] {
        assert_eq!(chain_for(path), Chain::Base, "{path} must route to base");
    }
}

#[test]
fn unknown_endpoint_defaults_to_base() {
    assert_eq!(chain_for("something-new"), Chain::Base);
    assert_eq!(chain_for(""), Chain::Base);
}

#[test]
fn rpc_for_selects_the_matching_endpoint() {
    let net = Network::default();
    assert_eq!(net.rpc_for(Chain::Er), net.er_rpc);
    assert_eq!(net.rpc_for(Chain::Base), net.base_rpc);
    assert_ne!(net.er_rpc, net.base_rpc, "ER and base must be distinct RPCs");
}

#[test]
fn defaults_target_the_verified_v2_topology() {
    let net = Network::default();
    // API base is ROOT — the /v2 edge prefix is not deployed.
    assert_eq!(net.api_base, "https://flashapi.trade");
    assert!(!net.api_base.ends_with("/v2"));
    assert_eq!(net.er_rpc, "https://flash.magicblock.xyz");
    assert_eq!(net.base_rpc, "https://api.mainnet-beta.solana.com");
}

#[test]
fn chain_labels_are_human_readable() {
    assert_eq!(Chain::Er.label(), "Ephemeral Rollup");
    assert_eq!(Chain::Base.label(), "base chain");
}
