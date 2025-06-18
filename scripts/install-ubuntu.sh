#!/bin/bash

# JERICHO Security Type C - Ubuntu 24.04 Installation Script
# Automated setup for development and production environments
# Fixed PM2 ES module compatibility issues with .cjs extension

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NODE_VERSION="20"
POSTGRES_VERSION="15"
REDIS_VERSION="7"

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   error "This script should not be run as root. Run as a regular user with sudo privileges."
fi

# Check Ubuntu version
check_ubuntu() {
    if ! lsb_release -d | grep -q "Ubuntu 24.04"; then
        warn "This script is designed for Ubuntu 24.04. Current version: $(lsb_release -d | cut -f2)"
        read -p "Continue anyway? (y/N): " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Complete cleanup of previous installations
complete_cleanup() {
    log "Performing complete cleanup of previous installations..."
    
    # Stop all PM2 processes
    pm2 kill 2>/dev/null || true
    
    # Stop nginx if running
    sudo systemctl stop nginx 2>/dev/null || true
    
    # Remove all jericho directories
    rm -rf ~/jericho-security* 2>/dev/null || true
    rm -rf /tmp/jericho-* 2>/dev/null || true
    
    # Kill any remaining processes
    sudo pkill -f "jericho" 2>/dev/null || true
    sudo pkill -f "node.*server.js" 2>/dev/null || true
    
    log "Cleanup completed!"
}

# Create necessary directories
create_directories() {
    log "Creating necessary directories..."
    mkdir -p ~/jericho-security-logs
    mkdir -p ~/jericho-security-uploads
    mkdir -p ~/jericho-security-backups
}

# Install system dependencies
install_system_dependencies() {
    log "Updating system packages..."
    sudo apt update && sudo apt upgrade -y

    log "Installing essential packages..."
    sudo apt install -y \
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
        vim \
        htop \
        net-tools \
        ufw

    log "System dependencies installed successfully!"
}

# Install Node.js
install_nodejs() {
    log "Installing Node.js ${NODE_VERSION}..."
    
    # Remove existing Node.js if present
    sudo apt remove -y nodejs npm 2>/dev/null || true
    
    # Install NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash -
    
    # Install Node.js
    sudo apt install -y nodejs
    
    # Verify installation
    NODE_VER=$(node --version)
    NPM_VER=$(npm --version)
    
    log "Node.js installed: ${NODE_VER}"
    log "npm installed: ${NPM_VER}"
    
    # Install global packages
    sudo npm install -g pm2 nodemon
    
    log "Global npm packages installed: pm2, nodemon"
}

# Install PostgreSQL
install_postgresql() {
    log "Installing PostgreSQL ${POSTGRES_VERSION}..."
    
    sudo apt install -y postgresql postgresql-contrib postgresql-client
    
    # Start and enable PostgreSQL
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    
    # Create database and user
    log "Setting up JERICHO database..."
    
    sudo -u postgres psql << EOF
CREATE USER jericho WITH PASSWORD 'jericho_secure_2024';
CREATE DATABASE jericho_security OWNER jericho;
GRANT ALL PRIVILEGES ON DATABASE jericho_security TO jericho;
ALTER USER jericho CREATEDB;
\q
EOF

    # Test connection
    if PGPASSWORD='jericho_secure_2024' psql -h localhost -U jericho -d jericho_security -c "SELECT 1;" > /dev/null 2>&1; then
        log "PostgreSQL database configured successfully!"
    else
        error "PostgreSQL database configuration failed!"
    fi
}

# Install Redis
install_redis() {
    log "Installing Redis..."
    
    sudo apt install -y redis-server
    
    # Configure Redis
    sudo sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf
    sudo sed -i 's/# maxmemory <bytes>/maxmemory 256mb/' /etc/redis/redis.conf
    sudo sed -i 's/# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
    
    # Start and enable Redis
    sudo systemctl restart redis-server
    sudo systemctl enable redis-server
    
    # Test Redis
    if redis-cli ping | grep -q "PONG"; then
        log "Redis installed and configured successfully!"
    else
        error "Redis installation failed!"
    fi
}

# Install FFmpeg
install_ffmpeg() {
    log "Installing FFmpeg for video processing..."
    
    sudo apt install -y ffmpeg
    
    # Verify installation
    FFMPEG_VER=$(ffmpeg -version | head -n1)
    log "FFmpeg installed: ${FFMPEG_VER}"
}

# Install Nginx
install_nginx() {
    log "Installing Nginx web server..."
    
    sudo apt install -y nginx
    
    # Start and enable Nginx
    sudo systemctl start nginx
    sudo systemctl enable nginx
    
    log "Nginx installed and started!"
}

# Configure firewall
configure_firewall() {
    log "Configuring UFW firewall..."
    
    # Enable UFW
    sudo ufw --force enable
    
    # Allow SSH
    sudo ufw allow ssh
    
    # Allow HTTP and HTTPS
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    
    # Allow JERICHO backend port
    sudo ufw allow 5000/tcp
    
    # Allow frontend development port
    sudo ufw allow 5173/tcp
    
    # Allow PostgreSQL (only from localhost)
    sudo ufw allow from 127.0.0.1 to any port 5432
    
    # Allow Redis (only from localhost)
    sudo ufw allow from 127.0.0.1 to any port 6379
    
    log "Firewall configured successfully!"
}

# Clone JERICHO repository
clone_repository() {
    log "Cloning JERICHO Security Type C repository..."
    
    # Navigate to home directory
    cd ~
    
    # Remove existing directory if present
    if [[ -d "jericho-security-type-c" ]]; then
        warn "Existing jericho-security-type-c directory found. Removing..."
        rm -rf jericho-security-type-c
    fi
    
    # Clone repository
    git clone https://github.com/AbdurahmanZA/jericho-security-type-c.git
    cd jericho-security-type-c
    
    # Check out main branch and pull latest
    git checkout main
    git pull origin main
    
    # Verify critical files exist
    if [[ ! -f "backend/server.js" ]]; then
        error "Critical file backend/server.js not found! Repository may be incomplete."
    fi
    
    if [[ ! -f "package.json" ]]; then
        error "Critical file package.json not found! Repository may be incomplete."
    fi
    
    log "Repository cloned successfully!"
    log "Project directory: $(pwd)"
}

# Install application dependencies
install_app_dependencies() {
    log "Installing application dependencies..."
    
    # Install root dependencies first
    npm install || warn "Root npm install encountered some issues, continuing..."
    
    # Install backend dependencies
    cd backend
    npm install || warn "Backend npm install encountered some issues, continuing..."
    
    # Copy environment file
    if [[ -f ".env.example" ]]; then
        cp .env.example .env
        log "Copied .env.example to .env"
    else
        warn "No .env.example found, will create .env manually"
    fi
    
    log "Backend dependencies installed!"
    
    # Install frontend dependencies
    cd ../frontend
    npm install || warn "Frontend npm install encountered some issues, continuing..."
    log "Frontend dependencies installed!"
    
    cd ..
}

# Setup environment files
setup_environment() {
    log "Setting up environment configuration..."
    
    # Get local IP address
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    
    # Update backend .env file
    cd backend
    cat > .env << EOF
NODE_ENV=development
PORT=5000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=jericho_security
DB_USER=jericho
DB_PASSWORD=jericho_secure_2024

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Configuration
JWT_SECRET=jericho_jwt_secret_$(openssl rand -hex 16)
JWT_EXPIRE=24h

# File Upload Configuration
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=50MB

# RTSP Configuration
RTSP_PORT=8554
HLS_SEGMENT_TIME=2
HLS_LIST_SIZE=3

# Security Configuration
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100

# Hikvision API Configuration
HIKVISION_TIMEOUT=5000
HIKVISION_RETRY_ATTEMPTS=3

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=logs/jericho.log

# Frontend URL
FRONTEND_URL=http://localhost:5173
EOF

    # Setup frontend .env file
    cd ../frontend
    cat > .env << EOF
VITE_API_BASE_URL=http://localhost:5000/api
VITE_WS_URL=ws://localhost:5000
VITE_APP_NAME=JERICHO Security Type C
VITE_APP_VERSION=2.0.0
EOF

    cd ..
    
    log "Environment files configured!"
    log "Local access: http://localhost:5173"
    log "Network access: http://${LOCAL_IP}:5173"
}

# Test installation
test_installation() {
    log "Testing installation..."
    
    # Test Node.js
    node --version > /dev/null && log "✓ Node.js working"
    
    # Test npm
    npm --version > /dev/null && log "✓ npm working"
    
    # Test PostgreSQL
    PGPASSWORD='jericho_secure_2024' psql -h localhost -U jericho -d jericho_security -c "SELECT 1;" > /dev/null 2>&1 && log "✓ PostgreSQL working"
    
    # Test Redis
    redis-cli ping | grep -q "PONG" && log "✓ Redis working"
    
    # Test FFmpeg
    ffmpeg -version > /dev/null 2>&1 && log "✓ FFmpeg working"
    
    # Test PM2
    pm2 --version > /dev/null && log "✓ PM2 working"
    
    # Verify critical files exist
    if [[ -f "backend/server.js" ]]; then
        log "✓ Backend server file found"
    else
        error "❌ Backend server file missing!"
    fi
    
    log "Installation test completed successfully!"
}

# Start services
start_services() {
    log "Starting JERICHO Security services..."
    
    # Create PM2 ecosystem file with CommonJS format for better compatibility
    # Using .cjs extension to force CommonJS interpretation
    cat > ecosystem.config.cjs << 'EOF'
/**
 * JERICHO Security Type C - PM2 Ecosystem Configuration
 * CommonJS format for maximum PM2 compatibility
 * Fixed script paths and working directory issues
 */

module.exports = {
  apps: [
    {
      name: 'jericho-backend',
      script: './backend/server.js',
      cwd: process.cwd(),
      
      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      
      // Process management
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      
      // Monitoring and restarts
      max_memory_restart: '1G',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Advanced options
      kill_timeout: 5000,
      listen_timeout: 8000,
      
      // Watch settings (disabled for stability)
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'uploads', 'frontend']
    }
  ]
};
EOF

    # Create necessary directories
    mkdir -p logs
    mkdir -p backend/uploads
    mkdir -p backend/public
    
    # Verify the ecosystem file exists and is readable
    if [[ -f "ecosystem.config.cjs" ]]; then
        log "✓ PM2 configuration file created successfully"
    else
        error "❌ Failed to create PM2 configuration file!"
    fi
    
    # Verify backend server file exists with correct path
    if [[ -f "./backend/server.js" ]]; then
        log "✓ Backend server file verified at: $(pwd)/backend/server.js"
    else
        error "❌ Backend server file not found at expected path: $(pwd)/backend/server.js"
    fi
    
    # Start backend with PM2 using the .cjs file
    log "Starting backend with PM2..."
    pm2 start ecosystem.config.cjs --env development
    
    # Wait a moment for the process to start
    sleep 5
    
    # Check if PM2 started successfully
    if pm2 list | grep -q "jericho-backend.*online"; then
        log "✓ Backend started successfully with PM2!"
    else
        warn "Backend may have issues starting. Checking logs..."
        pm2 logs jericho-backend --lines 10 || true
        
        # Try alternative startup method
        warn "Trying alternative startup method..."
        pm2 delete jericho-backend 2>/dev/null || true
        pm2 start ./backend/server.js --name jericho-backend --env development
        sleep 3
        
        if pm2 list | grep -q "jericho-backend.*online"; then
            log "✓ Backend started with alternative method!"
        else
            error "❌ Failed to start backend with PM2. Check logs: pm2 logs jericho-backend"
        fi
    fi
    
    # Save PM2 configuration
    pm2 save
    
    # Setup PM2 startup (with error handling)
    log "Setting up PM2 auto-startup..."
    PM2_STARTUP_CMD=$(pm2 startup | tail -n 1)
    if [[ $PM2_STARTUP_CMD == sudo* ]]; then
        log "PM2 startup command: $PM2_STARTUP_CMD"
        eval "$PM2_STARTUP_CMD" 2>/dev/null || warn "PM2 startup setup may need manual configuration"
    fi
    
    # Start frontend in development mode (background)
    log "Starting frontend in development mode..."
    cd frontend
    
    # Kill any existing frontend processes
    pkill -f "vite" 2>/dev/null || true
    
    # Start frontend
    nohup npm run dev > ../logs/frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > ../logs/frontend.pid
    
    cd ..
    
    log "Frontend started in development mode (PID: $FRONTEND_PID)!"
    
    # Wait a moment for services to initialize
    sleep 5
}

