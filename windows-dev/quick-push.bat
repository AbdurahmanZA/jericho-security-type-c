@echo off
REM JERICHO Security Type C - Quick Push to GitHub
REM Push changes immediately to maintain GitHub as source of truth

echo 📤 JERICHO Quick Push to GitHub
echo ================================
echo.

REM Check if in correct directory
if not exist "package.json" (
    echo ❌ Error: Not in project root directory
    echo Please run this from: C:\Users\Admin\OneDrive\Desktop\jericho-security-type-c
    pause
    exit /b 1
)

REM Check if there are changes to commit
git diff --quiet
if %errorlevel% equ 0 (
    git diff --cached --quiet
    if %errorlevel% equ 0 (
        echo ℹ️ No changes to commit
        pause
        exit /b 0
    )
)

echo 📋 Changes detected. Preparing to push to GitHub...
echo.

REM Show what will be committed
echo 📝 Files to be committed:
git diff --name-only
git diff --cached --name-only
echo.

REM Get commit message
set /p message="📝 Enter commit message: "

if "%message%"=="" (
    set "message=Update: Development changes"
    echo Using default message: %message%
)

echo.
echo 📦 Adding all changes...
git add .

echo 💾 Committing with message: %message%
git commit -m "%message%"

if %errorlevel% neq 0 (
    echo ❌ Commit failed
    pause
    exit /b 1
)

echo 🚀 Pushing to GitHub (source of truth)...
git push origin main

if %errorlevel% neq 0 (
    echo ❌ Push failed - check your internet connection
    echo Your changes are committed locally but not on GitHub
    echo Try running this script again when online
    pause
    exit /b 1
)

echo.
echo ✅ Changes successfully pushed to GitHub!
echo 🌐 View changes: https://github.com/AbdurahmanZA/jericho-security-type-c/commits/main
echo 📊 GitHub is now updated with your changes
echo.
pause