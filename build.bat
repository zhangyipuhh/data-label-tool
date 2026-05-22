@echo off
chcp 65001 >nul
echo ========================================
echo     数据标注工具 - Windows 打包
echo ========================================
echo.

:: 检查 Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo [错误] Node.js 未安装
    pause
    exit /b 1
)

:: 安装依赖
echo [步骤 1/3] 检查并安装依赖...
if not exist "node_modules" (
    call npm install
)

:: 检查 Python 依赖
echo [步骤 2/3] 检查 Python 环境...
cd python_service
python -m pip install -r requirements.txt >nul 2>&1
cd ..

:: 构建并打包
echo [步骤 3/3] 构建并打包 Windows 安装程序...
call npm run build:win

echo.
echo ========================================
echo [完成] 打包成功！
echo 安装程序位于: release/ 目录
echo ========================================
pause
