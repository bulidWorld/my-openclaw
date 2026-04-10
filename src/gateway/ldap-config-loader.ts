import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { LdapConfig } from "../config/types.gateway.js";

const DEFAULT_LDAP_CONFIG_PATHS = [
  "~/.openclaw/ldap.config",
  "./ldap.config",
  "./ldap.config.json",
];

/**
 * 从配置文件加载 LDAP 配置
 */
export function loadLdapConfig(configPath?: string): LdapConfig | null {
  const resolvedPath = resolveConfigPath(configPath);

  if (!resolvedPath) {
    return null;
  }

  try {
    const content = fs.readFileSync(resolvedPath, "utf-8");
    const config = JSON.parse(content) as Partial<LdapConfig>;

    // 验证必需字段
    if (!config.url) {
      console.warn("[LDAP] Config loaded but URL is missing");
      return null;
    }

    // 默认值
    const fullConfig: LdapConfig = {
      enabled: config.enabled ?? false,
      url: config.url,
      bindDN: config.bindDN,
      bindCredentials: config.bindCredentials,
      searchBase: config.searchBase,
      searchFilter: config.searchFilter,
      usernameAttribute: config.usernameAttribute,
      userDnTemplate: config.userDnTemplate,
      tlsEnabled: config.tlsEnabled ?? false,
      tlsRejectUnauthorized: config.tlsRejectUnauthorized ?? true,
      userAttributes: config.userAttributes,
      accessControl: config.accessControl,
      session: config.session,
    };

    return fullConfig;
  } catch (err) {
    console.error("[LDAP] Failed to load config:", err);
    return null;
  }
}

/**
 * 解析配置文件路径
 */
function resolveConfigPath(configPath?: string): string | null {
  // 1. 使用显式指定的路径
  if (configPath) {
    const expanded = expandTilde(configPath);
    if (fs.existsSync(expanded)) {
      return expanded;
    }
    return null;
  }

  // 2. 使用环境变量
  const envPath = process.env.OPENCLAW_LDAP_CONFIG_PATH;
  if (envPath) {
    const expanded = expandTilde(envPath);
    if (fs.existsSync(expanded)) {
      return expanded;
    }
  }

  // 3. 尝试默认路径
  for (const defaultPath of DEFAULT_LDAP_CONFIG_PATHS) {
    const expanded = expandTilde(defaultPath);
    if (fs.existsSync(expanded)) {
      return expanded;
    }
  }

  return null;
}

/**
 * 展开 ~ 为 home 目录
 */
function expandTilde(filePath: string): string {
  if (filePath.startsWith("~")) {
    const home = os.homedir();
    return path.join(home, filePath.slice(1));
  }
  return filePath;
}

/**
 * 保存 LDAP 配置到文件
 */
export function saveLdapConfig(config: LdapConfig, configPath?: string): void {
  const targetPath = configPath || process.env.OPENCLAW_LDAP_CONFIG_PATH || "~/.openclaw/ldap.config";
  const expandedPath = expandTilde(targetPath);

  // 确保目录存在
  const dir = path.dirname(expandedPath);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(expandedPath, JSON.stringify(config, null, 2), "utf-8");
  console.log(`[LDAP] Config saved to ${expandedPath}`);
}
