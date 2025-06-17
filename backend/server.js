#!/usr/bin/env node
/**
 * JERICHO Security Type C - Production Backend Server
 * Enhanced RTSP surveillance system with Hikvision API integration
 * 
 * Features:
 * - Hikvision ISAPI integration with AK/SK authentication
 * - 12 concurrent RTSP streams with auto-reconnection
 * - Motion detection and alerts
 * - WebSocket real-time communication
 * - PostgreSQL + Redis data layer
 * - JWT authentication
 * - Production logging and monitoring
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import Redis from 'redis';
import winston from 'winston';
import 'winston-daily-rotate-file';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Import custom modules
import { HikvisionAPI } from './src/services/hikvision-api.js';
import { RTSPStreamManager } from './src/services/rtsp-stream-manager.js';
import { MotionDetector } from './src/services/motion-detector.js';
import { DatabaseManager } from './src/services/database-manager.js';
import { CacheManager } from './src/services/cache-manager.js';
import { AuthMiddleware } from './src/middleware/auth.js';
import { ValidationMiddleware } from './src/middleware/validation.js';
import { ErrorHandler } from './src/middleware/error-handler.js';

// Routes
import authRoutes from './src/routes/auth.js';
import cameraRoutes from './src/routes/cameras.js';
import streamRoutes from './src/routes/streams.js';
import eventsRoutes from './src/routes/events.js';
import settingsRoutes from './src/routes/settings.js';
import healthRoutes from './src/routes/health.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

// Configuration
const config = {
  port: process.env.PORT || 5000,
  env: process.env.NODE_ENV || 'development',
  
  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'jericho_security',
    user: process.env.DB_USER || 'jericho',
    password: process.env.DB_PASSWORD || 'jericho_secure_2024',
    ssl: process.env.DB_SSL === 'true',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
  
  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB) || 0,
  },
  
  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'jericho_jwt_secret_change_in_production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'jericho_refresh_secret_change_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  
  // Hikvision API Credentials
  hikvision: {
    accessKey: process.env.HIKVISION_ACCESS_KEY,
    secretKey: process.env.HIKVISION_SECRET_KEY,
    apiUrl: process.env.HIKVISION_API_URL || 'https://openapi.hikvision.com',
    timeout: parseInt(process.env.HIKVISION_TIMEOUT) || 30000,
  },
  
  // Streaming
  streaming: {
    hlsPath: process.env.HLS_PATH || path.join(__dirname, 'hls'),
    snapshotsPath: process.env.SNAPSHOTS_PATH || path.join(__dirname, 'snapshots'),
    maxStreams: parseInt(process.env.MAX_STREAMS) || 12,
    streamQuality: process.env.STREAM_QUALITY || 'medium',
  },
  
  // Security
  security: {
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || path.join(__dirname, 'logs'),
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
  },
};

// Create logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'jericho-security-backend' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.DailyRotateFile({
      filename: path.join(config.logging.dir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: config.logging.maxFiles,
      maxSize: config.logging.maxSize,
    }),
    new winston.transports.DailyRotateFile({
      filename: path.join(config.logging.dir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: config.logging.maxFiles,
      maxSize: config.logging.maxSize,
    }),
  ],
});

// Express app setup
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.security.rateLimitWindow,
  max: config.security.rateLimitMax,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// General middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim()),
  },
}));

// Global services
let dbManager, cacheManager, hikvisionAPI, streamManager, motionDetector;

// Initialize services
async function initializeServices() {
  try {
    logger.info('🚀 Initializing JERICHO Security Backend services...');
    
    // Ensure directories exist
    [config.streaming.hlsPath, config.streaming.snapshotsPath, config.logging.dir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`📁 Created directory: ${dir}`);
      }
    });
    
    // Initialize Database
    logger.info('🗄️  Connecting to PostgreSQL database...');
    dbManager = new DatabaseManager(config.database, logger);
    await dbManager.connect();
    await dbManager.runMigrations();
    
    // Initialize Cache
    logger.info('🔄 Connecting to Redis cache...');
    cacheManager = new CacheManager(config.redis, logger);
    await cacheManager.connect();
    
    // Initialize Hikvision API
    if (config.hikvision.accessKey && config.hikvision.secretKey) {
      logger.info('🎥 Initializing Hikvision API integration...');
      hikvisionAPI = new HikvisionAPI(config.hikvision, logger);
      await hikvisionAPI.initialize();
    } else {
      logger.warn('⚠️  Hikvision API credentials not configured. Camera discovery will be limited.');
    }
    
    // Initialize Stream Manager
    logger.info('📺 Starting RTSP stream manager...');
    streamManager = new RTSPStreamManager(config.streaming, logger, hikvisionAPI);
    await streamManager.initialize();
    
    // Initialize Motion Detector
    logger.info('🔍 Starting motion detection service...');
    motionDetector = new MotionDetector(logger, hikvisionAPI);
    await motionDetector.initialize();
    
    // Make services available globally
    app.locals.services = {
      db: dbManager,
      cache: cacheManager,
      hikvision: hikvisionAPI,
      streams: streamManager,
      motion: motionDetector,
      logger,
    };
    
    logger.info('✅ All services initialized successfully');
    
  } catch (error) {
    logger.error('❌ Failed to initialize services:', error);
    process.exit(1);
  }
}

// WebSocket handling
wss.on('connection', (ws, request) => {
  logger.info('🔌 New WebSocket connection established');
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'subscribe_stream':
          // Subscribe to stream updates
          if (streamManager) {
            streamManager.addWebSocketClient(ws, data.streamId);
          }
          break;
          
        case 'subscribe_events':
          // Subscribe to motion/alert events
          if (motionDetector) {
            motionDetector.addWebSocketClient(ws);
          }
          break;
          
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
          
        default:
          logger.warn('🤷 Unknown WebSocket message type:', data.type);
      }
    } catch (error) {
      logger.error('💥 WebSocket message error:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });
  
  ws.on('close', () => {
    logger.info('🔌 WebSocket connection closed');
    if (streamManager) streamManager.removeWebSocketClient(ws);
    if (motionDetector) motionDetector.removeWebSocketClient(ws);
  });
  
  ws.on('error', (error) => {
    logger.error('💥 WebSocket error:', error);
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/cameras', AuthMiddleware.authenticate, cameraRoutes);
app.use('/api/streams', AuthMiddleware.authenticate, streamRoutes);
app.use('/api/events', AuthMiddleware.authenticate, eventsRoutes);
app.use('/api/settings', AuthMiddleware.authenticate, settingsRoutes);
app.use('/api/health', healthRoutes);

// Serve static files (HLS streams and snapshots)
app.use('/hls', express.static(config.streaming.hlsPath));
app.use('/snapshots', express.static(config.streaming.snapshotsPath));

// Default route for health check
app.get('/', (req, res) => {
  res.json({
    name: 'JERICHO Security Type C Backend',
    version: '2.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    environment: config.env,
    features: {
      hikvisionAPI: !!config.hikvision.accessKey,
      streaming: true,
      motionDetection: true,
      websockets: true,
      database: true,
      cache: true,
    },
  });
});

// Error handling middleware
app.use(ErrorHandler.notFound);
app.use(ErrorHandler.errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('🛑 SIGTERM received, shutting down gracefully...');
  await shutdown();
});

process.on('SIGINT', async () => {
  logger.info('🛑 SIGINT received, shutting down gracefully...');
  await shutdown();
});

async function shutdown() {
  try {
    // Close WebSocket server
    wss.close();
    
    // Stop services
    if (streamManager) await streamManager.stop();
    if (motionDetector) await motionDetector.stop();
    if (cacheManager) await cacheManager.disconnect();
    if (dbManager) await dbManager.disconnect();
    
    // Close HTTP server
    server.close(() => {
      logger.info('✅ Server shut down gracefully');
      process.exit(0);
    });
    
    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('⏰ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    logger.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Start server
async function startServer() {
  try {
    // Initialize all services first
    await initializeServices();
    
    // Start HTTP server
    server.listen(config.port, () => {
      logger.info(`🌟 JERICHO Security Type C Backend running on port ${config.port}`);
      logger.info(`🌐 Environment: ${config.env}`);
      logger.info(`🎥 Hikvision API: ${config.hikvision.accessKey ? 'Enabled' : 'Disabled'}`);
      logger.info(`📺 Max Streams: ${config.streaming.maxStreams}`);
      logger.info(`🔒 Security: Rate limiting, CORS, Helmet enabled`);
      logger.info('✅ Server ready to accept connections');
    });
    
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
startServer();

export default app;