# 🛡️ JERICHO Security Type C - Enhanced Surveillance System

![JERICHO Security](https://img.shields.io/badge/JERICHO-Security%20Type%20C-2D5A5C?style=for-the-badge&logo=shield&logoColor=white)
![Version](https://img.shields.io/badge/Version-2.0.0-D18B47?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Backend%20APIs%20Ready-4A6B75?style=for-the-badge)

## 🎯 Project Overview

**JERICHO Security Type C** combines the **battle-tested RTSP streaming engine** from your proven surveillance system with the **modern React/TypeScript frontend** from your GitHub repository, creating the ultimate professional surveillance platform.

### 🚀 Latest Updates (June 17, 2025)

- ✅ **Complete Settings UI** - All 4 major settings components production-ready
- ✅ **Backend API Server** - Express server with Settings API endpoints implemented
- ✅ **Database Integration** - PostgreSQL + Redis with automated schema creation
- ✅ **One-Command Installation** - Automated Ubuntu 24.04 deployment script
- ✅ **PM2 Process Management** - Production-ready service management
- ✅ **Security Configuration** - Environment setup with auto-generated secrets

## 📋 Quick Deployment

### 🎯 ONE-COMMAND INSTALLATION (Ubuntu 24.04)
```bash
# Download and run the automated installer
wget https://raw.githubusercontent.com/AbdurahmanZA/jericho-security-type-c/main/scripts/install-ubuntu.sh
chmod +x install-ubuntu.sh
./install-ubuntu.sh

# Access URLs after installation:
# Frontend: http://localhost:5173
# Backend:  http://localhost:5000
# Health:   http://localhost:5000/health
```

### 🔧 Manual Development Setup
```bash
# Clone repository
git clone https://github.com/AbdurahmanZA/jericho-security-type-c.git
cd jericho-security-type-c

# Start with PM2 (recommended)
pm2 start ecosystem.config.js

# OR start manually
cd backend && npm install && npm run dev
cd ../frontend && npm install && npm run dev
```

## 🏗️ Current Architecture Status

### ✅ **COMPLETED COMPONENTS**

#### Frontend (Production Ready)
- **React 18 + TypeScript** with Vite build system
- **shadcn/ui Component Library** with dark theme
- **Complete Settings Interface** with 4 major components:
  - 🔧 HikvisionSettings - Device credential management  
  - 🎯 MotionDetectionSettings - Detection configuration
  - 👥 UserManagement - Role-based user control
  - ⚙️ SystemSettings - Global system configuration
- **Responsive Design** optimized for all screen sizes
- **Toast Notifications** for real-time user feedback

#### Backend (Functional)
- **Express Server** with comprehensive middleware
- **Settings API Endpoints** for all frontend components:
  - `GET/POST /api/hikvision/*` - Device management
  - `GET/PUT /api/motion/settings` - Motion detection
  - `GET/POST /api/users` - User management  
  - `GET/PUT /api/system/settings` - System configuration
- **Database Integration** with PostgreSQL + Redis
- **WebSocket Support** for real-time updates
- **Health Monitoring** with `/health` endpoint

#### Infrastructure (Automated)
- **Database Schema** auto-created on startup
- **Environment Configuration** with secure defaults
- **PM2 Process Management** with monitoring
- **Ubuntu Installation Script** for deployment
- **Firewall Configuration** for security

### 🔄 **IN DEVELOPMENT**

#### Authentication & Security
- JWT authentication middleware implementation
- Password hashing with bcrypt
- API route protection
- Role-based access control (RBAC)

#### RTSP Streaming Engine
- FFmpeg integration for video processing
- HLS stream generation
- WebRTC signaling server
- Camera discovery and management

#### Advanced Features
- Real Hikvision ISAPI integration
- Motion detection with zones
- Event recording and playback
- Multi-camera management interface

## 🛠️ Technology Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for development and building
- **shadcn/ui** component library
- **Tailwind CSS** for styling
- **TanStack Query** for state management
- **WebSocket** for real-time updates

### Backend
- **Node.js 20+** with Express
- **PostgreSQL 15+** for data persistence
- **Redis 7+** for caching and sessions
- **Winston** for logging
- **PM2** for process management
- **FFmpeg** for video processing (coming)

### DevOps
- **Docker** containerization ready
- **PM2** process management
- **Nginx** reverse proxy support
- **Ubuntu 24.04** automated deployment
- **Git-based** version control with rollback

## 📊 API Documentation

### Settings API Endpoints

#### Hikvision Management
```bash
# Get all Hikvision devices
GET /api/hikvision/devices

# Test device connection  
POST /api/hikvision/test-connection
{
  "ip": "192.168.1.100",
  "port": 80,
  "username": "admin", 
  "password": "password"
}
```

#### Motion Detection
```bash
# Get motion settings for all cameras
GET /api/motion/settings

# Update motion settings for specific camera
PUT /api/motion/settings/:cameraId
{
  "motion_detection": {
    "enabled": true,
    "sensitivity": 75,
    "zones": [...]
  }
}
```

#### User Management
```bash
# Get all users
GET /api/users

# Create new user
POST /api/users
{
  "username": "operator1",
  "email": "operator@company.com",
  "password": "secure_password",
  "role": "operator"
}
```

#### System Settings
```bash
# Get all system settings grouped by category
GET /api/system/settings

# Update system setting
PUT /api/system/settings
{
  "category": "general",
  "key": "max_cameras",
  "value": 16,
  "description": "Maximum number of cameras"
}
```

### Health Check
```bash
# System health status
GET /health
{
  "status": "healthy",
  "timestamp": "2025-06-17T09:45:00.000Z",
  "services": {
    "database": "healthy",
    "redis": "healthy"
  },
  "version": "2.0.0"
}
```

## 🎨 UI Theme & Design

The project preserves the exact professional theme from the original GitHub repository:

- **Color Palette**: Dark theme with `#2D5A5C` (dark teal) and `#D18B47` (warm gold)
- **Component Library**: shadcn/ui with consistent styling
- **Typography**: Professional fonts with proper hierarchy
- **Responsive Design**: Mobile-first approach with desktop optimization
- **Accessibility**: WCAG compliant with proper contrast ratios

## 🔧 Development Workflow

### Starting Development Environment
```bash
# Quick start with PM2
pm2 start ecosystem.config.js

# Manual start (two terminals)
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend  
cd frontend && npm run dev
```

### Production Deployment
```bash
# Build frontend for production
cd frontend && npm run build

# Copy to backend public directory
cp -r dist/* ../backend/public/

# Start production services
pm2 start ecosystem.config.js --env production
pm2 save && pm2 startup
```

### Monitoring & Management
```bash
# View service status
pm2 status

# View logs
pm2 logs jericho-backend

# Restart services
pm2 restart all

# Check system health
curl http://localhost:5000/health
```

## 🚀 Roadmap & Next Steps

### Phase 1: Integration Testing ✅
- [x] Frontend Settings UI complete
- [x] Backend API implementation
- [x] Database integration
- [x] Automated deployment

### Phase 2: Authentication & Security (Current)
- [ ] JWT authentication implementation
- [ ] API route protection
- [ ] Password hashing and validation
- [ ] Role-based access control

### Phase 3: RTSP Streaming (Next)
- [ ] FFmpeg integration
- [ ] HLS stream generation  
- [ ] WebRTC signaling
- [ ] Camera discovery interface

### Phase 4: Advanced Features
- [ ] Real Hikvision ISAPI integration
- [ ] Motion detection with zones
- [ ] Event recording and playback
- [ ] Performance optimization

### Phase 5: Production Enhancement
- [ ] Advanced monitoring
- [ ] Backup and restore system
- [ ] Multi-tenant support
- [ ] Mobile PWA capabilities

## 📖 Documentation

- **[Installation Guide](docs/INSTALLATION.md)** - Detailed setup instructions
- **[API Documentation](docs/API.md)** - Complete API reference
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[Architecture](docs/ARCHITECTURE.md)** - System design and components

## 🔐 Security Features

- **Environment Configuration** with secure secret generation
- **Database Security** with parameterized queries
- **Input Validation** and sanitization
- **Rate Limiting** for API protection
- **Firewall Configuration** for system security
- **Health Monitoring** for service status

## 📞 Support & Contributing

- **Issues**: Create an issue on GitHub for bugs or feature requests
- **Documentation**: Check the docs folder for detailed guides
- **Security**: Report security issues privately to maintainers

---

**JERICHO Security Type C** - Professional surveillance system with modern architecture! 🛡️

**Current Status**: Backend APIs functional, ready for integration testing  
**Next Milestone**: Authentication implementation and RTSP streaming  
**Version**: 2.0.0 (Backend Foundation Complete)  
**Last Updated**: June 17, 2025