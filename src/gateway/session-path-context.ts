/**
 * Per-connection session path context for LDAP users.
 * Stores the session path for each authenticated connection.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("gateway/session-path-context");

const connectionSessionPaths = new Map<string, string>();

/**
 * Set the session path for a connection (identified by connId)
 */
export function setConnectionSessionPath(connId: string, sessionPath: string | undefined): void {
  log.debug("setConnectionSessionPath called", { connId, sessionPath });
  if (sessionPath) {
    connectionSessionPaths.set(connId, sessionPath);
    log.debug("session path stored", { connId, sessionPath });
  } else {
    connectionSessionPaths.delete(connId);
    log.debug("session path cleared", { connId });
  }
}

/**
 * Get the session path for a connection
 */
export function getConnectionSessionPath(connId: string): string | undefined {
  const path = connectionSessionPaths.get(connId);
  log.debug("getConnectionSessionPath called", { connId, result: path });
  return path;
}

/**
 * Clear the session path for a connection
 */
export function clearConnectionSessionPath(connId: string): void {
  log.debug("clearConnectionSessionPath called", { connId });
  connectionSessionPaths.delete(connId);
}

/**
 * Resolve session path: use connection-specific path if available, otherwise use default
 */
export function resolveSessionPathForConnection(
  connId: string | undefined,
  defaultSessionPath: string,
): string {
  if (!connId) {
    log.debug("resolveSessionPathForConnection: no connId, returning default", { defaultPath: defaultSessionPath });
    return defaultSessionPath;
  }
  const result = getConnectionSessionPath(connId) ?? defaultSessionPath;
  log.debug("resolveSessionPathForConnection", { connId, defaultPath: defaultSessionPath, result });
  return result;
}
