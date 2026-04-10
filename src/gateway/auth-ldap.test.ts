import { describe, it, expect } from "vitest";
import { createLdapAuthService, type LdapConfig } from "./auth-ldap.js";

describe("auth-ldap", () => {
  describe("createLdapAuthService", () => {
    it("should return null if LDAP is not enabled", () => {
      const config: LdapConfig = {
        enabled: false,
        url: "ldap://test-server:389",
        searchBase: "dc=test",
      };
      const service = createLdapAuthService(config);
      expect(service).toBeNull();
    });

    it("should return null if URL is missing", () => {
      const config: LdapConfig = {
        enabled: true,
        // @ts-expect-error - testing invalid config
        url: undefined,
        searchBase: "dc=test",
      };
      const service = createLdapAuthService(config);
      expect(service).toBeNull();
    });

    it("should return null if searchBase is missing", () => {
      const config: LdapConfig = {
        enabled: true,
        url: "ldap://test-server:389",
        // @ts-expect-error - testing invalid config
        searchBase: undefined,
      };
      const service = createLdapAuthService(config);
      expect(service).toBeNull();
    });

    it("should return service with valid config", () => {
      const config: LdapConfig = {
        enabled: true,
        url: "ldap://test-server:389",
        searchBase: "dc=test,dc=example,dc=com",
      };
      const service = createLdapAuthService(config);
      expect(service).not.toBeNull();
    });

    it("should accept userDnTemplate for direct bind", () => {
      const config: LdapConfig = {
        enabled: true,
        url: "ldap://test-server:389",
        searchBase: "dc=test",
        userDnTemplate: "uid=${username},ou=users,dc=test",
      };
      const service = createLdapAuthService(config);
      expect(service).not.toBeNull();
    });

    it("should accept access control config", () => {
      const config: LdapConfig = {
        enabled: true,
        url: "ldap://test-server:389",
        searchBase: "dc=test",
        accessControl: {
          allowedUsers: ["admin", "cn=admin,dc=test"],
          deniedUsers: ["banned"],
        },
      };
      const service = createLdapAuthService(config);
      expect(service).not.toBeNull();
    });

    it("should accept session config", () => {
      const config: LdapConfig = {
        enabled: true,
        url: "ldap://test-server:389",
        searchBase: "dc=test",
        session: {
          isolatedSessions: true,
          timeoutMs: 86400000,
          storageDir: "~/.openclaw/sessions/ldap",
        },
      };
      const service = createLdapAuthService(config);
      expect(service).not.toBeNull();
    });

    it("should accept user attributes config", () => {
      const config: LdapConfig = {
        enabled: true,
        url: "ldap://test-server:389",
        searchBase: "dc=test",
        userAttributes: {
          displayName: "cn",
          email: "mail",
          userId: "uid",
        },
      };
      const service = createLdapAuthService(config);
      expect(service).not.toBeNull();
    });

    it("should accept TLS config", () => {
      const config: LdapConfig = {
        enabled: true,
        url: "ldaps://test-server:636",
        searchBase: "dc=test",
        tlsEnabled: true,
        tlsRejectUnauthorized: false,
      };
      const service = createLdapAuthService(config);
      expect(service).not.toBeNull();
    });
  });
});
