import { describe, it, expect } from "bun:test";
import { ErrorHandler } from "../../src/lib/ErrorHandler";

describe("ErrorHandler", () => {
  describe("extractCode", () => {
    it("extracts Custom code from string (Method 1)", () => {
      expect(ErrorHandler.extractCode({ message: '"Custom": 6020' })).toBe("6020");
    });

    it("extracts hex code (Method 2)", () => {
      expect(ErrorHandler.extractCode({ message: "custom program error: 0x1784" })).toBe("6020");
    });

    it("extracts hash code (Method 3)", () => {
      expect(ErrorHandler.extractCode({ message: "custom program error: #6020" })).toBe("6020");
    });

    it("extracts Anchor error number (Method 4)", () => {
      expect(ErrorHandler.extractCode({ message: "Error Number: 6020" })).toBe("6020");
    });

    it("extracts from .code property (Method 5)", () => {
      expect(ErrorHandler.extractCode({ code: 6020 })).toBe("6020");
    });

    it("extracts from InstructionError (Method 6)", () => {
      expect(ErrorHandler.extractCode({
        InstructionError: [0, { Custom: 6020 }],
      })).toBe("6020");
    });

    it("extracts from v2 SolanaError context (Method 7)", () => {
      expect(ErrorHandler.extractCode({
        context: { err: { InstructionError: [0, { Custom: 6033 }] } },
      })).toBe("6033");
    });

    it("traverses cause chain (Method 8)", () => {
      expect(ErrorHandler.extractCode({
        message: "wrapper",
        cause: { cause: { message: '"Custom": 6019' } },
      })).toBe("6019");
    });

    it("returns null for unknown errors", () => {
      expect(ErrorHandler.extractCode({ message: "something random" })).toBeNull();
    });
  });

  describe("getMessage", () => {
    it("maps slippage codes", () => {
      expect(ErrorHandler.getMessage("6020")).toContain("Slippage");
      expect(ErrorHandler.getMessage("6019")).toContain("Slippage");
    });

    it("maps close-only mode", () => {
      expect(ErrorHandler.getMessage("6033")).toContain("close-only");
    });

    it("maps leverage exceeded", () => {
      expect(ErrorHandler.getMessage("6021")).toContain("leverage");
    });

    it("returns generic for unknown codes", () => {
      expect(ErrorHandler.getMessage("9999")).toContain("9999");
    });

    it("returns Unknown for null", () => {
      expect(ErrorHandler.getMessage(null)).toBe("Unknown error");
    });
  });

  describe("isUserRejection", () => {
    it("detects user rejection messages", () => {
      expect(ErrorHandler.isUserRejection({ message: "User rejected the request" })).toBe(true);
      expect(ErrorHandler.isUserRejection({ message: "User declined" })).toBe(true);
      expect(ErrorHandler.isUserRejection({ name: "WalletSignTransactionError" })).toBe(true);
    });

    it("rejects non-rejection errors", () => {
      expect(ErrorHandler.isUserRejection({ message: "custom program error: 0x1784" })).toBe(false);
    });
  });

  describe("formatError", () => {
    it("formats known program errors", () => {
      const result = ErrorHandler.formatError({ message: '"Custom": 6032' });
      expect(result).toContain("utilization");
    });

    it("formats user rejections", () => {
      const result = ErrorHandler.formatError({ message: "User rejected the request" });
      expect(result).toBe("Transaction cancelled.");
    });

    it("falls back to pattern matching", () => {
      const result = ErrorHandler.formatError({ message: "insufficient lamports" });
      expect(result).toContain("Insufficient SOL");
    });
  });
});
