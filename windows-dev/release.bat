@echo off
REM JERICHO Security Type C - Version Release Script for Windows
REM Usage: release.bat v2.0.1 "Release description"

echo 🛡️ JERICHO Security Type C - Version Release
echo ============================================

REM Check if in correct directory
if not exist "package.json" (
    echo ❌ Error: Not in project root directory
    echo Please run this from: C:\Users\Admin\OneDrive\Desktop\jericho-security-type-c
    pause
    exit /b 1
)

REM Get version from command line or prompt
set "version=%~1"
if "%version%"=="" (
    set /p version="Enter version (e.g., v2.0.1): "
)

if "%version%"=="" (
    echo ❌ Version is required
    pause
    exit /b 1
)

REM Add 'v' prefix if not present
echo %version% | findstr /r "^v" >nul
if %errorlevel% neq 0 (
    set "version=v%version%"
)

REM Get release description
set "description=%~2"
if "%description%"=="" (
    set /p description="Enter release description: "
)

if "%description%"=="" (
    set "description=New release"
)

echo 🏷️  Version: %version%
echo 📝 Description: %description%
echo.

REM Update package.json version (remove 'v' prefix for package.json)
set "pkg_version=%version:v=%"
echo 📦 Updating package.json version to %pkg_version%...

REM Use PowerShell to update package.json
powershell -Command "$pkg = Get-Content 'package.json' | ConvertFrom-Json; $pkg.version = '%pkg_version%'; $pkg | ConvertTo-Json -Depth 10 | Set-Content 'package.json'"

REM Update frontend package.json
if exist "frontend\package.json" (
    powershell -Command "$pkg = Get-Content 'frontend\package.json' | ConvertFrom-Json; $pkg.version = '%pkg_version%'; $pkg | ConvertTo-Json -Depth 10 | Set-Content 'frontend\package.json'"
)

REM Update backend package.json
if exist "backend\package.json" (
    powershell -Command "$pkg = Get-Content 'backend\package.json' | ConvertFrom-Json; $pkg.version = '%pkg_version%'; $pkg | ConvertTo-Json -Depth 10 | Set-Content 'backend\package.json'"
)

REM Add all changes
echo 📦 Adding changes...
git add .

REM Commit changes
echo 💾 Committing release...
git commit -m "🏷️ Release %version%: %description%

✅ Version updated to %pkg_version%
📋 Changes: %description%
🗓️ Released: %date% %time%"

if %errorlevel% neq 0 (
    echo ❌ Commit failed
    pause
    exit /b 1
)

REM Create Git tag
echo 🏷️  Creating Git tag...
git tag -a "%version%" -m "Release %version%: %description%"

if %errorlevel% neq 0 (
    echo ❌ Tag creation failed
    pause
    exit /b 1
)

REM Push to GitHub with tags
echo 🚀 Pushing to GitHub with tags...
git push origin main --tags

if %errorlevel% neq 0 (
    echo ❌ Push failed - check your internet connection and GitHub authentication
    pause
    exit /b 1
)

echo ✅ Release %version% completed successfully!
echo 🌐 Check: https://github.com/AbdurahmanZA/jericho-security-type-c/releases
echo 📦 New release created: %version%
echo.
pause