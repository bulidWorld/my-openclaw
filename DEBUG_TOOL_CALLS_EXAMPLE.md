# 工具调用日志集成示例

本文展示如何在现有工具调用代码中集成调试日志。

## 基本示例

### 1. 简单工具调用日志

```typescript
import { createDebugLogger, DEBUG_CATEGORIES } from "./utils/debug-logger";

const toolLogger = createDebugLogger(DEBUG_CATEGORIES.TOOL_CALLS);

async function readFile(path: string): Promise<string> {
  // 只在日志开启时执行日志逻辑
  if (toolLogger.isEnabled()) {
    toolLogger.info(`Reading file: ${path}`);
  }
  
  const content = await fs.readFile(path, "utf-8");
  
  if (toolLogger.isEnabled()) {
    toolLogger.info(`File read complete, ${content.length} bytes`);
  }
  
  return content;
}
```

### 2. 使用工具调用日志工具

```typescript
import { 
  logToolCall, 
  logToolResult, 
  ToolCallTimer 
} from "./utils/tool-call-logger";

async function writeFile(path: string, content: string): Promise<void> {
  logToolCall({ toolName: "write", args: { path, contentLength: content.length } });
  
  const startTime = Date.now();
  try {
    await fs.writeFile(path, content, "utf-8");
    const duration = Date.now() - startTime;
    
    logToolResult({ 
      toolName: "write", 
      success: true, 
      durationMs: duration 
    });
  } catch (err) {
    logToolResult({ 
      toolName: "write", 
      success: false, 
      error: err.message,
      durationMs: Date.now() - startTime 
    });
    throw err;
  }
}
```

### 3. 使用定时器自动记录

```typescript
import { ToolCallTimer } from "./utils/tool-call-logger";

async function grepContent(pattern: string, path: string): Promise<string[]> {
  const timer = new ToolCallTimer("grep");
  
  try {
    const results = await performGrep(pattern, path);
    timer.end(results);
    return results;
  } catch (err) {
    timer.end(undefined, err.message);
    throw err;
  }
}
```

### 4. 使用装饰器包装工具函数

```typescript
import { createLoggedToolCall } from "./utils/tool-call-logger";

// 原始工具函数
async function execCommand(cmd: string): Promise<{ stdout: string; code: number }> {
  return await exec(cmd);
}

// 自动包装，添加日志
const loggedExec = createLoggedToolCall("exec", execCommand);

// 使用时
const result = await loggedExec("ls -la");
```

## 在 OpenClaw 工具系统中集成

### 在工具创建处添加日志

```typescript
// src/agents/openclaw-tools.ts 或类似文件

import { createDebugLogger, DEBUG_CATEGORIES } from "./utils/debug-logger";
import { logToolCall, logToolResult } from "./utils/tool-call-logger";

const toolLogger = createDebugLogger(DEBUG_CATEGORIES.TOOL_CALLS);

export function createOpenClawTools(options: {...}) {
  const tools = {
    read: async (path: string) => {
      if (toolLogger.isEnabled()) {
        toolLogger.info("Tool: read", JSON.stringify({ path }));
      }
      // ... 原有实现
    },
    
    write: async (path: string, content: string) => {
      const timer = new ToolCallTimer("write");
      try {
        // ... 原有实现
        timer.end({ written: true });
      } catch (err) {
        timer.end(undefined, err.message);
        throw err;
      }
    },
    
    // 其他工具...
  };
  
  return tools;
}
```

### 在工具调用拦截器中添加日志

```typescript
// 在工具调用的统一入口处

import { logToolCallByType } from "./utils/tool-call-logger";

async function handleToolCall(toolName: string, args: unknown): Promise<unknown> {
  // 记录特定类型的工具调用（支持细粒度控制）
  logToolCallByType(toolName, args as Record<string, unknown>, {
    sessionId: getCurrentSessionId(),
  });
  
  // ... 原有工具调用逻辑
}
```

## 日志输出控制

### 开发环境

```bash
# .env 或 .env.local
DEBUG_CATEGORY=tool-calls,tool-results
```

### 生产环境

```bash
# 不设置 DEBUG_CATEGORY，默认不输出调试日志
```

### 临时调试

```bash
# 只查看某个工具的调用
DEBUG_CATEGORY=tool-calls.read pnpm gateway

# 查看特定会话的工具调用
DEBUG_CATEGORY=sessions,tool-calls pnpm gateway
```

## 最佳实践

1. **避免敏感信息** - 不要记录完整的路径、token 等敏感数据
2. **精简输出** - 使用 `previewResult` 等函数截断长内容
3. **条件日志** - 使用 `isEnabled()` 检查，避免不必要的对象序列化
4. **统一风格** - 在项目中保持一致的日志格式

## 完整示例

```typescript
import { 
  createDebugLogger, 
  DEBUG_CATEGORIES,
  logToolCall,
  logToolResult,
  ToolCallTimer 
} from "./utils/debug-logger";

class FileSystemService {
  private logger = createDebugLogger(DEBUG_CATEGORIES.TOOL_CALLS);
  
  async read(path: string): Promise<string> {
    // 方式 1: 手动记录
    if (this.logger.isEnabled()) {
      this.logger.info(`read: ${this.sanitizePath(path)}`);
    }
    
    const content = await this.doRead(path);
    
    if (this.logger.isEnabled()) {
      this.logger.info(`read complete: ${content.length} bytes`);
    }
    
    return content;
  }
  
  async write(path: string, content: string): Promise<void> {
    // 方式 2: 使用定时器
    const timer = new ToolCallTimer("write");
    try {
      await this.doWrite(path, content);
      timer.end({ path: this.sanitizePath(path), length: content.length });
    } catch (err) {
      timer.end(undefined, err.message);
      throw err;
    }
  }
  
  async grep(pattern: string, dir: string): Promise<string[]> {
    // 方式 3: 使用细粒度类别
    const grepLogger = createDebugLogger("tool-calls.grep");
    if (grepLogger.isEnabled()) {
      grepLogger.info("grep", JSON.stringify({ 
        pattern: pattern.slice(0, 50), 
        dir: this.sanitizePath(dir) 
      }));
    }
    
    // ... 实现
    return [];
  }
  
  private sanitizePath(path: string): string {
    // 脱敏路径，避免泄露敏感信息
    return path.replace(/\/home\/[^/]+/g, "/home/***");
  }
  
  private async doRead(path: string): Promise<string> {
    // 实际读取实现
    return "";
  }
  
  private async doWrite(path: string, content: string): Promise<void> {
    // 实际写入实现
  }
}
```
