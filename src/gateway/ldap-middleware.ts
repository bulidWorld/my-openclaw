import type { IncomingMessage } from "node:http";
import {
  createLdapAuthService,
  createLdapSessionManager,
  type LdapAuthResult,
  type LdapConfig,
} from "./auth-ldap.js";
import { loadLdapConfig } from "./ldap-config-loader.js";

/**
 * LDAP 认证中间件
 * 用于在网关 HTTP 请求中进行 LDAP 认证
 */
export class LdapAuthMiddleware {
  private config: LdapConfig | null = null;
  private sessionManager: ReturnType<typeof createLdapSessionManager> = null;

  /**
   * 初始化 LDAP 认证中间件
   */
  initialize(configPath?: string): void {
    this.config = loadLdapConfig(configPath);

    if (this.config && this.config.enabled) {
      this.sessionManager = createLdapSessionManager(this.config);
      console.log("[LDAP] Auth middleware initialized");
      if (this.config.session?.isolatedSessions) {
        console.log("[LDAP] Session isolation enabled");
      }
    }
  }

  /**
   * 获取 LDAP 配置
   */
  getConfig(): LdapConfig | null {
    return this.config;
  }

  /**
   * 检查 LDAP 是否启用
   */
  isEnabled(): boolean {
    return this.config?.enabled === true;
  }

  /**
   * 从请求头中提取 LDAP token
   */
  extractTokenFromRequest(req: IncomingMessage): string | null {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return null;
    }

    // 支持 "Bearer <token>" 格式
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
      return parts[1];
    }

    // 或者直接就是 token
    return authHeader;
  }

  /**
   * 验证 LDAP token
   */
  verifyToken(token: string): { ok: true; user: string; sessionPath?: string } | { ok: false; reason: string } {
    if (!this.sessionManager) {
      return { ok: false, reason: "LDAP session manager not initialized" };
    }
    return this.sessionManager.verifyToken(token);
  }

  /**
   * 获取用户的会话路径
   */
  getSessionPath(username: string): string | null {
    if (!this.sessionManager) {
      return null;
    }
    return this.sessionManager.getSessionPath(username);
  }

  /**
   * 处理 LDAP 登录请求
   */
  async authenticate(username: string, password: string): Promise<LdapAuthResult> {
    if (!this.config || !this.config.enabled) {
      return {
        ok: false,
        reason: "LDAP authentication is not enabled",
      };
    }

    const ldapService = createLdapAuthService(this.config);
    if (!ldapService) {
      return {
        ok: false,
        reason: "LDAP service not configured properly",
      };
    }

    return ldapService.authenticate({ username, password });
  }

  /**
   * 测试 LDAP 连接
   */
  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this.config || !this.config.enabled) {
      return { ok: false, error: "LDAP authentication is not enabled" };
    }

    const ldapService = createLdapAuthService(this.config);
    if (!ldapService) {
      return { ok: false, error: "LDAP service not configured properly" };
    }

    return ldapService.testConnection();
  }
}

// 单例实例
let ldapAuthMiddlewareInstance: LdapAuthMiddleware | null = null;

/**
 * 获取 LDAP 认证中间件单例
 */
export function getLdapAuthMiddleware(): LdapAuthMiddleware {
  if (!ldapAuthMiddlewareInstance) {
    ldapAuthMiddlewareInstance = new LdapAuthMiddleware();
  }
  return ldapAuthMiddlewareInstance;
}

/**
 * 初始化 LDAP 认证中间件
 */
export function initializeLdapAuth(configPath?: string): LdapAuthMiddleware {
  const middleware = getLdapAuthMiddleware();
  middleware.initialize(configPath);
  return middleware;
}
