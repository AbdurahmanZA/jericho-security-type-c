# 🆕 JERICHO Security Type-C - Fresh Installation Guide (Ubuntu 24.04)

**Version**: 2.0.0  
**Last Updated**: June 17, 2025  
**System**: Ubuntu 24.04 LTS  
**Status**: Backend APIs Ready, Authentication In Development

## 🎯 Quick Installation Overview

This guide provides a **complete fresh installation** of JERICHO Security Type-C surveillance system on Ubuntu 24.04. The system combines battle-tested RTSP streaming with modern React frontend and professional surveillance features.

## 🚀 ONE-COMMAND INSTALLATION

```bash
# Download and run automated installer
wget https://raw.githubusercontent.com/AbdurahmanZA/jericho-security-type-c/main/scripts/install-ubuntu.sh
chmod +x install-ubuntu.sh
./install-ubuntu.sh

# After installation, access:
# Frontend: http://localhost:5173
# Backend API: http://localhost:5000
# Health Check: http://localhost:5000/health
```

## 📋 Manual Installation Steps

### Step 1: System Prerequisites
```bash
# Update Ubuntu 24.04
sudo apt update && sudo apt upgrade -y

# Install Node.js 20+ (required)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL 15+
sudo apt install -y postgresql postgresql-contrib

# Install Redis 7+
sudo apt install -y redis-server

# Install FFmpeg for video processing
sudo apt install -y ffmpeg

# Install PM2 for process management
sudo npm install -g pm2
```

### Step 2: Database Setup
```bash
# Create PostgreSQL user and database
sudo -u postgres createuser -P jericho  # Set password: jericho_secure_pass
sudo -u postgres createdb jericho_security -O jericho

# Configure Redis for production
sudo sed -i 's/supervised no/supervised systemd/' /etc/redis/redis.conf
sudo systemctl restart redis-server
sudo systemctl enable redis-server
```

### Step 3: Clone and Setup Application
```bash
# Create application directory
sudo mkdir -p /opt/jericho-security
sudo chown -R $USER:$USER /opt/jericho-security

# Clone repository
cd /opt/jericho-security
git clone https://github.com/AbdurahmanZA/jericho-security-type-c.git
cd jericho-security-type-c

# Install dependencies
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### Step 4: Configuration
```bash
# Create environment file
cat > backend/.env << 'EOF'
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=jericho_security
DB_USER=jericho
DB_PASSWORD=jericho_secure_pass

# Redis Configuration  
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Server Configuration
PORT=5000
NODE_ENV=production

# Security (Generate secure secrets)
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Hikvision API (Add your credentials)
HIKVISION_ACCESS_KEY=your_access_key_here
HIKVISION_SECRET_KEY=your_secret_key_here

# Paths
HLS_PATH=/opt/jericho-security/jericho-security-type-c/backend/hls
SNAPSHOTS_PATH=/opt/jericho-security/jericho-security-type-c/backend/snapshots
LOG_DIR=/opt/jericho-security/jericho-security-type-c/backend/logs
EOF

# Create required directories
mkdir -p backend/{hls,snapshots,logs}
chmod 755 backend/{hls,snapshots,logs}
```

### Step 5: Database Initialization
```bash
# Run database migrations
cd backend
npm run db:migrate

