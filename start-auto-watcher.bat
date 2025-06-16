@echo off
REM JERICHO Security Type C - Start Auto-Watcher
REM Double-click this to start automatic GitHub uploads

echo 🛡️ JERICHO Auto-Watcher
echo =====================

echo Starting automatic GitHub upload monitoring...
echo Changes will be uploaded every 5 minutes
echo Press Ctrl+C to stop
echo.

powershell -ExecutionPolicy Bypass -File "auto-watcher.ps1"

pause