#!/bin/bash
# JERICHO Security Type C - Version Control System
# Enhanced version management with rollback capability

set -e

# Configuration
PROJECT_ROOT="/opt/jericho-security"
RELEASES_DIR="/opt/jericho-releases"
BACKUP_DIR="/opt/jericho-backups"
CURRENT_LINK="/opt/jericho-current"
LOG_FILE="/var/log/jericho/version-control.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    echo -e "${RED}ERROR: $1${NC}" >&2
    log "ERROR: $1"
    exit 1
}

# Success message
success() {
    echo -e "${GREEN}SUCCESS: $1${NC}"
    log "SUCCESS: $1"
}

# Warning message
warning() {
    echo -e "${YELLOW}WARNING: $1${NC}"
    log "WARNING: $1"
}

# Info message
info() {
    echo -e "${BLUE}INFO: $1${NC}"
    log "INFO: $1"
}

# Initialize version control system
init_version_control() {
    info "Initializing JERICHO version control system..."
    
    # Create directories
    sudo mkdir -p "$RELEASES_DIR"
    sudo mkdir -p "$BACKUP_DIR"
    sudo mkdir -p "$(dirname "$LOG_FILE")"
    
    # Set permissions
    sudo chown -R $USER:$USER "$RELEASES_DIR"
    sudo chown -R $USER:$USER "$BACKUP_DIR"
    sudo touch "$LOG_FILE"
    sudo chown $USER:$USER "$LOG_FILE"
    
    success "Version control system initialized"
}

