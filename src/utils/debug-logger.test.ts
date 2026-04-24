import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { debugLogger, createDebugLogger, DEBUG_CATEGORIES } from "./debug-logger.js";

describe("DebugLogger", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.DEBUG_CATEGORY;
    delete process.env.DEBUG_CATEGORY;
    // Reset logger state by recreating it
    Object.defineProperty(debugLogger, "categoryConfig", {
      value: new Map(),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(debugLogger, "defaultEnabled", {
      value: false,
      writable: true,
      configurable: true,
    });
    (debugLogger as unknown as { categoryConfig: Map<string, unknown>; defaultEnabled: boolean }).categoryConfig = new Map();
    (debugLogger as unknown as { categoryConfig: Map<string, unknown>; defaultEnabled: boolean }).defaultEnabled = false;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DEBUG_CATEGORY = originalEnv;
    } else {
      delete process.env.DEBUG_CATEGORY;
    }
  });

  describe("isEnabled", () => {
    it("should return false when no categories are configured", () => {
      expect(debugLogger.isEnabled("tool-calls")).toBe(false);
    });

    it("should enable exact category match", () => {
      debugLogger.enable("tool-calls");
      expect(debugLogger.isEnabled("tool-calls")).toBe(true);
      expect(debugLogger.isEnabled("api")).toBe(false);
    });

    it("should enable multiple categories", () => {
      debugLogger.enable("tool-calls");
      debugLogger.enable("api");
      debugLogger.enable("subagents");

      expect(debugLogger.isEnabled("tool-calls")).toBe(true);
      expect(debugLogger.isEnabled("api")).toBe(true);
      expect(debugLogger.isEnabled("subagents")).toBe(true);
      expect(debugLogger.isEnabled("config")).toBe(false);
    });

    it("should enable parent category for hierarchical categories", () => {
      debugLogger.enable("tool-calls");
      expect(debugLogger.isEnabled("tool-calls.read")).toBe(true);
      expect(debugLogger.isEnabled("tool-calls.write")).toBe(true);
      expect(debugLogger.isEnabled("tool-calls.edit")).toBe(true);
    });

    it("should not enable parent when only child is configured", () => {
      debugLogger.enable("tool-calls.read");
      expect(debugLogger.isEnabled("tool-calls.read")).toBe(true);
      expect(debugLogger.isEnabled("tool-calls")).toBe(false);
      expect(debugLogger.isEnabled("tool-calls.write")).toBe(false);
    });

    it("should enable all categories with 'all' or '*'", () => {
      debugLogger.enable("all");
      expect(debugLogger.isEnabled("tool-calls")).toBe(true);
      expect(debugLogger.isEnabled("api")).toBe(true);
      expect(debugLogger.isEnabled("any-category")).toBe(true);
    });

    it("should handle case-insensitive categories", () => {
      debugLogger.enable("TOOL-CALLS");
      expect(debugLogger.isEnabled("tool-calls")).toBe(true);
      expect(debugLogger.isEnabled("Tool-Calls")).toBe(true);
    });
  });

  describe("enable/disable", () => {
    it("should enable and disable categories", () => {
      debugLogger.enable("tool-calls");
      expect(debugLogger.isEnabled("tool-calls")).toBe(true);

      debugLogger.disable("tool-calls");
      expect(debugLogger.isEnabled("tool-calls")).toBe(false);
    });

    it("should return enabled categories list", () => {
      debugLogger.enable("tool-calls");
      debugLogger.enable("api");

      const enabled = debugLogger.getEnabledCategories();
      expect(enabled).toContain("tool-calls");
      expect(enabled).toContain("api");
      expect(enabled).not.toContain("config");
    });

    it("should return ['all'] when all is enabled", () => {
      debugLogger.enable("all");
      expect(debugLogger.getEnabledCategories()).toEqual(["all"]);
    });
  });

  describe("createDebugLogger", () => {
    it("should create a scoped logger", () => {
      const logger = createDebugLogger("tool-calls");
      debugLogger.enable("tool-calls");

      expect(logger.isEnabled()).toBe(true);
    });

    it("scoped logger should respect category enablement", () => {
      const logger = createDebugLogger("tool-calls");

      debugLogger.enable("tool-calls");
      expect(logger.isEnabled()).toBe(true);

      debugLogger.disable("tool-calls");
      expect(logger.isEnabled()).toBe(false);
    });
  });

  describe("DEBUG_CATEGORIES", () => {
    it("should have predefined category constants", () => {
      expect(DEBUG_CATEGORIES.TOOL_CALLS).toBe("tool-calls");
      expect(DEBUG_CATEGORIES.API).toBe("api");
      expect(DEBUG_CATEGORIES.SUBAGENTS).toBe("subagents");
      expect(DEBUG_CATEGORIES.MEMORY).toBe("memory");
    });
  });
});
