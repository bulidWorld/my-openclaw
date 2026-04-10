import ldap from "ldapjs";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { GatewayAuthResult } from "./auth.js";
import type {
  LdapConfig,
  LdapUserAttributes,
  LdapAccessControl,
  LdapSessionConfig,
} from "../config/types.gateway.js";

const log = createSubsystemLogger("gateway/auth-ldap");

export type { LdapConfig, LdapUserAttributes, LdapAccessControl, LdapSessionConfig };

export type LdapLoginParams = {
  username: string;
  password: string;
};

export type LdapAuthResult = GatewayAuthResult & {
  userAttributes?: LdapUserAttributes;
  sessionPath?: string;
};

export class LdapAuthService {
  private config: LdapConfig;

  constructor(config: LdapConfig) {
    this.config = config;
  }

  async authenticate(params: LdapLoginParams): Promise<LdapAuthResult> {
    const { username, password } = params;
    log.info("authenticate called", { username });

    if (!username || !password) {
      log.debug("missing username or password");
      return {
        ok: false,
        reason: "Username and password are required",
      };
    }

    // Check access control before attempting authentication
    if (this.config.accessControl) {
      const accessCheck = this.checkAccessControl(username);
      log.debug("accessControl check", { allowed: accessCheck.allowed, reason: accessCheck.reason });
      if (!accessCheck.allowed) {
        return {
          ok: false,
          reason: accessCheck.reason || "Access denied",
        };
      }
    }

    log.debug("LDAP config", { url: this.config.url, searchBase: this.config.searchBase, isolatedSessions: this.config.session?.isolatedSessions });

    return new Promise((resolve) => {
      const client = ldap.createClient({
        url: this.config.url,
        reconnect: true,
        connectTimeout: 10000,
        idleTimeout: 30000,
      });

      client.on("error", (err) => {
        log.error("LDAP connection error", { error: err.message });
        resolve({
          ok: false,
          reason: "LDAP connection failed",
        });
      });

      client.on("connect", () => {
        // If userDnTemplate is provided, try direct bind first
        // If that fails, fall back to search+bind
        if (this.config.userDnTemplate) {
          const userDn = this.config.userDnTemplate.replace("${username}", username);
          this.verifyUserCredentials(userDn, password)
            .then((verified) => {
              if (verified) {
                // Direct bind succeeded, fetch attributes and return
                this.fetchUserAttributes(client, username)
                  .then((userAttributes) => {
                    client.unbind();
                    const sessionPath = this.getSessionPath(username);
                    resolve({
                      ok: true,
                      method: "ldap",
                      user: userAttributes.displayName || username,
                      userAttributes,
                      sessionPath,
                    });
                  })
                  .catch(() => {
                    client.unbind();
                    resolve({
                      ok: true,
                      method: "ldap",
                      user: username,
                    });
                  });
              } else {
                // Direct bind failed, try search+bind as fallback
                this.searchAndBind(client, username, password, resolve);
              }
            })
            .catch((err) => {
              log.error("Direct bind error", { error: err instanceof Error ? err.message : String(err) });
              // On error, try search+bind as fallback
              this.searchAndBind(client, username, password, resolve);
            });
          return;
        }

        // No userDnTemplate, use search+bind directly
        this.searchAndBind(client, username, password, resolve);
      });
    });
  }

  /**
   * Search for user and verify credentials
   */
  private searchAndBind(
    client: ldap.Client,
    username: string,
    password: string,
    resolve: (result: LdapAuthResult) => void,
  ): void {
    const searchBase = this.config.searchBase;
    // Search for user by uid or cn
    const searchFilter = `(|(uid=${username})(cn=${username}))`;

    const searchOptions = {
      scope: "sub" as const,
      filter: searchFilter,
      attributes: ["dn", "uid", "cn", "mail", "*"],
    };

    log.info("searching for user", { username, searchFilter, searchBase });

    client.search(searchBase, searchOptions, (err, res) => {
      if (err) {
        log.error("LDAP search error", { error: err.message });
        // Search failed, try fallback to cn=${username},dc=naze format
        this.tryFallbackBind(username, password, resolve);
        return;
      }

      let userDn: string | null = null;
      let userAttributes: LdapUserAttributes = {};

      res.on("searchEntry", (entry) => {
        userDn = entry.dn;
        userAttributes = this.extractUserAttributes(entry.object);
        log.info("found user DN", { userDn });
      });

      res.on("error", (err) => {
        log.error("LDAP search entry error", { error: err.message });
        client.unbind();
        resolve({
          ok: false,
          reason: "LDAP search error",
        });
      });

      res.on("end", () => {
        if (!userDn) {
          log.info("user not found via search, trying fallback bind");
          // User not found via search, try fallback bind
          this.tryFallbackBind(username, password, resolve);
          return;
        }

        this.verifyUserCredentials(userDn, password)
          .then((verified) => {
            client.unbind();
            if (verified) {
              const sessionPath = this.getSessionPath(username);
              resolve({
                ok: true,
                method: "ldap",
                user: userAttributes.displayName || username,
                userAttributes,
                sessionPath,
              });
            } else {
              resolve({
                ok: false,
                reason: "Invalid credentials",
              });
            }
          })
          .catch((err) => {
            log.error("LDAP verification error", { error: err.message });
            client.unbind();
            resolve({
              ok: false,
              reason: "LDAP authentication failed",
            });
          });
      });
    });
  }

