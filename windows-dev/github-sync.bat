@echo off
REM JERICHO Security Type C - Force Sync with GitHub
REM WARNING: This will discard all local changes and match GitHub exactly

echo ⚠️  JERICHO Force Sync with GitHub
echo =================================
echo.
echo 🚨 WARNING: This will DISCARD all local changes!
echo 📋 GitHub will become your local state
echo.
set /p confirm="Are you sure? (y/N): "

if /i not "%confirm%"=="y" (
    echo ❌ Sync cancelled
    pause
    exit /b 0
)

REM Check if in correct directory
if not exist "package.json" (
    echo ❌ Error: Not in project root directory
    echo Please run this from: C:\Users\Admin\OneDrive\Desktop\jericho-security-type-c
    pause
    exit /b 1
)

echo.
echo 📥 Fetching latest state from GitHub...
git fetch origin

echo 🔄 Resetting local state to match GitHub exactly...
git reset --hard origin/main

echo 🧹 Cleaning untracked files...
git clean -fd

echo 📦 Installing dependencies from GitHub state...

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
echo ✅ Local environment now matches GitHub exactly!
echo 📋 All local changes have been discarded
echo 🐈‍⬛ GitHub is your source of truth
echo 🚀 Ready for development: npm run dev
echo.
pause