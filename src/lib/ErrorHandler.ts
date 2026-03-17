const PROGRAM_ERROR_CODES: Record<string, { name: string; message: string }> = {
  "6000": { name: "MultiSigAccountNotAuthorized", message: "Multisig account not authorized" },
  "6001": { name: "MultiSigAlreadySigned", message: "Multisig already signed" },
  "6002": { name: "MultiSigAlreadyExecuted", message: "Multisig already executed" },
  "6003": { name: "MathOverflow", message: "Math calculation overflow" },
  "6004": { name: "UnsupportedOracle", message: "Unsupported oracle type" },
  "6005": { name: "InvalidOracleAccount", message: "Invalid oracle account" },
  "6006": { name: "StaleOraclePrice", message: "Oracle price is stale — try again" },
  "6007": { name: "InvalidOraclePrice", message: "Invalid oracle price data" },
  "6008": { name: "InvalidEnvironment", message: "Invalid environment configuration" },
  "6009": { name: "InvalidPoolState", message: "Invalid pool state" },
  "6010": { name: "InvalidCustodyState", message: "Invalid custody state" },
  "6011": { name: "InvalidPositionState", message: "Invalid position state" },
  "6012": { name: "InvalidPerpetualsConfig", message: "Invalid perpetuals configuration" },
  "6013": { name: "InvalidPoolConfig", message: "Invalid pool configuration" },
  "6014": { name: "InvalidInstruction", message: "Invalid instruction" },
  "6015": { name: "InvalidCustodyBalance", message: "Invalid custody balance" },
  "6016": { name: "InvalidArgument", message: "Invalid argument provided" },
  "6017": { name: "InvalidFilesystem", message: "Invalid filesystem operation" },
  "6018": { name: "InsufficientTokenAmount", message: "Insufficient token balance" },
  "6019": { name: "InsufficientAmountReturned", message: "Slippage exceeded — try increasing slippage tolerance" },
  "6020": { name: "MaxPriceSlippage", message: "Slippage exceeded — try increasing slippage tolerance" },
  "6021": { name: "MaxLeverage", message: "Maximum leverage exceeded for this market" },
  "6022": { name: "MaxInitLeverage", message: "Initial leverage limit exceeded" },
  "6023": { name: "CustodyAmountLimit", message: "Custody amount limit exceeded" },
  "6024": { name: "PositionAmountLimit", message: "Position amount limit exceeded" },
  "6025": { name: "TokenRatioOutOfRange", message: "Token ratio out of range" },
  "6026": { name: "UnsupportedToken", message: "Token not supported in this pool" },
  "6027": { name: "InsufficientPoolAmount", message: "Insufficient pool liquidity for this trade" },
  "6028": { name: "CollateralSlippage", message: "Collateral slippage exceeded" },
  "6029": { name: "MaxGlobalLongSizes", message: "Global long size limit exceeded" },
  "6030": { name: "MaxGlobalShortSizes", message: "Global short size limit exceeded" },
  "6031": { name: "InvalidOracleMaxDivergence", message: "Oracle price divergence too high" },
  "6032": { name: "MaxUtilization", message: "Pool utilization too high — try a smaller position or different pool" },
  "6033": { name: "CloseOnlyMode", message: "Market is in close-only mode due to volatility" },
  "6034": { name: "LiquidationPrice", message: "Position would be immediately liquidatable" },
  "6035": { name: "InvalidFees", message: "Invalid fee calculation" },
  "6036": { name: "InvalidTriggerPrice", message: "Invalid trigger price" },
  "6037": { name: "PriceImpactTooLarge", message: "Price impact too large for this trade size" },
  "6038": { name: "InvalidLpAmount", message: "Invalid LP token amount" },
  "6039": { name: "PoolDepositLimit", message: "Pool deposit limit reached" },
  "6040": { name: "DegenModeNotAllowed", message: "Degen mode not available for this market" },
  "6041": { name: "InvalidMarketState", message: "Invalid market state" },
  "6042": { name: "InvalidOrderState", message: "Invalid order state" },
  "6043": { name: "OrderNotFound", message: "Order not found" },
  "6044": { name: "PositionNotFound", message: "Position not found" },
  "6045": { name: "InvalidOwner", message: "Invalid position owner" },
  "6046": { name: "InvalidDelegate", message: "Invalid delegate" },
  "6047": { name: "StakeNotFound", message: "Stake account not found" },
  "6048": { name: "StakeCooldown", message: "Unstaking cooldown period not met — try again later" },
  "6049": { name: "InvalidStopLossPrice", message: "Invalid stop loss price — must be below entry for longs, above for shorts" },
  "6050": { name: "InvalidTakeProfitPrice", message: "Invalid take profit price — must be above entry for longs, below for shorts" },
  "6051": { name: "ExposureLimitExceeded", message: "Exposure limit exceeded for this pool" },
};

