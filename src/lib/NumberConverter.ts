import BigNumber from "bignumber.js";
import BN from "bn.js";

// Configure BigNumber to never use exponential notation
BigNumber.config({ EXPONENTIAL_AT: 1e9 });

const USD_DECIMALS = 6;

export class NumberConverter {
  /**
   * Convert human-readable string amount to on-chain BN.
   * CRITICAL: Takes string, NOT number. Avoids floating-point precision loss.
   * Mirrors flash-sdk's uiDecimalsToNative().
   */
  static toNative(amount: string, decimals: number): BN {
    const value = new BigNumber(amount).multipliedBy(new BigNumber(10).pow(decimals));
    return new BN(value.toFixed(0, BigNumber.ROUND_DOWN));
  }

  /** Shorthand: USD string → native BN (6 decimals) */
  static usdToNative(amountUsd: string): BN {
    return NumberConverter.toNative(amountUsd, USD_DECIMALS);
  }

  /**
   * Convert on-chain BN to human-readable string.
   * Mirrors flash-sdk's nativeToUiDecimals().
   */
  static fromNative(amount: BN, decimals: number, precision?: number): string {
    const p = precision ?? decimals;
    const denominator = new BigNumber(10).pow(decimals);
    return new BigNumber(amount.toString()).div(denominator).toFixed(p, BigNumber.ROUND_DOWN);
  }

  /** Shorthand: native BN → USD string (6 decimals, 2 precision) */
  static fromNativeUsd(amount: BN, precision: number = 2): string {
    return NumberConverter.fromNative(amount, USD_DECIMALS, precision);
  }

  /**
   * Convert BN to number for display purposes ONLY.
   * WARNING: Do NOT use the returned number for further math.
   */
  static toDisplayNumber(amount: BN, decimals: number): number {
    return parseFloat(NumberConverter.fromNative(amount, decimals));
  }

  /** Validate that a string is a valid positive number */
  static isValidAmount(str: string): boolean {
    if (!str || str.trim() === "") return false;
    const n = new BigNumber(str);
    return !n.isNaN() && n.isPositive();
  }
}
