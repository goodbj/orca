---
name: magpie-gateway
description: AI Agent 统一网关与模型路由服务部署与维护
version: 1.0.0
maintainer: 06_00（集团技术部主管）
reviewed_at: 2026-11-03
tags:
  - AI Agent
  - 网关
  - 模型路由
  - 隐私保护
  - MCP
  - Docker
target_clusters:
  - 公共簇
  - 所有使用 AI Agent 的项目
  - 服务器部署
---

# magpie-gateway 技能

**yetone/magpie** 是一个 AI Agent 网关/模型路由中间件，统一管理所有 AI Agent（Claude Code、Codex、OpenCode 等）的模型选择、API 密钥、配额管理和隐私保护。

## 快速开始

### 1. 服务器部署（Docker）

```bash
# 创建配置目录
mkdir -p /opt/magpie/config

# 运行容器（推荐配置）
docker run -d \
  --name magpie \
  --restart unless-stopped \
  -p 0.0.0.0:3425:3425          # 网关端口（公网可访问）
  -p 127.0.0.1:3430:3430        # Web UI 端口（仅本地，安全）
  -v magpie-config:/config      # 命名卷存储配置
  -e MAGPIE_PUBLIC_URL=http://你的服务器IP:3425 \
  -e MAGPIE_WEB_KEY=你的固定web密钥（可选） \
  -e MAGPIE_BACKUP_REPO=goodbj/AI_Memory \
  -e MAGPIE_BACKUP_TOKEN=你的备份令牌 \
  ghcr.io/yetone/magpie:latest \
  web --addr 0.0.0.0:3430 --no-open
```

**安全建议**：

- Web UI（3430）仅绑定 `127.0.0.1`，通过 SSH 隧道访问
- 设置固定 `MAGPIE_WEB_KEY` 避免每次重启变化
- 使用 Docker 命名卷（`magpie-config`）避免权限问题

### 2. 访问 Web UI（隧道方式）

```bash
# SSH 隧道（在本地执行）
ssh -L 3430:127.0.0.1:3430 你的服务器

# 浏览器打开（密钥从容器日志获取）
http://127.0.0.1:3430/?k=你的web密钥
```

Windows 一键脚本：[magpie-tunnel.bat](./scripts/magpie-tunnel.bat) / [magpie-tunnel.ps1](./scripts/magpie-tunnel.ps1)

### 3. 配置 API 提供商

通过 Web UI 或 CLI 添加：

```bash
# CLI 方式（进入容器执行）
docker exec -it magpie magpie provider add deepseek sk-你的密钥
docker exec -it magpie magpie provider add kimi kimi://用户名:密码
docker exec -it magpie magpie provider add openai sk-你的密钥
```

### 4. 创建网关密钥（供 Agent 使用）

```bash
# 生成随机密钥
KEY=$(openssl rand -hex 32)
docker exec -it magpie magpie gateway-key add "Agent-Key" --key "$KEY"
```

### 5. 配置 AI Agent 客户端

**Claude Code**（修改 `.claude/settings.json`）：

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

**环境变量方式**：

```bash
export ANTHROPIC_BASE_URL=http://你的服务器IP:3425
export ANTHROPIC_API_KEY=你的网关密钥

export OPENAI_BASE_URL=http://你的服务器IP:3425/v1
export OPENAI_API_KEY=你的网关密钥
```

## 核心功能

### 1. 统一模型选择

- 所有 Agent 从同一列表选择模型
- 支持 OpenAI、Anthropic、Gemini、DeepSeek、Kimi 等

### 2. 智能路由

- 配额用尽自动切换账户/模型
- 基于上下文长度、价格、延迟的路由规则

### 3. 隐私掩码

- 本地脱敏敏感数据后再发送给厂商
- 保护代码、密钥、隐私信息

### 4. 配额管理

- 统一查看各提供商配额使用情况
- 设置预算和告警

### 5. 备份与同步

- 配置自动备份到 Git 仓库
- 多设备间同步账号和路由组

## 维护操作

### 更新容器

```bash
docker pull ghcr.io/yetone/magpie:latest
docker rm -f magpie
# 重新运行（使用相同卷和环境变量）
```

### 备份配置

```bash
# 导出配置（加密备份）
docker exec -it magpie magpie backup sync
```

### 恢复配置

```bash
# 从备份仓库恢复
docker exec -it magpie magpie backup restore
```

### 故障排查

```bash
# 查看日志
docker logs -f magpie

# 健康检查
curl http://127.0.0.1:3425/v1/models

# 进入容器调试
docker exec -it magpie sh
```

## 目录结构

```
magpie-gateway/
├── SKILL.md                    # 本技能文档
├── scripts/
│   ├── deploy-magpie.sh        # 一键部署脚本
│   ├── magpie-tunnel.bat       # Windows 隧道脚本
│   ├── magpie-tunnel.ps1       # PowerShell 隧道脚本
│   ├── configure-providers.sh  # 批量配置提供商
│   └── backup-config.sh        # 配置备份脚本
├── references/
│   ├── magpie-config-guide.md  # 配置参考
│   ├── agent-integration.md    # 各 Agent 集成指南
│   └── troubleshooting.md      # 故障排查
└── maintenance/
    └── maintenance-log.md      # 维护记录
```

## 已知问题与解决方案

### 1. Web 密钥每次重启变化

**解决**：设置 `MAGPIE_WEB_KEY` 环境变量固定密钥。

### 2. 数据库加密导致直接替换失效

**解决**：通过 API 或数据库合并方式迁移账号，不直接替换 DB 文件。

### 3. 端口冲突（本地与服务器）

**解决**：本地 magpie 使用默认端口，服务器 magpie 使用相同端口但不同 IP。

### 4. 安全组/防火墙拦截

**解决**：在云控制台开放 3425 端口入站规则。

## 联系与支持

- **维护者**：06_00（集团技术部主管）
- **问题反馈**：通过集团内部 Issue 系统
- **文档更新**：定期根据实际部署经验修订

---

_本技能基于实际部署经验编写，包含血泪教训与最佳实践。_
