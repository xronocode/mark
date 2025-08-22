# 配置 Electron MCP Server 到 Trae IDE

## 问题解决

您遇到的错误是因为 `electron-mcp-server` 需要设置 `SCREENSHOT_ENCRYPTION_KEY` 环境变量。我已经为您生成了一个安全的32字节十六进制密钥：

```
70a897b57310270e5ab1a765875f176bdf6d4eb4020dca974f5eac0240fac7d3
```

## 配置步骤

### 1. 打开 MCP 配置文件

在 Trae IDE 中，打开您的 MCP 配置文件：
`/Users/hubo/Library/Application Support/Trae/User/mcp.json`

### 2. 添加 electron-mcp-server 配置

将以下配置添加到您的 `mcp.json` 文件中：

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

如果您的配置文件中已经有其他 MCP 服务器，请将 `electron-mcp-server` 配置添加到现有的 `mcpServers` 对象中：

```json
{
  "mcpServers": {
    "existing-server": {
      "command": "existing-command",
      "args": []
    },
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

### 3. 重启 Trae IDE

保存配置文件后，重启 Trae IDE 以加载新的 MCP 服务器配置。

### 4. 验证配置

重启后，您应该能够在 MCP 服务器列表中看到 `electron-mcp-server`，并可以使用以下工具：

- `get_electron_window_info` - 获取 Electron 窗口信息
- `take_screenshot` - 截取屏幕截图
- `send_command_to_electron` - 向 Electron 应用发送命令
- `read_electron_logs` - 读取 Electron 应用日志（包括开发者工具控制台信息）

## 使用示例

配置完成后，您可以通过 MCP 工具来获取 Electron 应用的开发者工具控制台信息：

1. 使用 `get_electron_window_info` 获取当前运行的 Electron 应用信息
2. 使用 `read_electron_logs` 读取应用的控制台日志
3. 使用 `send_command_to_electron` 向应用发送调试命令

## 安全说明

- 生成的密钥用于加密截图数据，请妥善保管
- 如需重新生成密钥，可使用命令：`openssl rand -hex 32`
- 建议不要在公共代码仓库中提交包含密钥的配置文件

现在您可以通过 MCP 工具来调试和监控 Electron 应用的开发者工具控制台了！