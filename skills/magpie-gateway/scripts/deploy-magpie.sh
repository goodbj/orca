#!/bin/bash
# deploy-magpie.sh - magpie 网关一键部署脚本
# 用法：./deploy-magpie.sh <服务器IP> [web密钥] [备份令牌]

set -e

# 参数
SERVER_IP="${1:-你的服务器IP}"
WEB_KEY="${2:-magpie-web-$(date +%s | md5sum | head -c 16)}"
BACKUP_TOKEN="${3:-}"

echo "==========================================="
echo "  magpie 网关部署脚本"
echo "  服务器: $SERVER_IP"
echo "  web密钥: $WEB_KEY"
echo "==========================================="

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "[错误] Docker 未安装"
    exit 1
fi

# 检查端口占用
if ss -tlnp | grep -q ":3425 "; then
    echo "[错误] 端口 3425 已被占用"
    exit 1
fi

# 创建配置目录
mkdir -p /opt/magpie/config
chmod 755 /opt/magpie/config

# 构建环境变量
ENV_OPTS=""
if [ -n "$BACKUP_TOKEN" ]; then
    ENV_OPTS="$ENV_OPTS -e MAGPIE_BACKUP_REPO=goodbj/AI_Memory"
    ENV_OPTS="$ENV_OPTS -e MAGPIE_BACKUP_TOKEN=$BACKUP_TOKEN"
fi

# 拉取镜像
echo "拉取 magpie 镜像..."
docker pull ghcr.io/yetone/magpie:latest

# 停止并移除旧容器（如果存在）
if docker ps -a --filter name=magpie --format "{{.Names}}" | grep -q magpie; then
    echo "停止旧容器..."
    docker stop magpie 2>/dev/null || true
    docker rm magpie 2>/dev/null || true
fi

# 运行新容器
echo "启动 magpie 容器..."
docker run -d \
  --name magpie \
  --restart unless-stopped \
  -p 0.0.0.0:3425:3425 \
  -p 127.0.0.1:3430:3430 \
  -v magpie-config:/config \
  -e MAGPIE_PUBLIC_URL="http://$SERVER_IP:3425" \
  -e MAGPIE_WEB_KEY="$WEB_KEY" \
  $ENV_OPTS \
  ghcr.io/yetone/magpie:latest \
  web --addr 0.0.0.0:3430 --no-open

# 等待容器健康
echo "等待容器启动..."
for i in {1..30}; do
    if docker inspect magpie --format "{{.State.Health.Status}}" 2>/dev/null | grep -q healthy; then
        echo "容器已健康"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        echo "[警告] 容器启动超时，检查日志: docker logs magpie"
    fi
done

# 显示信息
echo ""
echo "✅ 部署完成！"
echo ""
echo "🔗 网关地址: http://$SERVER_IP:3425"
echo "🔑 Web UI: http://127.0.0.1:3430/?k=$WEB_KEY (需 SSH 隧道)"
echo ""
echo "📝 后续操作:"
echo "1. 通过 SSH 隧道访问 Web UI:"
echo "   ssh -L 3430:127.0.0.1:3430 你的服务器"
echo ""
echo "2. 添加 API 提供商:"
echo "   docker exec -it magpie magpie provider add deepseek sk-你的密钥"
echo ""
echo "3. 生成网关密钥:"
echo "   docker exec -it magpie magpie gateway-key add 'Agent-Key' --key \$(openssl rand -hex 32)"
echo ""
echo "4. 配置 Agent 客户端:"
echo "   export ANTHROPIC_BASE_URL=http://$SERVER_IP:3425"
echo "   export ANTHROPIC_API_KEY=你的网关密钥"
echo ""

# 显示初始 Web 密钥（如果未指定）
if [ "$2" = "" ]; then
    echo "📋 初始 Web 密钥（从容器日志获取）:"
    docker logs --tail 5 magpie 2>&1 | grep -o "k=[^ ]*" | head -1
fi