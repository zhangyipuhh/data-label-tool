# 数据标注工具 - PowerShell 快速启动脚本
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "    数据标注工具 - 快速启动" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Node.js
try {
    $nodeVersion = node -v 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[信息] Node.js 版本: $nodeVersion" -ForegroundColor Green
    } else {
        throw "Node.js 未找到"
    }
} catch {
    Write-Host "[错误] Node.js 未安装，请先安装 Node.js 18+" -ForegroundColor Red
    Write-Host "下载地址: https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "按 Enter 键退出"
    exit 1
}

# 检查 Python
try {
    $pythonVersion = python --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[信息] Python 版本: $pythonVersion" -ForegroundColor Green
    } else {
        throw "Python 未找到"
    }
} catch {
    Write-Host "[警告] Python 未安装或版本不对，推理功能将使用模拟数据" -ForegroundColor Yellow
    Write-Host "         推荐版本: Python 3.10 (https://python.org)" -ForegroundColor Yellow
    Write-Host "如需完整功能，请安装 Python 3.8+" -ForegroundColor Yellow
    Write-Host ""
}

# 检查 node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "[信息] 正在安装依赖，请稍候..." -ForegroundColor Cyan
    Write-Host "[信息] 如果安装失败，请以管理员身份运行 PowerShell" -ForegroundColor Yellow
    
    npm install
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[错误] 依赖安装失败" -ForegroundColor Red
        Write-Host "[提示] 请尝试以下方法:" -ForegroundColor Yellow
        Write-Host "       1. 以管理员身份运行 PowerShell" -ForegroundColor Yellow
        Write-Host "       2. 手动执行: npm install" -ForegroundColor Yellow
        Write-Host "       3. 清除 npm 缓存: npm cache clean --force" -ForegroundColor Yellow
        Read-Host "按 Enter 键退出"
        exit 1
    }
}

# 检查 vite 是否安装
if (-not (Test-Path "node_modules\.bin\vite.cmd")) {
    Write-Host "[错误] vite 未安装，请重新运行 npm install" -ForegroundColor Red
    Read-Host "按 Enter 键退出"
    exit 1
}

# 启动应用
Write-Host "[信息] 正在启动数据标注工具..." -ForegroundColor Cyan
Write-Host ""

npm run dev

Read-Host "按 Enter 键退出"
