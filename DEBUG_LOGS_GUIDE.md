# OpenClaw 调试日志指南

本文档说明如何查看和使用 OpenClaw 源码中的调试日志来学习框架流程。

## 快速开始：工具调用日志

新增的调试日志工具支持按类别控制日志输出：

```bash
# 只开启工具调用日志
DEBUG_CATEGORY=tool-calls pnpm gateway

# 开启工具调用和结果日志
DEBUG_CATEGORY=tool-calls,tool-results pnpm gateway

# 开启所有日志
DEBUG_CATEGORY=all pnpm gateway
```

详细用法见 [DEBUG_LOGGER_GUIDE.md](./DEBUG_LOGGER_GUIDE.md)。

## 调试日志概览

已在以下关键路径添加调试日志：

### 1. 服务初始化流程

**文件：** `src/entry.ts`, `src/cli/run-main.ts`

**日志前缀：** `[entry]`, `[runCli]`

**流程：**
```
[entry] === OpenClaw Entry Point Started ===
[entry] argv: ...
[entry] pid: ...
[entry] gaxios-fetch-compat installed
[entry] environment normalized, process title set
[entry] passing to main CLI handler
[runCli] === CLI Runner Started ===
[runCli] argv: ...
[runCli] container parsed: ...
[runCli] loading dotenv and normalizing env
[runCli] asserting runtime version
[runCli] enabling console capture
[runCli] building program
[runCli] installing unhandled rejection handler
```

### 2. Gateway 启动流程

**文件：** `src/gateway/server.impl.ts`, `src/gateway/server-startup.ts`

**日志前缀：** `[startGatewayServer]`

**流程：**
```
[startGatewayServer] === Gateway Server Starting ===
[startGatewayServer] options: {...}
[startGatewayServer] config loaded from: ...
[startGatewayServer] preparing startup auth
[startGatewayServer] auth bootstrap completed
[startGatewayServer] default agent ID: ...
[startGatewayServer] default workspace dir: ...
[startGatewayServer] loading gateway startup plugins
[startGatewayServer] plugins loaded, method count: ...
```

### 3. Session 管理流程

**文件：** `src/config/sessions/store.ts`

**日志前缀：** `[loadSessionStore]`, `[updateSessionStore]`

**流程：**
```
[loadSessionStore] storePath: ... skipCache: ...
[loadSessionStore] cache hit, storePath: ...
[loadSessionStore] returning store with X entries
[updateSessionStore] START, storePath: ...
[updateSessionStore] loaded store, keys count: ...
[updateSessionStore] mutator completed
[updateSessionStore] saveSessionStoreUnlocked completed
```

### 4. Agent 命令执行流程

**文件：** `src/agents/agent-command.ts`

**日志前缀：** `[agentCommandInternal]`, `[prepareAgentCommandExecution]`

**流程：**
```
[agentCommandInternal] === Agent Command Internal Started ===
[agentCommandInternal] opts: {deliver, senderIsOwner, sessionId, sessionKey}
[prepareAgentCommandExecution] === Preparing Agent Command ===
[prepareAgentCommandExecution] message length: ...
[prepareAgentCommandExecution] sessionId: ...
[prepareAgentCommandExecution] sessionKey: ...
[prepareAgentCommandExecution] agentId: ...
[agentCommandInternal] needsSkillsSnapshot: ...
[agentCommandInternal] skillFilter: ...
[agentCommandInternal] skillsSnapshot skills count: ...
[agentCommandInternal] running agent attempt, attempt: 1
[agentCommandInternal] provider: ... model: ...
[agentCommandInternal] isFallbackRetry: false
```

### 5. PI Embedded 运行流程

**文件：** `src/agents/pi-embedded-runner/run.ts`

**日志前缀：** `[runEmbeddedPiAgent]`

**流程：**
```
[runEmbeddedPiAgent] === PI Embedded Agent Starting ===
[runEmbeddedPiAgent] sessionId: ...
[runEmbeddedPiAgent] sessionKey: ...
[runEmbeddedPiAgent] agentId: ...
[runEmbeddedPiAgent] provider: ...
[runEmbeddedPiAgent] model: ...
[runEmbeddedPiAgent] prompt length: ...
[runEmbeddedPiAgent] lane: ...
```

### 6. Tools 初始化流程

