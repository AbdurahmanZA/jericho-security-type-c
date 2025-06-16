#!/bin/bash
# JERICHO Security Type C - Development Setup Script
# Quick setup for development environment

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Functions
info() {
    echo -e "${BLUE}INFO: $1${NC}"
}

success() {
    echo -e "${GREEN}SUCCESS: $1${NC}"
}

warning() {
    echo -e "${YELLOW}WARNING: $1${NC}"
}

error_exit() {
    echo -e "${RED}ERROR: $1${NC}" >&2
    exit 1
}

# Check if we're in the project root
check_project_root() {
    if [ ! -f "package.json" ] || [ ! -d "frontend" ] || [ ! -d "backend" ]; then
        error_exit "This script must be run from the project root directory"
    fi
}

# Check Node.js version
check_nodejs() {
    if ! command -v node &> /dev/null; then
        error_exit "Node.js is not installed. Please install Node.js 20+ first."
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        error_exit "Node.js version 18+ required. Current: $(node --version)"
    fi
    
    info "Node.js version: $(node --version)"
}

# Check npm
check_npm() {
    if ! command -v npm &> /dev/null; then
        error_exit "npm is not installed"
    fi
    
    info "npm version: $(npm --version)"
}

# Install global dependencies
install_global_dependencies() {
    info "Installing global dependencies..."
    
    # Check if PM2 is installed globally
    if ! command -v pm2 &> /dev/null; then
        info "Installing PM2..."
        npm install -g pm2
    fi
    
    # Check if concurrently is available
    if ! npm list -g concurrently &> /dev/null; then
        info "Installing concurrently..."
        npm install -g concurrently
    fi
    
    success "Global dependencies installed"
}

# Setup project directories
setup_directories() {
    info "Setting up project directories..."
    
    # Create necessary directories
    mkdir -p logs
    mkdir -p releases
    mkdir -p backups
    mkdir -p backend/hls
    mkdir -p backend/snapshots
    mkdir -p backend/uploads
    mkdir -p frontend/dist
    
    success "Directories created"
}

# Install root dependencies
install_root_dependencies() {
    info "Installing root project dependencies..."
    
    npm install
    
    success "Root dependencies installed"
}

# Install frontend dependencies
install_frontend_dependencies() {
    info "Installing frontend dependencies..."
    
    cd frontend
    
    # Install dependencies
    npm install
    
    # Create .env file if it doesn't exist
    if [ ! -f ".env" ]; then
        cat > .env << EOF
VITE_API_URL=http://localhost:5000
VITE_WS_URL=ws://localhost:5000
VITE_HLS_URL=http://localhost:5000/hls
VITE_SNAPSHOTS_URL=http://localhost:5000/snapshots
EOF
        info "Frontend .env file created"
    fi
    
    cd ..
    
    success "Frontend dependencies installed"
}

# Install backend dependencies
install_backend_dependencies() {
    info "Installing backend dependencies..."
    
    cd backend
    
    # Install dependencies
    npm install
    
    # Install additional development dependencies
    npm install --save-dev nodemon
    
    # Create .env file if it doesn't exist
    if [ ! -f ".env" ]; then
        cat > .env << EOF
NODE_ENV=development
PORT=5000

# Database (for development - use SQLite)
DB_TYPE=sqlite
DB_PATH=./database.sqlite

# Redis (optional for development)
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT Secrets
JWT_SECRET=development_jwt_secret_$(openssl rand -hex 16)
JWT_REFRESH_SECRET=development_refresh_secret_$(openssl rand -hex 16)

# File paths
HLS_PATH=./hls
SNAPSHOTS_PATH=./snapshots
UPLOADS_PATH=./uploads

# Logging
LOG_LEVEL=debug
LOG_FILE=../logs/development.log

# RTSP Settings (for testing)
RTSP_TIMEOUT=30000
HLS_SEGMENT_DURATION=6
HLS_PLAYLIST_SIZE=10

# Motion Detection
MOTION_DETECTION_ENABLED=true
MOTION_THRESHOLD=0.1
MOTION_MIN_AREA=1000
EOF
        info "Backend .env file created"
    fi
    
    cd ..
    
    success "Backend dependencies installed"
}

