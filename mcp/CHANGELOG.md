# Changelog

## 0.5.1 — patch

### Fixed
- The server now reports its real package version in the MCP `serverInfo` handshake (read from `package.json`) instead of a hardcoded string that had drifted to `1.0.0`.

## 0.5.0 — V2-only rewrite

Rebuilt from scratch against the Flash Trade **V2** API (MagicBlock Ephemeral Rollup). All V1 paths, concepts, and the position-key request model were removed.

### Added
- **Account lifecycle tools** (base chain): `init_basket`, `init_deposit_ledger`, `delegate_basket`, `deposit_direct`.
- **Withdrawal tools** (base chain, two-step): `request_withdrawal`, `execute_withdrawal` (handles the `0xbc4` settlement-timing state).
- **New trading tools**: `place_tp_sl` (atomic bracket), `edit_limit_order`, `cancel_limit_order`.
- **`get_owner`** — the consolidated V2 read model (setup status + positions + orders); `get_tokens` (mints + Token-2022 flag); `get_basket` (raw basket by PDA, doubles as a setup diagnostic).
- **Two-chain routing**: every transaction tool states its target chain; `sign_and_send` takes a **required** `network` (`"er"` | `"base"`) argument.
- **Mark-price PnL**: positions render PnL/leverage/liquidation computed from the live mark price, not the spread-distorted indexer values.
- **Four-channel error normalization** (`body-err` / `http-400` / `http-422` / `http-500`) with actionable hints.

### Changed (breaking)
- Default `FLASH_API_URL` is the live root `https://flashapi.trade` (the `/v2` edge prefix is not deployed).
- New env `ER_RPC_URL` (Ephemeral Rollup, trading txs); `SOLANA_RPC_URL` is now the base-chain RPC for setup/withdrawal.
- Position operations identify the position by `market_symbol` + `side` (V2 has no position key).
- `get_positions` / `get_orders` require an `owner` and are sourced from the single `/owner` snapshot; reads use `/raw/*` accounts.
- `open_position` makes `owner` optional — omitting it returns a free quote.
- Tool **names** are preserved for existing consumers; request/response shapes and env vars changed.

### Notes
- `execute_withdrawal` returns 404 on the current live dev deployment (the endpoint is not yet live there); the tool is implemented per the spec and canonical client and will function once deployed.
- `@modelcontextprotocol/sdk` stays on 1.x; the v2 migration (raw shapes → wrapped schema objects) is future work.
