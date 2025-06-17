#!/usr/bin/env node

/**
 * JERICHO Security Type C - Main Backend Server
 * Enhanced surveillance system with Settings API integration
 * 
 * Features:
 * - Express server with comprehensive middleware
 * - PostgreSQL + Redis connectivity
 * - WebSocket for real-time updates
 * - Settings API endpoints for frontend
 * - Production-ready logging and error handling
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import pkg from 'pg';
import redis from 'redis';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Configuration
const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'jericho_security',
    user: process.env.DB_USER || 'jericho',
    password: process.env.DB_PASSWORD || 'jericho_secure_2024'
  },
  
  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  },
  
  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'jericho_jwt_secret_key_2024_ultra_secure',
    expire: process.env.JWT_EXPIRE || '24h'
  }
};

// Logger setup
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'jericho-backend' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new DailyRotateFile({
      filename: 'logs/jericho-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '5d'
    })
  ]
});

// Database connection
const { Pool } = pkg;
let dbPool;
let redisClient;

// Initialize database connection
async function initializeDatabase() {
  try {
    dbPool = new Pool(config.database);
    
    // Test connection
    const client = await dbPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    logger.info('PostgreSQL connected successfully');
    
    // Create tables if they don't exist
    await createTables();
    
  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
}

// Initialize Redis connection
async function initializeRedis() {
  try {
    redisClient = redis.createClient(config.redis);
    
    redisClient.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });
    
    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });
    
    await redisClient.connect();
    
  } catch (error) {
    logger.error('Redis connection failed:', error);
    process.exit(1);
  }
}

// Create database tables
async function createTables() {
  const queries = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(255) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'operator',
      is_active BOOLEAN DEFAULT true,
      last_login TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    
    // Cameras table
    `CREATE TABLE IF NOT EXISTS cameras (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      rtsp_url TEXT NOT NULL,
      hikvision_ip VARCHAR(45),
      hikvision_port INTEGER DEFAULT 80,
      hikvision_username VARCHAR(255),
      hikvision_password VARCHAR(255),
      location JSONB DEFAULT '{}',
      settings JSONB DEFAULT '{}',
      motion_detection JSONB DEFAULT '{}',
      status VARCHAR(50) DEFAULT 'offline',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    
    // System settings table
    `CREATE TABLE IF NOT EXISTS system_settings (
      id SERIAL PRIMARY KEY,
      category VARCHAR(100) NOT NULL,
      key VARCHAR(255) NOT NULL,
      value JSONB,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(category, key)
    )`,
    
    // Motion events table
    `CREATE TABLE IF NOT EXISTS motion_events (
      id SERIAL PRIMARY KEY,
      camera_id INTEGER REFERENCES cameras(id),
      event_type VARCHAR(50) NOT NULL,
      confidence REAL,
      bounding_boxes JSONB,
      snapshot_url TEXT,
      video_clip_url TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    
    // Audit log table
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      action VARCHAR(255) NOT NULL,
      entity_type VARCHAR(100),
      entity_id VARCHAR(100),
      details JSONB,
      ip_address INET,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
  ];

  for (const query of queries) {
    try {
      await dbPool.query(query);
    } catch (error) {
      logger.error('Error creating table:', error);
    }
  }
  
  // Insert default admin user if not exists
  try {
    const result = await dbPool.query('SELECT id FROM users WHERE username = $1', ['admin']);
    if (result.rows.length === 0) {
      // Note: In production, hash this password properly
      await dbPool.query(
        'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        ['admin', 'admin@jericho-security.local', '$2a$12$hashed_password_here', 'admin']
      );
      logger.info('Default admin user created');
    }
  } catch (error) {
    logger.error('Error creating default user:', error);
  }
}

// Express app setup
const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000 || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

// General middleware
app.use(compression());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) }
}));

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Check database
    const dbCheck = await dbPool.query('SELECT 1');
    
    // Check Redis
    const redisCheck = await redisClient.ping();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbCheck.rows.length > 0 ? 'healthy' : 'unhealthy',
        redis: redisCheck === 'PONG' ? 'healthy' : 'unhealthy'
      },
      version: '2.0.0'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API Routes - Settings endpoints for frontend integration
app.use('/api', (req, res, next) => {
  req.db = dbPool;
  req.redis = redisClient;
  req.logger = logger;
  next();
});

// Hikvision Settings API
app.get('/api/hikvision/devices', async (req, res) => {
  try {
    const result = await dbPool.query(`
      SELECT id, name, hikvision_ip, hikvision_port, hikvision_username, 
             status, location, created_at, updated_at 
      FROM cameras 
      WHERE hikvision_ip IS NOT NULL 
      ORDER BY name
    `);
    
    res.json({
      success: true,
      devices: result.rows
    });
  } catch (error) {
    logger.error('Error fetching Hikvision devices:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch devices' });
  }
});

app.post('/api/hikvision/test-connection', async (req, res) => {
  try {
    const { ip, port = 80, username, password } = req.body;
    
    // TODO: Implement actual Hikvision ISAPI connection test
    // For now, simulate the test
    const isReachable = true; // await testHikvisionConnection(ip, port, username, password);
    
    res.json({
      success: true,
      connected: isReachable,
      message: isReachable ? 'Connection successful' : 'Connection failed'
    });
  } catch (error) {
    logger.error('Error testing Hikvision connection:', error);
    res.status(500).json({ success: false, error: 'Connection test failed' });
  }
});

// Motion Detection Settings API
app.get('/api/motion/settings', async (req, res) => {
  try {
    const result = await dbPool.query(`
      SELECT id, name, motion_detection, status 
      FROM cameras 
      WHERE is_active = true 
      ORDER BY name
    `);
    
    res.json({
      success: true,
      cameras: result.rows.map(camera => ({
        ...camera,
        motion_detection: camera.motion_detection || {
          enabled: false,
          sensitivity: 50,
          zones: []
        }
      }))
    });
  } catch (error) {
    logger.error('Error fetching motion settings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch motion settings' });
  }
});

app.put('/api/motion/settings/:cameraId', async (req, res) => {
  try {
    const { cameraId } = req.params;
    const { motion_detection } = req.body;
    
    await dbPool.query(
      'UPDATE cameras SET motion_detection = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(motion_detection), cameraId]
    );
    
    res.json({
      success: true,
      message: 'Motion detection settings updated'
    });
  } catch (error) {
    logger.error('Error updating motion settings:', error);
    res.status(500).json({ success: false, error: 'Failed to update motion settings' });
  }
});

// User Management API
app.get('/api/users', async (req, res) => {
  try {
    const result = await dbPool.query(`
      SELECT id, username, email, role, is_active, last_login, created_at 
      FROM users 
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      users: result.rows
    });
  } catch (error) {
    logger.error('Error fetching users:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch users' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { username, email, password, role = 'operator' } = req.body;
    
    // TODO: Hash password properly with bcrypt
    const hashedPassword = '$2a$12$temp_hashed_password'; // await bcrypt.hash(password, 12);
    
    const result = await dbPool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
      [username, email, hashedPassword, role]
    );
    
    res.json({
      success: true,
      user: result.rows[0],
      message: 'User created successfully'
    });
  } catch (error) {
    logger.error('Error creating user:', error);
    res.status(500).json({ success: false, error: 'Failed to create user' });
  }
});

// System Settings API
app.get('/api/system/settings', async (req, res) => {
  try {
    const result = await dbPool.query(`
      SELECT category, key, value, description 
      FROM system_settings 
      ORDER BY category, key
    `);
    
    // Group settings by category
    const settings = result.rows.reduce((acc, row) => {
      if (!acc[row.category]) {
        acc[row.category] = {};
      }
      acc[row.category][row.key] = {
        value: row.value,
        description: row.description
      };
      return acc;
    }, {});
    
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    logger.error('Error fetching system settings:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch system settings' });
  }
});

app.put('/api/system/settings', async (req, res) => {
  try {
    const { category, key, value, description } = req.body;
    
    await dbPool.query(`
      INSERT INTO system_settings (category, key, value, description) 
      VALUES ($1, $2, $3, $4) 
      ON CONFLICT (category, key) 
      DO UPDATE SET value = $3, description = $4, updated_at = NOW()
    `, [category, key, JSON.stringify(value), description]);
    
    res.json({
      success: true,
      message: 'System setting updated'
    });
  } catch (error) {
    logger.error('Error updating system setting:', error);
    res.status(500).json({ success: false, error: 'Failed to update system setting' });
  }
});

// Serve frontend static files in production
if (config.nodeEnv === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: config.nodeEnv === 'production' ? 'Internal server error' : err.message,
    ...(config.nodeEnv !== 'production' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found'
  });
});

// Create HTTP server
const server = createServer(app);

// WebSocket server for real-time updates
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  logger.info(`WebSocket client connected from ${req.socket.remoteAddress}`);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to JERICHO Security Type C',
    timestamp: new Date().toISOString()
  }));
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      logger.info('WebSocket message received:', data);
      
      // Echo back for now - implement actual message handling
      ws.send(JSON.stringify({
        type: 'response',
        data: data,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      logger.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  if (dbPool) {
    await dbPool.end();
    logger.info('Database pool closed');
  }
  
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
  
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    // Initialize connections
    await initializeDatabase();
    await initializeRedis();
    
    // Start HTTP server
    server.listen(config.port, () => {
      logger.info(`🛡️ JERICHO Security Type C Backend started`);
      logger.info(`🚀 Server running on port ${config.port}`);
      logger.info(`🌍 Environment: ${config.nodeEnv}`);
      logger.info(`📊 Health check: http://localhost:${config.port}/health`);
      logger.info(`🔌 WebSocket server ready`);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();