# Create a new version
create_version() {
    VERSION=$1
    
    if [ -z "$VERSION" ]; then
        error_exit "Version number required. Usage: $0 create <version>"
    fi
    
    # Validate version format (semantic versioning)
    if [[ ! $VERSION =~ ^v?[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9]+)?$ ]]; then
        error_exit "Invalid version format. Use semantic versioning (e.g., v2.0.0 or 2.0.1-beta)"
    fi
    
    # Add 'v' prefix if not present
    if [[ ! $VERSION =~ ^v ]]; then
        VERSION="v$VERSION"
    fi
    
    info "Creating version $VERSION..."
    
    # Check if version already exists
    if [ -d "$RELEASES_DIR/$VERSION" ]; then
        error_exit "Version $VERSION already exists"
    fi
    
    # Create version directory
    mkdir -p "$RELEASES_DIR/$VERSION"
    
    # Copy current codebase
    if [ -d "$PROJECT_ROOT" ]; then
        cp -r "$PROJECT_ROOT"/* "$RELEASES_DIR/$VERSION/"
    else
        # Copy from current directory if PROJECT_ROOT doesn't exist
        cp -r . "$RELEASES_DIR/$VERSION/"
    fi
    
    # Create version info file
    cat > "$RELEASES_DIR/$VERSION/VERSION_INFO" << EOF
VERSION=$VERSION
CREATED=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
CREATED_BY=$(whoami)
HOSTNAME=$(hostname)
GIT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "N/A")
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "N/A")
EOF
    
    # Create Git tag if in a Git repository
    if git rev-parse --git-dir > /dev/null 2>&1; then
        git tag -a "$VERSION" -m "Release $VERSION" 2>/dev/null || warning "Could not create Git tag"
    fi
    
    # Create compressed archive
    cd "$RELEASES_DIR"
    tar -czf "$VERSION.tar.gz" "$VERSION"
    
    success "Version $VERSION created successfully"
    info "Location: $RELEASES_DIR/$VERSION"
    info "Archive: $RELEASES_DIR/$VERSION.tar.gz"
}

# List all versions
list_versions() {
    info "Available versions:"
    echo
    
    if [ ! -d "$RELEASES_DIR" ] || [ -z "$(ls -A "$RELEASES_DIR" 2>/dev/null)" ]; then
        warning "No versions found"
        return
    fi
    
    # Get current version
    CURRENT_VERSION=""
    if [ -L "$CURRENT_LINK" ]; then
        CURRENT_VERSION=$(basename "$(readlink "$CURRENT_LINK")")
    fi
    
    # List versions with details
    echo -e "Version\t\tCreated\t\t\tCurrent"
    echo -e "-------\t\t-------\t\t\t-------"
    
    for version_dir in "$RELEASES_DIR"/v*; do
        if [ -d "$version_dir" ]; then
            VERSION=$(basename "$version_dir")
            
            # Get creation time
            if [ -f "$version_dir/VERSION_INFO" ]; then
                CREATED=$(grep "CREATED=" "$version_dir/VERSION_INFO" | cut -d'=' -f2 | cut -d'T' -f1)
            else
                CREATED=$(stat -c %y "$version_dir" | cut -d' ' -f1)
            fi
            
            # Check if current
            IS_CURRENT=""
            if [ "$VERSION" = "$CURRENT_VERSION" ]; then
                IS_CURRENT="*"
            fi
            
            echo -e "$VERSION\t\t$CREATED\t\t$IS_CURRENT"
        fi
    done
}

# Deploy a specific version
deploy_version() {
    VERSION=$1
    
    if [ -z "$VERSION" ]; then
        error_exit "Version number required. Usage: $0 deploy <version>"
    fi
    
    # Add 'v' prefix if not present
    if [[ ! $VERSION =~ ^v ]]; then
        VERSION="v$VERSION"
    fi
    
    info "Deploying version $VERSION..."
    
    # Check if version exists
    if [ ! -d "$RELEASES_DIR/$VERSION" ]; then
        error_exit "Version $VERSION not found"
    fi
    
    # Create backup of current installation
    if [ -d "$PROJECT_ROOT" ]; then
        BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S)"
        info "Creating backup: $BACKUP_NAME"
        cp -r "$PROJECT_ROOT" "$BACKUP_DIR/$BACKUP_NAME"
    fi
    
    # Stop services
    info "Stopping services..."
    sudo systemctl stop jericho-* 2>/dev/null || true
    sudo pkill -f "jericho" 2>/dev/null || true
    
    # Deploy new version
    sudo mkdir -p "$PROJECT_ROOT"
    sudo cp -r "$RELEASES_DIR/$VERSION"/* "$PROJECT_ROOT/"
    sudo chown -R www-data:www-data "$PROJECT_ROOT"
    
    # Update symlink
    sudo ln -sfn "$RELEASES_DIR/$VERSION" "$CURRENT_LINK"
    
    # Start services
    info "Starting services..."
    cd "$PROJECT_ROOT"
    
    # Install/update dependencies if needed
    if [ -f "frontend/package.json" ]; then
        cd frontend && npm install --production && cd ..
    fi
    
    if [ -f "backend/package.json" ]; then
        cd backend && npm install --production && cd ..
    fi
    
    # Start services
    sudo systemctl start jericho-* 2>/dev/null || true
    
    success "Version $VERSION deployed successfully"
}

# Rollback to previous version
rollback() {
    TARGET_VERSION=$1
    
    if [ -z "$TARGET_VERSION" ]; then
        # Find previous version
        VERSIONS=($(ls -1 "$RELEASES_DIR" | grep "^v" | sort -V))
        CURRENT_VERSION=""
        
        if [ -L "$CURRENT_LINK" ]; then
            CURRENT_VERSION=$(basename "$(readlink "$CURRENT_LINK")")
        fi
        
        # Find previous version
        for i in "${!VERSIONS[@]}"; do
            if [ "${VERSIONS[$i]}" = "$CURRENT_VERSION" ] && [ $i -gt 0 ]; then
                TARGET_VERSION="${VERSIONS[$((i-1))]}"
                break
            fi
        done
        
        if [ -z "$TARGET_VERSION" ]; then
            error_exit "Cannot determine previous version"
        fi
    else
        # Add 'v' prefix if not present
        if [[ ! $TARGET_VERSION =~ ^v ]]; then
            TARGET_VERSION="v$TARGET_VERSION"
        fi
    fi
    
    warning "Rolling back to version $TARGET_VERSION"
    echo "This will:"
    echo "1. Stop all JERICHO services"
    echo "2. Restore version $TARGET_VERSION"
    echo "3. Restart services"
    echo
    read -p "Continue? (y/N): " confirm
    
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        info "Rollback cancelled"
        exit 0
    fi
    
    deploy_version "$TARGET_VERSION"
    success "Rollback to $TARGET_VERSION completed"
}

# Delete a version
delete_version() {
    VERSION=$1
    
    if [ -z "$VERSION" ]; then
        error_exit "Version number required. Usage: $0 delete <version>"
    fi
    
    # Add 'v' prefix if not present
    if [[ ! $VERSION =~ ^v ]]; then
        VERSION="v$VERSION"
    fi
    
    # Check if version exists
    if [ ! -d "$RELEASES_DIR/$VERSION" ]; then
        error_exit "Version $VERSION not found"
    fi
    
    # Check if it's the current version
    CURRENT_VERSION=""
    if [ -L "$CURRENT_LINK" ]; then
        CURRENT_VERSION=$(basename "$(readlink "$CURRENT_LINK")")
    fi
    
    if [ "$VERSION" = "$CURRENT_VERSION" ]; then
        error_exit "Cannot delete current version ($VERSION)"
    fi
    
    warning "This will permanently delete version $VERSION"
    read -p "Continue? (y/N): " confirm
    
    if [[ ! $confirm =~ ^[Yy]$ ]]; then
        info "Deletion cancelled"
        exit 0
    fi
    
    # Remove version
    rm -rf "$RELEASES_DIR/$VERSION"
    rm -f "$RELEASES_DIR/$VERSION.tar.gz"
    
    success "Version $VERSION deleted"
}

# Show version details
show_version() {
    VERSION=$1
    
    if [ -z "$VERSION" ]; then
        # Show current version
        if [ -L "$CURRENT_LINK" ]; then
            VERSION=$(basename "$(readlink "$CURRENT_LINK")")
        else
            error_exit "No current version found"
        fi
    else
        # Add 'v' prefix if not present
        if [[ ! $VERSION =~ ^v ]]; then
            VERSION="v$VERSION"
        fi
    fi
    
    if [ ! -d "$RELEASES_DIR/$VERSION" ]; then
        error_exit "Version $VERSION not found"
    fi
    
    info "Version Details: $VERSION"
    echo
    
    if [ -f "$RELEASES_DIR/$VERSION/VERSION_INFO" ]; then
        cat "$RELEASES_DIR/$VERSION/VERSION_INFO"
    else
        echo "Created: $(stat -c %y "$RELEASES_DIR/$VERSION")"
    fi
    
    echo
    echo "Size: $(du -sh "$RELEASES_DIR/$VERSION" | cut -f1)"
    
    if [ -f "$RELEASES_DIR/$VERSION.tar.gz" ]; then
        echo "Archive: $(du -sh "$RELEASES_DIR/$VERSION.tar.gz" | cut -f1)"
    fi
}

# Main command processing
case "$1" in
    "init")
        init_version_control
        ;;
    "create")
        create_version "$2"
        ;;
    "list")
        list_versions
        ;;
    "deploy")
        deploy_version "$2"
        ;;
    "rollback")
        rollback "$2"
        ;;
    "delete")
        delete_version "$2"
        ;;
    "show")
        show_version "$2"
        ;;
    *)
        echo "JERICHO Security Type C - Version Control System"
        echo
        echo "Usage: $0 <command> [options]"
        echo
        echo "Commands:"
        echo "  init                    Initialize version control system"
        echo "  create <version>        Create new version (e.g., 2.0.1)"
        echo "  list                    List all available versions"
        echo "  deploy <version>        Deploy specific version"
        echo "  rollback [version]      Rollback to previous or specific version"
        echo "  delete <version>        Delete a version"
        echo "  show [version]          Show version details"
        echo
        echo "Examples:"
        echo "  $0 init"
        echo "  $0 create 2.0.1"
        echo "  $0 deploy v2.0.0"
        echo "  $0 rollback"
        echo "  $0 list"
        exit 1
        ;;
esac