# Display final information
display_final_info() {
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    
    echo
    echo "============================================="
    echo "🛡️  JERICHO Security Type C Installation Complete!"
    echo "============================================="
    echo
    echo "📊 System Information:"
    echo "   • Operating System: $(lsb_release -d | cut -f2)"
    echo "   • Node.js Version: $(node --version)"
    echo "   • PostgreSQL: Running on port 5432"
    echo "   • Redis: Running on port 6379"
    echo "   • Local IP: ${LOCAL_IP}"
    echo
    echo "🌐 Access URLs:"
    echo "   • Frontend (Local): http://localhost:5173"
    echo "   • Frontend (Network): http://${LOCAL_IP}:5173"
    echo "   • Backend API: http://localhost:5000"
    echo "   • Health Check: http://localhost:5000/health"
    echo
    echo "🔧 Management Commands:"
    echo "   • View backend logs: pm2 logs jericho-backend"
    echo "   • View frontend logs: tail -f logs/frontend.log"
    echo "   • Restart backend: pm2 restart jericho-backend"
    echo "   • Stop all services: pm2 stop all"
    echo "   • Check PM2 status: pm2 status"
    echo "   • Monitor PM2: pm2 monit"
    echo
    echo "🔑 Default Login Credentials:"
    echo "   • Username: admin"
    echo "   • Password: admin123"
    echo "   • (Change on first login)"
    echo
    echo "📁 Project Directory: $(pwd)"
    echo
    echo "🎯 Quick Health Check:"
    echo "   • PM2 Status: $(pm2 list | grep jericho-backend | awk '{print $12}' || echo 'Not found')"
    echo "   • Backend Health: $(curl -s http://localhost:5000/health 2>/dev/null | head -c 20 || echo 'Not responding yet')"
    echo
    echo "✅ Installation completed successfully!"
    echo "✅ Services are running and ready for development!"
    echo
    echo "🆘 If you encounter issues:"
    echo "   • Backend not starting: pm2 logs jericho-backend"
    echo "   • Frontend issues: tail -f logs/frontend.log"
    echo "   • Database issues: sudo systemctl status postgresql"
    echo "   • Redis issues: sudo systemctl status redis-server"
    echo
    echo "🔄 To restart everything:"
    echo "   pm2 restart all && pkill -f vite && cd frontend && nohup npm run dev > ../logs/frontend.log 2>&1 &"
    echo
    echo "📞 Support: Check GitHub issues at https://github.com/AbdurahmanZA/jericho-security-type-c/issues"
    echo
}