const INSTRUCTION_ERRORS: Record<string, string> = {
  InvalidArgument: "Invalid transaction argument",
  ProgramFailedToComplete: "Transaction failed — please try again",
  InsufficientFunds: "Insufficient funds for transaction",
  AccountAlreadyInitialized: "Account already initialized",
  AccountNotRentExempt: "Insufficient SOL for account rent",
};

const FALLBACK_PATTERNS: [RegExp, string][] = [
  [/insufficient.*(?:lamports|funds|SOL)/i, "Insufficient SOL balance for transaction fees"],
  [/User rejected|User declined|WalletSign/i, "Transaction cancelled by user"],
  [/Failed to fetch|NetworkError|ECONNREFUSED/i, "Network error — check your connection and RPC endpoint"],
  [/blockhash not found|expired/i, "Transaction expired — please retry"],
  [/Account does not exist/i, "Account not found — may have already been closed"],
];

export class ErrorHandler {
  /**
   * Extract error code from any error shape using 8 extraction methods.
   * Mirrors the Flash Trade frontend's error extraction pipeline.
   */
  static extractCode(error: any): string | null {
    const errorString = String(error?.message ?? error ?? "");

    // Method 1: Direct Custom — "Custom": NNNN
    let match = errorString.match(/"Custom"\s*:\s*(\d+)/);
    if (match) return match[1];

    // Method 2: Hex format — custom program error: 0xNNNN
    match = errorString.match(/custom program error:\s*0x([0-9a-fA-F]+)/);
    if (match) return String(parseInt(match[1], 16));

    // Method 3: Hash format — custom program error: #NNNN
    match = errorString.match(/custom program error:\s*#(\d+)/);
    if (match) return match[1];

    // Method 4: Anchor Number — Error Number: NNNN
    match = errorString.match(/Error Number:\s*(\d+)/);
    if (match) return match[1];

    // Method 5: Direct .code property
    if (error?.code !== undefined && !isNaN(Number(error.code))) return String(error.code);

    // Method 6: InstructionError nested object
    const instrErr = error?.InstructionError ?? error?.err?.InstructionError;
    if (Array.isArray(instrErr) && instrErr[1]?.Custom !== undefined) {
      return String(instrErr[1].Custom);
    }

    // Method 7: v2 SolanaError .context
    if (error?.context?.Custom !== undefined) return String(error.context.Custom);
    if (error?.context?.err?.Custom !== undefined) return String(error.context.err.Custom);
    if (error?.context?.err?.InstructionError) {
      const inner = error.context.err.InstructionError[1];
      if (inner?.Custom !== undefined) return String(inner.Custom);
    }

    // Method 8: Cause chain traversal (10 levels deep)
    let cause = error?.cause;
    for (let i = 0; i < 10 && cause; i++) {
      const code = ErrorHandler.extractCode(cause);
      if (code) return code;
      cause = cause?.cause;
    }

    return null;
  }

  /** Get user-friendly message for an error code */
  static getMessage(code: string | null): string {
    if (!code) return "Unknown error";
    const entry = PROGRAM_ERROR_CODES[code];
    if (entry) return entry.message;
    return `Program error code: ${code}`;
  }

  /** Get error name for an error code */
  static getErrorName(code: string | null): string | null {
    if (!code) return null;
    return PROGRAM_ERROR_CODES[code]?.name ?? null;
  }

  /** Check if the error is a user rejection (wallet declined) */
  static isUserRejection(error: any): boolean {
    const s = String(error?.message ?? error?.name ?? error ?? "");
    return (
      s.includes("User rejected") ||
      s.includes("User declined") ||
      s.includes("WalletSignTransactionError") ||
      s.includes("WalletSendTransactionError")
    );
  }

  /** Format any error into a user-friendly string for CLI output */
  static formatError(error: any, action?: string): string {
    if (ErrorHandler.isUserRejection(error)) {
      return "Transaction cancelled.";
    }

    const code = ErrorHandler.extractCode(error);
    if (code) {
      const msg = ErrorHandler.getMessage(code);
      const name = ErrorHandler.getErrorName(code);
      return name ? `${msg} [${name}]` : msg;
    }

    // Check instruction-level errors
    const instrErr = error?.InstructionError ?? error?.err?.InstructionError;
    if (Array.isArray(instrErr) && typeof instrErr[1] === "string") {
      const msg = INSTRUCTION_ERRORS[instrErr[1]];
      if (msg) return msg;
    }

    // Fallback to string pattern matching
    const s = String(error?.message ?? error ?? "");
    for (const [pattern, message] of FALLBACK_PATTERNS) {
      if (pattern.test(s)) return message;
    }

    // Last resort
    const prefix = action ? `Failed to ${action}: ` : "";
    return `${prefix}${s.slice(0, 200)}`;
  }
}
