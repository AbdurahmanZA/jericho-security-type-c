/**
 * Health Check Routes
 * Provides health status for the application and its services
 */

import express from 'express';
import { ErrorHandler } from '../middleware/error-handler.js';

const router = express.Router();

/**
 * GET /api/health
 * Basic health check endpoint
 */
router.get('/',
  ErrorHandler.asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { db, cache, hikvision, streams, motion, logger } = req.app.locals.services || {};
      
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'development',
        services: {},
      };
      
      let overallHealthy = true;
      
      // Check database health
      if (db) {
        try {
          health.services.database = await db.healthCheck();
          if (health.services.database.status !== 'healthy') {
            overallHealthy = false;
          }
        } catch (error) {
          health.services.database = {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString(),
          };
          overallHealthy = false;
        }
      } else {
        health.services.database = {
          status: 'unavailable',
          error: 'Database service not initialized',
          timestamp: new Date().toISOString(),
        };
        overallHealthy = false;
      }
      
      // Check cache health
      if (cache) {
        try {
          health.services.cache = await cache.healthCheck();
          if (health.services.cache.status !== 'healthy') {
            overallHealthy = false;
          }
        } catch (error) {
          health.services.cache = {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString(),
          };
          overallHealthy = false;
        }
      } else {
        health.services.cache = {
          status: 'unavailable',
          error: 'Cache service not initialized',
          timestamp: new Date().toISOString(),
        };
        overallHealthy = false;
      }
      
      // Check Hikvision API health
      if (hikvision) {
        try {
          health.services.hikvision = await hikvision.healthCheck();
          if (health.services.hikvision.status !== 'healthy') {
            // Hikvision API being down doesn't make the whole system unhealthy
            logger?.warn('Hikvision API health check failed');
          }
        } catch (error) {
          health.services.hikvision = {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString(),
          };
        }
      } else {
        health.services.hikvision = {
          status: 'unavailable',
          error: 'Hikvision API not configured',
          timestamp: new Date().toISOString(),
        };
      }
      
      // Check streaming service health
      if (streams) {
        try {
          const streamStats = streams.getStreamStats();
          health.services.streaming = {
            status: 'healthy',
            activeStreams: streamStats.runningStreams,
            totalStreams: streamStats.totalStreams,
            maxStreams: streamStats.maxStreams,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          health.services.streaming = {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString(),
          };
        }
      } else {
        health.services.streaming = {
          status: 'unavailable',
          error: 'Streaming service not initialized',
          timestamp: new Date().toISOString(),
        };
        overallHealthy = false;
      }
      
      // Check motion detection service health
      if (motion) {
        try {
          const motionSettings = motion.getSettings();
          health.services.motionDetection = {
            status: 'healthy',
            activeDetectors: motionSettings.activeDetectors,
            eventBufferSize: motionSettings.eventBufferSize,
            timestamp: new Date().toISOString(),
          };
        } catch (error) {
          health.services.motionDetection = {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString(),
          };
        }
      } else {
        health.services.motionDetection = {
          status: 'unavailable',
          error: 'Motion detection service not initialized',
          timestamp: new Date().toISOString(),
        };
      }
      
      // Set overall status
      health.status = overallHealthy ? 'healthy' : 'degraded';
      health.responseTime = `${Date.now() - startTime}ms`;
      
      // Return appropriate status code
      const statusCode = overallHealthy ? 200 : 503;
      
      res.status(statusCode).json(health);
      
    } catch (error) {
      const health = {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime: `${Date.now() - startTime}ms`,
      };
      
      res.status(503).json(health);
    }
  })
);

/**
 * GET /api/health/detailed
 * Detailed health check with more information
 */
