#!/bin/bash

# ============================================================================
# JERICHO Security Type-C - One-Line Installer
# Ubuntu 24.04 LTS Complete Installation Script
# ============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Installation directory
INSTALL_DIR="/opt/jericho-security"
REPO_URL="https://github.com/AbdurahmanZA/jericho-security-type-c.git"

# Logo
print_logo() {
    echo -e "${PURPLE}"
    cat << "EOF"
     ██╗███████╗██████╗ ██╗ ██████╗██╗  ██╗ ██████╗ 
     ██║██╔════╝██╔══██╗██║██╔════╝██║  ██║██╔═══██╗
     ██║█████╗  ██████╔╝██║██║     ███████║██║   ██║
██   ██║██╔══╝  ██╔══██╗██║██║     ██╔══██║██║   ██║
╚█████╔╝███████╗██║  ██║██║╚██████╗██║  ██║╚██████╔╝
 ╚════╝ ╚══════╝╚═╝  ╚═╝╚═╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝ 
                                                      
    SECURITY TYPE-C - COMPLETE INSTALLATION
EOF
    echo -e "${NC}"
}

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_error "This script should not be run as root. Run as a regular user with sudo privileges."
        exit 1
    fi
}

# Check Ubuntu version
check_ubuntu() {
    if [[ ! -f /etc/lsb-release ]]; then
        log_error "This script is designed for Ubuntu. Other distributions are not supported."
        exit 1
    fi
    
    UBUNTU_VERSION=$(lsb_release -rs)
    if [[ "$UBUNTU_VERSION" != "24.04" ]]; then
        log_warning "This script is optimized for Ubuntu 24.04. Current version: $UBUNTU_VERSION"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Update system
update_system() {
    log_step "Updating system packages..."
    sudo apt update -qq
    sudo apt upgrade -y -qq
    sudo apt install -y curl wget git build-essential software-properties-common \
        apt-transport-https ca-certificates gnupg lsb-release unzip vim htop ufw \
        python3-pip > /dev/null 2>&1
    log_success "System updated successfully"
}

# Install Node.js 20 LTS
install_nodejs() {
    log_step "Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - > /dev/null 2>&1
    sudo apt install -y nodejs > /dev/null 2>&1
    
    # Install global packages
    sudo npm install -g pm2 nodemon > /dev/null 2>&1
    
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    log_success "Node.js installed: $NODE_VERSION, npm: $NPM_VERSION"
}

# Install PostgreSQL 15
install_postgresql() {
    log_step "Installing PostgreSQL 15..."
    sudo apt install -y postgresql postgresql-contrib > /dev/null 2>&1
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    
    # Create database and user
    sudo -u postgres psql << 'EOF' > /dev/null 2>&1
CREATE USER jericho WITH PASSWORD 'jericho_secure_2024';
CREATE DATABASE jericho_security OWNER jericho;
GRANT ALL PRIVILEGES ON DATABASE jericho_security TO jericho;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
EOF
    
    log_success "PostgreSQL installed and configured"
}

# Install Redis
install_redis() {
    log_step "Installing Redis..."
    sudo apt install -y redis-server > /dev/null 2>&1
    
    # Configure Redis for production
    sudo sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf
    sudo sed -i 's/# maxmemory <bytes>/maxmemory 256mb/' /etc/redis/redis.conf
    sudo sed -i 's/# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
    
    sudo systemctl restart redis-server
    sudo systemctl enable redis-server
    
    log_success "Redis installed and configured"
}

# Install FFmpeg for video processing
install_ffmpeg() {
    log_step "Installing FFmpeg for video processing..."
    sudo apt install -y ffmpeg > /dev/null 2>&1
    
    FFMPEG_VERSION=$(ffmpeg -version | head -n1 | cut -d' ' -f3)
    log_success "FFmpeg installed: $FFMPEG_VERSION"
}

# Install Nginx
install_nginx() {
    log_step "Installing Nginx web server..."
    sudo apt install -y nginx > /dev/null 2>&1
    sudo systemctl start nginx
    sudo systemctl enable nginx
    
    log_success "Nginx installed and started"
}

# Clone and setup application
setup_application() {
    log_step "Setting up JERICHO Security application..."
    
    # Create application directory
    sudo mkdir -p "$INSTALL_DIR"
    sudo chown -R $USER:$USER "$INSTALL_DIR"
    
    # Clone repository
    log_info "Cloning repository..."
    cd "$INSTALL_DIR"
    git clone "$REPO_URL" . > /dev/null 2>&1
    
    # Install backend dependencies
    log_info "Installing backend dependencies..."
    cd backend
    npm install --production > /dev/null 2>&1
    
    # Install frontend dependencies
    log_info "Installing frontend dependencies..."
    cd ../frontend
    npm install > /dev/null 2>&1
    
    # Build frontend
    log_info "Building frontend..."
    npm run build > /dev/null 2>&1
    
    cd ..
    log_success "Application setup completed"
}

# Configure environment
configure_environment() {
    log_step "Configuring environment..."
    
    # Copy environment file
    cp backend/.env.example backend/.env
    
    # Generate JWT secrets
    JWT_SECRET=$(openssl rand -hex 32)
    JWT_REFRESH_SECRET=$(openssl rand -hex 32)
    
    # Update .env file
    sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" backend/.env
    sed -i "s/JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET/" backend/.env
    
    # Create necessary directories
    mkdir -p backend/logs
    mkdir -p backend/public/hls
    mkdir -p backend/uploads
    mkdir -p backend/snapshots
    
    log_success "Environment configured"
}

# Configure firewall
configure_firewall() {
    log_step "Configuring firewall..."
    
    # Configure UFW
    sudo ufw --force enable > /dev/null 2>&1
    sudo ufw allow ssh > /dev/null 2>&1
    sudo ufw allow 80/tcp > /dev/null 2>&1
    sudo ufw allow 443/tcp > /dev/null 2>&1
    sudo ufw allow 5000/tcp > /dev/null 2>&1
    sudo ufw allow 8080/tcp > /dev/null 2>&1
    sudo ufw allow 9999:10010/tcp > /dev/null 2>&1
    
    log_success "Firewall configured"
}

# Configure Nginx
configure_nginx() {
    log_step "Configuring Nginx..."
    
    # Create Nginx configuration
    sudo tee /etc/nginx/sites-available/jericho << 'EOF' > /dev/null
server {
    listen 80;
    server_name _;

    # Serve React frontend
    location / {
        root /opt/jericho-security/frontend/build;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Serve HLS streaming files
    location /hls/ {
        alias /opt/jericho-security/backend/public/hls/;
        add_header Cache-Control no-cache;
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods GET,HEAD,OPTIONS;
        add_header Access-Control-Allow-Headers Range;
    }

    # WebSocket proxy for RTSP streaming
    location /ws/ {
        proxy_pass http://localhost:9999;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
EOF

    # Enable site
    sudo ln -sf /etc/nginx/sites-available/jericho /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # Test and reload Nginx
    sudo nginx -t > /dev/null 2>&1
    sudo systemctl reload nginx
    
    log_success "Nginx configured for JERICHO"
}

# Setup PM2 for process management
setup_pm2() {
    log_step "Setting up PM2 process management..."
    
    # Create PM2 ecosystem file
    tee "$INSTALL_DIR/ecosystem.config.js" << 'EOF' > /dev/null
module.exports = {
  apps: [{
    name: 'jericho-backend',
    script: './backend/server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './backend/logs/error.log',
    out_file: './backend/logs/out.log',
    log_file: './backend/logs/combined.log',
    time: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G'
  }]
};
EOF

    # Start application with PM2
    cd "$INSTALL_DIR"
    pm2 start ecosystem.config.js > /dev/null 2>&1
    pm2 save > /dev/null 2>&1
    pm2 startup > /dev/null 2>&1 || true
    
    log_success "PM2 configured and application started"
}

# Create maintenance script
create_maintenance() {
    log_step "Creating maintenance tools..."
    
    sudo tee /usr/local/bin/jericho-status << 'EOF' > /dev/null
#!/bin/bash
echo "=== JERICHO Security System Status ==="
echo "Services:"
systemctl is-active --quiet postgresql && echo "  ✅ PostgreSQL: Running" || echo "  ❌ PostgreSQL: Failed"
systemctl is-active --quiet redis-server && echo "  ✅ Redis: Running" || echo "  ❌ Redis: Failed"
systemctl is-active --quiet nginx && echo "  ✅ Nginx: Running" || echo "  ❌ Nginx: Failed"

echo -e "\nPM2 Processes:"
pm2 status

echo -e "\nSystem Resources:"
df -h /opt/jericho-security | tail -1 | awk '{print "  Disk Usage: " $3 "/" $2 " (" $5 ")"}'
free -h | grep Mem | awk '{print "  Memory Usage: " $3 "/" $2}'
EOF

    sudo chmod +x /usr/local/bin/jericho-status
    
    log_success "Maintenance tools created"
}

# Get system information
get_system_info() {
    IP_ADDRESS=$(ip route get 1 | awk '{print $7; exit}')
    HOSTNAME=$(hostname)
    
    echo
    echo -e "${GREEN}=================================="
    echo "🎉 JERICHO Security Installation Complete!"
    echo -e "==================================${NC}"
    echo
    echo -e "${CYAN}🌐 Web Access:${NC}"
    echo "   HTTP:  http://$IP_ADDRESS"
    echo "   Local: http://localhost"
    echo
    echo -e "${CYAN}🔧 Backend Services:${NC}"
    echo "   API:       http://$IP_ADDRESS:5000/api/health"
    echo "   WebSocket: ws://$IP_ADDRESS:9999"
    echo
    echo -e "${CYAN}🎥 RTSP Streaming:${NC}"
    echo "   JSMpeg (Low Latency): WebSocket streams"
    echo "   HLS (Universal):      HTTP streams"
    echo "   Streaming API:        http://$IP_ADDRESS:8080/api/streams"
    echo
    echo -e "${CYAN}📊 System Management:${NC}"
    echo "   Status Check:   jericho-status"
    echo "   PM2 Status:     pm2 status"
    echo "   View Logs:      pm2 logs jericho-backend"
    echo "   Restart:        pm2 restart jericho-backend"
    echo
    echo -e "${CYAN}📋 Next Steps:${NC}"
    echo "1. Open browser: http://$IP_ADDRESS"
    echo "2. Login with default credentials (admin/admin123!)"
    echo "3. Change default password immediately"
    echo "4. Add your Hikvision credentials in Settings"
    echo "5. Discover and add cameras"
    echo
    echo -e "${YELLOW}⚠️  Important Security Notes:${NC}"
    echo "• Change default login credentials immediately"
    echo "• Update firewall rules for your network"
    echo "• Add SSL certificate for HTTPS"
    echo "• Configure regular backups"
    echo
    echo -e "${GREEN}✅ Installation completed successfully!${NC}"
    echo
}

# Main installation function
main() {
    print_logo
    
    log_info "Starting JERICHO Security Type-C installation..."
    log_info "This will install a complete surveillance system with RTSP streaming"
    
    # Confirmation
    read -p "Continue with installation? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Installation cancelled"
        exit 0
    fi
    
    # Pre-installation checks
    check_root
    check_ubuntu
    
    # Installation steps
    update_system
    install_nodejs
    install_postgresql
    install_redis
    install_ffmpeg
    install_nginx
    setup_application
    configure_environment
    configure_firewall
    configure_nginx
    setup_pm2
    create_maintenance
    
    # Show results
    get_system_info
}

# Run main function
main "$@"