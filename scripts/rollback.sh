#!/bin/bash
# JERICHO Security Type C - Rollback Script
# Safe rollback to previous versions with validation

set -e

# Configuration
TARGET_VERSION=$1
PROJECT_ROOT="/opt/jericho-security"
RELEASES_DIR="/opt/jericho-releases"
BACKUP_DIR="/opt/jericho-backups"
LOG_FILE="/var/log/jericho/rollback.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

error_exit() {
    echo -e "${RED}ERROR: $1${NC}" >&2
    log "ERROR: $1"
    exit 1
}

success() {
    echo -e "${GREEN}SUCCESS: $1${NC}"
    log "SUCCESS: $1"
}

info() {
    echo -e "${BLUE}INFO: $1${NC}"
    log "INFO: $1"
}

warning() {
    echo -e "${YELLOW}WARNING: $1${NC}"
    log "WARNING: $1"
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        error_exit "This script must be run as root (use sudo)"
    fi
}

# Get current version
get_current_version() {
    if [ -L "/opt/jericho-current" ]; then
        basename "$(readlink "/opt/jericho-current")"
    else
        echo "unknown"
    fi
}

# Find target version for rollback
find_target_version() {
    if [ -n "$TARGET_VERSION" ]; then
        # Add 'v' prefix if not present
        if [[ ! $TARGET_VERSION =~ ^v ]]; then
            TARGET_VERSION="v$TARGET_VERSION"
        fi
        echo "$TARGET_VERSION"
        return
    fi
    
    # Find previous version automatically
    CURRENT_VERSION=$(get_current_version)
    
    if [ "$CURRENT_VERSION" = "unknown" ]; then
        error_exit "Cannot determine current version"
    fi
    
    # Get sorted list of versions
    VERSIONS=($(ls -1 "$RELEASES_DIR" 2>/dev/null | grep "^v" | sort -V))
    
    # Find previous version
    for i in "${!VERSIONS[@]}"; do
        if [ "${VERSIONS[$i]}" = "$CURRENT_VERSION" ] && [ $i -gt 0 ]; then
            echo "${VERSIONS[$((i-1))]}"
            return
        fi
    done
    
    error_exit "Cannot determine previous version"
}

# Validate target version
validate_target_version() {
    local version=$1
    
    if [ ! -d "$RELEASES_DIR/$version" ]; then
        error_exit "Version $version not found in releases directory"
    fi
    
    # Check if it's different from current version
    local current=$(get_current_version)
    if [ "$version" = "$current" ]; then
        error_exit "Target version ($version) is the same as current version"
    fi
    
    success "Target version $version validated"
}

# Pre-rollback checks
pre_rollback_checks() {
    info "Running pre-rollback checks..."
    
    # Check if releases directory exists
    if [ ! -d "$RELEASES_DIR" ]; then
        error_exit "Releases directory not found: $RELEASES_DIR"
    fi
    
    # Check system services
    command -v systemctl >/dev/null 2>&1 || error_exit "systemctl not found"
    command -v pm2 >/dev/null 2>&1 || error_exit "PM2 not found"
    
    # Check database connectivity
    if ! sudo -u postgres psql -c '\q' jericho_security 2>/dev/null; then
        warning "Database connectivity check failed"
    fi
    
    success "Pre-rollback checks completed"
}

# Create emergency backup
create_emergency_backup() {
    info "Creating emergency backup before rollback..."
    
    if [ -d "$PROJECT_ROOT" ]; then
        EMERGENCY_BACKUP="emergency-rollback-$(date +%Y%m%d-%H%M%S)"
        mkdir -p "$BACKUP_DIR"
        
        # Backup current installation
        cp -r "$PROJECT_ROOT" "$BACKUP_DIR/$EMERGENCY_BACKUP"
        
        # Backup database
        sudo -u postgres pg_dump jericho_security > "$BACKUP_DIR/$EMERGENCY_BACKUP/database.sql" 2>/dev/null || true
        
        # Store backup info
        echo "$EMERGENCY_BACKUP" > /tmp/jericho_emergency_backup
        
        success "Emergency backup created: $EMERGENCY_BACKUP"
    fi
}