router.get('/detailed',
  ErrorHandler.asyncHandler(async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { db, cache, hikvision, streams, motion, logger } = req.app.locals.services || {};
      
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'development',
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          memoryUsage: process.memoryUsage(),
          cpuUsage: process.cpuUsage(),
        },
        services: {},
        statistics: {},
      };
      
      let overallHealthy = true;
      
      // Database health and statistics
      if (db) {
        try {
          health.services.database = await db.healthCheck();
          
          // Get database statistics
          const dbStats = await db.query(`
            SELECT 
              (SELECT COUNT(*) FROM cameras) as total_cameras,
              (SELECT COUNT(*) FROM cameras WHERE status = 'active') as active_cameras,
              (SELECT COUNT(*) FROM events WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours') as events_24h,
              (SELECT COUNT(*) FROM users WHERE active = true) as active_users,
              (SELECT COUNT(*) FROM streams WHERE status = 'active') as active_streams
          `);
          
          if (dbStats.rows.length > 0) {
            health.statistics.database = {
              totalCameras: parseInt(dbStats.rows[0].total_cameras),
              activeCameras: parseInt(dbStats.rows[0].active_cameras),
              events24h: parseInt(dbStats.rows[0].events_24h),
              activeUsers: parseInt(dbStats.rows[0].active_users),
              activeStreams: parseInt(dbStats.rows[0].active_streams),
            };
          }
          
          if (health.services.database.status !== 'healthy') {
            overallHealthy = false;
          }
        } catch (error) {
          health.services.database = {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString(),
          };
          overallHealthy = false;
        }
      }
      
      // Cache health and statistics
      if (cache) {
        try {
          health.services.cache = await cache.healthCheck();
          health.statistics.cache = await cache.getStats();
          
          if (health.services.cache.status !== 'healthy') {
            overallHealthy = false;
          }
        } catch (error) {
          health.services.cache = {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString(),
          };
          overallHealthy = false;
        }
      }
      
      // Hikvision API health
      if (hikvision) {
        try {
          health.services.hikvision = await hikvision.healthCheck();
        } catch (error) {
          health.services.hikvision = {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString(),
          };
        }
      }
      
      // Streaming service health and statistics
      if (streams) {
        try {
          const streamStats = streams.getStreamStats();
          health.services.streaming = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
          };
          health.statistics.streaming = streamStats;
        } catch (error) {
          health.services.streaming = {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString(),
          };
        }
      }
      
      // Motion detection service health and statistics
      if (motion) {
        try {
          const motionSettings = motion.getSettings();
          const motionStats = motion.getStatistics();
          
          health.services.motionDetection = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
          };
          
          health.statistics.motionDetection = {
            settings: motionSettings,
            statistics: motionStats,
          };
        } catch (error) {
          health.services.motionDetection = {
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString(),
          };
        }
      }
      
      // Set overall status
      health.status = overallHealthy ? 'healthy' : 'degraded';
      health.responseTime = `${Date.now() - startTime}ms`;
      
      // Return appropriate status code
      const statusCode = overallHealthy ? 200 : 503;
      
      res.status(statusCode).json(health);
      
    } catch (error) {
      const health = {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime: `${Date.now() - startTime}ms`,
      };
      
      res.status(503).json(health);
    }
  })
);

/**
 * GET /api/health/services/:service
 * Health check for specific service
 */
router.get('/services/:service',
  ErrorHandler.asyncHandler(async (req, res) => {
    const { service } = req.params;
    const { db, cache, hikvision, streams, motion } = req.app.locals.services || {};
    
    const startTime = Date.now();
    
    let serviceHealth;
    
    try {
      switch (service) {
        case 'database':
          if (!db) {
            serviceHealth = {
              status: 'unavailable',
              error: 'Database service not initialized',
            };
          } else {
            serviceHealth = await db.healthCheck();
          }
          break;
          
        case 'cache':
          if (!cache) {
            serviceHealth = {
              status: 'unavailable',
              error: 'Cache service not initialized',
            };
          } else {
            serviceHealth = await cache.healthCheck();
          }
          break;
          
        case 'hikvision':
          if (!hikvision) {
            serviceHealth = {
              status: 'unavailable',
              error: 'Hikvision API not configured',
            };
          } else {
            serviceHealth = await hikvision.healthCheck();
          }
          break;
          
        case 'streaming':
          if (!streams) {
            serviceHealth = {
              status: 'unavailable',
              error: 'Streaming service not initialized',
            };
          } else {
            const streamStats = streams.getStreamStats();
            serviceHealth = {
              status: 'healthy',
              statistics: streamStats,
            };
          }
          break;
          
        case 'motion':
          if (!motion) {
            serviceHealth = {
              status: 'unavailable',
              error: 'Motion detection service not initialized',
            };
          } else {
            const motionSettings = motion.getSettings();
            serviceHealth = {
              status: 'healthy',
              settings: motionSettings,
            };
          }
          break;
          
        default:
          return res.status(404).json({
            error: 'Service not found',
            code: 'SERVICE_NOT_FOUND',
            availableServices: ['database', 'cache', 'hikvision', 'streaming', 'motion'],
          });
      }
      
      serviceHealth.service = service;
      serviceHealth.timestamp = new Date().toISOString();
      serviceHealth.responseTime = `${Date.now() - startTime}ms`;
      
      const statusCode = serviceHealth.status === 'healthy' ? 200 : 503;
      res.status(statusCode).json(serviceHealth);
      
    } catch (error) {
      res.status(503).json({
        service,
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
        responseTime: `${Date.now() - startTime}ms`,
      });
    }
  })
);

/**
 * GET /api/health/ping
 * Simple ping endpoint
 */
router.get('/ping',
  ErrorHandler.asyncHandler(async (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  })
);

export default router;