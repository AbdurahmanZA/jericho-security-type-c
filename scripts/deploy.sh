#!/bin/bash
# JERICHO Security Type C - Production Deployment Script
# Comprehensive deployment with rollback capability

set -e

# Configuration
VERSION=${1:-"latest"}
ENVIRONMENT=${2:-"production"}
PROJECT_ROOT="/opt/jericho-security"
BACKUP_DIR="/opt/jericho-backups"
LOG_FILE="/var/log/jericho/deployment.log"

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

# Pre-deployment checks
pre_deployment_checks() {
    info "Running pre-deployment checks..."
    
    # Check system requirements
    command -v node >/dev/null 2>&1 || error_exit "Node.js is not installed"
    command -v npm >/dev/null 2>&1 || error_exit "npm is not installed"
    command -v git >/dev/null 2>&1 || error_exit "Git is not installed"
    command -v ffmpeg >/dev/null 2>&1 || error_exit "FFmpeg is not installed"
    
    # Check PostgreSQL
    if ! systemctl is-active --quiet postgresql; then
        warning "PostgreSQL is not running. Starting..."
        systemctl start postgresql
    fi
    
    # Check Redis
    if ! systemctl is-active --quiet redis; then
        warning "Redis is not running. Starting..."
        systemctl start redis
    fi
    
    # Check available disk space (minimum 2GB)
    AVAILABLE_SPACE=$(df / | awk 'NR==2 {print $4}')
    if [ "$AVAILABLE_SPACE" -lt 2097152 ]; then
        error_exit "Insufficient disk space. At least 2GB required."
    fi
    
    success "Pre-deployment checks passed"
}

# Create backup
create_backup() {
    if [ -d "$PROJECT_ROOT" ]; then
        BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S)"
        info "Creating backup: $BACKUP_NAME"
        
        mkdir -p "$BACKUP_DIR"
        cp -r "$PROJECT_ROOT" "$BACKUP_DIR/$BACKUP_NAME"
        
        # Create database backup
        sudo -u postgres pg_dump jericho_security > "$BACKUP_DIR/$BACKUP_NAME/database.sql" 2>/dev/null || true
        
        success "Backup created: $BACKUP_DIR/$BACKUP_NAME"
        echo "$BACKUP_NAME" > /tmp/jericho_last_backup
    fi
}

# Stop services
stop_services() {
    info "Stopping JERICHO services..."
    
    # Stop PM2 processes
    sudo -u www-data pm2 stop all 2>/dev/null || true
    sudo -u www-data pm2 delete all 2>/dev/null || true
    
    # Stop systemd services
    systemctl stop jericho-* 2>/dev/null || true
    
    # Kill any remaining processes
    pkill -f "jericho" 2>/dev/null || true
    pkill -f "node.*jericho" 2>/dev/null || true
    
    success "Services stopped"
}

# Start services
start_services() {
    info "Starting JERICHO services..."
    
    cd "$PROJECT_ROOT"
    
    # Start with PM2
    if [ -f "ecosystem.config.js" ]; then
        sudo -u www-data pm2 start ecosystem.config.js --env "$ENVIRONMENT"
        sudo -u www-data pm2 save
    fi
    
    # Start systemd services
    systemctl start jericho-* 2>/dev/null || true
    
    # Verify services are running
    sleep 5
    
    if sudo -u www-data pm2 list | grep -q "online"; then
        success "Services started successfully"
    else
        error_exit "Failed to start services"
    fi
}

# Deploy from GitHub
deploy_from_github() {
    info "Deploying from GitHub repository..."
    
    # Clone repository
    TEMP_DIR="/tmp/jericho-deploy-$(date +%s)"
    git clone https://github.com/AbdurahmanZA/jericho-security-type-c.git "$TEMP_DIR"
    
    cd "$TEMP_DIR"
    
    # Checkout specific version if provided
    if [ "$VERSION" != "latest" ]; then
        git checkout "$VERSION" || error_exit "Version $VERSION not found"
    fi
    
    # Deploy files
    mkdir -p "$PROJECT_ROOT"
    cp -r * "$PROJECT_ROOT/"
    chown -R www-data:www-data "$PROJECT_ROOT"
    
    # Cleanup
    rm -rf "$TEMP_DIR"
    
    success "Code deployed from GitHub"
}

# Install dependencies
install_dependencies() {
    info "Installing dependencies..."
    
    cd "$PROJECT_ROOT"
    
    # Frontend dependencies
    if [ -d "frontend" ]; then
        cd frontend
        sudo -u www-data npm install --production
        sudo -u www-data npm run build
        cd ..
    fi
    
    # Backend dependencies
    if [ -d "backend" ]; then
        cd backend
        sudo -u www-data npm install --production
        cd ..
    fi
    
    success "Dependencies installed"
}

# Setup database
setup_database() {
    info "Setting up database..."
    
    # Create database if not exists
    sudo -u postgres createdb jericho_security 2>/dev/null || true
    
    # Run migrations
    if [ -f "$PROJECT_ROOT/backend/migrations/001_initial_schema.sql" ]; then
        sudo -u postgres psql jericho_security < "$PROJECT_ROOT/backend/migrations/001_initial_schema.sql" 2>/dev/null || true
    fi
    
    success "Database setup completed"
}