# Create development database
setup_development_database() {
    info "Setting up development database..."
    
    cd backend
    
    # Create SQLite database if migrations exist
    if [ -d "migrations" ]; then
        # Simple SQLite setup for development
        cat > init-db.js << 'EOF'
const fs = require('fs');
const path = require('path');

// Check if sqlite3 is available
try {
    const sqlite3 = require('sqlite3').verbose();
    
    const dbPath = './database.sqlite';
    const migrationsDir = './migrations';
    
    // Remove existing database
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log('Existing database removed');
    }
    
    // Create new database
    const db = new sqlite3.Database(dbPath);
    console.log('New SQLite database created');
    
    // Run migrations
    if (fs.existsSync(migrationsDir)) {
        const migrations = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();
        
        migrations.forEach(migration => {
            const sql = fs.readFileSync(path.join(migrationsDir, migration), 'utf8');
            // Convert PostgreSQL syntax to SQLite if needed
            const sqliteSql = sql
                .replace(/SERIAL PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT')
                .replace(/TIMESTAMPTZ/g, 'DATETIME')
                .replace(/JSONB/g, 'TEXT')
                .replace(/TEXT\[\]/g, 'TEXT');
            
            db.exec(sqliteSql, (err) => {
                if (err) {
                    console.error(`Error running migration ${migration}:`, err);
                } else {
                    console.log(`Migration ${migration} completed`);
                }
            });
        });
    }
    
    db.close();
    console.log('Development database initialized successfully');
    
} catch (error) {
    console.log('SQLite not available, skipping database setup');
    console.log('Install sqlite3 for database functionality: npm install sqlite3');
}
EOF
        
        # Run database initialization
        node init-db.js
        rm init-db.js
    fi
    
    cd ..
    
    success "Development database setup completed"
}

# Create development scripts
create_development_scripts() {
    info "Creating development scripts..."
    
    # Update package.json scripts if needed
    if [ -f "package.json" ]; then
        # Backup original
        cp package.json package.json.backup
        
        # Add development scripts using node
        node << 'EOF'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Add development-specific scripts
pkg.scripts = {
    ...pkg.scripts,
    "dev:setup": "scripts/dev-setup.sh",
    "dev:reset": "npm run clean && npm run dev:setup",
    "clean": "rm -rf node_modules frontend/node_modules backend/node_modules frontend/dist backend/dist logs/*.log",
    "dev:frontend:only": "cd frontend && npm run dev",
    "dev:backend:only": "cd backend && npm run dev",
    "dev:logs": "tail -f logs/development.log",
    "dev:db:reset": "cd backend && rm -f database.sqlite && node init-db.js",
    "test:dev": "npm run test:frontend && npm run test:backend",
    "lint:fix": "npm run lint:frontend:fix && npm run lint:backend:fix",
    "lint:frontend:fix": "cd frontend && npm run lint -- --fix",
    "lint:backend:fix": "cd backend && npm run lint -- --fix"
};

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log('Development scripts added to package.json');
EOF
    fi
    
    success "Development scripts created"
}

# Create PM2 ecosystem for development
create_pm2_ecosystem() {
    info "Creating PM2 ecosystem configuration..."
    
    cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'jericho-backend-dev',
      script: './backend/server.js',
      cwd: process.cwd(),
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      instances: 1,
      exec_mode: 'fork',
      watch: ['backend/src', 'backend/server.js'],
      ignore_watch: ['backend/node_modules', 'backend/hls', 'backend/snapshots', 'logs'],
      watch_options: {
        followSymlinks: false
      },
      max_memory_restart: '500M',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2.log',
      time: true,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
      env_development: {
        NODE_ENV: 'development',
        PORT: 5000,
        LOG_LEVEL: 'debug'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
        LOG_LEVEL: 'info'
      }
    }
  ]
};
EOF
    
    success "PM2 ecosystem configuration created"
}

# Setup Git hooks (if Git repo exists)
setup_git_hooks() {
    if [ -d ".git" ]; then
        info "Setting up Git hooks..."
        
        # Pre-commit hook
        cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# JERICHO Pre-commit hook

echo "Running pre-commit checks..."

# Check if frontend linting passes
if [ -d "frontend" ]; then
    echo "Checking frontend..."
    cd frontend && npm run lint
    if [ $? -ne 0 ]; then
        echo "Frontend linting failed. Please fix errors before committing."
        exit 1
    fi
    cd ..
fi

# Check if backend linting passes
if [ -d "backend" ]; then
    echo "Checking backend..."
    cd backend && npm run lint
    if [ $? -ne 0 ]; then
        echo "Backend linting failed. Please fix errors before committing."
        exit 1
    fi
    cd ..
fi

echo "Pre-commit checks passed!"
EOF
        
        chmod +x .git/hooks/pre-commit
        success "Git hooks configured"
    fi
}

