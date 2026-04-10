import { Command } from "commander";
import * as readline from "node:readline";
import { loadLdapConfig } from "../gateway/ldap-config-loader.js";
import { createLdapAuthService, type LdapConfig } from "../gateway/auth-ldap.js";
import { createLdapSessionManager } from "../gateway/ldap-session-manager.js";

/**
 * 创建 LDAP 相关的 CLI 命令
 */
export function createLdapCommands(): Command {
  const ldap = new Command("ldap");
  ldap.description("LDAP authentication and session management");

  // ldap login
  ldap
    .command("login")
    .description("Login with LDAP credentials")
    .option("-u, --username <username>", "LDAP username")
    .option("-p, --password <password>", "LDAP password")
    .option("-c, --config <path>", "Path to LDAP config file")
    .action(async (options) => {
      await handleLdapLogin(options);
    });

  // ldap test-connection
  ldap
    .command("test-connection")
    .description("Test LDAP server connection")
    .option("-c, --config <path>", "Path to LDAP config file")
    .action(async (options) => {
      await handleTestConnection(options);
    });

  // ldap session
  ldap
    .command("session")
    .description("Show LDAP session information")
    .option("-t, --token <token>", "LDAP auth token")
    .action(async (options) => {
      await handleSessionInfo(options);
    });

  // ldap logout
  ldap
    .command("logout")
    .description("Logout and clear LDAP session")
    .option("-u, --username <username>", "LDAP username to logout")
    .option("-a, --all", "Logout all LDAP sessions")
    .action(async (options) => {
      await handleLdapLogout(options);
    });

  return ldap;
}

/**
 * 处理 LDAP 登录
 */
async function handleLdapLogin(options: {
  username?: string;
  password?: string;
  config?: string;
}): Promise<void> {
  const config = loadLdapConfig(options.config);

  if (!config) {
    console.error(
      "LDAP configuration not found. Please create ~/.openclaw/ldap.config or set OPENCLAW_LDAP_CONFIG_PATH",
    );
    process.exit(1);
  }

  if (!config.enabled) {
    console.error("LDAP authentication is not enabled in the configuration");
    process.exit(1);
  }

  let { username, password } = options;

  // 交互式输入
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => {
      rl.question(prompt, resolve);
    });

  try {
    if (!username) {
      username = await question("LDAP username: ");
    }

    if (!password) {
      // 隐藏密码输入
      process.stdout.write("LDAP password: ");
      const tty = await import("node:tty");
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }
      password = await new Promise<string>((resolve) => {
        const chars: string[] = [];
        const onData = (data: Buffer) => {
          const str = data.toString();
          if (str === "\r" || str === "\n") {
            process.stdin.removeListener("data", onData);
            if (process.stdin.isTTY) {
              process.stdin.setRawMode(false);
            }
            console.log("");
            resolve(chars.join(""));
            return;
          }
          if (str === "\u0003") {
            // Ctrl+C
            process.exit(0);
          }
          if (str === "\b" || str === "\x7f") {
            chars.pop();
            process.stdout.write("\b \b");
          } else {
            chars.push(str);
            process.stdout.write("*");
          }
        };
        process.stdin.on("data", onData);
      });
    }

    rl.close();

    if (!username || !password) {
      console.error("Username and password are required");
      process.exit(1);
    }

    const ldapService = createLdapAuthService(config);
    if (!ldapService) {
      console.error("Failed to create LDAP authentication service");
      process.exit(1);
    }

    console.log("Authenticating with LDAP server...");
    const result = await ldapService.authenticate({ username, password });

    if (result.ok) {
      const ldapResult = result as import("../gateway/auth-ldap.js").LdapAuthResult;
      console.log("\n✓ Authentication successful!");
      console.log(`  User: ${ldapResult.user}`);
      if (ldapResult.userAttributes?.displayName) {
        console.log(`  Display Name: ${ldapResult.userAttributes.displayName}`);
      }
      if (ldapResult.userAttributes?.email) {
        console.log(`  Email: ${ldapResult.userAttributes.email}`);
      }

      // 生成 token
      const tokenData = {
        user: ldapResult.user,
        method: "ldap",
        timestamp: Date.now(),
        sessionPath: ldapResult.sessionPath,
        userAttributes: ldapResult.userAttributes,
      };
      const token = Buffer.from(JSON.stringify(tokenData)).toString("base64");

      console.log(`\n  Token: ${token}`);
      if (ldapResult.sessionPath) {
        console.log(`  Session Path: ${ldapResult.sessionPath}`);
      }

      console.log(
        "\nSave this token for subsequent requests. Set OPENCLAW_LDAP_TOKEN environment variable or pass --token to commands.",
      );

      // 如果启用了会话隔离，创建会话目录
      if (config.session?.isolatedSessions && ldapResult.sessionPath) {
        const sessionManager = createLdapSessionManager(config);
        if (sessionManager) {
          await sessionManager.ensureSessionDir(username);
          console.log(`\n✓ Session directory created: ${ldapResult.sessionPath}`);
        }
      }
    } else {
      console.error(`✗ Authentication failed: ${result.reason}`);
      process.exit(1);
    }
  } catch (err) {
    rl.close();
    console.error("LDAP login error:", err);
    process.exit(1);
  }
}

