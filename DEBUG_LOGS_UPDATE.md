# OpenClaw 调试日志增强说明

## 新增调试日志位置

### 1. 提示词构建日志

**文件：** `src/agents/pi-embedded-runner/run/attempt.ts`

**日志前缀：** `[attempt]`

```
[attempt] === Starting Embedded Run ===
[attempt] runId: ...
[attempt] sessionId: ...
[attempt] provider: anthropic
[attempt] model: claude-opus-4-6
[attempt] effectivePrompt length: 15234
[attempt] messages count: 28
[attempt] systemPrompt length: 3421
[attempt] skills count: 15
[attempt] clientTools count: 12
[attempt] clientTools: bash, edit, write, read, ...
```

### 2. 模型运行日志

**文件：** `src/agents/pi-embedded-runner/run.ts`

**日志前缀：** `[runEmbeddedPiAgent]`

**启动时：**
```
[runEmbeddedPiAgent] === PI Embedded Agent Starting ===
[runEmbeddedPiAgent] sessionId: ...
[runEmbeddedPiAgent] sessionKey: ...
[runEmbeddedPiAgent] agentId: main
[runEmbeddedPiAgent] provider: anthropic
[runEmbeddedPiAgent] model: claude-opus-4-6
[runEmbeddedPiAgent] prompt length: 15234
[runEmbeddedPiAgent] lane: global
```

**每次尝试：**
```
[runEmbeddedPiAgent] === Starting Attempt ===
[runEmbeddedPiAgent] attempt iteration: 1
[runEmbeddedPiAgent] provider: anthropic model: claude-opus-4-6
[runEmbeddedPiAgent] prompt length: 15234
[runEmbeddedPiAgent] thinkLevel: off
[runEmbeddedPiAgent] contextTokenBudget: 200000
[runEmbeddedPiAgent] skillsSnapshot skills count: 15
[runEmbeddedPiAgent] clientTools count: 12
[runEmbeddedPiAgent] disableTools: false
```

**完成时：**
```
[runEmbeddedPiAgent] === Run Completed ===
[runEmbeddedPiAgent] durationMs: 3521
[runEmbeddedPiAgent] aborted: false
[runEmbeddedPiAgent] stopReason: tool_calls
[runEmbeddedPiAgent] pendingToolCall name: bash
[runEmbeddedPiAgent] pendingToolCall params: {"command":"ls -la"}
[runEmbeddedPiAgent] tools executed count: 3
[runEmbeddedPiAgent] tools: bash, read, edit
[runEmbeddedPiAgent] usage totalTokens: 12345
```

**Attempt 完成：**
```
[attempt] === Run Completed ===
[attempt] toolMetas count: 3
[attempt] tools executed: bash, read, edit
[attempt] assistantTexts count: 2
[attempt] lastAssistant role: assistant
[attempt] usage total: 12345
```

### 3. Skills 快照日志

**文件：** `src/agents/skills/workspace.ts`

**日志前缀：** `[buildWorkspaceSkillSnapshot]`

```
[buildWorkspaceSkillSnapshot] workspaceDir: /path/to/workspace
[buildWorkspaceSkillSnapshot] skillFilter: undefined
[buildWorkspaceSkillSnapshot] eligible skills count: 15
[buildWorkspaceSkillSnapshot] prompt length: 8234
```

### 4. Tools 创建日志

**文件：** `src/agents/openclaw-tools.ts`

**日志前缀：** `[createOpenClawTools]`

```
[createOpenClawTools] === Creating OpenClaw Tools ===
[createOpenClawTools] agentSessionKey: ...
[createOpenClawTools] agentDir: /path/to/agent
[createOpenClawTools] sessionId: uuid-1234
[createOpenClawTools] sandboxed: false
[createOpenClawTools] disableMessageTool: false
```

### 5. Chat Delta 日志（已移除）

**文件：** `src/gateway/server-chat.ts`

已移除 `[emitChatDelta]` 日志以减少输出噪音。

## 完整的 Agent 运行日志流程

```
# 1. 技能快照构建
[buildWorkspaceSkillSnapshot] workspaceDir: ...
[buildWorkspaceSkillSnapshot] eligible skills count: 15

# 2. Tools 创建
[createOpenClawTools] === Creating OpenClaw Tools ===
[createOpenClawTools] clientTools count: 12

# 3. PI Embedded 启动
[runEmbeddedPiAgent] === PI Embedded Agent Starting ===
[runEmbeddedPiAgent] provider: anthropic
[runEmbeddedPiAgent] model: claude-opus-4-6

# 4. 尝试开始
[runEmbeddedPiAgent] === Starting Attempt ===
[runEmbeddedPiAgent] attempt iteration: 1

# 5. Attempt 内部
[attempt] === Starting Embedded Run ===
[attempt] effectivePrompt length: 15234
[attempt] messages count: 28
[attempt] tools: bash, edit, write, ...

# 6. 运行完成
[runEmbeddedPiAgent] === Run Completed ===
[runEmbeddedPiAgent] stopReason: tool_calls
[runEmbeddedPiAgent] pendingToolCall name: bash
[runEmbeddedPiAgent] tools executed: bash, read
[runEmbeddedPiAgent] usage totalTokens: 12345

[attempt] === Run Completed ===
[attempt] toolMetas count: 2
```

## 使用方法

### 实时查看日志

```bash
# 查看所有调试日志
tail -f /var/log/openclaw/gateway.log | grep -E "\[runEmbeddedPiAgent\]|\[attempt\]"

# 只看提示词相关
tail -f /var/log/openclaw/gateway.log | grep "\[attempt\]"

# 只看工具调用
tail -f /var/log/openclaw/gateway.log | grep "tools executed\|pendingToolCall"

# 只看 usage
tail -f /var/log/openclaw/gateway.log | grep "usage"
```

### 过滤特定会话

```bash
# 查看特定 session 的日志
tail -f /var/log/openclaw/gateway.log | grep "sessionId: your-session-id"

# 查看特定 runId 的日志
tail -f /var/log/openclaw/gateway.log | grep "runId: your-run-id"
```

## 日志级别说明

当前添加的日志主要为 `console.log()`，在 `OPENCLAW_LOG_LEVEL=debug` 模式下会输出到日志文件。

- **启动日志**：服务启动、配置加载
- **运行日志**：每次 agent 运行、工具调用
- **性能日志**：durationMs、usage tokens

## 下一步

如需更多调试信息，可以在以下位置添加日志：

1. **工具执行详细参数** - `attempt.ts` 工具调用前
2. **工具返回结果** - `attempt.ts` toolResult 处理
3. **提示词 Hook** - `attempt.ts` hook 执行前后
4. **上下文压缩** - `run.ts` compaction 相关
