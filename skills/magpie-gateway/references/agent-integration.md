# 各 AI Agent 集成指南

## Claude Code

### 方法一：环境变量

```bash
export ANTHROPIC_BASE_URL=http://你的服务器IP:3425
export ANTHROPIC_API_KEY=你的magpie网关密钥
```

### 方法二：配置文件

修改 `~/.claude/settings.json`：

```json
{
  "claude": {
    "api": {
      "baseUrl": "http://你的服务器IP:3425",
      "apiKey": "你的网关密钥"
    }
  }
}
```

### 方法三：启动参数

```bash
claude --api-base-url http://你的服务器IP:3425 --api-key 你的网关密钥
```

## Codex

### 环境变量

```bash
export OPENAI_BASE_URL=http://你的服务器IP:3425/v1
export OPENAI_API_KEY=你的magpie网关密钥
```

### 配置文件

`~/.codex/config.json`：

```json
{
  "openai": {
    "base_url": "http://你的服务器IP:3425/v1",
    "api_key": "你的网关密钥"
  }
}
```

## OpenCode

### CLI 配置

```bash
op config set api.base_url http://你的服务器IP:3425/v1
op config set api.key 你的网关密钥
```

### 环境变量

```bash
export OPENCODEX_API_BASE=http://你的服务器IP:3425/v1
export OPENCODEX_API_KEY=你的网关密钥
```

## Cursor

### 配置

在 Cursor 设置中：

- **API Endpoint**: `http://你的服务器IP:3425/v1`
- **API Key**: `你的网关密钥`

### 环境变量

```bash
export CURSOR_API_BASE=http://你的服务器IP:3425/v1
export CURSOR_API_KEY=你的网关密钥
```

## VSCode 扩展（GitHub Copilot、Codeium 等）

### GitHub Copilot

修改 VSCode 设置：

```json
{
  "github.copilot.advanced": {
    "api.url": "http://你的服务器IP:3425/v1",
    "api.key": "你的网关密钥"
  }
}
```

### Codeium

```json
{
  "codeium.endpoint": "http://你的服务器IP:3425/v1",
  "codeium.apiKey": "你的网关密钥"
}
```

## 命令行工具

### curl 示例

```bash
# 列出可用模型
curl -H "Authorization: Bearer 你的网关密钥" \
  http://你的服务器IP:3425/v1/models

# 调用聊天
curl -H "Authorization: Bearer 你的网关密钥" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-5.4-mini",
    "messages": [{"role": "user", "content": "你好"}]
  }' \
  http://你的服务器IP:3425/v1/chat/completions
```

### Python 客户端

```python
import openai

client = openai.OpenAI(
    base_url="http://你的服务器IP:3425/v1",
    api_key="你的网关密钥",
)

response = client.chat.completions.create(
    model="openai/gpt-5.4-mini",
    messages=[{"role": "user", "content": "Hello"}]
)
```

### Node.js 客户端

```javascript
import OpenAI from 'openai'

const openai = new OpenAI({
  baseURL: 'http://你的服务器IP:3425/v1',
  apiKey: '你的网关密钥'
})

const completion = await openai.chat.completions.create({
  model: 'openai/gpt-5.4-mini',
  messages: [{ role: 'user', content: 'Hello' }]
})
```

## 路由组使用

### 指定路由组

在模型字段中使用 `group/` 前缀：

```bash
# 使用智能路由组
curl -H "Authorization: Bearer 你的网关密钥" \
  -d '{
    "model": "group/never-stuck",
    "messages": [{"role": "user", "content": "..."}]
  }' \
  http://你的服务器IP:3425/v1/chat/completions
```

### 查看可用路由组

```bash
curl -H "Authorization: Bearer 你的网关密钥" \
  http://你的服务器IP:3425/v1/models | grep "group/"
```

## 多环境配置

### 开发环境

```bash
# 本地 magpie（127.0.0.1:3425）
export ANTHROPIC_BASE_URL=http://127.0.0.1:3425
export ANTHROPIC_API_KEY=本地网关密钥
```

### 测试环境

```bash
# 测试服务器 magpie
export ANTHROPIC_BASE_URL=http://测试服务器IP:3425
export ANTHROPIC_API_KEY=测试网关密钥
```

### 生产环境

```bash
# 生产服务器 magpie
export ANTHROPIC_BASE_URL=http://生产服务器IP:3425
export ANTHROPIC_API_KEY=生产网关密钥
```

## 配置验证

### 测试连接

```bash
# 检查网关是否响应
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer 你的网关密钥" \
  http://你的服务器IP:3425/v1/models

# 应返回 200
```

### 验证模型列表

```bash
# 获取可用模型数量
curl -s -H "Authorization: Bearer 你的网关密钥" \
  http://你的服务器IP:3425/v1/models | \
  jq '.data | length'
```

### 测试完整流程

```bash
# 发送测试请求
curl -s -H "Authorization: Bearer 你的网关密钥" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-5.4-mini",
    "messages": [{"role": "user", "content": "Say hello"}],
    "max_tokens": 10
  }' \
  http://你的服务器IP:3425/v1/chat/completions | \
  jq '.choices[0].message.content'
```

## 故障排除

### Agent 无法连接

1. 检查网络连通性：`ping 你的服务器IP`
2. 检查端口开放：`telnet 你的服务器IP 3425` 或 `nc -zv 你的服务器IP 3425`
3. 验证网关密钥：在 magpie Web UI 中确认密钥有效

### 模型不可用

1. 检查提供商状态：`docker exec magpie magpie providers`
2. 确认配额：在 Web UI 中查看提供商配额
3. 检查路由组配置：`docker exec magpie magpie groups`

### 性能问题

1. 查看网关日志：`docker logs --tail 100 magpie`
2. 检查网络延迟：`curl -w "time_total: %{time_total}\n" ...`
3. 考虑启用缓存或调整路由规则

## 自动化脚本

### 一键配置脚本

创建 `configure-agent.sh`：

```bash
#!/bin/bash
SERVER_IP="你的服务器IP"
GATEWAY_KEY="你的网关密钥"

echo "配置 Claude Code..."
cat > ~/.claude/settings.json << EOF
{
  "claude": {
    "api": {
      "baseUrl": "http://${SERVER_IP}:3425",
      "apiKey": "${GATEWAY_KEY}"
    }
  }
}
EOF

echo "配置环境变量..."
echo "export ANTHROPIC_BASE_URL=http://${SERVER_IP}:3425" >> ~/.bashrc
echo "export ANTHROPIC_API_KEY=${GATEWAY_KEY}" >> ~/.bashrc
echo "export OPENAI_BASE_URL=http://${SERVER_IP}:3425/v1" >> ~/.bashrc
echo "export OPENAI_API_KEY=${GATEWAY_KEY}" >> ~/.bashrc

echo "配置完成！重新加载环境：source ~/.bashrc"
```

### 批量部署脚本

适用于多台开发机批量配置。
