// Unit suite — exercises the real flash_cli internals (no duplicated logic), so
// the two-chain routing table, the API DTOs, and the mark-price math are guarded
// against drift.
mod api_test;
mod compute_test;
mod config_test;
mod network_test;
mod wallet_test;