  /**
   * Try fallback bind using cn=${username},dc=naze format
   */
  private tryFallbackBind(
    username: string,
    password: string,
    resolve: (result: LdapAuthResult) => void,
  ): void {
    // Try cn=${username},dc=naze format for users like admin
    const fallbackDn = `cn=${username},dc=naze`;
    log.info("trying fallback bind", { fallbackDn });

    this.verifyUserCredentials(fallbackDn, password)
      .then((verified) => {
        if (verified) {
          log.info("fallback bind successful", { fallbackDn });
          resolve({
            ok: true,
            method: "ldap",
            user: username,
            sessionPath: this.getSessionPath(username),
          });
        } else {
          resolve({
            ok: false,
            reason: "User not found",
          });
        }
      })
      .catch((err) => {
        log.error("fallback bind error", { error: err.message });
        resolve({
          ok: false,
          reason: "User not found",
        });
      });
  }

  /**
   * Extract user attributes from LDAP entry object
   */
  private extractUserAttributes(entryObject: Record<string, string | string[]>): LdapUserAttributes {
    const attrs = this.config.userAttributes || {};
    const displayNameAttr = attrs.displayName || "cn";
    const emailAttr = attrs.email || "mail";
    const userIdAttr = attrs.userId || "uid";

    const getValue = (key: string): string | undefined => {
      if (!entryObject) {
        return undefined;
      }
      const value = entryObject[key];
      if (Array.isArray(value)) {
        return value[0];
      }
      return value;
    };

    return {
      displayName: getValue(displayNameAttr) || getValue(userIdAttr),
      email: getValue(emailAttr),
      userId: getValue(userIdAttr),
    };
  }

  /**
   * Check if user is allowed based on access control rules
   */
  private checkAccessControl(username: string): { allowed: boolean; reason?: string } {
    const ac = this.config.accessControl;
    if (!ac) {
      return { allowed: true };
    }

    // Check denied users first
    if (ac.deniedUsers && ac.deniedUsers.some((u) => u === username || username.endsWith(u))) {
      return { allowed: false, reason: "User is denied access" };
    }

    // Check allowed users if specified
    if (ac.allowedUsers && ac.allowedUsers.length > 0) {
      const isAllowed = ac.allowedUsers.some((u) => u === username || username.endsWith(u));
      if (!isAllowed) {
        return { allowed: false, reason: "User is not in the allowed list" };
      }
    }

    // Note: Group membership check would require additional LDAP query
    // Can be implemented if needed

    return { allowed: true };
  }

  /**
   * Fetch user attributes from LDAP
   */
  private async fetchUserAttributes(
    client: ldap.Client,
    username: string,
  ): Promise<LdapUserAttributes> {
    return new Promise((resolve, reject) => {
      const searchFilter = `(${this.config.usernameAttribute || "uid"}=${username})`;
      const searchOptions = {
        scope: "sub" as const,
        filter: searchFilter,
        attributes: ["*"],
      };

      client.search(this.config.searchBase, searchOptions, (err, res) => {
        if (err) {
          reject(err);
          return;
        }

        let attributes: LdapUserAttributes = {};

        res.on("searchEntry", (entry) => {
          attributes = this.extractUserAttributes(entry.object);
        });

        res.on("end", () => {
          resolve(attributes);
        });

        res.on("error", (err) => {
          reject(err);
        });
      });
    });
  }

  /**
   * Get the session path for a user
   */
  private getSessionPath(username: string): string | undefined {
    if (!this.config.session?.isolatedSessions) {
      log.debug("getSessionPath: isolatedSessions not enabled, returning undefined", { username });
      return undefined;
    }

    const sessionPath = `ldap/${username}`;
    log.debug("getSessionPath: isolatedSessions enabled, returning", { username, sessionPath });
    // Return relative path (ldap/username), not absolute path
    // The resolveStorePath function will prepend the state directory
    return `ldap/${username}`;
  }

  private async verifyUserCredentials(userDn: string, password: string): Promise<boolean> {
    log.debug("verifyUserCredentials called", { userDn });
    return new Promise((resolve) => {
      const verifyClient = ldap.createClient({
        url: this.config.url,
        reconnect: false,
        connectTimeout: 10000,
      });

      verifyClient.on("error", (err) => {
        log.debug("verifyUserCredentials error", { error: err.message });
        verifyClient.unbind();
        resolve(false);
      });

      verifyClient.bind(userDn, password, (err) => {
        log.debug("verifyUserCredentials bind result", { success: !err });
        verifyClient.unbind();
        resolve(!err);
      });
    });
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      const client = ldap.createClient({
        url: this.config.url,
        reconnect: false,
        connectTimeout: 10000,
      });

      client.on("error", (err) => {
        log.error("Test connection error", { error: err.message });
        client.unbind();
        resolve({ ok: false, error: err.message });
      });

      client.on("connect", () => {
        log.info("Connection test successful");
        client.unbind();
        resolve({ ok: true });
      });

      client.on("connectTimeout", () => {
        client.unbind();
        resolve({ ok: false, error: "Connection timeout" });
      });
    });
  }
}

export function createLdapAuthService(config: LdapConfig): LdapAuthService | null {
  if (!config.enabled) {
    return null;
  }

  if (!config.url) {
    log.warn("LDAP enabled but no URL provided");
    return null;
  }

  if (!config.searchBase) {
    log.warn("LDAP enabled but no searchBase provided");
    return null;
  }

  return new LdapAuthService(config);
}
