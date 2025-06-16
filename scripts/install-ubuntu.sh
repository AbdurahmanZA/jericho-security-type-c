#!/bin/bash
# JERICHO Security Type C - Ubuntu Production Installation
# Complete installation with all dependencies and configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_ROOT="/opt/jericho-security"
LOG_FILE="/var/log/jericho/installation.log"
REPO_URL="https://github.com/AbdurahmanZA/jericho-security-type-c.git"

# Logging functions
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}INFO: $1${NC}"
    log "INFO: $1"
}

success() {
    echo -e "${GREEN}SUCCESS: $1${NC}"
    log "SUCCESS: $1"
}

warning() {
    echo -e "${YELLOW}WARNING: $1${NC}"
    log "WARNING: $1"
}

error_exit() {
    echo -e "${RED}ERROR: $1${NC}" >&2
    log "ERROR: $1"
    exit 1
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        error_exit "This script must be run as root (use sudo)"
    fi
}

# Check Ubuntu version
check_ubuntu_version() {
    if [ ! -f /etc/os-release ]; then
        error_exit "Cannot determine OS version"
    fi
    
    . /etc/os-release
    
    if [ "$ID" != "ubuntu" ]; then
        error_exit "This script is for Ubuntu only. Detected: $ID"
    fi
    
    # Check for supported versions
    case "$VERSION_ID" in
        "20.04"|"22.04"|"24.04")
            info "Ubuntu $VERSION_ID detected - supported"
            ;;
        *)
            warning "Ubuntu $VERSION_ID may not be fully tested"
            ;;
    esac
}

# System update
update_system() {
    info "Updating system packages..."
    
    export DEBIAN_FRONTEND=noninteractive
    
    apt-get update
    apt-get upgrade -y
    
    success "System updated"
}

# Install system dependencies
install_system_dependencies() {
    info "Installing system dependencies..."
    
    # Essential packages
    apt-get install -y \
        curl \
        wget \
        git \
        build-essential \
        software-properties-common \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        unzip \
        supervisor \
        htop \
        nano \
        vim
    
    success "System dependencies installed"
}

# Install Node.js
install_nodejs() {
    info "Installing Node.js 20.x..."
    
    # Add NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    
    # Install Node.js
    apt-get install -y nodejs
    
    # Install PM2 globally
    npm install -g pm2
    
    # Verify installation
    node_version=$(node --version)
    npm_version=$(npm --version)
    pm2_version=$(pm2 --version)
    
    info "Node.js version: $node_version"
    info "npm version: $npm_version"
    info "PM2 version: $pm2_version"
    
    success "Node.js and PM2 installed"
}

# Install PostgreSQL
install_postgresql() {
    info "Installing PostgreSQL 15..."
    
    # Install PostgreSQL
    apt-get install -y postgresql postgresql-contrib postgresql-client
    
    # Start and enable PostgreSQL
    systemctl start postgresql
    systemctl enable postgresql
    
    # Create database and user for JERICHO
    sudo -u postgres psql << EOF
CREATE DATABASE jericho_security;
CREATE USER jericho WITH ENCRYPTED PASSWORD 'jericho_secure_2024';
GRANT ALL PRIVILEGES ON DATABASE jericho_security TO jericho;
ALTER USER jericho CREATEDB;
\q
EOF
    
    # Configure PostgreSQL for local connections
    PG_VERSION=$(sudo -u postgres psql -t -c "SELECT version();" | grep -oP 'PostgreSQL \K[0-9]+')
    PG_CONFIG_DIR="/etc/postgresql/$PG_VERSION/main"
    
    # Allow local connections
    sed -i "s/#listen_addresses = 'localhost'/listen_addresses = 'localhost'/" "$PG_CONFIG_DIR/postgresql.conf"
    
    # Configure authentication
    echo "local   jericho_security    jericho                                 md5" >> "$PG_CONFIG_DIR/pg_hba.conf"
    echo "host    jericho_security    jericho         127.0.0.1/32            md5" >> "$PG_CONFIG_DIR/pg_hba.conf"
    
    # Restart PostgreSQL
    systemctl restart postgresql
    
    success "PostgreSQL installed and configured"
}

