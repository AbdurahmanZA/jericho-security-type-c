@echo off
REM JERICHO Security Type C - GitHub-First Daily Start
REM Run this every time you start development

echo 🌅 Starting JERICHO Development Day
echo ====================================
echo.

REM Check if in correct directory
if not exist "package.json" (
    echo ❌ Error: Not in project root directory
    echo Please run this from: C:\Users\Admin\OneDrive\Desktop\jericho-security-type-c
    pause
    exit /b 1
)

echo 📥 Pulling latest from GitHub (source of truth)...
git pull origin main

if %errorlevel% neq 0 (
    echo ❌ Pull failed - check your internet connection
    echo ⚠️ If you have local changes, they may conflict with GitHub
    echo Run github-sync.bat to force sync with GitHub
    pause
    exit /b 1
)

echo 📦 Updating dependencies from GitHub state...

REM Root dependencies
echo Installing root dependencies...
call npm install

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

echo.
echo ✅ JERICHO Development Environment Ready!
echo 📋 GitHub is your source of truth
echo 🚀 Start development: npm run dev
echo 📤 Push changes: quick-push.bat
echo 🔄 Force sync: github-sync.bat
echo.
pause