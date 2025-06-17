# JERICHO Security Type-C - Maintenance & Version Control Plan

## 🎯 Repository Maintenance Overview

This document outlines the maintenance strategy for the JERICHO Security Type-C surveillance system repository on Ubuntu 24.04.

## 📋 Version Control Strategy

### Current Status (v2.0.0)
- ✅ Backend API endpoints functional
- ✅ Frontend React components implemented  
- ✅ Database schema ready
- ✅ Docker & PM2 deployment configured
- 🔄 Authentication system in development
- 🔄 RTSP streaming integration pending

### Branch Structure
```
main (stable production)
├── develop (integration branch)
├── feature/authentication (current work)
├── feature/rtsp-streaming (next priority)
├── feature/hikvision-integration
└── hotfix/security-patches
```

### Release Versioning
- **Major (X.0.0)**: Architecture changes, breaking API changes
- **Minor (X.Y.0)**: New features, API additions
- **Patch (X.Y.Z)**: Bug fixes, security patches

## 🔄 Automated Maintenance Tasks

### Daily Tasks
```bash
#!/bin/bash
# scripts/daily-maintenance.sh

# Update system packages
sudo apt update && sudo apt upgrade -y

# Check service health
pm2 status
systemctl status postgresql
systemctl status redis-server

# Backup database
sudo -u postgres pg_dump jericho_security > "/opt/jericho-security/backups/daily-$(date +%Y%m%d).sql"

# Clean old logs
find /opt/jericho-security/jericho-security-type-c/backend/logs -name "*.log" -mtime +7 -delete

# Monitor disk space
df -h | grep -E "(/$|/opt)" | awk '{if($5+0 > 85) print "Warning: " $0 " is " $5 " full"}'
```

### Weekly Tasks
```bash
#!/bin/bash
# scripts/weekly-maintenance.sh

# Full system backup
tar -czf "/opt/backups/jericho-weekly-$(date +%Y%m%d).tar.gz" \
    /opt/jericho-security \
    --exclude=node_modules \
    --exclude=*.log

# Update dependencies
cd /opt/jericho-security/jericho-security-type-c
npm audit && npm audit fix
cd backend && npm update
cd ../frontend && npm update

# Clean unused Docker images
docker image prune -f

# Rotate backups (keep 4 weeks)
find /opt/backups -name "jericho-weekly-*.tar.gz" -mtime +28 -delete
```

## 🚀 Deployment & Rollback System

### Deployment Script
```bash
#!/bin/bash
# scripts/deploy.sh
VERSION=$1

if [ -z "$VERSION" ]; then
    echo "Usage: ./deploy.sh <version>"
    exit 1
fi

echo "🚀 Deploying JERICHO Security Type-C v$VERSION"

# Create backup before deployment
./scripts/create-backup.sh "pre-deploy-v$VERSION"

# Pull latest changes
git fetch origin
git checkout "v$VERSION"

# Install dependencies
cd backend && npm ci --production
cd ../frontend && npm ci && npm run build

# Database migrations
npm run db:migrate

# Restart services
pm2 reload ecosystem.config.js

# Health check
sleep 10
curl -f http://localhost:5000/health || {
    echo "❌ Health check failed, rolling back..."
    ./scripts/rollback.sh
    exit 1
}

echo "✅ Deployment successful!"
```

### Rollback Script
```bash
#!/bin/bash
# scripts/rollback.sh
BACKUP_VERSION=$1

echo "🔄 Rolling back JERICHO Security Type-C..."

# Stop services
pm2 stop all

# Restore from backup
if [ -n "$BACKUP_VERSION" ]; then
    ./scripts/restore-backup.sh "$BACKUP_VERSION"
else
    # Restore from latest backup
    LATEST_BACKUP=$(ls -t /opt/backups/jericho-backup-*.tar.gz | head -1)
    ./scripts/restore-backup.sh "$LATEST_BACKUP"
fi

# Restart services
pm2 start ecosystem.config.js

echo "✅ Rollback completed!"
```

## 🔐 Security Maintenance

### Security Updates
```bash
#!/bin/bash
# scripts/security-update.sh

# Update system security patches
sudo apt update && sudo apt upgrade -y

# Update Node.js security vulnerabilities
npm audit fix --force

# Regenerate JWT secrets if needed
if [ "$1" = "rotate-secrets" ]; then
    echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env.new
    echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)" >> .env.new
    echo "⚠️  New JWT secrets generated. Update .env file manually."
fi

# Check for exposed credentials
git log --oneline | head -10 | xargs git show | grep -i "password\|secret\|key" || echo "✅ No credentials found in recent commits"
```

### Permission Auditing
```bash
#!/bin/bash
# scripts/audit-permissions.sh

echo "🔍 Auditing file permissions..."

# Check critical files
find /opt/jericho-security -name "*.env*" -exec ls -la {} \;
find /opt/jericho-security -name "*.key" -exec ls -la {} \;
find /opt/jericho-security -name "config.*" -exec ls -la {} \;

# Ensure proper ownership
chown -R $USER:$USER /opt/jericho-security/jericho-security-type-c
chmod 600 /opt/jericho-security/jericho-security-type-c/.env
chmod 755 /opt/jericho-security/jericho-security-type-c/scripts/*.sh
```

## 📊 Monitoring & Health Checks

