@echo off
chcp 65001 >nul
echo ========================================
echo     Data Label Tool - Quick Start
echo ========================================
echo.

:: Check Node.js
node -v >nul 2>&1
if errorlevel 1 (
    echo [Error] Node.js not installed. Please install Node.js 18+
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [Warning] Python not installed. Inference will use mock data.
    echo           Recommended: Python 3.10 (https://python.org)
    echo For full features, please install Python 3.8+
    echo.
)

:: Check node_modules
if not exist "node_modules" (
    echo [Info] Installing dependencies, please wait...
    echo [Info] If installation fails, run as administrator
    call npm install
    if errorlevel 1 (
        echo [Error] Dependencies installation failed
        echo [Tips] Please try:
        echo        1. Run as administrator
        echo        2. Manual: npm install
        echo        3. Clear cache: npm cache clean --force
        pause
        exit /b 1
    )
)

:: Check vite
if not exist "node_modules\.bin\vite.cmd" (
    echo [Error] vite not installed. Please run npm install
    pause
    exit /b 1
)

:: Start app
echo [Info] Starting Data Label Tool...
echo.
npm run dev

pause
