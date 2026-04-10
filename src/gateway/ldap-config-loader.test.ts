import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadLdapConfig, saveLdapConfig } from "./ldap-config-loader.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("ldap-config-loader", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ldap-config-test-"));
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("loadLdapConfig", () => {
    it("should load valid config from explicit path", () => {
      const configPath = path.join(tempDir, "ldap.config");
      const config = {
        enabled: true,
        url: "ldap://test-server:389",
        searchBase: "dc=test,dc=example,dc=com",
        bindDN: "cn=admin,dc=test,dc=example,dc=com",
        bindCredentials: "secret",
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      const loaded = loadLdapConfig(configPath);
      expect(loaded).not.toBeNull();
      expect(loaded?.enabled).toBe(true);
      expect(loaded?.url).toBe("ldap://test-server:389");
      expect(loaded?.searchBase).toBe("dc=test,dc=example,dc=com");
    });

    it("should apply default values", () => {
      const configPath = path.join(tempDir, "ldap.config");
      const config = {
        enabled: true,
        url: "ldap://test-server:389",
        searchBase: "dc=test",
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      const loaded = loadLdapConfig(configPath);
      expect(loaded).not.toBeNull();
      expect(loaded?.tlsEnabled).toBe(false);
      expect(loaded?.tlsRejectUnauthorized).toBe(true);
    });

    it("should return null if file does not exist", () => {
      const loaded = loadLdapConfig("/nonexistent/path/ldap.config");
      expect(loaded).toBeNull();
    });

    it("should return null if URL is missing", () => {
      const configPath = path.join(tempDir, "ldap.config");
      const config = {
        enabled: true,
        searchBase: "dc=test",
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      const loaded = loadLdapConfig(configPath);
      expect(loaded).toBeNull();
    });

    it("should return null if JSON is invalid", () => {
      const configPath = path.join(tempDir, "ldap.config");
      fs.writeFileSync(configPath, "invalid json {");

      const loaded = loadLdapConfig(configPath);
      expect(loaded).toBeNull();
    });

    it("should expand tilde in path", () => {
      // This test assumes HOME is set
      const home = process.env.HOME || process.env.USERPROFILE;
      if (!home) {
        return; // Skip if no home directory
      }

      const configPath = "~/test-ldap.config";
      const fullPath = path.join(home, "test-ldap.config");
      const config = {
        enabled: true,
        url: "ldap://test-server:389",
        searchBase: "dc=test",
      };
      fs.writeFileSync(fullPath, JSON.stringify(config, null, 2));

      try {
        const loaded = loadLdapConfig(configPath);
        expect(loaded).not.toBeNull();
      } finally {
        fs.rmSync(fullPath, { force: true });
      }
    });

    it("should respect OPENCLAW_LDAP_CONFIG_PATH env var", () => {
      const configPath = path.join(tempDir, "ldap.config");
      const config = {
        enabled: true,
        url: "ldap://test-server:389",
        searchBase: "dc=test",
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      process.env.OPENCLAW_LDAP_CONFIG_PATH = configPath;
      const loaded = loadLdapConfig();
      delete process.env.OPENCLAW_LDAP_CONFIG_PATH;

      expect(loaded).not.toBeNull();
      expect(loaded?.url).toBe("ldap://test-server:389");
    });
  });

  describe("saveLdapConfig", () => {
    it("should save config to specified path", () => {
      const configPath = path.join(tempDir, "ldap.config");
      const config = {
        enabled: true,
        url: "ldap://test-server:389",
        searchBase: "dc=test",
        session: {
          isolatedSessions: true,
          timeoutMs: 86400000,
        },
      };

      saveLdapConfig(config, configPath);

      expect(fs.existsSync(configPath)).toBe(true);
      const content = fs.readFileSync(configPath, "utf-8");
      const saved = JSON.parse(content);
      expect(saved.enabled).toBe(true);
      expect(saved.url).toBe("ldap://test-server:389");
    });

    it("should create parent directories if needed", () => {
      const configPath = path.join(tempDir, "subdir", "ldap.config");
      const config = {
        enabled: true,
        url: "ldap://test-server:389",
        searchBase: "dc=test",
      };

      saveLdapConfig(config, configPath);

      expect(fs.existsSync(configPath)).toBe(true);
    });
  });
});