# Perform final health checks
final_health_checks() {
    log "Performing final health checks..."
    
    # Wait for services to fully start
    sleep 10
    
    # Check PM2 status
    if pm2 list | grep -q "jericho-backend.*online"; then
        log "✓ PM2 backend process is running"
    else
        warn "⚠️  PM2 backend process may have issues"
        pm2 logs jericho-backend --lines 5 || true
    fi
    
    # Check if backend is responding
    if curl -s http://localhost:5000/health > /dev/null 2>&1; then
        log "✓ Backend API is responding"
    else
        warn "⚠️  Backend API not responding yet (may still be starting up)"
    fi
    
    # Check if frontend is running
    if ps aux | grep -v grep | grep -q "vite"; then
        log "✓ Frontend development server is running"
    else
        warn "⚠️  Frontend development server may have issues"
    fi
    
    # Check database connection
    if PGPASSWORD='jericho_secure_2024' psql -h localhost -U jericho -d jericho_security -c "SELECT 1;" > /dev/null 2>&1; then
        log "✓ Database connection working"
    else
        warn "⚠️  Database connection issues"
    fi
    
    # Check Redis
    if redis-cli ping | grep -q "PONG"; then
        log "✓ Redis is responding"
    else
        warn "⚠️  Redis connection issues"
    fi
}

# Main installation function
main() {
    echo "============================================="
    echo "🛡️  JERICHO Security Type C Installer v2.2"
    echo "============================================="
    echo "Starting automated installation for Ubuntu 24.04..."
    echo "$(date)"
    echo
    
    check_ubuntu
    complete_cleanup
    create_directories
    install_system_dependencies
    install_nodejs
    install_postgresql
    install_redis
    install_ffmpeg
    install_nginx
    configure_firewall
    clone_repository
    install_app_dependencies
    setup_environment
    test_installation
    start_services
    final_health_checks
    display_final_info
}

# Run main function with error handling
main "$@" || {
    error "Installation failed! Check the logs above for details."
    echo "You can try running the installation again or check the GitHub repository for support."
    echo ""
    echo "Common fixes:"
    echo "  • Try: pm2 start ./backend/server.js --name jericho-backend"
    echo "  • Check: pm2 logs jericho-backend"
    echo "  • Verify: ls -la backend/server.js"
    exit 1
}