# Stop services gracefully
stop_services() {
    info "Stopping JERICHO services..."
    
    # Stop PM2 processes gracefully
    if sudo -u www-data pm2 list | grep -q "online"; then
        info "Stopping PM2 processes..."
        sudo -u www-data pm2 stop all
        sleep 3
        sudo -u www-data pm2 delete all 2>/dev/null || true
    fi
    
    # Stop systemd services
    for service in jericho-backend jericho-database; do
        if systemctl is-active --quiet "$service"; then
            info "Stopping $service..."
            systemctl stop "$service"
        fi
    done
    
    # Kill any remaining processes
    pkill -f "jericho" 2>/dev/null || true
    
    # Wait for processes to stop
    sleep 5
    
    success "Services stopped"
}

# Restore version
restore_version() {
    local version=$1
    
    info "Restoring to version $version..."
    
    # Remove current installation
    if [ -d "$PROJECT_ROOT" ]; then
        rm -rf "$PROJECT_ROOT"
    fi
    
    # Create project directory
    mkdir -p "$PROJECT_ROOT"
    
    # Copy version files
    cp -r "$RELEASES_DIR/$version"/* "$PROJECT_ROOT/"
    
    # Set proper ownership
    chown -R www-data:www-data "$PROJECT_ROOT"
    
    # Update current symlink
    ln -sfn "$RELEASES_DIR/$version" "/opt/jericho-current"
    
    success "Version $version restored"
}

# Restore database
restore_database() {
    local version=$1
    
    info "Checking database compatibility..."
    
    # Check if version has database migrations
    if [ -d "$RELEASES_DIR/$version/backend/migrations" ]; then
        warning "Database migrations may be needed"
        
        # Run migrations for target version
        for migration in "$RELEASES_DIR/$version/backend/migrations"/*.sql; do
            if [ -f "$migration" ]; then
                info "Running migration: $(basename "$migration")"
                sudo -u postgres psql jericho_security < "$migration" 2>/dev/null || warning "Migration failed: $(basename "$migration")"
            fi
        done
    fi
    
    success "Database compatibility checked"
}

# Reinstall dependencies
reinstall_dependencies() {
    local version=$1
    
    info "Reinstalling dependencies for version $version..."
    
    cd "$PROJECT_ROOT"
    
    # Frontend dependencies
    if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
        info "Installing frontend dependencies..."
        cd frontend
        sudo -u www-data npm ci --production
        
        # Build if needed
        if [ -f "package.json" ] && grep -q '"build"' package.json; then
            sudo -u www-data npm run build
        fi
        cd ..
    fi
    
    # Backend dependencies
    if [ -d "backend" ] && [ -f "backend/package.json" ]; then
        info "Installing backend dependencies..."
        cd backend
        sudo -u www-data npm ci --production
        cd ..
    fi
    
    success "Dependencies reinstalled"
}

# Start services
start_services() {
    info "Starting JERICHO services..."
    
    cd "$PROJECT_ROOT"
    
    # Start with PM2 if config exists
    if [ -f "ecosystem.config.js" ]; then
        info "Starting PM2 processes..."
        sudo -u www-data pm2 start ecosystem.config.js --env production
        sudo -u www-data pm2 save
    fi
    
    # Start systemd services
    for service in jericho-database jericho-backend; do
        if systemctl is-enabled --quiet "$service" 2>/dev/null; then
            info "Starting $service..."
            systemctl start "$service"
        fi
    done
    
    success "Services started"
}

# Verify rollback
verify_rollback() {
    local version=$1
    
    info "Verifying rollback to version $version..."
    
    # Wait for services to stabilize
    sleep 15
    
    # Check PM2 processes
    if [ -f "$PROJECT_ROOT/ecosystem.config.js" ]; then
        if ! sudo -u www-data pm2 list | grep -q "online"; then
            error_exit "PM2 processes are not running after rollback"
        fi
    fi
    
    # Check frontend accessibility
    if ! curl -s http://localhost/ > /dev/null; then
        warning "Frontend may not be accessible (this could be temporary)"
    fi
    
    # Check current version
    CURRENT=$(get_current_version)
    if [ "$CURRENT" != "$version" ]; then
        error_exit "Version verification failed. Expected: $version, Current: $CURRENT"
    fi
    
    success "Rollback verification completed"
}

# Show rollback confirmation
show_confirmation() {
    local current_version=$1
    local target_version=$2
    
    echo
    echo "=== JERICHO Security Rollback Confirmation ==="
    echo
    echo "Current Version: $current_version"
    echo "Target Version:  $target_version"
    echo
    echo "This will:"
    echo "1. Stop all JERICHO services"
    echo "2. Create emergency backup of current state"
    echo "3. Restore to version $target_version"
    echo "4. Reinstall dependencies"
    echo "5. Restart services"
    echo
    echo "Emergency backup will be created for recovery if needed."
    echo
    
    # Show version details if available
    if [ -f "$RELEASES_DIR/$target_version/VERSION_INFO" ]; then
        echo "Target version details:"
        cat "$RELEASES_DIR/$target_version/VERSION_INFO"
        echo
    fi
    
    read -p "Continue with rollback? (y/N): " confirm
    
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        info "Rollback cancelled by user"
        exit 0
    fi
}

# Emergency recovery
emergency_recovery() {
    if [ -f "/tmp/jericho_emergency_backup" ]; then
        EMERGENCY_BACKUP=$(cat /tmp/jericho_emergency_backup)
        
        error_exit "Rollback failed! Emergency recovery backup available: $EMERGENCY_BACKUP"
        echo "To recover, run:"
        echo "sudo cp -r $BACKUP_DIR/$EMERGENCY_BACKUP/* $PROJECT_ROOT/"
        echo "sudo chown -R www-data:www-data $PROJECT_ROOT"
        echo "sudo systemctl restart jericho-*"
    else
        error_exit "Rollback failed and no emergency backup found!"
    fi
}

# Main rollback function
main() {
    info "JERICHO Security Type C - Rollback Utility"
    
    # Create log directory
    mkdir -p "$(dirname "$LOG_FILE")"
    
    # Check requirements
    check_root
    
    # Determine versions
    CURRENT_VERSION=$(get_current_version)
    TARGET_VERSION=$(find_target_version)
    
    info "Current version: $CURRENT_VERSION"
    info "Target version: $TARGET_VERSION"
    
    # Validate and confirm
    validate_target_version "$TARGET_VERSION"
    show_confirmation "$CURRENT_VERSION" "$TARGET_VERSION"
    
    # Execute rollback with error handling
    trap emergency_recovery ERR
    
    pre_rollback_checks
    create_emergency_backup
    stop_services
    restore_version "$TARGET_VERSION"
    restore_database "$TARGET_VERSION"
    reinstall_dependencies "$TARGET_VERSION"
    start_services
    verify_rollback "$TARGET_VERSION"
    
    # Cleanup emergency backup reference
    rm -f /tmp/jericho_emergency_backup
    
    success "Rollback to version $TARGET_VERSION completed successfully!"
    info "Current version is now: $(get_current_version)"
    info "System is accessible at: http://$(hostname -I | awk '{print $1}')"
    echo
    echo "Rollback completed! Check system status with:"
    echo "sudo systemctl status jericho-*"
    echo "sudo -u www-data pm2 status"
}

# Handle script arguments
case "$1" in
    "--help"|"-h")
        echo "JERICHO Security Type C - Rollback Script"
        echo
        echo "Usage: $0 [version]"
        echo
        echo "Arguments:"
        echo "  version    Target version to rollback to (optional)"
        echo "             If not specified, will rollback to previous version"
        echo
        echo "Examples:"
        echo "  $0                # Rollback to previous version"
        echo "  $0 v2.0.0         # Rollback to specific version"
        echo "  $0 2.0.0          # Rollback to specific version (v prefix added automatically)"
        echo
        exit 0
        ;;
    *)
        main
        ;;
esac

exit 0
