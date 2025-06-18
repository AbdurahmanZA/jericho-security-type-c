@echo off
REM JERICHO Security Type C - Auto-sync with GitHub
REM Run this daily to stay up-to-date

echo 🛡️ JERICHO Auto-Sync
echo ===================

cd "C:\Users\Admin\OneDrive\Desktop\jericho-security-type-c"

echo 📥 Checking for updates...
git fetch origin

REM Check if there are new commits
for /f %%i in ('git rev-list HEAD...origin/main --count') do set "commits=%%i"

if "%commits%"=="0" (
    echo ✅ Already up to date
    exit /b 0
)

echo 📦 Found %commits% new update(s)
echo 🔄 Syncing...

git pull origin main
call npm install

echo ✅ Auto-sync completed!
echo 📋 %commits% update(s) applied