/**
 * 处理测试连接
 */
async function handleTestConnection(options: { config?: string }): Promise<void> {
  const config = loadLdapConfig(options.config);

  if (!config) {
    console.error(
      "LDAP configuration not found. Please create ~/.openclaw/ldap.config or set OPENCLAW_LDAP_CONFIG_PATH",
    );
    process.exit(1);
  }

  console.log("Testing LDAP connection...");
  console.log(`  URL: ${config.url}`);
  console.log(`  TLS: ${config.tlsEnabled ? "enabled" : "disabled"}`);
  console.log(`  Search Base: ${config.searchBase}`);

  const ldapService = createLdapAuthService(config);
  if (!ldapService) {
    console.error("Failed to create LDAP authentication service");
    process.exit(1);
  }

  const result = await ldapService.testConnection();

  if (result.ok) {
    console.log("\n✓ LDAP connection successful!");
  } else {
    console.error(`\n✗ LDAP connection failed: ${result.error}`);
    process.exit(1);
  }
}

/**
 * 处理会话信息查询
 */
async function handleSessionInfo(options: { token?: string }): Promise<void> {
  const token = options.token || process.env.OPENCLAW_LDAP_TOKEN;

  if (!token) {
    console.error(
      "No token provided. Pass --token or set OPENCLAW_LDAP_TOKEN environment variable",
    );
    process.exit(1);
  }

  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf-8"));

    if (!decoded.user || decoded.method !== "ldap") {
      console.error("Invalid LDAP token format");
      process.exit(1);
    }

    console.log("LDAP Session Information:");
    console.log(`  User: ${decoded.user}`);
    console.log(`  Auth Method: ${decoded.method}`);
    console.log(`  Authenticated: ${new Date(decoded.timestamp).toISOString()}`);

    if (decoded.sessionPath) {
      console.log(`  Session Path: ${decoded.sessionPath}`);
    }

    if (decoded.userAttributes) {
      console.log("\n  User Attributes:");
      if (decoded.userAttributes.displayName) {
        console.log(`    Display Name: ${decoded.userAttributes.displayName}`);
      }
      if (decoded.userAttributes.email) {
        console.log(`    Email: ${decoded.userAttributes.email}`);
      }
      if (decoded.userAttributes.userId) {
        console.log(`    User ID: ${decoded.userAttributes.userId}`);
      }
    }

    // 检查 token 是否过期
    const config = loadLdapConfig();
    if (config?.session?.timeoutMs) {
      const age = Date.now() - decoded.timestamp;
      const remaining = config.session.timeoutMs - age;
      if (remaining > 0) {
        const hours = Math.floor(remaining / 3600000);
        const minutes = Math.floor((remaining % 3600000) / 60000);
        console.log(`  Token Expires In: ${hours}h ${minutes}m`);
      } else {
        console.log("  Token Status: EXPIRED");
      }
    }
  } catch (err) {
    console.error("Failed to parse token:", err);
    process.exit(1);
  }
}

/**
 * 处理 LDAP 登出
 */
async function handleLdapLogout(options: { username?: string; all?: boolean }): Promise<void> {
  const config = loadLdapConfig();

  if (!config?.session?.isolatedSessions) {
    console.log("LDAP session isolation is not enabled");
    return;
  }

  const sessionManager = createLdapSessionManager(config);
  if (!sessionManager) {
    console.log("No LDAP session manager available");
    return;
  }

  if (options.all) {
    const sessions = await sessionManager.listSessions();
    if (sessions.length === 0) {
      console.log("No LDAP sessions found");
      return;
    }

    console.log(`Found ${sessions.length} LDAP session(s):`);
    for (const session of sessions) {
      console.log(`  - ${session}`);
    }

    console.log("\nDeleting all sessions...");
    for (const session of sessions) {
      await sessionManager.deleteSession(session);
      console.log(`  ✓ Deleted: ${session}`);
    }
    console.log("\nAll LDAP sessions cleared");
  } else if (options.username) {
    await sessionManager.deleteSession(options.username);
    console.log(`✓ LDAP session cleared for user: ${options.username}`);
  } else {
    console.log(
      "Specify --username <user> to clear a specific session or --all to clear all sessions",
    );
  }
}