### System Health Script
```bash
#!/bin/bash
# scripts/health-check.sh

echo "🏥 JERICHO Security Health Check - $(date)"
echo "================================================"

# Service status
echo "📋 Service Status:"
pm2 jlist | jq '.[] | select(.name | test("jericho")) | {name: .name, status: .pm2_env.status, memory: .memory, cpu: .cpu}'

# Database connectivity
echo "🗄️  Database Status:"
psql -h localhost -U jericho -d jericho_security -c "SELECT version();" > /dev/null 2>&1 && echo "✅ PostgreSQL Connected" || echo "❌ PostgreSQL Connection Failed"

# Redis connectivity  
echo "🔄 Redis Status:"
redis-cli ping > /dev/null 2>&1 && echo "✅ Redis Connected" || echo "❌ Redis Connection Failed"

# API health endpoint
echo "🌐 API Health:"
curl -s http://localhost:5000/health | jq '.' || echo "❌ API Health Check Failed"

# Disk space
echo "💾 Disk Usage:"
df -h | grep -E "(/$|/opt)" | awk '{print $5 " used on " $6}'

# Memory usage
echo "🧠 Memory Usage:"
free -h | grep Mem | awk '{print $3 "/" $2 " used (" $3/$2*100 "%)"}'

# Recent errors in logs
echo "🚨 Recent Errors:"
tail -100 /opt/jericho-security/jericho-security-type-c/backend/logs/error.log 2>/dev/null | grep -c "ERROR" || echo "0 errors in recent logs"

echo "================================================"
echo "Health check completed at $(date)"
```

## 🔧 Development Environment Sync

### Fresh Installation Updater
```bash
#!/bin/bash
# scripts/update-fresh-install.sh

echo "🔄 Updating fresh installation artifacts..."

# Update installation guide
cat > docs/FRESH_INSTALL_UBUNTU.md << 'EOF'
# 🆕 JERICHO Security Type-C - Fresh Installation (Ubuntu 24.04)

## Current Version: $(git describe --tags --always)
## Last Updated: $(date)

[Installation content will be automatically updated]
EOF

# Update Docker configuration
docker-compose config > docker-compose.validated.yml

# Update package versions
cd frontend && npm list --depth=0 > ../docs/frontend-dependencies.txt
cd ../backend && npm list --depth=0 > ../docs/backend-dependencies.txt

# Create fresh installation artifact
tar -czf "releases/jericho-fresh-install-$(date +%Y%m%d).tar.gz" \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=*.log \
    .

echo "✅ Fresh installation artifacts updated"
```

## 📦 Release Management

### Release Preparation
```bash
#!/bin/bash
# scripts/prepare-release.sh
NEW_VERSION=$1

if [ -z "$NEW_VERSION" ]; then
    echo "Usage: ./prepare-release.sh <version>"
    exit 1
fi

echo "📦 Preparing release v$NEW_VERSION"

# Update version in package.json files
jq ".version = \"$NEW_VERSION\"" package.json > package.json.tmp && mv package.json.tmp package.json
jq ".version = \"$NEW_VERSION\"" frontend/package.json > frontend/package.json.tmp && mv frontend/package.json.tmp frontend/package.json
jq ".version = \"$NEW_VERSION\"" backend/package.json > backend/package.json.tmp && mv backend/package.json.tmp backend/package.json

# Update README with new version
sed -i "s/Version-[0-9]\+\.[0-9]\+\.[0-9]\+/Version-$NEW_VERSION/g" README.md

# Create changelog entry
echo "## v$NEW_VERSION - $(date +%Y-%m-%d)" >> CHANGELOG.md.tmp
echo "" >> CHANGELOG.md.tmp
cat CHANGELOG.md >> CHANGELOG.md.tmp
mv CHANGELOG.md.tmp CHANGELOG.md

# Commit changes
git add -A
git commit -m "chore: bump version to v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo "✅ Release v$NEW_VERSION prepared. Push with: git push origin main --tags"
```

## 🤖 Automation Setup

### Cron Jobs
```bash
# Add to crontab: crontab -e
# Daily health check and backup
0 2 * * * /opt/jericho-security/jericho-security-type-c/scripts/daily-maintenance.sh

# Weekly full backup and updates  
0 3 * * 0 /opt/jericho-security/jericho-security-type-c/scripts/weekly-maintenance.sh

# Hourly health check
0 * * * * /opt/jericho-security/jericho-security-type-c/scripts/health-check.sh >> /var/log/jericho-health.log

# Monitor disk space every 6 hours
0 */6 * * * df -h | grep -E "(/$|/opt)" | awk '{if($5+0 > 90) print "CRITICAL: " $0 " is " $5 " full"}' | mail -s "Disk Space Warning" admin@company.com
```

## 📝 Next Steps & Priorities

### Immediate (Next 2 weeks)
1. **Authentication System** - Complete JWT implementation
2. **RTSP Integration** - Merge proven streaming engine
3. **Security Hardening** - API route protection
4. **Documentation** - Complete API reference

### Medium Term (Next month)
1. **Hikvision ISAPI** - Real motion detection integration  
2. **Performance Optimization** - Stream management
3. **Mobile Interface** - PWA capabilities
4. **Advanced Monitoring** - Grafana dashboards

### Long Term (Next quarter)
1. **Multi-tenant Support** - Enterprise features
2. **Cloud Integration** - Backup and remote access
3. **AI Enhancement** - Advanced motion detection
4. **Kubernetes Deployment** - Scalable infrastructure

---

**Maintained by**: Claude AI Assistant  
**Repository**: https://github.com/AbdurahmanZA/jericho-security-type-c  
**Last Updated**: $(date)  
**Ubuntu Version**: 24.04 LTS  
**Node.js Version**: 20+  
**Database**: PostgreSQL 15+ with Redis 7+
