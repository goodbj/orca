# magpie-tunnel.ps1 - PowerShell 版隧道脚本
# 执行策略：Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

$WEB_KEY = "你的web密钥"
$TUNNEL_PORT = 3430
$REMOTE_HOST = "你的服务器"

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  magpie web UI 隧道启动脚本 (PowerShell)" -ForegroundColor Cyan
Write-Host "  服务器: $REMOTE_HOST" -ForegroundColor Yellow
Write-Host "  web key: $WEB_KEY" -ForegroundColor Yellow
Write-Host "===========================================" -ForegroundColor Cyan

# 检查 SSH 连接
try {
    $null = ssh -q -o BatchMode=yes -o ConnectTimeout=5 $REMOTE_HOST "exit"
} catch {
    Write-Host "[错误] SSH 连接到 $REMOTE_HOST 失败" -ForegroundColor Red
    Write-Host "请确保 SSH key 已配置且服务器可访问"
    Read-Host "按 Enter 退出"
    exit 1
}

# 检查端口占用
$portInUse = Get-NetTCPConnection -LocalPort $TUNNEL_PORT -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "[错误] 本地端口 $TUNNEL_PORT 已被占用" -ForegroundColor Red
    Write-Host "占用进程: $($portInUse.OwningProcess)" -ForegroundColor Red
    Write-Host "请关闭占用该端口的程序后再试"
    Read-Host "按 Enter 退出"
    exit 1
}

# 启动 SSH 隧道（后台作业）
Write-Host "正在启动 SSH 隧道..." -ForegroundColor Green
$tunnelJob = Start-Job -ScriptBlock {
    param($hostname, $port)
    ssh -N -L ${port}:127.0.0.1:${port} $hostname
} -ArgumentList $REMOTE_HOST, $TUNNEL_PORT

# 等待隧道建立
Start-Sleep -Seconds 3

# 打开浏览器
$url = "http://127.0.0.1:${TUNNEL_PORT}/?k=$WEB_KEY"
Write-Host "打开浏览器: $url" -ForegroundColor Green
Start-Process $url

Write-Host ""
Write-Host "隧道已启动，浏览器已打开" -ForegroundColor Cyan
Write-Host "网关地址: http://你的服务器IP:3425" -ForegroundColor Yellow
Write-Host "网关密钥: 你的网关密钥" -ForegroundColor Yellow
Write-Host ""
Write-Host "[提示]" -ForegroundColor Magenta
Write-Host "1. 关闭此窗口会断开隧道"
Write-Host "2. 需要添加 API 密钥时，通过浏览器配置"
Write-Host "3. 在 web UI 中生成新的 gateway key 供 Agent 使用"
Write-Host ""

Write-Host "按 Ctrl+C 停止隧道并退出" -ForegroundColor DarkYellow

# 保持窗口运行，直到用户中断
try {
    Wait-Job $tunnelJob -ErrorAction Stop
} catch {
    # 用户中断或隧道异常
    Write-Host "`n停止隧道..." -ForegroundColor Yellow
    Stop-Job $tunnelJob -ErrorAction SilentlyContinue
    Remove-Job $tunnelJob -Force -ErrorAction SilentlyContinue
    Write-Host "隧道已关闭" -ForegroundColor Green
}

Read-Host "按 Enter 退出"