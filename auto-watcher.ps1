# JERICHO Security Type C - Auto-Upload Watcher
# This script monitors file changes and automatically commits to GitHub

param(
    [int]$IntervalMinutes = 5,  # Check every 5 minutes
    [switch]$DryRun = $false   # Test mode - don't actually commit
)

Write-Host "🛡️ JERICHO Auto-Upload Watcher Started" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "📁 Project: jericho-security-type-c" -ForegroundColor Green
Write-Host "⏱️  Interval: $IntervalMinutes minutes" -ForegroundColor Yellow
Write-Host "🔄 Mode: $(if($DryRun){'DRY RUN'}else{'LIVE'})" -ForegroundColor $(if($DryRun){'Yellow'}else{'Green'})
Write-Host "Press Ctrl+C to stop..." -ForegroundColor Gray
Write-Host ""

# Check if in correct directory
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Error: Not in project root directory" -ForegroundColor Red
    Write-Host "Please run from: C:\Users\Admin\OneDrive\Desktop\jericho-security-type-c" -ForegroundColor Yellow
    exit 1
}

# Function to check for changes and auto-commit
function Check-AndCommit {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    
    # Check if there are unstaged changes
    $status = git status --porcelain
    
    if ($status) {
        Write-Host "[$timestamp] 📝 Changes detected:" -ForegroundColor Blue
        $status | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
        
        if (-not $DryRun) {
            # Stage all changes
            git add .
            
            # Create auto-commit message
            $changedFiles = ($status | ForEach-Object { $_.Substring(3) }) -join ", "
            $commitMsg = "Auto-update: Modified $($status.Count) file(s) - $(Get-Date -Format 'HH:mm')"
            
            # Commit changes
            Write-Host "[$timestamp] 💾 Auto-committing..." -ForegroundColor Green
            $commitResult = git commit -m $commitMsg 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "[$timestamp] 🚀 Pushing to GitHub..." -ForegroundColor Green
                $pushResult = git push 2>&1
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "[$timestamp] ✅ Auto-upload successful!" -ForegroundColor Green
                } else {
                    Write-Host "[$timestamp] ❌ Push failed: $pushResult" -ForegroundColor Red
                }
            } else {
                Write-Host "[$timestamp] ❌ Commit failed: $commitResult" -ForegroundColor Red
            }
        } else {
            Write-Host "[$timestamp] 🧪 DRY RUN - Would commit: $($status.Count) file(s)" -ForegroundColor Yellow
        }
        
        Write-Host ""
    } else {
        Write-Host "[$timestamp] ✨ No changes detected" -ForegroundColor Gray
    }
}

# Main monitoring loop
try {
    while ($true) {
        Check-AndCommit
        Start-Sleep -Seconds ($IntervalMinutes * 60)
    }
} catch {
    Write-Host "🛑 Auto-watcher stopped" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}