**文件：** `src/agents/openclaw-tools.ts`, `src/agents/pi-tools.ts`

**日志前缀：** `[createOpenClawTools]`, `[createOpenClawCodingTools]`

**流程：**
```
[createOpenClawTools] === Creating OpenClaw Tools ===
[createOpenClawTools] agentSessionKey: ...
[createOpenClawTools] agentDir: ...
[createOpenClawTools] sessionId: ...
[createOpenClawTools] sandboxed: ...
[createOpenClawTools] disableMessageTool: ...
[createOpenClawTools] OpenClaw Tools created: X tools
```

### 6.1. 工具执行日志

**文件：** `src/agents/pi-tools.before-tool-call.ts`

**日志前缀：** `[TOOL-CALLS]`, `[TOOL-RESULTS]`

**流程：**
```
[TOOL-CALLS] Tool call: read
[TOOL-RESULTS] Tool result: read (success, 45ms)
[TOOL-RESULTS] Tool error: write (EACCES: permission denied)
[TOOL-RESULTS] Tool blocked: exec (Command not allowed)
```

### 7. Skills 快照构建流程

**文件：** `src/agents/skills/workspace.ts`

**日志前缀：** `[buildWorkspaceSkillSnapshot]`

**流程：**
```
[buildWorkspaceSkillSnapshot] workspaceDir: ...
[buildWorkspaceSkillSnapshot] skillFilter: ...
[buildWorkspaceSkillSnapshot] eligible skills count: ...
[buildWorkspaceSkillSnapshot] prompt length: ...
```

### 8. Chat 事件处理流程

**文件：** `src/gateway/server-chat.ts`

**日志前缀：** `[emitChatDelta]`

**流程：**
```
[emitChatDelta] sessionKey: ... runId: ... seq: ... textLen: ...
```

## 使用方法

### 1. 查看 CLI 命令日志

```bash
# 运行 CLI 命令查看初始化日志
pnpm openclaw --version

# 运行 agent 命令查看完整流程
pnpm openclaw agent --message "hello" --session-id test-123
```

### 2. 查看 Gateway 启动日志

```bash
# 启动 gateway
pnpm gateway

# 或 watch 模式
pnpm gateway:watch
```

### 3. 日志输出位置

- **控制台输出：** 所有 `console.log` 直接输出到终端
- **结构化日志：** `enableConsoleCapture()` 启用后生成结构化日志文件
- **子系统日志：** 使用 `createSubsystemLogger()` 的日志按子系统分类
- **调试类别日志：** 使用 `createDebugLogger()` 按 `DEBUG_CATEGORY` 环境变量控制输出

## 日志级别

当前添加的调试日志主要使用 `console.log()`，对应调试级别。

生产环境日志使用 `createSubsystemLogger()`，支持：
- `log.debug()` - 调试信息
- `log.info()` - 一般信息
- `log.warn()` - 警告
- `log.error()` - 错误

## 可用的日志类别

通过 `DEBUG_CATEGORY` 环境变量控制的日志类别：

| 类别 | 用途 | 示例 |
|------|------|------|
| `tool-calls` | 工具调用日志 | 工具名称、参数、耗时 |
| `tool-results` | 工具执行结果 | 成功/失败、结果预览 |
| `api` | API 请求/响应 | HTTP 请求详情 |
| `subagents` | 子代理相关 | 子代理创建、通信 |
| `sessions` | 会话管理 | 会话创建、加载 |
| `config` | 配置加载 | 配置解析、应用 |
| `channels` | 频道相关 | 频道连接、消息 |
| `cron` | 定时任务 | 任务调度、执行 |
| `memory` | 记忆功能 | 记忆读取、写入 |
| `context` | 上下文管理 | 上下文构建 |
| `compaction` | 上下文压缩 | 压缩触发、结果 |
| `all` 或 `*` | 开启所有日志 | 完整调试 |

### 层级类别支持

```bash
# 开启所有 tool-calls 子类别
DEBUG_CATEGORY=tool-calls

# 只开启特定子类别
DEBUG_CATEGORY=tool-calls.read,tool-calls.write
```

## 流程框架学习路径

按照以下顺序阅读日志输出，可以理解完整流程：

