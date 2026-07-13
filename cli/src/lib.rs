// ─────────────────────────────────────────────────────────────────────────────
// flash-cli library root. Exposes the CLI's modules so the binary (main.rs) and
// the external test suites (tests/unit, tests/integration) share ONE definition
// of each — the two-chain routing table, the API DTOs, and the mark-price math
// are tested against the real code, not a copy.
// ─────────────────────────────────────────────────────────────────────────────

pub mod cli;
pub mod commands;
pub mod core;
pub mod error;
pub mod output;