# Create development documentation
create_dev_docs() {
    info "Creating development documentation..."
    
    mkdir -p docs
    
    cat > docs/DEVELOPMENT.md << 'EOF'
# JERICHO Security Type C - Development Guide

## Quick Start

```bash
# Clone and setup
git clone https://github.com/AbdurahmanZA/jericho-security-type-c.git
cd jericho-security-type-c
chmod +x scripts/dev-setup.sh
./scripts/dev-setup.sh

# Start development
npm run dev
```

## Development Commands

### Setup and Installation
```bash
npm run dev:setup          # Run development setup
npm run dev:reset          # Clean and reset development environment
npm run clean              # Clean all node_modules and build files
```

### Running the Application
```bash
npm run dev                # Start both frontend and backend
npm run dev:frontend:only  # Start only frontend (port 3000)
npm run dev:backend:only   # Start only backend (port 5000)
```

### Process Management (PM2)
```bash
pm2 start ecosystem.config.js --env development  # Start with PM2
pm2 stop all               # Stop all processes
pm2 restart all            # Restart all processes
pm2 logs                   # View logs
pm2 monit                  # Monitor processes
```

### Testing and Quality
```bash
npm test                   # Run all tests
npm run test:dev           # Run development tests
npm run lint               # Lint all code
npm run lint:fix           # Fix linting issues automatically
```

### Database
```bash
npm run dev:db:reset       # Reset development database
```

### Logging
```bash
npm run dev:logs           # Tail development logs
tail -f logs/development.log  # Direct log monitoring
```

## Project Structure

```
jericho-security-type-c/
├── frontend/              # React + TypeScript frontend
│   ├── src/
│   │   ├── components/   # UI components (preserve from GitHub)
│   │   ├── pages/        # Page components
│   │   ├── lib/          # Utilities
│   │   └── hooks/        # Custom hooks
│   ├── .env              # Frontend environment variables
│   └── package.json      # Frontend dependencies
│
├── backend/               # Node.js + Express backend
│   ├── src/
│   │   ├── controllers/  # API controllers
│   │   ├── services/     # Business logic (RTSP engine)
│   │   ├── models/       # Database models
│   │   ├── routes/       # API routes
│   │   └── utils/        # Utilities
│   ├── migrations/       # Database migrations
│   ├── .env              # Backend environment variables
│   └── package.json      # Backend dependencies
│
├── scripts/              # Deployment and management scripts
├── docs/                 # Documentation
├── logs/                 # Development logs
└── ecosystem.config.js   # PM2 configuration
```

## Environment Variables

### Frontend (.env)
```
VITE_API_URL=http://localhost:5000
VITE_WS_URL=ws://localhost:5000
VITE_HLS_URL=http://localhost:5000/hls
VITE_SNAPSHOTS_URL=http://localhost:5000/snapshots
```

### Backend (.env)
```
NODE_ENV=development
PORT=5000
DB_TYPE=sqlite
DB_PATH=./database.sqlite
JWT_SECRET=your_jwt_secret
LOG_LEVEL=debug
```

## Development Workflow

1. **Setup Development Environment**
   ```bash
   ./scripts/dev-setup.sh
   ```

2. **Start Development Servers**
   ```bash
   npm run dev
   ```

3. **Access Applications**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000
   - WebSocket: ws://localhost:5000

4. **Make Changes**
   - Frontend: Hot reload enabled
   - Backend: Nodemon/PM2 watch enabled

5. **Test Changes**
   ```bash
   npm test
   npm run lint
   ```

6. **Commit Changes**
   - Pre-commit hooks will run automatically
   - Linting and basic tests will be executed

## Debugging

### Frontend
- React Developer Tools
- Browser console
- Vite dev server logs

### Backend
- Node.js debugger
- PM2 logs: `pm2 logs`
- Log files: `logs/development.log`

### Database
- SQLite Browser for development database
- SQL queries can be run directly on `backend/database.sqlite`

## Integration with GitHub Theme

The development setup preserves the exact theme and components from the GitHub repository:

- **Dark theme with blue/green accents**
- **shadcn/ui components** (buttons, cards, dialogs)
- **Tailwind CSS styling**
- **React component structure**

## Adding New Features

1. **Frontend Components**
   - Add to `frontend/src/components/`
   - Follow existing shadcn/ui patterns
   - Maintain Jericho brand colors

2. **Backend Services**
   - Add to `backend/src/services/`
   - Follow existing RTSP engine patterns
   - Include proper error handling

3. **API Endpoints**
   - Add to `backend/src/routes/`
   - Include input validation
   - Add to API documentation

## Troubleshooting

### Common Issues

1. **Port Conflicts**
   - Frontend: Change port in `vite.config.ts`
   - Backend: Change PORT in `.env`

2. **Database Issues**
   - Reset: `npm run dev:db:reset`
   - Check: `ls -la backend/database.sqlite`

3. **Dependency Issues**
   - Clean: `npm run clean`
   - Reinstall: `npm run dev:setup`

4. **Permission Issues**
   - Make scripts executable: `chmod +x scripts/*.sh`

### Getting Help

1. Check logs: `npm run dev:logs`
2. Check PM2 status: `pm2 status`
3. Verify environment: `node --version`, `npm --version`
4. Reset environment: `npm run dev:reset`

## Production Deployment

For production deployment, use:
```bash
sudo ./scripts/install-ubuntu.sh  # Full production setup
sudo ./scripts/deploy.sh          # Deploy specific version
sudo ./scripts/rollback.sh        # Rollback if needed
```
EOF
    
    success "Development documentation created"
}

