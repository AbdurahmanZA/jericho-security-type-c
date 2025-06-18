@echo off
REM JERICHO Security Type C - Transition to GitHub-First Workflow
REM This script helps you migrate from local-first to GitHub-first development

echo 🔄 JERICHO Transition to GitHub-First Workflow 
echo ===============================================
echo.
echo This script will help you transition from local development
echo to GitHub-first workflow where GitHub is the source of truth.
echo.

REM Check if in correct directory
if not exist "package.json" (
    echo ❌ Error: Not in project root directory
    echo Please run this from your JERICHO project directory
    pause
    exit /b 1
)

echo 📋 Current local status:
git status --porcelain
echo.

REM Check for uncommitted changes
git diff --quiet
set "has_changes=%errorlevel%"

if %has_changes% neq 0 (
    echo ⚠️  You have uncommitted local changes.
    echo.
    echo Options:
    echo 1. Commit and push them to GitHub first
    echo 2. Discard them and sync with GitHub
    echo 3. Cancel and handle them manually
    echo.
    set /p choice="Choose option (1/2/3): "
    
    if "%choice%"=="1" (
        echo.
        set /p message="Enter commit message for your changes: "
        git add .
        git commit -m "!message!"
        git push origin main
        echo ✅ Changes pushed to GitHub
    ) else if "%choice%"=="2" (
        echo.
        echo ⚠️  This will discard all local changes!
        set /p confirm="Are you sure? (y/N): "
        if /i "%confirm%"=="y" (
            git reset --hard HEAD
            git clean -fd
            echo ✅ Local changes discarded
        ) else (
            echo ❌ Transition cancelled
            pause
            exit /b 0
        )
    ) else (
        echo ❌ Transition cancelled
        pause
        exit /b 0
    )
)

echo.
echo 🔄 Synchronizing with GitHub (source of truth)...
git fetch origin
git reset --hard origin/main

echo 📦 Installing dependencies from GitHub...
call npm install

echo.
echo ✅ Transition Complete!
echo.
echo 🎯 You are now using GitHub-First Workflow
echo.
echo 📋 Your new daily workflow:
echo   1. Start development: daily-start.bat
echo   2. Make changes locally
echo   3. Push immediately: quick-push.bat
echo   4. If issues: github-sync.bat
echo.
echo 📚 Read GITHUB_FIRST_WORKFLOW.md for complete guide
echo 🌐 GitHub Repository: https://github.com/AbdurahmanZA/jericho-security-type-c
echo.
echo 🚀 Ready to start your first GitHub-first development session!
echo    Run: daily-start.bat
echo.
pause
