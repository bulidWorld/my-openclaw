import * as fs from "node:fs";
import * as path from "node:path";
import type { LdapConfig } from "./auth-ldap.js";

/**
 * LDAP 会话管理器
 * 负责管理 LDAP 用户的独立会话空间
 */
export class LdapSessionManager {
  private config: LdapConfig;
  private sessionRoot: string;

  constructor(config: LdapConfig) {
    this.config = config;
    const homeDir = process.env.HOME || process.env.USERPROFILE || "~";
    this.sessionRoot = config.session?.storageDir || `${homeDir}/.openclaw/sessions/ldap`;
  }

  /**
   * 获取用户的会话目录路径
   */
  getSessionPath(username: string): string {
    if (!this.config.session?.isolatedSessions) {
      return this.sessionRoot;
    }
    return path.join(this.sessionRoot, this.sanitizeUsername(username));
  }

  /**
   * 清理用户名，防止路径遍历攻击
   */
  private sanitizeUsername(username: string): string {
    // 只保留字母数字、下划线、连字符和点
    return username.replace(/[^a-zA-Z0-9_.-]/g, "_");
  }

  /**
   * 确保用户会话目录存在
   */
  async ensureSessionDir(username: string): Promise<string> {
    const sessionPath = this.getSessionPath(username);
    await fs.promises.mkdir(sessionPath, { recursive: true });
    return sessionPath;
  }

  /**
   * 获取所有 LDAP 用户会话列表
   */
  async listSessions(): Promise<string[]> {
    try {
      const entries = await fs.promises.readdir(this.sessionRoot, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (err) {
      // Directory doesn't exist yet
      return [];
    }
  }

  /**
   * 删除用户会话目录
   */
  async deleteSession(username: string): Promise<void> {
    const sessionPath = this.getSessionPath(username);
    await fs.promises.rm(sessionPath, { recursive: true, force: true });
  }

  /**
   * 获取会话配置
   */
  getSessionConfig(): { isolatedSessions: boolean; timeoutMs?: number } {
    return {
      isolatedSessions: this.config.session?.isolatedSessions ?? true,
      timeoutMs: this.config.session?.timeoutMs,
    };
  }

  /**
   * 验证会话 token 并提取用户信息
   */
  verifyToken(token: string): { ok: true; user: string; sessionPath?: string } | { ok: false; reason: string } {
    try {
      const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));
      if (!decoded.user || decoded.method !== "ldap") {
        return { ok: false, reason: "Invalid token format" };
      }

      // Check token expiration if timeout is configured
      if (this.config.session?.timeoutMs && decoded.timestamp) {
        const age = Date.now() - decoded.timestamp;
        if (age > this.config.session.timeoutMs) {
          return { ok: false, reason: "Token expired" };
        }
      }

      return {
        ok: true,
        user: decoded.user,
        sessionPath: decoded.sessionPath,
      };
    } catch (err) {
      return { ok: false, reason: "Invalid token" };
    }
  }
}

/**
 * 创建 LDAP 会话管理器实例
 */
export function createLdapSessionManager(config: LdapConfig): LdapSessionManager | null {
  if (!config.enabled || !config.session?.isolatedSessions) {
    return null;
  }
  return new LdapSessionManager(config);
}
