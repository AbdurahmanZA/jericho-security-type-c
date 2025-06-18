@echo off
REM JERICHO Security Type C - Development Sync Script
REM Pulls latest changes from GitHub and sets up development

echo 🛡️ JERICHO Security Type C - Development Sync
echo ===============================================

REM Check if in correct directory
if not exist "package.json" (
    echo ❌ Error: Not in project root directory
    echo Please run this from: C:\Users\Admin\OneDrive\Desktop\jericho-security-type-c
    pause
    exit /b 1
)

echo 📥 Pulling latest changes from GitHub...
git pull origin main

if %errorlevel% neq 0 (
    echo ❌ Pull failed - check your internet connection
    pause
    exit /b 1
)

echo 📦 Installing/updating dependencies...

REM Root dependencies
if exist "package.json" (
    echo Installing root dependencies...
    call npm install
)

REM Frontend dependencies
if exist "frontend\package.json" (
    echo Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

REM Backend dependencies
if exist "backend\package.json" (
    echo Installing backend dependencies...
    cd backend
    call npm install
    cd ..
)

echo ✅ Development environment synced successfully!
echo 🚀 Ready for development. Run: npm run dev
echo.
pause