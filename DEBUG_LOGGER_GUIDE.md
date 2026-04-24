# Debug Logger 使用指南

## 概述

OpenClaw 调试日志工具允许你通过环境变量按需开启不同类别的调试日志输出，帮助诊断问题而不产生过多噪音。

## 快速开始

### 基本用法

```bash
# 开启工具调用日志
DEBUG_CATEGORY=tool-calls pnpm dev

# 开启多个类别
DEBUG_CATEGORY=tool-calls,api,subagents pnpm dev

# 开启所有日志
DEBUG_CATEGORY=all pnpm dev
# 或者
DEBUG_CATEGORY=* pnpm dev
```

### 在代码中使用

```typescript
import { createDebugLogger, DEBUG_CATEGORIES } from "./debug-logger";

// 方式 1: 使用预定义的类别常量
const logger = createDebugLogger(DEBUG_CATEGORIES.TOOL_CALLS);

// 方式 2: 使用自定义类别
const logger = createDebugLogger("my-custom-category");

// 打印日志
logger.log("Simple message");
logger.info("Info message", { data: "value" });
logger.warn("Warning message", someObject);
logger.error("Error message", error);
logger.debug("Debug message", debugData);
```

## 可用的日志类别

### 预定义类别 (DEBUG_CATEGORIES)

| 类别常量 | 环境变量值 | 用途 |
|----------|------------|------|
| `TOOL_CALLS` | `tool-calls` | 工具调用日志 |
| `TOOL_RESULTS` | `tool-results` | 工具执行结果日志 |
| `API` | `api` | API 请求/响应日志 |
| `SUBAGENTS` | `subagents` | 子代理相关日志 |
| `SESSIONS` | `sessions` | 会话管理日志 |
| `CONFIG` | `config` | 配置加载/应用日志 |
| `CHANNELS` | `channels` | 频道相关日志 |
| `CRON` | `cron` | 定时任务日志 |
| `MCP` | `mcp` | MCP 协议日志 |
| `ACP` | `acp` | ACP 协议日志 |
| `HOOKS` | `hooks` | 钩子函数日志 |
| `PLUGINS` | `plugins` | 插件相关日志 |
| `MEMORY` | `memory` | 记忆功能日志 |
| `CONTEXT` | `context` | 上下文管理日志 |
| `COMPACT` | `compaction` | 上下文压缩日志 |
| `ALL` | `all` | 开启所有日志 |

### 层级类别支持

日志类别支持点号分隔的层级结构：

```bash
# 开启所有 tool-calls 子类别
DEBUG_CATEGORY=tool-calls pnpm dev

# 只开启特定子类别
DEBUG_CATEGORY=tool-calls.read pnpm dev

# 组合使用
DEBUG_CATEGORY=tool-calls.read,tool-calls.write pnpm dev
```

当父类别启用时，子类别自动启用：
- 启用 `tool-calls` → `tool-calls.read`, `tool-calls.write`, `tool-calls.exec` 都会输出

## 日志输出格式

```
[2026-04-22T10:30:45.123Z] [INFO] [TOOL-CALLS] Tool call: read
{
  "args": {
    "path": "/path/to/file.txt"
  },
  "sessionId": "session-123",
  "timestamp": 1713789045123
}
```

## 工具调用日志示例

### 记录工具调用

```typescript
import {
  logToolCall,
  logToolResult,
  logToolCallByType,
  ToolCallTimer,
  createLoggedToolCall,
} from "./tool-call-logger";

// 方式 1: 手动记录
async function readFile(path: string) {
  logToolCall({ toolName: "read", args: { path } });
  try {
    const content = await fs.readFile(path, "utf-8");
    logToolResult({ toolName: "read", success: true, result: content });
    return content;
  } catch (err) {
    logToolResult({ toolName: "read", success: false, error: err.message });
    throw err;
  }
}

// 方式 2: 使用定时器（自动记录耗时）
async function writeFile(path: string, content: string) {
  const timer = new ToolCallTimer("write");
  try {
    const result = await fs.writeFile(path, content);
    timer.end(result);
    return result;
  } catch (err) {
    timer.end(undefined, err.message);
    throw err;
  }
}

// 方式 3: 按工具类型记录（支持细粒度控制）
async function execCommand(cmd: string) {
  logToolCallByType("exec", { command: cmd }, { shell: "bash" });
  // ...
}

// 方式 4: 自动包装工具函数
const loggedRead = createLoggedToolCall("read", async (path: string) => {
  return await fs.readFile(path, "utf-8");
});
```

### 记录批量工具调用

```typescript
import { logToolBatch } from "./tool-call-logger";

async function executeParallelTools(calls: Array<{ name: string; args: unknown }>) {
  logToolBatch("batch-001", calls);
  // ... 并行执行
}
```

## 在现有代码中集成

### 在工具调用入口处添加

找到工具调用的核心函数，例如在 `src/agents/tools/` 或相关工具实现文件中：

```typescript
import { logToolCall, logToolResult, DEBUG_CATEGORIES } from "../utils/debug-logger";

const toolLogger = createDebugLogger(DEBUG_CATEGORIES.TOOL_CALLS);

async function executeToolCall(toolName: string, args: unknown): Promise<unknown> {
  // 只在调试开启时执行日志逻辑，避免性能开销
  if (toolLogger.isEnabled()) {
    toolLogger.info(`Executing: ${toolName}`, JSON.stringify(args));
  }
  
  const startTime = Date.now();
  try {
    const result = await actualToolImplementation(toolName, args);
    
    if (toolLogger.isEnabled()) {
      const duration = Date.now() - startTime;
      toolLogger.info(`Completed: ${toolName} (${duration}ms)`);
    }
    
    return result;
  } catch (err) {
    if (toolLogger.isEnabled()) {
      toolLogger.error(`Failed: ${toolName}`, err);
    }
    throw err;
  }
}
```

## 最佳实践

1. **生产环境关闭调试日志** - 默认不设置 `OPENCLAW_DEBUG` 环境变量

2. **使用预定义类别** - 优先使用 `DEBUG_CATEGORIES` 中的常量

3. **避免敏感信息** - 不要在日志中打印密码、token 等敏感数据

4. **合理 truncate 长内容** - 使用 `previewResult()` 等函数截断长输出

5. **层级命名** - 对于复杂模块，使用层级命名如 `tool-calls.read`, `tool-calls.write`

## 故障排查

### 日志不输出

1. 确认环境变量设置正确：`echo $DEBUG_CATEGORY`
2. 确认类别名称匹配（大小写不敏感）
3. 确认代码中使用了正确的类别

### 日志太多

1. 使用更具体的子类别而非父类别
2. 避免使用 `all` 或 `*`
3. 只开启需要的类别

## 扩展

添加新的日志类别只需在 `DEBUG_CATEGORIES` 中添加常量：

```typescript
export const DEBUG_CATEGORIES = {
  // ... existing categories
  NEW_FEATURE: "new-feature",
} as const;
```
