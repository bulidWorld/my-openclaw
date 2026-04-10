# LDAP 认证配置指南

OpenClaw 支持通过 LDAP (Lightweight Directory Access Protocol) 进行用户认证，并为每个 LDAP 用户提供独立的会话空间。

## 快速开始

### 1. 创建 LDAP 配置文件

在 `~/.openclaw/ldap.config` 创建配置文件：

```json
{
  "enabled": true,
  "url": "ldap://your-ldap-server:389",
  "bindDN": "cn=admin,dc=example,dc=com",
  "bindCredentials": "your-admin-password",
  "searchBase": "dc=example,dc=com",
  "session": {
    "isolatedSessions": true,
    "timeoutMs": 86400000
  }
}
```

### 2. 登录 LDAP

```bash
# 交互式登录
openclaw ldap login

# 使用用户名密码登录
openclaw ldap login -u username -p password

# 使用指定配置文件
openclaw ldap login --config /path/to/ldap.config
```

### 3. 测试连接

```bash
openclaw ldap test-connection
```

## 配置选项

### 基本配置

| 选项 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `enabled` | boolean | 是 | 是否启用 LDAP 认证 |
| `url` | string | 是 | LDAP 服务器 URL |
| `bindDN` | string | 否 | 管理员绑定 DN |
| `bindCredentials` | string | 否 | 管理员密码 |
| `searchBase` | string | 是 | 搜索基础 DN |
| `searchFilter` | string | 否 | 搜索过滤器 |
| `usernameAttribute` | string | 否 | 用户名属性 (默认：uid) |
| `userDnTemplate` | string | 否 | 用户 DN 模板（用于直接绑定） |

### TLS 配置

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `tlsEnabled` | boolean | false | 是否启用 TLS |
| `tlsRejectUnauthorized` | boolean | true | 是否验证 TLS 证书 |

### 会话配置

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `session.isolatedSessions` | boolean | true | 是否启用独立会话 |
| `session.timeoutMs` | number | 86400000 | 会话超时时间 (ms) |
| `session.storageDir` | string | ~/.openclaw/sessions/ldap | 会话存储目录 |

### 用户属性映射

```json
{
  "userAttributes": {
    "displayName": "cn",
    "email": "mail",
    "userId": "uid"
  }
}
```

### 访问控制

```json
{
  "accessControl": {
    "allowedUsers": ["admin", "cn=admin,dc=example,dc=com"],
    "allowedGroups": ["cn=openclaw-users,ou=groups,dc=example,dc=com"],
    "deniedUsers": ["banned"]
  }
}
```

## 使用场景

### 场景 1: 简单 LDAP 认证

适用于不需要会话隔离的简单场景：

```json
{
  "enabled": true,
  "url": "ldap://ldap.example.com:389",
  "searchBase": "ou=users,dc=example,dc=com",
  "session": {
    "isolatedSessions": false
  }
}
```

### 场景 2: 独立用户会话

每个用户有独立的会话、技能和配置：

```json
{
  "enabled": true,
  "url": "ldaps://ldap.example.com:636",
  "bindDN": "cn=openclaw,ou=services,dc=example,dc=com",
  "bindCredentials": "${LDAP_BIND_PASSWORD}",
  "searchBase": "ou=users,dc=example,dc=com",
  "session": {
    "isolatedSessions": true,
    "timeoutMs": 604800000,
    "storageDir": "~/.openclaw/sessions/ldap"
  }
}
```

### 场景 3: Active Directory

使用 sAMAccountName 进行认证：

```json
{
  "enabled": true,
  "url": "ldap://ad.example.com:389",
  "bindDN": "cn=openclaw,ou=services,dc=example,dc=com",
  "searchBase": "dc=example,dc=com",
  "usernameAttribute": "sAMAccountName",
  "userDnTemplate": "cn=${username},ou=users,dc=example,dc=com",
  "userAttributes": {
    "displayName": "displayName",
    "email": "mail",
    "userId": "sAMAccountName"
  }
}
```

### 场景 4: 限制用户访问

只允许特定用户或组访问：

```json
{
  "enabled": true,
  "url": "ldap://ldap.example.com:389",
  "searchBase": "dc=example,dc=com",
  "accessControl": {
    "allowedUsers": ["admin", "developer1", "developer2"],
    "allowedGroups": ["cn=openclaw-users,ou=groups,dc=example,dc=com"]
  }
}
```

## CLI 命令

### `openclaw ldap login`

使用 LDAP 凭证登录。

```bash
# 交互式输入
openclaw ldap login

# 命令行参数
openclaw ldap login -u username -p password

# 指定配置文件
openclaw ldap login --config /path/to/config

# 输出会包含 token 和会话路径
```

### `openclaw ldap test-connection`

测试 LDAP 服务器连接。

```bash
openclaw ldap test-connection
openclaw ldap test-connection --config /path/to/config
```

### `openclaw ldap session`

查看当前 LDAP 会话信息。

```bash
# 使用环境变量中的 token
openclaw ldap session

# 指定 token
openclaw ldap session -t <token>
```

### `openclaw ldap logout`

登出并清除 LDAP 会话。

```bash
# 清除指定用户会话
openclaw ldap logout -u username

# 清除所有会话
openclaw ldap logout --all
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `OPENCLAW_LDAP_CONFIG_PATH` | LDAP 配置文件路径 |
| `OPENCLAW_LDAP_TOKEN` | LDAP 认证 token |
| `LDAP_BIND_PASSWORD` | LDAP 绑定密码（可在配置中引用） |

## 安全建议

1. **使用 TLS**: 在生产环境中始终使用 LDAPS (`ldaps://`) 或 StartTLS
2. **使用环境变量**: 不要在配置文件中明文存储密码
3. **限制访问**: 使用 `accessControl` 限制可以访问的用户
4. **设置超时**: 配置合适的 `session.timeoutMs` 避免会话永久有效
5. **证书验证**: 不要禁用 `tlsRejectUnauthorized`，除非使用自签名证书

## 故障排查

### 连接失败

```bash
# 测试连接
openclaw ldap test-connection

# 检查防火墙
telnet ldap-server 389

# 检查 TLS
openssl s_client -connect ldap-server:636
```

### 认证失败

- 检查 `bindDN` 和 `bindCredentials` 是否正确
- 检查 `searchBase` 是否包含用户
- 检查 `usernameAttribute` 是否与 LDAP schema 匹配

### 会话隔离不工作

- 确认 `session.isolatedSessions` 设置为 `true`
- 检查会话目录权限
- 查看日志中的会话路径输出

## 示例配置

完整的示例配置请参考 `docs/ldap.config.example`。

## API 集成

LDAP 登录 API:

```bash
POST /api/ldap/login
Content-Type: application/json

{
  "username": "user",
  "password": "password"
}
```

响应:

```json
{
  "ok": true,
  "user": "John Doe",
  "token": "base64-encoded-token",
  "sessionPath": "~/.openclaw/sessions/ldap/user",
  "userAttributes": {
    "displayName": "John Doe",
    "email": "john@example.com"
  }
}
```
