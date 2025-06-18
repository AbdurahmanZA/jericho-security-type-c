/**
 * JERICHO Security Type C - PM2 Ecosystem Configuration
 * ES Module compatible configuration for Node.js 20+
 * Process management for development and production environments
 */

export default {
  apps: [
    {
      name: 'jericho-backend',
      script: 'backend/server.js',
      cwd: './',
      
      // Environment variables
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      env_staging: {
        NODE_ENV: 'staging',
        PORT: 5001
      },
      
      // Process management
      instances: 1,
      exec_mode: 'fork',
      
      // Monitoring and restarts
      watch: ['backend/server.js', 'backend/src'],
      ignore_watch: ['node_modules', 'logs', 'uploads', 'backend/public'],
      watch_delay: 1000,
      max_memory_restart: '1G',
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      autorestart: true,
      
      // Logging
      log_file: 'logs/combined.log',
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Advanced options
      kill_timeout: 5000,
      listen_timeout: 8000,
      
      // Environment-specific instances
      instance_var: 'INSTANCE_ID',
      
      // Health monitoring
      health_check: {
        url: 'http://localhost:5000/health',
        interval: 30000,
        timeout: 5000
      }
    },
    
    {
      name: 'jericho-frontend-dev',
      script: 'npm',
      args: 'run dev',
      cwd: './frontend',
      
      // Only for development
      env: {
        NODE_ENV: 'development',
        BROWSER: 'false'
      },
      
      // Development-specific settings
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      
      // Logging
      log_file: 'logs/frontend-dev.log',
      out_file: 'logs/frontend-out.log',
      error_file: 'logs/frontend-error.log',
      
      // Only start in development
      ignore_watch: ['**/*'],
      min_uptime: '5s'
    }
  ],

  // Deployment configuration
  deploy: {
    production: {
      user: 'jericho',
      host: ['production-server.example.com'],
      ref: 'origin/main',
      repo: 'https://github.com/AbdurahmanZA/jericho-security-type-c.git',
      path: '/opt/jericho-security',
      
      // Deployment commands
      'pre-deploy': 'git fetch --all',
      'post-deploy': 'npm install --production && pm2 reload ecosystem.config.js --env production',
      
      // Environment
      env: {
        NODE_ENV: 'production'
      }
    },
    
    staging: {
      user: 'jericho',
      host: ['staging-server.example.com'],
      ref: 'origin/staging',
      repo: 'https://github.com/AbdurahmanZA/jericho-security-type-c.git',
      path: '/opt/jericho-security-staging',
      
      // Deployment commands
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging',
      
      // Environment
      env: {
        NODE_ENV: 'staging'
      }
    }
  }
};
