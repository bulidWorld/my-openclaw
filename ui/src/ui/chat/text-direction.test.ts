import { describe, expect, it } from "vitest";
import { detectTextDirection } from "./text-direction.ts";

describe("detectTextDirection", () => {
  it("returns ltr for null and empty input", () => {
    expect(detectTextDirection(null)).toBe("ltr");
    expect(detectTextDirection("")).toBe("ltr");
  });

  it("detects rtl for Hebrew text", () => {
    expect(detectTextDirection("שלום עולם")).toBe("rtl");
    expect(detectTextDirection("**שלום")).toBe("rtl");
  });

  it("detects rtl for Arabic text", () => {
    expect(detectTextDirection("مرحبا")).toBe("rtl");
    expect(detectTextDirection("# مرحبا")).toBe("rtl");
  });

  it("detects ltr for English text", () => {
    expect(detectTextDirection("Hello world")).toBe("ltr");
    expect(detectTextDirection("- hello")).toBe("ltr");
  });

  it("skips leading whitespace", () => {
    expect(detectTextDirection("   Hello")).toBe("ltr");
    expect(detectTextDirection("   שלום")).toBe("rtl");
  });

  it("skips leading punctuation", () => {
    expect(detectTextDirection("...Hello")).toBe("ltr");
    expect(detectTextDirection("!!!مرحبا")).toBe("rtl");
  });

  it("skips markdown formatting prefixes", () => {
    expect(detectTextDirection("**bold text**")).toBe("ltr");
    expect(detectTextDirection("*italic*")).toBe("ltr");
    expect(detectTextDirection("# Heading")).toBe("ltr");
    expect(detectTextDirection("## Heading 2")).toBe("ltr");
    expect(detectTextDirection("> blockquote")).toBe("ltr");
    expect(detectTextDirection("- list item")).toBe("ltr");
    expect(detectTextDirection("1. numbered")).toBe("ltr");
  });

  it("handles mixed rtl and ltr text", () => {
    // First significant character determines direction
    expect(detectTextDirection("Hello שלום")).toBe("ltr");
    expect(detectTextDirection("שלום Hello")).toBe("rtl");
  });

  it("handles Unicode scripts beyond Hebrew and Arabic", () => {
    // Syriac
    expect(detectTextDirection("ܫܠܡ")).toBe("rtl");
    // Thaana (Dhivehi)
    expect(detectTextDirection("ސަލާމް")).toBe("rtl");
  });

  it("returns ltr when only punctuation is present", () => {
    expect(detectTextDirection("...")).toBe("ltr");
    expect(detectTextDirection("!!!")).toBe("ltr");
    expect(detectTextDirection("   ")).toBe("ltr");
  });
});
