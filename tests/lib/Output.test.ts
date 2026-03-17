import { describe, it, expect } from "bun:test";
import { Output } from "../../src/lib/Output";

describe("Output", () => {
  describe("formatDollar", () => {
    it("formats small amounts with 2 decimals", () => {
      expect(Output.formatDollar(100)).toBe("$100.00");
    });

    it("formats large amounts with commas", () => {
      expect(Output.formatDollar(1234567)).toContain("1,234,567");
    });

    it("handles string input", () => {
      expect(Output.formatDollar("99.5")).toBe("$99.50");
    });
  });

  describe("formatPercentage", () => {
    it("formats positive with +", () => {
      // Strip ANSI codes for testing
      const result = Output.formatPercentage(5.97).replace(/\x1B\[[0-9;]*m/g, "");
      expect(result).toBe("+5.97%");
    });

    it("formats negative with -", () => {
      const result = Output.formatPercentage(-2.31).replace(/\x1B\[[0-9;]*m/g, "");
      expect(result).toBe("-2.31%");
    });
  });

  describe("formatSide", () => {
    it("formats LONG", () => {
      const result = Output.formatSide("long").replace(/\x1B\[[0-9;]*m/g, "");
      expect(result).toBe("LONG");
    });

    it("formats SHORT", () => {
      const result = Output.formatSide("short").replace(/\x1B\[[0-9;]*m/g, "");
      expect(result).toBe("SHORT");
    });
  });

  describe("formatLeverage", () => {
    it("formats with 1 decimal", () => {
      expect(Output.formatLeverage(10)).toBe("10.0x");
    });
  });

  describe("formatSignature", () => {
    it("truncates long signatures", () => {
      const sig = "7xKXpqw3mNPr9bYZqf7DeaBC123456789abcdef";
      const result = Output.formatSignature(sig);
      expect(result).toBe("7xKXpq...cdef");
    });

    it("doesn't truncate short strings", () => {
      expect(Output.formatSignature("short")).toBe("short");
    });
  });
});