# Print development setup summary
print_dev_summary() {
    echo
    echo "========================================"
    echo "   JERICHO Development Setup Complete   "
    echo "========================================"
    echo
    echo "🚀 Development environment is ready!"
    echo
    echo "📁 Project Structure:"
    echo "   Frontend: React + TypeScript + Vite (port 3000)"
    echo "   Backend:  Node.js + Express (port 5000)"
    echo "   Database: SQLite (development)"
    echo
    echo "⚡ Quick Start Commands:"
    echo "   npm run dev                 # Start both frontend and backend"
    echo "   npm run dev:frontend:only   # Frontend only"
    echo "   npm run dev:backend:only    # Backend only"
    echo
    echo "📋 PM2 Process Management:"
    echo "   pm2 start ecosystem.config.js --env development"
    echo "   pm2 stop all"
    echo "   pm2 logs"
    echo "   pm2 monit"
    echo
    echo "🔧 Development Tools:"
    echo "   npm test                    # Run tests"
    echo "   npm run lint                # Check code quality"
    echo "   npm run lint:fix            # Fix linting issues"
    echo "   npm run dev:logs            # View development logs"
    echo
    echo "📖 Documentation:"
    echo "   docs/DEVELOPMENT.md         # Detailed development guide"
    echo
    echo "🌐 Access URLs (after starting dev servers):"
    echo "   Frontend:  http://localhost:3000"
    echo "   Backend:   http://localhost:5000"
    echo "   API Docs:  http://localhost:5000/api-docs"
    echo
    echo "💡 Next Steps:"
    echo "   1. Run 'npm run dev' to start development servers"
    echo "   2. Open http://localhost:3000 in your browser"
    echo "   3. Check docs/DEVELOPMENT.md for detailed workflow"
    echo "   4. Start coding! 🎯"
    echo
    echo "🔄 To reset development environment:"
    echo "   npm run dev:reset"
    echo
}

# Main development setup function
main() {
    echo "JERICHO Security Type C - Development Setup"
    echo "==========================================="
    echo
    
    info "Setting up development environment..."
    
    check_project_root
    check_nodejs
    check_npm
    install_global_dependencies
    setup_directories
    install_root_dependencies
    install_frontend_dependencies
    install_backend_dependencies
    setup_development_database
    create_development_scripts
    create_pm2_ecosystem
    setup_git_hooks
    create_dev_docs
    
    print_dev_summary
    
    success "Development setup completed successfully!"
}

# Execute main function
main "$@"