# Install Redis
install_redis() {
    info "Installing Redis..."
    
    apt-get install -y redis-server
    
    # Configure Redis
    sed -i 's/^supervised no/supervised systemd/' /etc/redis/redis.conf
    sed -i 's/^# maxmemory <bytes>/maxmemory 256mb/' /etc/redis/redis.conf
    sed -i 's/^# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
    
    # Start and enable Redis
    systemctl restart redis-server
    systemctl enable redis-server
    
    success "Redis installed and configured"
}

# Install FFmpeg
install_ffmpeg() {
    info "Installing FFmpeg with hardware acceleration..."
    
    # Add PPA for latest FFmpeg
    add-apt-repository -y ppa:savoury1/ffmpeg4
    apt-get update
    
    # Install FFmpeg and related tools
    apt-get install -y \
        ffmpeg \
        libavcodec-extra \
        libavdevice-dev \
        libavfilter-dev \
        libavformat-dev \
        libavutil-dev \
        libswresample-dev \
        libswscale-dev \
        v4l-utils \
        gstreamer1.0-tools \
        gstreamer1.0-plugins-base \
        gstreamer1.0-plugins-good \
        gstreamer1.0-plugins-bad \
        gstreamer1.0-plugins-ugly
    
    # Verify FFmpeg installation
    ffmpeg_version=$(ffmpeg -version | head -n1)
    info "FFmpeg installed: $ffmpeg_version"
    
    success "FFmpeg and video tools installed"
}

# Install Nginx
install_nginx() {
    info "Installing and configuring Nginx..."
    
    apt-get install -y nginx
    
    # Enable required modules
    a2enmod rewrite 2>/dev/null || true
    a2enmod mime 2>/dev/null || true
    a2enmod headers 2>/dev/null || true
    a2enmod ssl 2>/dev/null || true
    
    # Start and enable Nginx
    systemctl start nginx
    systemctl enable nginx
    
    success "Nginx installed"
}

# Create system user
create_system_user() {
    info "Creating system user and directories..."
    
    # Create www-data user if it doesn't exist (usually exists on Ubuntu)
    if ! id "www-data" &>/dev/null; then
        useradd -r -s /bin/false www-data
    fi
    
    # Create project directories
    mkdir -p "$PROJECT_ROOT"
    mkdir -p /opt/jericho-releases
    mkdir -p /opt/jericho-backups
    mkdir -p /var/log/jericho
    mkdir -p /var/lib/jericho/hls
    mkdir -p /var/lib/jericho/snapshots
    
    # Set ownership
    chown -R www-data:www-data "$PROJECT_ROOT"
    chown -R www-data:www-data /opt/jericho-releases
    chown -R www-data:www-data /opt/jericho-backups
    chown -R www-data:www-data /var/log/jericho
    chown -R www-data:www-data /var/lib/jericho
    
    # Set permissions
    chmod 755 "$PROJECT_ROOT"
    chmod 755 /opt/jericho-releases
    chmod 755 /opt/jericho-backups
    chmod 755 /var/log/jericho
    chmod 755 /var/lib/jericho
    
    success "System user and directories created"
}