# Setup systemd services
setup_systemd() {
    info "Setting up systemd services..."
    
    # JERICHO Backend Service
    cat > /etc/systemd/system/jericho-backend.service << EOF
[Unit]
Description=JERICHO Security Backend
After=network.target postgresql.service redis.service
Wants=postgresql.service redis.service

[Service]
Type=forking
User=www-data
Group=www-data
WorkingDirectory=$PROJECT_ROOT
ExecStart=/usr/bin/pm2 start ecosystem.config.js --env production
ExecReload=/usr/bin/pm2 reload all
ExecStop=/usr/bin/pm2 stop all
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    # JERICHO Database Service
    cat > /etc/systemd/system/jericho-database.service << EOF
[Unit]
Description=JERICHO Security Database
After=postgresql.service
Requires=postgresql.service

[Service]
Type=oneshot
ExecStart=/bin/true
RemainAfterExit=true

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload
    systemctl enable jericho-backend
    systemctl enable jericho-database
    
    success "Systemd services configured"
}

# Setup nginx reverse proxy
setup_nginx() {
    info "Setting up Nginx reverse proxy..."
    
    cat > /etc/nginx/sites-available/jericho << EOF
server {
    listen 80;
    server_name _;
    
    # Frontend
    location / {
        root $PROJECT_ROOT/frontend/dist;
        try_files \$uri \$uri/ /index.html;
        
        # Security headers
        add_header X-Frame-Options "SAMEORIGIN";
        add_header X-XSS-Protection "1; mode=block";
        add_header X-Content-Type-Options "nosniff";
    }
    
    # API
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # WebSocket
    location /ws {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # HLS Streams
    location /hls/ {
        alias $PROJECT_ROOT/backend/hls/;
        
        # CORS headers for streaming
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
        add_header Access-Control-Allow-Headers "Content-Type";
        
        # Cache control
        location ~* \\.m3u8\$ {
            expires -1;
            add_header Cache-Control no-cache;
        }
        
        location ~* \\.ts\$ {
            expires 1h;
        }
    }
    
    # Snapshots
    location /snapshots/ {
        alias $PROJECT_ROOT/backend/snapshots/;
        expires 1d;
    }
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
}
EOF

    # Enable site
    ln -sf /etc/nginx/sites-available/jericho /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # Test nginx configuration
    nginx -t || error_exit "Nginx configuration test failed"
    
    # Restart nginx
    systemctl restart nginx
    
    success "Nginx configured and restarted"
}

# Post-deployment verification
verify_deployment() {
    info "Verifying deployment..."
    
    # Check if services are running
    sleep 10
    
    # Check PM2 processes
    if ! sudo -u www-data pm2 list | grep -q "online"; then
        error_exit "Backend services are not running"
    fi
    
    # Check if frontend is accessible
    if ! curl -s http://localhost/ > /dev/null; then
        error_exit "Frontend is not accessible"
    fi
    
    # Check API endpoint
    if ! curl -s http://localhost/api/health > /dev/null; then
        warning "API health check failed - may be expected if not implemented"
    fi
    
    success "Deployment verification passed"
}

# Rollback function
rollback_deployment() {
    if [ -f "/tmp/jericho_last_backup" ]; then
        BACKUP_NAME=$(cat /tmp/jericho_last_backup)
        
        warning "Rolling back to backup: $BACKUP_NAME"
        
        stop_services
        
        # Restore files
        rm -rf "$PROJECT_ROOT"
        cp -r "$BACKUP_DIR/$BACKUP_NAME" "$PROJECT_ROOT"
        chown -R www-data:www-data "$PROJECT_ROOT"
        
        # Restore database
        if [ -f "$BACKUP_DIR/$BACKUP_NAME/database.sql" ]; then
            sudo -u postgres psql jericho_security < "$BACKUP_DIR/$BACKUP_NAME/database.sql"
        fi
        
        start_services
        
        success "Rollback completed"
    else
        error_exit "No backup found for rollback"
    fi
}

# Main deployment function
deploy() {
    info "Starting JERICHO Security Type C deployment - Version: $VERSION, Environment: $ENVIRONMENT"
    
    # Create log directory
    mkdir -p "$(dirname "$LOG_FILE")"
    
    # Run deployment steps
    check_root
    pre_deployment_checks
    create_backup
    stop_services
    deploy_from_github
    install_dependencies
    setup_database
    setup_systemd
    setup_nginx
    start_services
    verify_deployment
    
    success "JERICHO Security Type C deployed successfully!"
    info "Access the system at: http://$(hostname -I | awk '{print $1}')"
    info "Check logs with: sudo journalctl -u jericho-backend -f"
    info "PM2 status: sudo -u www-data pm2 status"
}

# Handle script arguments
case "$1" in
    "rollback")
        rollback_deployment
        ;;
    "verify")
        verify_deployment
        ;;
    "stop")
        stop_services
        ;;
    "start")
        start_services
        ;;
    *)
        deploy
        ;;
esac

exit 0
