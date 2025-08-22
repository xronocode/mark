# Electron MCP Server 配置指南

## 问题解决

您遇到的错误是因为 `electron-mcp-server` 需要设置 `SCREENSHOT_ENCRYPTION_KEY` 环境变量。我已经为您生成了一个安全的32字节十六进制密钥。

## 生成的密钥

```
SCREENSHOT_ENCRYPTION_KEY=70a897b57310270e5ab1a765875f176bdf6d4eb4020dca974f5eac0240fac7d3
```

## 配置步骤

### 1. 在 Trae IDE 中配置 MCP 服务器

将以下配置添加到您的 MCP 配置文件中（通常位于 `~/Library/Application Support/Trae/User/mcp.json`）：

```json
{
  "mcpServers": {
    "electron-mcp-server": {
      "command": "electron-mcp-server",
      "args": [],
      "env": {
        "SCREENSHOT_ENCRYPTION_KEY": "70a897b57310270e5ab1a765875f176bdf6d4eb4020dca974f5eac0240fac7d3"
      }
    }
  }
}
```

### 2. 或者设置全局环境变量

您也可以将密钥设置为全局环境变量：

```bash
# 添加到 ~/.zshrc 或 ~/.bash_profile
export SCREENSHOT_ENCRYPTION_KEY=70a897b57310270e5ab1a765875f176bdf6d4eb4020dca974f5eac0240fac7d3
```

### 3. 验证配置

配置完成后，重启 Trae IDE，然后您应该能够在 MCP 服务器列表中看到 `electron-mcp-server`。

## 可用功能

`electron-mcp-server` 提供以下工具：

- `get_electron_window_info` - 获取 Electron 窗口信息
- `take_screenshot` - 截取屏幕截图
- `send_command_to_electron` - 向 Electron 应用发送命令
- `read_electron_logs` - 读取 Electron 应用日志

## 安全说明

- 生成的密钥用于加密截图数据，请妥善保管
- 如需重新生成密钥，可使用命令：`openssl rand -hex 32`
- 建议不要在公共代码仓库中提交包含密钥的配置文件

## 当前状态

✅ electron-mcp-server 已成功启动并运行
✅ 环境变量已正确设置
✅ 服务器运行在 stdio 模式，可与 MCP 客户端通信

现在您可以在 Trae IDE 中使用 electron-mcp-server 来调试和控制 Electron 应用程序了！