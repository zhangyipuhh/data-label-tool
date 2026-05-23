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

:: 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] Python 未安装
    pause
    exit /b 1
)

:: 安装 npm 依赖
echo [步骤 1/5] 检查并安装 npm 依赖...
if not exist "node_modules" (
    call npm install
)

:: 安装 PyInstaller
echo [步骤 2/5] 检查 PyInstaller...
python -m PyInstaller --version >nul 2>&1
if errorlevel 1 (
    echo 安装 PyInstaller...
    python -m pip install pyinstaller
)

:: 安装 Python 依赖
echo [步骤 3/5] 检查 Python 环境...
cd python_service
python -m pip install -r requirements.txt >nul 2>&1
cd ..

:: 使用 PyInstaller 打包 Python 服务
echo [步骤 4/5] 打包 Python 服务...
if exist "python_dist" (
    rmdir /s /q python_dist
)
python -m PyInstaller python_service\data-label-tool.spec --noconfirm --distpath python_dist --workpath python_dist\build
if errorlevel 1 (
    echo [错误] Python 服务打包失败
    pause
    exit /b 1
)

:: 验证 Python 打包输出
if not exist "python_dist\app\app.exe" (
    echo [错误] Python 服务可执行文件未生成
    pause
    exit /b 1
)
echo [成功] Python 服务打包完成: python_dist\app\app.exe

:: 构建并打包 Electron 应用
echo [步骤 5/5] 构建并打包 Windows 安装程序...
call npm run build:win

echo.
echo ========================================
echo [完成] 打包成功！
echo 安装程序位于: release/ 目录
echo ========================================
echo.
echo [注意] 用户安装后需手动将 models\abbr_mapper_nar\ 目录
echo        复制到安装目录的 resources\models\ 下
echo.
pause
