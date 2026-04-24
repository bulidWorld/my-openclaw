/**
 * Debug Logger utility for OpenClaw
 *
 * Usage:
 *   const logger = createDebugLogger("tool-calls");
 *   logger.log("Tool call started:", { name: "read", path: "/file.txt" });
 *
 * Enable via environment variable:
 *   DEBUG_CATEGORY=tool-calls pnpm dev
 *   DEBUG_CATEGORY=tool-calls,api pnpm dev
 *   DEBUG_CATEGORY=tool-calls,api,subagents pnpm dev
 */

type LogLevel = "log" | "warn" | "error" | "info" | "debug";

type CategoryConfig = {
  enabled: boolean;
  prefix: string;
};

class DebugLogger {
  private categoryConfig: Map<string, CategoryConfig>;
  private defaultEnabled: boolean;

  constructor() {
    this.categoryConfig = new Map();
    this.defaultEnabled = false;
    this.parseEnvConfig();
  }

  private parseEnvConfig(): void {
    const debugEnv = process.env.DEBUG_CATEGORY;
    if (!debugEnv) {
      return;
    }



    
    // Parse comma-separated categories: "tool-calls,api,subagents"
    const categories = debugEnv
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);

    if (categories.includes("all") || categories.includes("*")) {
      this.defaultEnabled = true;
      return;
    }

    for (const category of categories) {
      this.categoryConfig.set(category, {
        enabled: true,
        prefix: category,
      });
    }
  }

  /**
   * Check if a category is enabled.
   * Supports hierarchical categories with dot notation:
   *   - "tool-calls" enables "tool-calls.read", "tool-calls.write", etc.
   *   - "tool-calls.read" only enables that specific sub-category
   */
  isEnabled(category: string): boolean {
    // If defaultEnabled is true (e.g., "all" or "*" was set), enable everything
    if (this.defaultEnabled) {
      return true;
    }

    const normalizedCategory = category.toLowerCase();

    // Check exact match
    const exactMatch = this.categoryConfig.get(normalizedCategory);
    if (exactMatch) {
      return exactMatch.enabled;
    }

    // Check parent categories (e.g., "tool-calls" enables "tool-calls.read")
    const parts = normalizedCategory.split(".");
    for (let i = 1; i < parts.length; i++) {
      const parentCategory = parts.slice(0, i).join(".");
      const parentConfig = this.categoryConfig.get(parentCategory);
      if (parentConfig?.enabled) {
        return true;
      }
    }

    // Check wildcard sub-category (e.g., "tool-calls.*" enables all tool-calls sub-categories)
    const wildcardCategory = `${normalizedCategory.split(".")[0]}.*`;
    const wildcardConfig = this.categoryConfig.get(wildcardCategory);
    if (wildcardConfig?.enabled) {
      return true;
    }

    return this.defaultEnabled;
  }

  /**
   * Enable a category programmatically
   */
  enable(category: string): void {
    const normalized = category.toLowerCase();
    // Special handling for "all" or "*" - enable default mode
    if (normalized === "all" || normalized === "*") {
      this.defaultEnabled = true;
      return;
    }
    this.categoryConfig.set(normalized, { enabled: true, prefix: normalized });
  }

  /**
   * Disable a category programmatically
   */
  disable(category: string): void {
    const normalized = category.toLowerCase();
    this.categoryConfig.set(normalized, { enabled: false, prefix: normalized });
  }

  /**
   * Get all enabled categories
   */
  getEnabledCategories(): string[] {
    if (this.defaultEnabled) {
      return ["all"];
    }
    return Array.from(this.categoryConfig.entries())
      .filter(([, config]) => config.enabled)
      .map(([category]) => category);
  }

  private formatMessage(category: string, level: LogLevel, args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const categoryUpper = category.toUpperCase();
    const levelTag = `[${level.toUpperCase()}]`;

    // Try to format objects as JSON for readability
    const formattedArgs = args.map((arg) => {
      if (typeof arg === "object" && arg !== null) {
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    });

    return `[${timestamp}] ${levelTag} [${categoryUpper}] ${formattedArgs.join(" ")}`;
  }

  private logWithLevel(category: string, level: LogLevel, ...args: unknown[]): void {
    if (!this.isEnabled(category)) {
      return;
    }

    const formattedMessage = this.formatMessage(category, level, args);

    switch (level) {
      case "log":
        console.log(formattedMessage);
        break;
      case "warn":
        console.warn(formattedMessage);
        break;
      case "error":
        console.error(formattedMessage);
        break;
      case "info":
        console.info(formattedMessage);
        break;
      case "debug":
        console.debug(formattedMessage);
        break;
    }
  }

  log(category: string, ...args: unknown[]): void {
    this.logWithLevel(category, "log", ...args);
  }

  info(category: string, ...args: unknown[]): void {
    this.logWithLevel(category, "info", ...args);
  }

  warn(category: string, ...args: unknown[]): void {
    this.logWithLevel(category, "warn", ...args);
  }

  error(category: string, ...args: unknown[]): void {
    this.logWithLevel(category, "error", ...args);
  }

  debug(category: string, ...args: unknown[]): void {
    this.logWithLevel(category, "debug", ...args);
  }

  /**
   * Create a scoped logger for a specific category
   */
  forCategory(category: string): ScopedDebugLogger {
    return new ScopedDebugLogger(this, category);
  }
}

/**
 * Scoped logger that's bound to a specific category
 */
class ScopedDebugLogger {
  constructor(
    private logger: DebugLogger,
    private category: string,
  ) {}

  log(...args: unknown[]): void {
    this.logger.log(this.category, ...args);
  }

  info(...args: unknown[]): void {
    this.logger.info(this.category, ...args);
  }

  warn(...args: unknown[]): void {
    this.logger.warn(this.category, ...args);
  }

  error(...args: unknown[]): void {
    this.logger.error(this.category, ...args);
  }

  debug(...args: unknown[]): void {
    this.logger.debug(this.category, ...args);
  }

  isEnabled(): boolean {
    return this.logger.isEnabled(this.category);
  }
}

// Singleton instance
const globalLogger = new DebugLogger();

// Create and export scoped logger factories for common categories
export const debugLogger = globalLogger;

export function createDebugLogger(category: string): ScopedDebugLogger {
  return globalLogger.forCategory(category);
}

// Pre-defined category constants
export const DEBUG_CATEGORIES = {
  TOOL_CALLS: "tool-calls",
  TOOL_RESULTS: "tool-results",
  API: "api",
  SUBAGENTS: "subagents",
  SESSIONS: "sessions",
  CONFIG: "config",
  CHANNELS: "channels",
  CRON: "cron",
  MCP: "mcp",
  ACP: "acp",
  HOOKS: "hooks",
  PLUGINS: "plugins",
  MEMORY: "memory",
  CONTEXT: "context",
  COMPACT: "compaction",
  ALL: "all",
} as const;

export type DebugCategory = (typeof DEBUG_CATEGORIES)[keyof typeof DEBUG_CATEGORIES];
