/**
 * Tool Call Logger - Example usage of debug-logger for tool calls
 *
 * Usage:
 *   OPENCLAW_DEBUG=tool-calls pnpm dev
 *   OPENCLAW_DEBUG=tool-calls,tool-results pnpm dev
 */

import { createDebugLogger, DEBUG_CATEGORIES } from "./debug-logger.js";

// Create scoped loggers for different aspects of tool calls
const toolCallLogger = createDebugLogger(DEBUG_CATEGORIES.TOOL_CALLS);
const toolResultLogger = createDebugLogger(DEBUG_CATEGORIES.TOOL_RESULTS);

export interface ToolCallLog {
  toolName: string;
  args?: Record<string, unknown>;
  sessionId?: string;
  timestamp?: number;
}

export interface ToolResultLog {
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs?: number;
}

/**
 * Log a tool call before execution
 */
export function logToolCall(log: ToolCallLog): void {
  toolCallLogger.info(
    `Tool call: ${log.toolName}`,
    JSON.stringify({
      args: log.args,
      sessionId: log.sessionId,
      timestamp: log.timestamp ?? Date.now(),
    }),
  );
}

/**
 * Log a tool call result after execution
 */
export function logToolResult(log: ToolResultLog): void {
  if (log.success) {
    toolResultLogger.info(
      `Tool result: ${log.toolName}`,
      JSON.stringify({
        success: true,
        durationMs: log.durationMs,
        resultPreview: previewResult(log.result),
      }),
    );
  } else {
    toolResultLogger.warn(
      `Tool result: ${log.toolName}`,
      JSON.stringify({
        success: false,
        durationMs: log.durationMs,
        error: log.error,
      }),
    );
  }
}

/**
 * Log tool call with hierarchical category for fine-grained control
 * e.g., "tool-calls.read", "tool-calls.write", "tool-calls.exec"
 */
export function logToolCallByType(
  toolType: string,
  args?: Record<string, unknown>,
  extra?: Record<string, unknown>,
): void {
  const categoryLogger = createDebugLogger(`tool-calls.${toolType}`);
  if (categoryLogger.isEnabled()) {
    categoryLogger.info(`Tool [${toolType}] called`, JSON.stringify({ args, ...extra }));
  }
}

/**
 * Log batch tool calls (useful for debugging parallel execution)
 */
export function logToolBatch(
  batchId: string,
  calls: Array<{ toolName: string; args?: Record<string, unknown> }>,
): void {
  toolCallLogger.info(
    `Batch [${batchId}]: ${calls.length} tool calls`,
    calls.map((c) => ({ name: c.toolName, args: c.args })).join(", "),
  );
}

/**
 * Performance timing for tool calls
 */
export class ToolCallTimer {
  private startTime: number;
  private toolName: string;

  constructor(toolName: string) {
    this.toolName = toolName;
    this.startTime = Date.now();
    logToolCall({ toolName });
  }

  end(result?: unknown, error?: string): void {
    const durationMs = Date.now() - this.startTime;
    logToolResult({
      toolName: this.toolName,
      success: !error,
      result,
      error,
      durationMs,
    });
  }
}

/**
 * Create a wrapper function that automatically logs tool calls
 */
export function createLoggedToolCall<T extends (...args: unknown[]) => Promise<unknown>>(
  toolName: string,
  fn: T,
): T {
  return (async (...args: unknown[]) => {
    const timer = new ToolCallTimer(toolName);
    try {
      const result = await fn(...args);
      timer.end(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      timer.end(undefined, errorMessage);
      throw err;
    }
  }) as T;
}

/**
 * Preview long results for logging (truncate if too long)
 */
function previewResult(result?: unknown, maxLength = 500): string {
  if (result === undefined || result === null) {
    return "undefined";
  }

  const str = typeof result === "string" ? result : JSON.stringify(result);
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength) + `... (${str.length - maxLength} chars truncated)`;
}