# Verify database setup
psql -h localhost -U jericho -d jericho_security -c "\dt"
```

### Step 6: Start Services
```bash
# Build frontend for production
cd frontend
npm run build
cd ..

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Enable firewall (optional)
sudo ufw allow 5000
sudo ufw allow 5173
```

## 🔧 Current System Capabilities

### ✅ Functional Features (v2.0.0)
- **Backend API Server**: All endpoints operational
  - Camera management: `/api/cameras/*`
  - User management: `/api/users`
  - System settings: `/api/system/settings`
  - Motion detection: `/api/motion/settings`
  - Health monitoring: `/health`

- **Frontend Interface**: Complete React application
  - Multi-camera grid layouts (1, 2, 4, 6, 9, 12 cameras)
  - Camera source management (RTSP, IP, NVR, DVR, HikConnect)
  - Real-time controls (start/stop/remove cameras)
  - Professional dark theme UI
  - Multi-screen support

- **Database Integration**: PostgreSQL + Redis
  - Auto-schema creation
  - Settings persistence
  - User management tables
  - Camera configuration storage

### 🔄 In Development Features
- **Authentication System**: JWT implementation in progress
- **RTSP Streaming**: FFmpeg integration pending
- **Real Hikvision Integration**: ISAPI motion detection
- **Advanced Security**: API route protection

## 🚨 System Health Verification

```bash
# Check all services
pm2 status

# Test database connectivity
psql -h localhost -U jericho -d jericho_security -c "SELECT version();"

# Test Redis
redis-cli ping

# Test API health
curl http://localhost:5000/health

# Check frontend
curl http://localhost:5173
```

## 🔧 Configuration Management

### Environment Variables
Key configuration in `backend/.env`:
- **Database**: PostgreSQL connection settings
- **Redis**: Caching and session storage
- **Security**: JWT secrets and authentication
- **Hikvision**: API credentials for motion detection
- **Paths**: File storage locations

### PM2 Process Management
```bash
# View service status
pm2 status

# View logs
pm2 logs jericho-backend
pm2 logs jericho-frontend

# Restart services
pm2 restart all

# Monitor resources
pm2 monit
```

## 🔄 Version Control & Updates

### Current Repository State
- **Main Branch**: Stable production code
- **Develop Branch**: Integration branch for new features
- **Feature Branches**: Authentication, RTSP streaming

### Update Process
```bash
# Pull latest changes
git fetch origin
git checkout main
git pull origin main

# Restart services after updates
pm2 reload all

# Run migrations if needed
npm run db:migrate
```

### Backup Strategy
```bash
# Create database backup
sudo -u postgres pg_dump jericho_security > "/opt/backups/jericho-$(date +%Y%m%d).sql"

# Create application backup
tar -czf "/opt/backups/jericho-app-$(date +%Y%m%d).tar.gz" \
    /opt/jericho-security/jericho-security-type-c \
    --exclude=node_modules \
    --exclude=*.log
```

## 🚀 Next Development Steps

### Immediate Priorities
1. **Complete Authentication**: JWT login/logout system
2. **RTSP Integration**: Merge proven streaming engine
3. **Security Hardening**: API route protection
4. **Hikvision ISAPI**: Real motion detection

### Development Workflow
```bash
# Start development environment
cd /opt/jericho-security/jericho-security-type-c

# Backend development
cd backend && npm run dev

# Frontend development (new terminal)
cd frontend && npm run dev

# Access development URLs:
# Frontend: http://localhost:5173
# Backend: http://localhost:5000
```

## 📞 Support & Troubleshooting

### Common Issues
1. **Port conflicts**: Ensure 5000 and 5173 are available
2. **Database connection**: Verify PostgreSQL service is running
3. **Permission errors**: Check file ownership in `/opt/jericho-security`
4. **Node.js version**: Ensure Node.js 20+ is installed

### Log Files
- **Application**: `/opt/jericho-security/jericho-security-type-c/backend/logs/`
- **PM2**: `pm2 logs`
- **PostgreSQL**: `/var/log/postgresql/`
- **System**: `/var/log/syslog`

### Health Monitoring
```bash
# System resource usage
df -h                    # Disk space
free -h                 # Memory usage
top                     # CPU usage

# Service status
systemctl status postgresql
systemctl status redis-server
pm2 status             # Application processes
```

---

**Installation Support**: Check GitHub repository issues  
**Repository**: https://github.com/AbdurahmanZA/jericho-security-type-c  
**Documentation**: See `/docs` folder for detailed guides  
**Version**: 2.0.0 (Backend Foundation Complete)  
**Ubuntu**: 24.04 LTS Required  
**Last Updated**: June 17, 2025

🛡️ **JERICHO Security Type-C** - Professional surveillance with modern architecture!