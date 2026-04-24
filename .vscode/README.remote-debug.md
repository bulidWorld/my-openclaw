# VSCode Remote-SSH 调试 OpenClaw Gateway

## 前提条件

1. 安装 VSCode 扩展：
   - Remote - SSH (`ms-vscode-remote.remote-ssh`)
   - Remote - SSH: Editing Configuration Files

2. 配置 SSH 连接（`~/.ssh/config`）：
```
Host openclaw-server
    HostName <your-server-ip>
    User <your-username>
    IdentityFile ~/.ssh/id_rsa
```

## 调试步骤

### 步骤 1：连接到远程服务器

1. 点击 VSCode 左下角绿色图标
2. 选择 "Connect to Host" → "openclaw-server"
3. 在新窗口中打开 `/opt/apps/openclaw_orgin/openclaw` 目录

### 步骤 2：启动 Gateway（带调试端口）

**方式 A：使用 Debug 配置（推荐）**

1. 按 `F5` 或点击 "Run and Debug" 侧边栏
2. 选择 **"Gateway (Remote Debug)"**
3. 确保 Gateway 已通过以下方式之一启动：
   ```bash
   # 方式 1：直接带 inspect 标志
   NODE_OPTIONS="--inspect=9229" pnpm openclaw gateway
   
   # 方式 2：使用 openclaw 命令的 debug 模式
   OPENCLAW_LOG_LEVEL=debug NODE_OPTIONS="--inspect=9229" pnpm openclaw gateway > /var/log/openclaw/gateway.log 2>&1 &
   ```

**方式 B：手动启动后附加**

```bash
# SSH 连接到服务器
ssh openclaw-server

# 停止现有 gateway（如果有）
pkill -f "openclaw gateway"

# 带调试端口启动
cd /opt/apps/openclaw_orgin/openclaw
NODE_OPTIONS="--inspect=9229" pnpm openclaw gateway > /var/log/openclaw/gateway.log 2>&1 &

# 验证进程
ps aux | grep "node.*9229"
```

然后在 VSCode 中：
1. 按 `F5`
2. 选择 **"Gateway (Remote Debug)"**
3. 点击绿色运行按钮

### 步骤 3：设置断点调试

1. 在源代码文件中设置断点（点击行号左侧）
2. 触发 Gateway 行为（发送消息、调用工具等）
3. 查看 Variables、Call Stack、Debug Console

## 配置文件说明

### launch.json 配置

**Gateway (Remote Debug)** - 附加到远程进程：
```json
{
    "name": "Gateway (Remote Debug)",
    "type": "node",
    "request": "attach",
    "address": "localhost",
    "port": 9229,
    "localRoot": "${workspaceFolder}",
    "remoteRoot": "${workspaceFolder}"
}
```

- `localRoot` / `remoteRoot`: 映射本地和远程工作目录
- `skipFiles`: 跳过 node 内部和 node_modules 的调试

**Gateway (Direct Launch)** - 直接启动（本地调试）：
```json
{
    "name": "Gateway (Direct Launch)",
    "type": "node",
    "request": "launch",
    "runtimeExecutable": "pnpm",
    "runtimeArgs": ["openclaw", "gateway"]
}
```

## 常用调试场景

### 1. 调试消息处理流程
断点位置：
- `src/gateway/server-methods/chat.ts:1240` - 消息入口
- `src/auto-reply/reply/get-reply.ts` - 回复决策
- `src/auto-reply/reply/agent-runner-execution.ts` - Agent 执行

### 2. 调试工具调用
断点位置：
- `src/agents/pi-tools.ts` - 工具创建
- `src/agents/pi-embedded-runner/run/attempt.ts:1681` - 工具执行循环

### 3. 调试工作空间操作
断点位置：
- `src/agents/workspace-run.ts:74-116` - 工作空间解析
- `src/infra/fs-safe.ts:547-589` - 文件写入验证

## 故障排查

### 无法连接到调试端口
```bash
# 检查端口是否开放
netstat -tlnp | grep 9229

# 检查防火墙
sudo ufw status | grep 9229

# 临时开放端口（测试用）
sudo ufw allow 9229
```

### 断点不命中
1. 确认源代码与运行代码版本一致
2. 检查 `outFiles` 配置是否匹配输出目录
3. 重启 Gateway 进程

### Source Map 问题
确保已执行：
```bash
pnpm build
```

## 日志查看

```bash
# 实时查看日志
tail -f /var/log/openclaw/gateway.log

# 使用项目脚本
./scripts/clawlog.sh
```
