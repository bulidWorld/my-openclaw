# LDAP 认证配置指南

## 概述

OpenClaw 支持通过 LDAP (OpenLDAP) 进行用户认证。启用后，用户可以通过 LDAP 用户名和密码登录到 Web 控制面板。

## 配置示例

在您的 OpenClaw 配置文件中添加以下 LDAP 配置：

```json
{
  "gateway": {
    "ldap": {
      "enabled": true,
      "url": "ldap://192.168.124.247:389",
      "bindDN": "cn=admin,dc=naze",
      "bindCredentials": "Naze666666",
      "searchBase": "dc=naze",
      "searchFilter": "(uid=${username})",
      "usernameAttribute": "uid",
      "tlsEnabled": false,
      "tlsRejectUnauthorized": true
    }
  }
}
```

## 配置选项

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `enabled` | boolean | 是 | `false` | 是否启用 LDAP 认证 |
| `url` | string | 是 | - | LDAP 服务器 URL，例如 `ldap://192.168.124.247:389` |
| `bindDN` | string | 否 | - | 管理员绑定 DN，例如 `cn=admin,dc=naze` |
| `bindCredentials` | string | 否 | - | 管理员密码 |
| `searchBase` | string | 是 | - | 搜索基础 DN，例如 `dc=naze` |
| `searchFilter` | string | 否 | `(uid=${username})` | LDAP 搜索过滤器 |
| `usernameAttribute` | string | 否 | `uid` | 用户名属性名 |
| `tlsEnabled` | boolean | 否 | `false` | 是否启用 TLS 加密连接 |
| `tlsRejectUnauthorized` | boolean | 否 | `true` | 是否拒绝未授权的 TLS 证书 |

## 使用方式

### 1. 启动网关

确保在配置文件中启用了 LDAP 认证，然后启动网关：

```bash
openclaw gateway run
```

### 2. 访问 Web 控制面板

打开浏览器访问 Web 控制面板，在登录页面选择 "LDAP" 标签页，输入您的 LDAP 用户名和密码即可登录。

### 3. API 端点

LDAP 认证提供以下 HTTP API 端点：

- **POST /api/ldap/login** - LDAP 登录
  ```json
  {
    "username": "your-username",
    "password": "your-password"
  }
  ```
  
  响应：
  ```json
  {
    "ok": true,
    "user": "your-username",
    "token": "base64-encoded-token"
  }
  ```

- **POST /api/ldap/test** - 测试 LDAP 连接
  ```json
  {
    "ok": true
  }
  ```

## 安全建议

1. **使用 TLS**: 在生产环境中，建议启用 TLS 加密连接 (`ldaps://` 或 `tlsEnabled: true`)
2. **限制访问**: 结合防火墙规则，只允许受信任的 IP 访问 LDAP 服务
3. **定期更新密码**: 定期更新 LDAP 管理员密码
4. **最小权限**: LDAP 绑定账号应仅具有必要的读取权限

## 故障排除

### 连接失败

检查以下几点：
- LDAP 服务器地址和端口是否正确
- 网络连接是否正常
- LDAP 服务是否正在运行

```bash
# 测试 LDAP 连接
ldapsearch -x -H ldap://192.168.124.247:389 -b "dc=naze" -D "cn=admin,dc=naze" -w "Naze666666"
```

### 认证失败

- 确认用户名和密码正确
- 检查 LDAP 搜索过滤器是否正确
- 验证用户是否存在于指定的 searchBase 中

### 查看日志

OpenClaw 网关日志会显示 LDAP 相关的错误信息：

```bash
# 查看网关日志
tail -f ~/.openclaw/logs/gateway.log | grep LDAP
```

## 示例配置

### 基础配置 (OpenLDAP)

```json
{
  "gateway": {
    "ldap": {
      "enabled": true,
      "url": "ldap://192.168.124.247:389",
      "searchBase": "dc=naze"
    }
  }
}
```

### 带管理员绑定配置

```json
{
  "gateway": {
    "ldap": {
      "enabled": true,
      "url": "ldap://192.168.124.247:389",
      "bindDN": "cn=admin,dc=naze",
      "bindCredentials": "${env:LDAP_ADMIN_PASSWORD}",
      "searchBase": "dc=naze",
      "searchFilter": "(|(uid=${username})(mail=${username}))"
    }
  }
}
```

### 启用 TLS 的配置

```json
{
  "gateway": {
    "ldap": {
      "enabled": true,
      "url": "ldaps://192.168.124.247:636",
      "searchBase": "dc=naze",
      "tlsEnabled": true,
      "tlsRejectUnauthorized": true
    }
  }
}
```

## 注意事项

1. LDAP 密码在配置文件中应使用环境变量或密钥管理系统保护
2. 首次配置后，重启网关使配置生效
3. LDAP 认证失败不会锁定账户，但会有速率限制保护
4. 支持同时使用 LDAP 和其他认证方式（如 token、password）
