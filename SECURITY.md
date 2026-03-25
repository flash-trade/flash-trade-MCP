# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.3.x (mcp) | Yes |
| 0.1.x (cli) | Yes |

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Please report security findings via [GitHub's private vulnerability reporting](https://github.com/flash-trade/flash-trade-MCP/security/advisories/new).

Include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Any suggested fix

We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Scope

- MCP server (`mcp/`) -- TypeScript, handles Solana keypairs and transactions
- CLI (`cli/`) -- Rust, handles Solana keypairs and transactions
- GitHub Actions workflows (`.github/`)

## Out of Scope

- The Flash Trade API itself (report to Flash Trade directly)
- Third-party dependencies (report to their maintainers, but let us know if it affects this project)
