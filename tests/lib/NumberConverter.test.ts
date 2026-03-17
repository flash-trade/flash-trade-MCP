import { describe, it, expect } from "bun:test";
import { NumberConverter } from "../../src/lib/NumberConverter";
import { BN } from "bn.js";

describe("NumberConverter", () => {
  describe("toNative (string → BN)", () => {
    it("converts USDC correctly", () => {
      expect(NumberConverter.toNative("100", 6).toString()).toBe("100000000");
    });

    it("handles the 1.005 precision edge case", () => {
      // This is the critical test — JS number gives 1004999.9999...
      expect(NumberConverter.toNative("1.005", 6).toString()).toBe("1005000");
    });

    it("converts SOL with 9 decimals", () => {
      expect(NumberConverter.toNative("1.5", 9).toString()).toBe("1500000000");
    });

    it("handles zero", () => {
      expect(NumberConverter.toNative("0", 9).toString()).toBe("0");
    });

    it("handles very small amounts", () => {
      expect(NumberConverter.toNative("0.000000001", 9).toString()).toBe("1");
    });

    it("rounds down — never rounds up", () => {
      expect(NumberConverter.toNative("1.9999999", 6).toString()).toBe("1999999");
    });

    it("handles large amounts", () => {
      expect(NumberConverter.toNative("1000000", 6).toString()).toBe("1000000000000");
    });
  });

  describe("usdToNative", () => {
    it("converts USD shorthand", () => {
      expect(NumberConverter.usdToNative("50").toString()).toBe("50000000");
    });
  });

  describe("fromNative (BN → string)", () => {
    it("converts lamports to SOL", () => {
      expect(NumberConverter.fromNative(new BN("1500000000"), 9)).toBe("1.500000000");
    });

    it("converts with precision", () => {
      expect(NumberConverter.fromNative(new BN("1500000000"), 9, 2)).toBe("1.50");
    });

    it("converts USDC", () => {
      expect(NumberConverter.fromNativeUsd(new BN("100000000"))).toBe("100.00");
    });
  });

  describe("isValidAmount", () => {
    it("accepts valid amounts", () => {
      expect(NumberConverter.isValidAmount("100")).toBe(true);
      expect(NumberConverter.isValidAmount("0.001")).toBe(true);
    });

    it("rejects invalid amounts", () => {
      expect(NumberConverter.isValidAmount("")).toBe(false);
      expect(NumberConverter.isValidAmount("abc")).toBe(false);
      expect(NumberConverter.isValidAmount("-5")).toBe(false);
    });
  });
});