1. **启动阶段** (`entry.ts` → `run-main.ts` → `server.impl.ts`)
2. **会话管理** (`store.ts` → `session-utils.ts`)
3. **命令处理** (`agent-command.ts` → `pi-embedded-runner/run.ts`)
4. **上下文构建** (`skills/workspace.ts` → `openclaw-tools.ts`)
5. **事件处理** (`server-chat.ts`)

## 示例日志输出

### 传统日志格式

完整的 agent 命令执行日志流程：

```
[entry] === OpenClaw Entry Point Started ===
[runCli] === CLI Runner Started ===
[agentCommandInternal] === Agent Command Internal Started ===
[prepareAgentCommandExecution] === Preparing Agent Command ===
[buildWorkspaceSkillSnapshot] workspaceDir: /path/to/workspace
[buildWorkspaceSkillSnapshot] eligible skills count: 15
[agentCommandInternal] skillsSnapshot skills count: 15
[runEmbeddedPiAgent] === PI Embedded Agent Starting ===
[runEmbeddedPiAgent] provider: anthropic
[runEmbeddedPiAgent] model: sonnet-4.6
[createOpenClawTools] === Creating OpenClaw Tools ===
[emitChatDelta] sessionKey: abc... runId: xyz... seq: 1 textLen: 128
```

### 工具调用日志格式

```bash
# 开启工具调用日志
DEBUG_CATEGORY=tool-calls,tool-results pnpm gateway
```

输出：

```
[2026-04-22T10:30:45.123Z] [INFO] [TOOL-CALLS] Tool call: read
{
  "args": {
    "path": "/path/to/file.txt"
  },
  "sessionId": "session-123",
  "timestamp": 1713789045123
}

[2026-04-22T10:30:45.456Z] [INFO] [TOOL-RESULTS] Tool result: read
{
  "success": true,
  "durationMs": 33,
  "resultPreview": "file content..."
}

[2026-04-22T10:30:46.000Z] [INFO] [TOOL-CALLS] Tool call: grep
{
  "args": {
    "pattern": "TODO",
    "path": "/src"
  }
}

[2026-04-22T10:30:46.250Z] [WARN] [TOOL-RESULTS] Tool result: grep
{
  "success": false,
  "durationMs": 250,
  "error": "Pattern not found"
}
```

### 工具创建日志

工具创建时的日志输出：

```
=== Creating OpenClaw Tools ===
{
  "agentSessionKey": "abc123...",
  "agentDir": "/path/to/agent",
  "sessionId": "session-123",
  "sandboxed": false,
  "disableMessageTool": false
}

OpenClaw Tools created: 25 tools
{
  "coreTools": ["browser", "canvas", "nodes", "cron", "message", ...],
  "pluginTools": ["read", "write", "exec", "process", ...]
}
```

### 工具执行日志

工具调用时的详细日志：

```
[TOOL-CALLS] Tool call: read
{
  "toolCallId": "call_abc123",
  "params": "{\"path\":\"/path/to/file\"}",
  "sessionId": "session-123",
  "sessionKey": "key_abc..."
}

[TOOL-RESULTS] Tool result: read
{
  "toolCallId": "call_abc123",
  "success": true,
  "durationMs": 45,
  "resultPreview": "file content..."
}
```

工具被 hook 拦截的日志：

```
[TOOL-RESULTS] Tool blocked: exec
{
  "toolCallId": "call_abc123",
  "reason": "Command not allowed by policy"
}
```

工具执行错误的日志：

```
[TOOL-RESULTS] Tool error: write
{
  "toolCallId": "call_abc123",
  "success": false,
  "durationMs": 12,
  "error": "EACCES: permission denied"
}
```

## 注意事项

1. 调试日志已精简关键信息，敏感数据（如完整 sessionKey）已截断
2. 日志前缀便于使用 grep 过滤：`console.log | grep "\[agentCommand\]"`
3. 某些日志仅在特定条件下触发（如缓存命中/未命中）
4. 生产环境建议关闭详细调试日志，使用子系统日志

## 禁用调试日志

如需禁用调试日志，可以：

1. 注释掉 `console.log()` 语句
2. 使用环境变量控制：`DEBUG=false`
3. 构建时移除调试代码

## 下一步

要继续深入学习，建议：

1. 运行实际的 agent 命令观察日志输出
2. 阅读对应源文件了解日志上下文的业务逻辑
3. 查看 `src/logging/` 目录了解日志系统架构
4. 阅读 `src/infra/agent-events.ts` 了解事件系统
