import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LdapSessionManager, createLdapSessionManager } from "./ldap-session-manager.js";
import type { LdapConfig } from "../config/types.gateway.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("LdapSessionManager", () => {
  let tempDir: string;
  let sessionDir: string;

  const baseConfig: LdapConfig = {
    enabled: true,
    url: "ldap://test-server:389",
    searchBase: "dc=test",
    session: {
      isolatedSessions: true,
      timeoutMs: 3600000, // 1 hour
    },
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ldap-session-test-"));
    sessionDir = path.join(tempDir, "sessions");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getSessionPath", () => {
    it("should return isolated session path for user", () => {
      const config: LdapConfig = {
        ...baseConfig,
        session: {
          ...baseConfig.session,
          storageDir: sessionDir,
        },
      };
      const manager = new LdapSessionManager(config);
      const sessionPath = manager.getSessionPath("testuser");
      expect(sessionPath).toBe(path.join(sessionDir, "testuser"));
    });

    it("should sanitize username to prevent path traversal", () => {
      const config: LdapConfig = {
        ...baseConfig,
        session: {
          ...baseConfig.session,
          storageDir: sessionDir,
        },
      };
      const manager = new LdapSessionManager(config);

      // Test various malicious inputs
      expect(manager.getSessionPath("../etc/passwd")).not.toContain("..");
      expect(manager.getSessionPath("user/test")).toBe(path.join(sessionDir, "user_test"));
      expect(manager.getSessionPath("user\\test")).toBe(path.join(sessionDir, "user_test"));
    });
  });

  describe("verifyToken", () => {
    it("should verify valid token", () => {
      const config: LdapConfig = {
        ...baseConfig,
        session: {
          ...baseConfig.session,
          storageDir: sessionDir,
        },
      };
      const manager = new LdapSessionManager(config);

      const tokenData = {
        user: "testuser",
        method: "ldap",
        timestamp: Date.now(),
        sessionPath: path.join(sessionDir, "testuser"),
      };
      const token = Buffer.from(JSON.stringify(tokenData)).toString("base64");

      const result = manager.verifyToken(token);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.user).toBe("testuser");
        expect(result.sessionPath).toBe(path.join(sessionDir, "testuser"));
      }
    });

    it("should reject expired token", () => {
      const config: LdapConfig = {
        ...baseConfig,
        session: {
          timeoutMs: 1000, // 1 second
          storageDir: sessionDir,
        },
      };
      const manager = new LdapSessionManager(config);

      const tokenData = {
        user: "testuser",
        method: "ldap",
        timestamp: Date.now() - 2000, // 2 seconds ago
      };
      const token = Buffer.from(JSON.stringify(tokenData)).toString("base64");

      const result = manager.verifyToken(token);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("Token expired");
      }
    });

    it("should reject invalid token format", () => {
      const config: LdapConfig = {
        ...baseConfig,
        session: {
          ...baseConfig.session,
          storageDir: sessionDir,
        },
      };
      const manager = new LdapSessionManager(config);

      const result = manager.verifyToken("invalid-token");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("Invalid token");
      }

      const validBase64InvalidJson = Buffer.from("not-json").toString("base64");
      const result2 = manager.verifyToken(validBase64InvalidJson);
      expect(result2.ok).toBe(false);
    });

    it("should reject token with wrong method", () => {
      const config: LdapConfig = {
        ...baseConfig,
        session: {
          ...baseConfig.session,
          storageDir: sessionDir,
        },
      };
      const manager = new LdapSessionManager(config);

      const tokenData = {
        user: "testuser",
        method: "password", // Wrong method
        timestamp: Date.now(),
      };
      const token = Buffer.from(JSON.stringify(tokenData)).toString("base64");

      const result = manager.verifyToken(token);
      expect(result.ok).toBe(false);
    });
  });

  describe("listSessions", () => {
    it("should return empty list when no sessions exist", async () => {
      const config: LdapConfig = {
        ...baseConfig,
        session: {
          ...baseConfig.session,
          storageDir: sessionDir,
        },
      };
      const manager = new LdapSessionManager(config);

      const sessions = await manager.listSessions();
      expect(sessions).toEqual([]);
    });

    it("should return list of session directories", async () => {
      const config: LdapConfig = {
        ...baseConfig,
        session: {
          ...baseConfig.session,
          storageDir: sessionDir,
        },
      };
      const manager = new LdapSessionManager(config);

      // Create some session directories
      fs.mkdirSync(path.join(sessionDir, "user1"), { recursive: true });
      fs.mkdirSync(path.join(sessionDir, "user2"), { recursive: true });

      const sessions = await manager.listSessions();
      expect(sessions).toContain("user1");
      expect(sessions).toContain("user2");
    });
  });

  describe("deleteSession", () => {
    it("should delete session directory", async () => {
      const config: LdapConfig = {
        ...baseConfig,
        session: {
          ...baseConfig.session,
          storageDir: sessionDir,
        },
      };
      const manager = new LdapSessionManager(config);

      const sessionPath = path.join(sessionDir, "testuser");
      fs.mkdirSync(sessionPath, { recursive: true });
      fs.writeFileSync(path.join(sessionPath, "test.txt"), "test");

      await manager.deleteSession("testuser");

      expect(fs.existsSync(sessionPath)).toBe(false);
    });
  });

  describe("createLdapSessionManager", () => {
    it("should return null when session isolation is disabled", () => {
      const config: LdapConfig = {
        ...baseConfig,
        session: {
          isolatedSessions: false,
        },
      };
      const manager = createLdapSessionManager(config);
      expect(manager).toBeNull();
    });

    it("should return manager when session isolation is enabled", () => {
      const config: LdapConfig = {
        ...baseConfig,
        session: {
          isolatedSessions: true,
        },
      };
      const manager = createLdapSessionManager(config);
      expect(manager).not.toBeNull();
    });

    it("should return null when LDAP is disabled", () => {
      const config: LdapConfig = {
        ...baseConfig,
        enabled: false,
        session: {
          isolatedSessions: true,
        },
      };
      const manager = createLdapSessionManager(config);
      expect(manager).toBeNull();
    });
  });
});
