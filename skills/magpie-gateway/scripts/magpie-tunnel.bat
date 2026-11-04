@echo off
REM magpie-tunnel.bat - 双击打开 SSH 隧道并启动 magpie web UI
REM 需要预先配置 SSH key 到服务器

set WEB_KEY=你的web密钥
set TUNNEL_PORT=3430
set REMOTE_HOST=你的服务器

echo ===========================================
echo   magpie web UI 隧道启动脚本
echo   服务器: %REMOTE_HOST%
echo   web key: %WEB_KEY%
echo ===========================================

REM 检查 SSH 是否可用
ssh -q -o BatchMode=yes -o ConnectTimeout=5 %REMOTE_HOST% exit
if %ERRORLEVEL% neq 0 (
    echo [错误] SSH 连接到 %REMOTE_HOST% 失败
    echo 请确保 SSH key 已配置且服务器可访问
    pause
    exit /b 1
)

REM 检查端口是否被占用
netstat -ano | findstr :%TUNNEL_PORT% > nul
if %ERRORLEVEL% equ 0 (
    echo [错误] 本地端口 %TUNNEL_PORT% 已被占用
    echo 请关闭占用该端口的程序后再试
    pause
    exit /b 1
)

REM 启动 SSH 隧道（后台静默运行）
echo 正在启动 SSH 隧道...
start /B /MIN ssh -N -L %TUNNEL_PORT%:127.0.0.1:%TUNNEL_PORT% %REMOTE_HOST%

REM 等待隧道建立
timeout /t 3 /nobreak > nul

REM 启动浏览器
echo 打开浏览器: http://127.0.0.1:%TUNNEL_PORT%/?k=%WEB_KEY%
start "" "http://127.0.0.1:%TUNNEL_PORT%/?k=%WEB_KEY%"

echo.
echo 隧道已启动，浏览器已打开
echo 网关地址: http://你的服务器IP:3425
echo 网关密钥: 你的网关密钥
echo.
echo [提示]
echo 1. 关闭此窗口会断开隧道
echo 2. 需要添加 API 密钥时，通过浏览器配置
echo 3. 在 web UI 中生成新的 gateway key 供 Agent 使用
echo.

pause