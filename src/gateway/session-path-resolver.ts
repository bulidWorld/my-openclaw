/**
 * Resolve session path from client context.
 * Supports both direct sessionPath on client and legacy connId-based lookup.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import type { GatewayClient } from "./server-methods/types.js";
import { getConnectionSessionPath } from "./session-path-context.js";

const log = createSubsystemLogger("gateway/session-path-resolver");

/**
 * Resolve session path for a client connection.
 * Prefers sessionPath directly on the client object, falls back to connId-based lookup.
 */
export function resolveSessionPathFromClient(client: GatewayClient | null): string | undefined {
  log.debug("resolveSessionPathFromClient called", {
    connId: client?.connId,
    sessionPath: client?.sessionPath
  });
  if (client?.sessionPath) {
    log.debug("returning direct sessionPath", { sessionPath: client.sessionPath });
    return client.sessionPath;
  }
  if (client?.connId) {
    const pathFromMap = getConnectionSessionPath(client.connId);
    log.debug("returning path from connId lookup", { connId: client.connId, path: pathFromMap });
    return pathFromMap;
  }
  log.debug("no session path found, returning undefined");
  return undefined;
}
