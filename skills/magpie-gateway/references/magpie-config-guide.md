# magpie 配置指南

## 环境变量参考

| 变量                  | 说明             | 示例                                                                                            |
| --------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| `MAGPIE_PUBLIC_URL`   | 网关公网访问地址 | `http://你的服务器IP:3425`                                                                    |
| `MAGPIE_WEB_KEY`      | 固定 Web UI 密钥 | `magpie-web-xxxxxx`（避免重启变化）                                                             |
| `MAGPIE_BACKUP_REPO`  | 备份 Git 仓库    | `goodbj/AI_Memory`                                                                              |
| `MAGPIE_BACKUP_TOKEN` | 备份令牌         | `你的备份令牌` |
| `DISABLE_AUTOUPDATER` | 禁用自动更新     | `1`（保持版本）                                                                                 |
| `GROK_BIN_DIR`        | Grok CLI 路径    | `/config/home/.grok`                                                                            |

## 端口说明

| 端口     | 用途     | 绑定建议                    |
| -------- | -------- | --------------------------- |
| **3425** | 网关 API | `0.0.0.0`（公网访问）       |
| **3430** | Web UI   | `127.0.0.1`（SSH 隧道访问） |

**安全提示**：Web UI 包含完整配置权限，密钥明文传输，切勿直接暴露公网。

## 配置目录结构（Docker 卷）

```
/config
├── cache/           # 缓存文件（Claude Code 等下载）
├── data/            # 运行时数据
├── home/            # 用户主目录（插件等）
├── magpie/          # magpie 主配置
│   ├── providers/   # 提供商配置
│   ├── groups/      # 路由组配置
│   ├── keys/        # 网关密钥
│   └── settings.yml # 全局设置
└── state/           # 状态文件
```

## 常用 CLI 命令

### 提供商管理

```bash
# 列出所有提供商
docker exec magpie magpie providers

# 添加提供商
docker exec magpie magpie provider add <provider> <api-key>

# 移除提供商
docker exec magpie magpie provider remove <provider-id>

# 启用/禁用
docker exec magpie magpie provider enable <provider-id>
docker exec magpie magpie provider disable <provider-id>
```

### 路由组管理

```bash
# 列出路由组
docker exec magpie magpie groups

# 创建智能路由组
docker exec magpie magpie group add "智能编码" \
  models=openai/gpt-5.4-mini,deepseek/deepseek-v4-pro,kimi/kimi-k3 \
  routing=smart

# 删除路由组
docker exec magpie magpie group remove <group-id>
```

### 网关密钥管理

```bash
# 列出密钥
docker exec magpie magpie gateway-key list

# 添加密钥
docker exec magpie magpie gateway-key add "Agent-Key" --key <密钥值>

# 删除密钥
docker exec magpie magpie gateway-key remove <key-id>
```

### 备份与同步

```bash
# 同步到备份仓库
docker exec -it magpie magpie backup sync

# 从备份恢复
docker exec -it magpie magpie backup restore

# 设置备份密码（首次）
docker exec -it magpie magpie backup passphrase
```

## 模型 ID 格式

magpie 使用统一格式：`provider/model` 或 `group/group-name`

### 示例

- `openai/gpt-5.4-mini`
- `deepseek/deepseek-v4-pro`
- `kimi/kimi-k3`
- `claude/claude-sonnet-5-5`
- `group/never-stuck`（路由组）

获取完整列表：

```bash
docker exec magpie magpie models
```

## 最佳实践

### 1. 固定 Web 密钥

```bash
# 生成固定密钥
WEB_KEY="magpie-web-$(date +%s | md5sum | head -c 16)"

# 启动时设置
-e MAGPIE_WEB_KEY=$WEB_KEY
```

### 2. 使用命名卷

避免使用主机目录权限问题：

```bash
-v magpie-config:/config   # 命名卷
# 而不是
-v /opt/magpie/config:/config
```

### 3. 定期备份

设置自动备份到 Git 仓库：

```bash
-e MAGPIE_BACKUP_REPO=goodbj/AI_Memory
-e MAGPIE_BACKUP_TOKEN=你的令牌
```

### 4. 安全访问

- Web UI 只通过 SSH 隧道访问
- 网关密钥定期轮换
- 监控 3425 端口的异常访问

### 5. 性能监控

```bash
# 查看容器资源使用
docker stats magpie

# 查看日志
docker logs --tail 50 magpie | grep -E "(error|warn|slow)"
```

## 故障排查

### 网关返回 401

```bash
curl -H "Authorization: Bearer <key>" http://127.0.0.1:3425/v1/models
```

检查：

1. 网关密钥是否正确
2. 容器是否健康运行
3. 网络连接是否正常

### Web UI 无法访问

1. 检查隧道是否建立：`ssh -L 3430:127.0.0.1:3430 服务器`
2. 检查 Web 密钥：`docker logs magpie | grep "k="`
3. 确认 3430 端口绑定：`docker port magpie 3430`

### 提供商无法连接

1. 检查 API 密钥是否有效
2. 查看提供商状态：`docker exec magpie magpie providers`
3. 检查网络代理设置

### 模型列表为空

1. 提供商是否已添加并启用
2. 是否有可用配额
3. 检查 `docker logs magpie` 中的刷新日志

## 版本升级

```bash
# 拉取新镜像
docker pull ghcr.io/yetone/magpie:latest

# 停止旧容器
docker stop magpie

# 备份配置（确保已设置备份）
docker exec magpie magpie backup sync

# 移除旧容器
docker rm magpie

# 启动新容器（使用相同卷和环境变量）
docker run ...（同原命令）
```

**升级注意**：

- 配置卷自动保留
- Web 密钥需重新获取（若未固定）
- 检查新版本特性变化
