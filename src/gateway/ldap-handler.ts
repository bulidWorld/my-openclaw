import type { IncomingMessage, ServerResponse } from "node:http";
import { createLdapAuthService, type LdapAuthResult } from "./auth-ldap.js";
import type { LdapConfig } from "../config/types.gateway.js";
import { sendJson } from "./http-common.js";
import { readJsonBody } from "./hooks.js";
import { loadLdapConfig } from "./ldap-config-loader.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("gateway/ldap-handler");

type LdapLoginRequest = {
  username: string;
  password: string;
};

type LdapLoginResponse = {
  ok: boolean;
  user?: string;
  reason?: string;
  token?: string;
  sessionPath?: string;
  userAttributes?: {
    displayName?: string;
    email?: string;
    userId?: string;
  };
};

export function handleLdapLoginRequest(
  req: IncomingMessage,
  res: ServerResponse,
  _ldapConfig: LdapConfig,
): void {
  log.info("=== handleLdapLoginRequest START ===", { method: req.method, url: req.url });
  log.debug("handleLdapLoginRequest request details", { method: req.method, url: req.url });
  // Load LDAP config from ~/.openclaw/ldap.config instead of relying on passed config
  const ldapConfig = loadLdapConfig();
  log.debug("ldapConfig loaded", { exists: ldapConfig !== null, enabled: ldapConfig?.enabled });

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method Not Allowed");
    return;
  }

  readJsonBody(req, 65536)
    .then(async (bodyResult) => {
      log.debug("readJsonBody result", { ok: bodyResult.ok });
      if (!bodyResult.ok) {
        res.statusCode = 400;
        sendJson(res, 400, {
          ok: false,
          reason: "Invalid JSON body",
        } as LdapLoginResponse);
        return;
      }

      const body = bodyResult.value as Partial<LdapLoginRequest>;
      if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
        res.statusCode = 400;
        sendJson(res, 400, {
          ok: false,
          reason: "Invalid request body. Expected { username: string, password: string }",
        } as LdapLoginResponse);
        return;
      }

      const { username, password } = body;
      log.info("LDAP login request", { username });

      if (!ldapConfig || !ldapConfig.enabled) {
        log.warn("LDAP not enabled, returning 503");
        res.statusCode = 503;
        sendJson(res, 503, {
          ok: false,
          reason: "LDAP authentication is not enabled",
        } as LdapLoginResponse);
        return;
      }

      const ldapService = createLdapAuthService(ldapConfig);
      log.debug("ldapService created", { created: ldapService !== null });
      if (!ldapService) {
        res.statusCode = 503;
        sendJson(res, 503, {
          ok: false,
          reason: "LDAP service not configured properly",
        } as LdapLoginResponse);
        return;
      }

      log.info("calling ldapService.authenticate", { username });
      const result = await ldapService.authenticate({ username, password });
      log.info("ldapService.authenticate result", { ok: result.ok, user: result.ok ? result.user : undefined, reason: result.ok ? undefined : result.reason });

      if (result.ok) {
        log.info("authentication successful", { user: result.user, sessionPath: result.sessionPath });
        // Generate a token that includes user identity for session isolation
        const ldapResult = result as LdapAuthResult;
        const tokenData = {
          user: ldapResult.user,
          method: "ldap",
          timestamp: Date.now(),
          sessionPath: ldapResult.sessionPath,
          userAttributes: ldapResult.userAttributes,
        };
        const token = Buffer.from(JSON.stringify(tokenData)).toString("base64");
        log.debug("token generated", { tokenLength: token.length });
        log.info("sending success response", { sessionPath: ldapResult.sessionPath });
        res.statusCode = 200;
        sendJson(res, 200, {
          ok: true,
          user: ldapResult.user,
          token,
          sessionPath: ldapResult.sessionPath,
          userAttributes: ldapResult.userAttributes,
        } as LdapLoginResponse);
        log.info("=== handleLdapLoginRequest END (success) ===");
      } else {
        log.warn("authentication failed", { reason: result.reason });
        res.statusCode = 401;
        sendJson(res, 401, {
          ok: false,
          reason: result.reason || "Authentication failed",
        } as LdapLoginResponse);
        log.info("=== handleLdapLoginRequest END (failed) ===");
      }
    })
    .catch((err) => {
      log.error("LDAP login error", { error: err instanceof Error ? err.message : String(err) });
      res.statusCode = 400;
      sendJson(res, 400, {
        ok: false,
        reason: "Invalid JSON body",
      } as LdapLoginResponse);
    });
}

export function handleLdapTestConnectionRequest(
  req: IncomingMessage,
  res: ServerResponse,
  _ldapConfig: LdapConfig,
): void {
  // Load LDAP config from ~/.openclaw/ldap.config
  const ldapConfig = loadLdapConfig();

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method Not Allowed");
    return;
  }

  if (!ldapConfig || !ldapConfig.enabled) {
    res.statusCode = 503;
    sendJson(res, 503, {
      ok: false,
      error: "LDAP authentication is not enabled",
    });
    return;
  }

  const ldapService = createLdapAuthService(ldapConfig);
  if (!ldapService) {
    res.statusCode = 503;
    sendJson(res, 503, {
      ok: false,
      error: "LDAP service not configured properly",
    });
    return;
  }

  ldapService
    .testConnection()
    .then((result) => {
      res.statusCode = result.ok ? 200 : 503;
      sendJson(res, res.statusCode, result);
    })
    .catch((err) => {
      log.error("Test connection error", { error: err instanceof Error ? err.message : String(err) });
      res.statusCode = 503;
      sendJson(res, 503, {
        ok: false,
        error: err.message,
      });
    });
}
