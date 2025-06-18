#!/bin/bash

# JERICHO Security Type C - Complete Cleanup Script
# Removes all traces of previous installations for a fresh start
# Ubuntu 24.04 Compatible

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

header() {
    echo -e "${CYAN}$1${NC}"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   error "This script should not be run as root. Run as a regular user with sudo privileges."
   exit 1
fi

echo "============================================="
header "🧹 JERICHO Security Complete Cleanup Utility"
echo "============================================="
echo
warn "⚠️  WARNING: This will completely remove ALL JERICHO installations!"
echo
echo "This script will remove:"
echo "  • All PM2 processes and configurations"
echo "  • All JERICHO directories and files"
echo "  • Database and user accounts"
echo "  • Nginx configurations"
echo "  • Firewall rules"
echo "  • Node modules and caches"
echo "  • Logs and temporary files"
echo
echo "Press Ctrl+C to cancel or Enter to continue..."
read -r

# Step 1: Stop and remove all PM2 processes
header "🛑 Stopping PM2 processes and services..."
log "Killing all PM2 processes..."
pm2 kill 2>/dev/null || true
pm2 unstartup 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# Remove PM2 directories
log "Removing PM2 directories..."
rm -rf ~/.pm2 2>/dev/null || true
sudo rm -rf /etc/systemd/system/pm2* 2>/dev/null || true
sudo systemctl daemon-reload 2>/dev/null || true

# Step 2: Stop and remove web services
header "🌐 Stopping web services..."
log "Stopping Nginx..."
sudo systemctl stop nginx 2>/dev/null || true

# Remove Nginx JERICHO configurations
log "Removing Nginx configurations..."
sudo rm -f /etc/nginx/sites-available/jericho* 2>/dev/null || true
sudo rm -f /etc/nginx/sites-enabled/jericho* 2>/dev/null || true

# Restore default Nginx configuration
log "Restoring default Nginx configuration..."
sudo ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default 2>/dev/null || true
sudo systemctl restart nginx 2>/dev/null || true

# Step 3: Kill all JERICHO related processes
header "🔪 Killing all JERICHO processes..."
log "Killing JERICHO processes..."
sudo pkill -f "jericho" 2>/dev/null || true
sudo pkill -f "node.*server.js" 2>/dev/null || true
sudo pkill -f "vite" 2>/dev/null || true
sudo pkill -f "npm.*run.*dev" 2>/dev/null || true

# Kill processes using JERICHO ports
log "Killing processes on JERICHO ports..."
sudo fuser -k 3000/tcp 2>/dev/null || true
sudo fuser -k 3001/tcp 2>/dev/null || true
sudo fuser -k 5000/tcp 2>/dev/null || true
sudo fuser -k 5173/tcp 2>/dev/null || true
sudo fuser -k 4173/tcp 2>/dev/null || true

# Step 4: Remove all JERICHO directories and files
header "📁 Removing JERICHO directories and files..."
log "Removing all JERICHO directories..."

# Remove from home directory
rm -rf ~/jericho* 2>/dev/null || true
rm -rf ~/.jericho* 2>/dev/null || true

# Remove from common installation locations
sudo rm -rf /opt/jericho* 2>/dev/null || true
sudo rm -rf /var/lib/jericho* 2>/dev/null || true
sudo rm -rf /var/log/jericho* 2>/dev/null || true
sudo rm -rf /etc/jericho* 2>/dev/null || true

# Remove temporary files
rm -rf /tmp/jericho* 2>/dev/null || true
rm -rf /tmp/npm-* 2>/dev/null || true

# Step 5: Remove database and user
header "🗄️ Removing database and user..."
log "Removing PostgreSQL database and user..."

# Check if PostgreSQL is installed and running
if command -v psql >/dev/null 2>&1 && sudo systemctl is-active --quiet postgresql; then
    # Remove database and user
    sudo -u postgres psql << 'EOF' 2>/dev/null || true
DROP DATABASE IF EXISTS jericho_security;
DROP USER IF EXISTS jericho;
\q
EOF
    log "PostgreSQL database and user removed"
else
    info "PostgreSQL not found or not running - skipping database cleanup"
fi

# Step 6: Clean up Redis data
header "📊 Cleaning Redis data..."
if command -v redis-cli >/dev/null 2>&1 && sudo systemctl is-active --quiet redis-server; then
    log "Flushing Redis data..."
    redis-cli FLUSHALL 2>/dev/null || true
    log "Redis data flushed"
else
    info "Redis not found or not running - skipping Redis cleanup"
fi

# Step 7: Remove firewall rules
header "🔥 Removing firewall rules..."
log "Removing UFW firewall rules..."
sudo ufw --force delete allow 5000/tcp 2>/dev/null || true
sudo ufw --force delete allow 5173/tcp 2>/dev/null || true
sudo ufw --force delete allow 4173/tcp 2>/dev/null || true
sudo ufw --force delete allow 3000/tcp 2>/dev/null || true
sudo ufw --force delete allow 3001/tcp 2>/dev/null || true

# Step 8: Clean Node.js and npm caches
header "🧹 Cleaning Node.js and npm caches..."
log "Clearing npm cache..."
npm cache clean --force 2>/dev/null || true

# Clear npm global modules if they exist
log "Removing global npm modules..."
sudo npm uninstall -g pm2 2>/dev/null || true
sudo npm uninstall -g nodemon 2>/dev/null || true

# Clear node_modules directories that might be left
log "Removing orphaned node_modules..."
find ~ -name "node_modules" -type d -path "*/jericho*" -exec rm -rf {} + 2>/dev/null || true

# Step 9: Remove systemd services
header "⚙️ Removing systemd services..."
log "Removing systemd services..."
sudo systemctl stop jericho* 2>/dev/null || true
sudo systemctl disable jericho* 2>/dev/null || true
sudo rm -f /etc/systemd/system/jericho* 2>/dev/null || true
sudo systemctl daemon-reload

# Step 10: Clean up logs and configuration files
header "📋 Cleaning logs and configuration files..."
log "Removing log files..."
sudo rm -rf /var/log/jericho* 2>/dev/null || true
sudo rm -rf /var/log/nginx/jericho* 2>/dev/null || true

# Remove any JERICHO related cron jobs
log "Removing cron jobs..."
crontab -l 2>/dev/null | grep -v jericho | crontab - 2>/dev/null || true

# Step 11: Remove user-specific configurations
header "👤 Removing user configurations..."
log "Removing user configuration files..."
rm -rf ~/.config/jericho* 2>/dev/null || true
rm -rf ~/.local/share/jericho* 2>/dev/null || true
rm -rf ~/.cache/jericho* 2>/dev/null || true

# Remove any JERICHO related environment variables from shell profiles
log "Cleaning shell profiles..."
sed -i '/jericho/Id' ~/.bashrc 2>/dev/null || true
sed -i '/jericho/Id' ~/.profile 2>/dev/null || true
sed -i '/JERICHO/Id' ~/.bashrc 2>/dev/null || true
sed -i '/JERICHO/Id' ~/.profile 2>/dev/null || true

# Step 12: Final cleanup and verification
header "🔍 Final cleanup and verification..."
log "Performing final cleanup..."

# Clear any remaining processes
sleep 2
sudo pkill -f "jericho" 2>/dev/null || true

# Verify cleanup
log "Verifying cleanup..."

# Check for remaining processes
REMAINING_PROCESSES=$(ps aux | grep -i jericho | grep -v grep | wc -l)
if [ "$REMAINING_PROCESSES" -eq 0 ]; then
    log "✅ No remaining JERICHO processes found"
else
    warn "⚠️  Found $REMAINING_PROCESSES remaining JERICHO processes"
fi

# Check for remaining directories
REMAINING_DIRS=$(find ~ -maxdepth 3 -name "*jericho*" -type d 2>/dev/null | wc -l)
if [ "$REMAINING_DIRS" -eq 0 ]; then
    log "✅ No remaining JERICHO directories found"
else
    warn "⚠️  Found $REMAINING_DIRS remaining JERICHO directories"
fi

# Check for remaining files
REMAINING_FILES=$(find ~ -maxdepth 3 -name "*jericho*" -type f 2>/dev/null | wc -l)
if [ "$REMAINING_FILES" -eq 0 ]; then
    log "✅ No remaining JERICHO files found"
else
    warn "⚠️  Found $REMAINING_FILES remaining JERICHO files"
fi

# Final system cleanup
log "Running final system cleanup..."
sudo apt autoremove -y 2>/dev/null || true
sudo apt autoclean 2>/dev/null || true

# Step 13: Display completion summary
echo
echo "============================================="
header "🎉 JERICHO Security Cleanup Complete!"
echo "============================================="
echo
log "✅ All JERICHO Security components have been removed:"
echo
echo "  🛑 PM2 processes and configurations"
echo "  📁 All JERICHO directories and files"
echo "  🗄️ Database and user accounts"
echo "  🌐 Nginx configurations"
echo "  🔥 Firewall rules"
echo "  🧹 Node.js and npm caches"
echo "  📋 Log files and configurations"
echo "  👤 User-specific settings"
echo
info "🚀 Your system is now ready for a fresh JERICHO installation!"
echo
echo "To install JERICHO Security Type C, run:"
echo "curl -fsSL https://raw.githubusercontent.com/AbdurahmanZA/jericho-security-type-c/main/scripts/install-ubuntu.sh | bash"
echo
echo "============================================="
log "Cleanup completed successfully at $(date)"
echo "============================================="