# Clone and setup application
setup_application() {
    info "Downloading JERICHO Security Type C..."
    
    # Remove existing installation
    rm -rf "$PROJECT_ROOT"/*
    
    # Clone repository
    if ! git clone "$REPO_URL" /tmp/jericho-install; then
        error_exit "Failed to clone repository from $REPO_URL"
    fi
    
    # Copy files
    cp -r /tmp/jericho-install/* "$PROJECT_ROOT/"
    
    # Set ownership
    chown -R www-data:www-data "$PROJECT_ROOT"
    
    # Clean up
    rm -rf /tmp/jericho-install
    
    success "Application downloaded and copied"
}

# Install application dependencies
install_app_dependencies() {
    info "Installing application dependencies..."
    
    cd "$PROJECT_ROOT"
    
    # Frontend dependencies
    if [ -d "frontend" ]; then
        info "Installing frontend dependencies..."
        cd frontend
        sudo -u www-data npm ci --production
        sudo -u www-data npm run build
        cd ..
    fi
    
    # Backend dependencies
    if [ -d "backend" ]; then
        info "Installing backend dependencies..."
        cd backend
        sudo -u www-data npm ci --production
        cd ..
    fi
    
    success "Application dependencies installed"
}

# Setup database schema
setup_database_schema() {
    info "Setting up database schema..."
    
    if [ -f "$PROJECT_ROOT/backend/migrations/001_initial_schema.sql" ]; then
        sudo -u postgres psql jericho_security < "$PROJECT_ROOT/backend/migrations/001_initial_schema.sql"
        success "Database schema created"
    else
        warning "Database migration file not found"
    fi
}

# Create configuration files
create_config_files() {
    info "Creating configuration files..."
    
    # Environment configuration
    cat > "$PROJECT_ROOT/.env" << EOF
NODE_ENV=production
PORT=5000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=jericho_security
DB_USER=jericho
DB_PASSWORD=jericho_secure_2024

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)

# File paths
HLS_PATH=/var/lib/jericho/hls
SNAPSHOTS_PATH=/var/lib/jericho/snapshots

# Logging
LOG_LEVEL=info
LOG_FILE=/var/log/jericho/application.log
EOF
    
    # PM2 Ecosystem configuration
    cat > "$PROJECT_ROOT/ecosystem.config.js" << EOF
module.exports = {
  apps: [
    {
      name: 'jericho-backend',
      script: './backend/server.js',
      cwd: '$PROJECT_ROOT',
      user: 'www-data',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: '/var/log/jericho/pm2-error.log',
      out_file: '/var/log/jericho/pm2-out.log',
      log_file: '/var/log/jericho/pm2.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
EOF
    
    # Set ownership
    chown www-data:www-data "$PROJECT_ROOT/.env"
    chown www-data:www-data "$PROJECT_ROOT/ecosystem.config.js"
    
    success "Configuration files created"
}

# Setup systemd services
setup_systemd_services() {
    info "Setting up systemd services..."
    
    # JERICHO main service
    cat > /etc/systemd/system/jericho-security.service << EOF
[Unit]
Description=JERICHO Security System
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=forking
User=www-data
Group=www-data
WorkingDirectory=$PROJECT_ROOT
Environment=NODE_ENV=production
ExecStart=/usr/bin/pm2 start ecosystem.config.js --env production
ExecReload=/usr/bin/pm2 reload all
ExecStop=/usr/bin/pm2 stop all
Restart=always
RestartSec=10
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable jericho-security
    
    success "Systemd services configured"
}

# Configure Nginx reverse proxy
configure_nginx() {
    info "Configuring Nginx reverse proxy..."
    
    # Remove default site
    rm -f /etc/nginx/sites-enabled/default
    
    # Create JERICHO site configuration
    cat > /etc/nginx/sites-available/jericho << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Frontend static files
    location / {
        root /opt/jericho-security/frontend/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # API endpoints
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }
    
    # WebSocket connections
    location /ws {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # HLS video streams
    location /hls/ {
        alias /var/lib/jericho/hls/;
        
        # CORS for video streaming
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type" always;
        
        # M3U8 playlist cache control
        location ~* \.m3u8$ {
            expires -1;
            add_header Cache-Control "no-cache, no-store, must-revalidate";
            add_header Pragma "no-cache";
        }
        
        # TS segments cache control
        location ~* \.ts$ {
            expires 1h;
            add_header Cache-Control "public";
        }
    }
    
    # Camera snapshots
    location /snapshots/ {
        alias /var/lib/jericho/snapshots/;
        expires 1d;
        add_header Cache-Control "public";
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;
}
EOF
    
    # Enable site
    ln -sf /etc/nginx/sites-available/jericho /etc/nginx/sites-enabled/
    
    # Test configuration
    nginx -t
    
    # Restart Nginx
    systemctl restart nginx
    
    success "Nginx configured and restarted"
}

# Setup log rotation
setup_log_rotation() {
    info "Setting up log rotation..."
    
    cat > /etc/logrotate.d/jericho << EOF
/var/log/jericho/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        sudo -u www-data pm2 reloadLogs
    endscript
}
EOF
    
    success "Log rotation configured"
}

# Setup firewall
setup_firewall() {
    info "Configuring firewall..."
    
    # Install UFW if not present
    apt-get install -y ufw
    
    # Reset firewall
    ufw --force reset
    
    # Default policies
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH
    ufw allow ssh
    
    # Allow HTTP and HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # Enable firewall
    ufw --force enable
    
    success "Firewall configured"
}

# Final system checks
final_checks() {
    info "Running final system checks..."
    
    # Start all services
    systemctl start jericho-security
    
    # Wait for services to start
    sleep 10
    
    # Check service status
    if systemctl is-active --quiet jericho-security; then
        success "JERICHO Security service is running"
    else
        warning "JERICHO Security service failed to start"
    fi
    
    # Check web server
    if curl -s http://localhost/ > /dev/null; then
        success "Web server is responding"
    else
        warning "Web server may not be accessible"
    fi
    
    # Check database connection
    if sudo -u postgres psql -c '\q' jericho_security 2>/dev/null; then
        success "Database is accessible"
    else
        warning "Database connection failed"
    fi
    
    success "Final checks completed"
}

# Print installation summary
print_summary() {
    echo
    echo "======================================"
    echo "  JERICHO Security Type C Installed  "
    echo "======================================"
    echo
    echo "Installation completed successfully!"
    echo
    echo "Access Information:"
    echo "  Web Interface: http://$(hostname -I | awk '{print $1}')/"
    echo "  Local Access:  http://localhost/"
    echo
    echo "Service Management:"
    echo "  Status:   sudo systemctl status jericho-security"
    echo "  Start:    sudo systemctl start jericho-security"
    echo "  Stop:     sudo systemctl stop jericho-security"
    echo "  Restart:  sudo systemctl restart jericho-security"
    echo
    echo "Process Management (PM2):"
    echo "  Status:   sudo -u www-data pm2 status"
    echo "  Logs:     sudo -u www-data pm2 logs"
    echo "  Monitor:  sudo -u www-data pm2 monit"
    echo
    echo "Log Files:"
    echo "  System:   /var/log/jericho/"
    echo "  PM2:      sudo -u www-data pm2 logs"
    echo "  Nginx:    /var/log/nginx/"
    echo
    echo "Configuration:"
    echo "  Project:  $PROJECT_ROOT"
    echo "  Config:   $PROJECT_ROOT/.env"
    echo "  PM2:      $PROJECT_ROOT/ecosystem.config.js"
    echo
    echo "Database:"
    echo "  Name:     jericho_security"
    echo "  User:     jericho"
    echo "  Host:     localhost:5432"
    echo
    echo "Version Control:"
    echo "  Create:   sudo $PROJECT_ROOT/scripts/version-control.sh create v2.0.1"
    echo "  Deploy:   sudo $PROJECT_ROOT/scripts/deploy.sh v2.0.1"
    echo "  Rollback: sudo $PROJECT_ROOT/scripts/rollback.sh v2.0.0"
    echo
    echo "Next Steps:"
    echo "1. Access the web interface to configure cameras"
    echo "2. Set up your RTSP camera streams"
    echo "3. Configure motion detection settings"
    echo "4. Test the system functionality"
    echo
    echo "For troubleshooting, check:"
    echo "  sudo journalctl -u jericho-security -f"
    echo "  sudo -u www-data pm2 logs"
    echo
}

# Main installation function
main() {
    echo "JERICHO Security Type C - Ubuntu Installation"
    echo "============================================="
    echo
    
    # Create log directory
    mkdir -p "$(dirname "$LOG_FILE")"
    
    info "Starting installation..."
    
    check_root
    check_ubuntu_version
    update_system
    install_system_dependencies
    install_nodejs
    install_postgresql
    install_redis
    install_ffmpeg
    install_nginx
    create_system_user
    setup_application
    install_app_dependencies
    setup_database_schema
    create_config_files
    setup_systemd_services
    configure_nginx
    setup_log_rotation
    setup_firewall
    final_checks
    
    print_summary
    
    success "JERICHO Security Type C installation completed!"
}

# Execute main function
main "$@"
