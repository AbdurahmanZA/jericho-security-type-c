#!/bin/bash

# JERICHO Security Type C - Ubuntu 24.04 Installation Script
# Automated setup for development and production environments

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
    
    log "Repository cloned successfully!"
}

# Install application dependencies
install_app_dependencies() {
    log "Installing application dependencies..."
    
    # Install backend dependencies
    cd backend
    npm install
    
    # Copy environment file
    cp .env.example .env
    log "Backend dependencies installed!"
    
    # Install frontend dependencies
    cd ../frontend
    npm install
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

DB_HOST=localhost
DB_PORT=5432
DB_NAME=jericho_security
DB_USER=jericho
DB_PASSWORD=jericho_secure_2024

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

JWT_SECRET=jericho_jwt_secret_$(openssl rand -hex 16)
JWT_EXPIRE=24h

UPLOAD_DIR=./uploads
MAX_FILE_SIZE=50MB

RTSP_PORT=8554
HLS_SEGMENT_TIME=2
HLS_LIST_SIZE=3

BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100

HIKVISION_TIMEOUT=5000
HIKVISION_RETRY_ATTEMPTS=3

LOG_LEVEL=info
LOG_FILE=logs/jericho.log

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
    
    log "Installation test completed successfully!"
}

# Start services
start_services() {
    log "Starting JERICHO Security services..."
    
    # Create PM2 ecosystem file
    cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'jericho-backend',
      script: 'backend/server.js',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      watch: ['backend'],
      ignore_watch: ['node_modules', 'logs', 'uploads'],
      log_file: 'logs/combined.log',
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      max_memory_restart: '1G',
      restart_delay: 5000
    }
  ]
};
EOF

    # Create logs directory
    mkdir -p logs
    
    # Start backend with PM2
    pm2 start ecosystem.config.js
    pm2 save
    
    # Setup PM2 startup
    PM2_STARTUP=$(pm2 startup | tail -n 1)
    eval $PM2_STARTUP 2>/dev/null || true
    
    log "Backend started with PM2!"
    
    # Start frontend in development mode (background)
    cd frontend
    nohup npm run dev > ../logs/frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > ../logs/frontend.pid
    
    cd ..
    
    log "Frontend started in development mode!"
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
    echo
    echo "📁 Project Directory: $(pwd)"
    echo
    echo "✅ Installation completed successfully!"
    echo "✅ Services are running and ready for development!"
    echo
}

# Main installation function
main() {
    echo "============================================="
    echo "🛡️  JERICHO Security Type C Installer"
    echo "============================================="
    echo "Starting automated installation for Ubuntu 24.04..."
    echo
    
    check_ubuntu
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
    display_final_info
}

# Run main function
main "$@"