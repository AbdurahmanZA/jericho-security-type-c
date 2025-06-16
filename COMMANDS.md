#!/bin/bash
# JERICHO Security Type C - Copy-Paste Commands Summary
# All commands needed for quick development and deployment

cat << 'EOF'

🛡️  JERICHO Security Type C - Copy-Paste Commands
====================================================

📋 QUICK SETUP COMMANDS

1️⃣ Clone and Setup Development:
```bash
git clone https://github.com/AbdurahmanZA/jericho-security-type-c.git
cd jericho-security-type-c
chmod +x scripts/*.sh
./scripts/dev-setup.sh
```

2️⃣ Start Development:
```bash
npm run dev
# OR with PM2
pm2 start ecosystem.config.js --env development
```

3️⃣ Production Deployment (Ubuntu):
```bash
sudo ./scripts/install-ubuntu.sh
sudo ./scripts/deploy.sh v2.0.0
```

4️⃣ Docker Deployment:
```bash
docker-compose up -d
docker-compose logs -f
```

🔄 VERSION CONTROL COMMANDS

Create Version:
```bash
sudo ./scripts/version-control.sh create v2.0.1
```

Deploy Version:
```bash
sudo ./scripts/deploy.sh v2.0.1
```

Rollback:
```bash
sudo ./scripts/rollback.sh v2.0.0
```

List Versions:
```bash
sudo ./scripts/version-control.sh list
```

🚀 DEVELOPMENT COMMANDS

Frontend Only:
```bash
cd frontend && npm run dev
```

Backend Only:
```bash
cd backend && npm run dev
```

Both (Concurrent):
```bash
npm run dev
```

PM2 Management:
```bash
pm2 start ecosystem.config.js
pm2 stop all
pm2 restart all
pm2 logs
pm2 monit
```

Testing:
```bash
npm test
npm run lint
npm run lint:fix
```

🗄️ DATABASE COMMANDS

Reset Development DB:
```bash
npm run dev:db:reset
```

Production DB Migration:
```bash
cd backend && npm run db:migrate
```

Backup Database:
```bash
sudo ./scripts/backup.sh
```

🐳 DOCKER COMMANDS

Build:
```bash
docker-compose build
```

Start Services:
```bash
docker-compose up -d
```

View Logs:
```bash
docker-compose logs -f
docker-compose logs backend
docker-compose logs frontend
```

Stop Services:
```bash
docker-compose down
```

Clean Volumes:
```bash
docker-compose down -v
docker system prune -a
```

🔧 TROUBLESHOOTING COMMANDS

Check Service Status:
```bash
sudo systemctl status jericho-security
sudo systemctl status postgresql
sudo systemctl status redis
```

View Logs:
```bash
sudo journalctl -u jericho-security -f
sudo tail -f /var/log/jericho/application.log
sudo -u www-data pm2 logs
```

Restart Services:
```bash
sudo systemctl restart jericho-security
sudo systemctl restart nginx
```

Test Connectivity:
```bash
curl http://localhost/health
curl http://localhost/api/health
```

📁 PROJECT STRUCTURE
```
jericho-security-type-c/
├── frontend/           # React + TypeScript + shadcn/ui
├── backend/           # Node.js + Express + PostgreSQL  
├── scripts/          # Deployment & version control
├── docker/           # Docker configuration
├── docs/             # Documentation
└── releases/         # Version management
```

🌐 ACCESS URLS

Development:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000
- WebSocket: ws://localhost:5000

Production:
- Web Interface: http://your-server-ip/
- API: http://your-server-ip/api/

🎯 THEME PRESERVATION

This project preserves the EXACT theme from jericho-security-ad958edc:
✅ Dark theme with blue/green accents (#2D5A5C, #D18B47)
✅ shadcn/ui component library
✅ Tailwind CSS styling  
✅ React component structure
✅ Responsive design patterns

🔑 KEY FILES TO MAINTAIN

Theme Files (DO NOT MODIFY):
- frontend/src/index.css
- frontend/tailwind.config.ts
- frontend/components.json
- frontend/src/lib/utils.ts

Core Components (PRESERVE EXACTLY):
- frontend/src/components/ui/*
- frontend/src/pages/Index.tsx
- frontend/src/pages/Settings.tsx
- frontend/src/pages/MultiView.tsx

⚡ QUICK FIXES

Reset Everything:
```bash
npm run clean
./scripts/dev-setup.sh
```

Fix Permissions:
```bash
chmod +x scripts/*.sh
sudo chown -R www-data:www-data /opt/jericho-security
```

Restart All:
```bash
sudo systemctl restart jericho-security nginx postgresql redis
```

💡 NEXT STEPS

1. Run development setup
2. Start coding with preserved GitHub theme
3. Test with version control system
4. Deploy to production when ready

🆘 NEED HELP?

Check documentation:
- docs/DEVELOPMENT.md
- docs/INSTALLATION.md
- docs/TROUBLESHOOTING.md

EOF
