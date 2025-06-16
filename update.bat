@echo off
REM JERICHO Security Type C - Quick Update Script for Windows
REM Usage: update.bat "Your commit message"

echo 🛡️ JERICHO Security Type C - Quick Update
echo ==========================================

REM Check if in correct directory
if not exist "package.json" (
    echo ❌ Error: Not in project root directory
    echo Please run this from: C:\Users\Admin\OneDrive\Desktop\jericho-security-type-c
    pause
    exit /b 1
)

REM Get commit message from command line or prompt
set "commit_msg=%~1"
if "%commit_msg%"=="" (
    set /p commit_msg="Enter commit message: "
)

if "%commit_msg%"=="" (
    set "commit_msg=Update: General improvements"
)

echo 📝 Commit message: %commit_msg%
echo.

REM Add all changes
echo 📦 Adding changes...
git add .

REM Check if there are changes to commit
git diff --staged --quiet
if %errorlevel% equ 0 (
    echo ℹ️  No changes to commit
    pause
    exit /b 0
)

REM Commit changes
echo 💾 Committing changes...
git commit -m "%commit_msg%"

if %errorlevel% neq 0 (
    echo ❌ Commit failed
    pause
    exit /b 1
)

REM Push to GitHub
echo 🚀 Pushing to GitHub...
git push

if %errorlevel% neq 0 (
    echo ❌ Push failed - check your internet connection and GitHub authentication
    pause
    exit /b 1
)

echo ✅ Update completed successfully!
echo 🌐 Check: https://github.com/AbdurahmanZA/jericho-security-type-c
echo.
pause