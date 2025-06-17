/**
 * Settings Routes
 * Handles application configuration and motion detection settings
 */

import express from 'express';
import { AuthMiddleware } from '../middleware/auth.js';
import { ValidationMiddleware } from '../middleware/validation.js';
import { ErrorHandler } from '../middleware/error-handler.js';

const router = express.Router();

/**
 * GET /api/settings
 * Get all application settings
 */
router.get('/',
  AuthMiddleware.authorize(['operator', 'admin']),
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, cache } = req.app.locals.services;
    
    // Check cache first
    let settings = await cache.get('settings:all');
    
    if (!settings) {
      settings = await db.getAllSettings();
      
      // Cache for 5 minutes
      await cache.set('settings:all', settings, 300);
    }
    
    res.json({ settings });
  })
);

/**
 * GET /api/settings/:key
 * Get specific setting by key
 */
router.get('/:key',
  AuthMiddleware.authorize(['operator', 'admin']),
  ValidationMiddleware.validateSettingKey,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, cache } = req.app.locals.services;
    const { key } = req.params;
    
    // Check cache first
    let value = await cache.get(`setting:${key}`);
    
    if (value === null) {
      value = await db.getSetting(key);
      
      if (value === undefined) {
        return res.status(404).json({
          error: 'Setting not found',
          code: 'SETTING_NOT_FOUND',
        });
      }
      
      // Cache for 10 minutes
      await cache.set(`setting:${key}`, value, 600);
    }
    
    res.json({ 
      key,
      value: JSON.parse(value),
    });
  })
);

/**
 * PUT /api/settings/:key
 * Update specific setting
 */
router.put('/:key',
  AuthMiddleware.authorize(['admin']),
  ValidationMiddleware.validateSettingKey,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, cache, logger } = req.app.locals.services;
    const { key } = req.params;
    const { value } = req.body;
    
    if (value === undefined) {
      return res.status(400).json({
        error: 'Value is required',
        code: 'VALUE_REQUIRED',
      });
    }
    
    // Get old value for audit log
    const oldValue = await db.getSetting(key);
    
    // Update setting
    await db.setSetting(key, value);
    
    // Clear cache
    await cache.del(`setting:${key}`);
    await cache.del('settings:all');
    
    // Log audit event
    await db.query(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      req.user.id,
      'UPDATE',
      'setting',
      key,
      oldValue ? JSON.stringify({ value: JSON.parse(oldValue) }) : null,
      JSON.stringify({ value }),
      req.ip
    ]);
    
    logger.info(`Setting '${key}' updated by ${req.user.username}`);
    
    res.json({
      message: 'Setting updated successfully',
      key,
      value,
    });
  })
);

/**
 * POST /api/settings/bulk
 * Update multiple settings at once
 */
router.post('/bulk',
  AuthMiddleware.authorize(['admin']),
  ValidationMiddleware.validateUpdateSettings,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, cache, logger } = req.app.locals.services;
    const { settings } = req.body;
    
    const updates = [];
    
    // Update each setting
    for (const [key, value] of Object.entries(settings)) {
      // Get old value for audit log
      const oldValue = await db.getSetting(key);
      
      // Update setting
      await db.setSetting(key, value);
      
      updates.push({
        key,
        oldValue: oldValue ? JSON.parse(oldValue) : null,
        newValue: value,
      });
      
      // Clear individual cache
      await cache.del(`setting:${key}`);
    }
    
    // Clear general cache
    await cache.del('settings:all');
    
    // Log audit event
    await db.query(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      req.user.id,
      'BULK_UPDATE',
      'settings',
      'bulk',
      JSON.stringify(updates.map(u => ({ [u.key]: u.oldValue }))),
      JSON.stringify(updates.map(u => ({ [u.key]: u.newValue }))),
      req.ip
    ]);
    
    logger.info(`${updates.length} settings updated in bulk by ${req.user.username}`);
    
    res.json({
      message: 'Settings updated successfully',
      updatedCount: updates.length,
      updates,
    });
  })
);

/**
 * GET /api/settings/motion-detection
 * Get motion detection settings
 */
router.get('/motion-detection',
  ErrorHandler.asyncHandler(async (req, res) => {
    const { motion } = req.app.locals.services;
    
    if (!motion) {
      return res.status(503).json({
        error: 'Motion detection service not available',
        code: 'MOTION_SERVICE_UNAVAILABLE',
      });
    }
    
    const settings = motion.getSettings();
    
    res.json({ settings });
  })
);

/**
 * PUT /api/settings/motion-detection
 * Update motion detection settings
 */
router.put('/motion-detection',
  AuthMiddleware.authorize(['operator', 'admin']),
  ErrorHandler.asyncHandler(async (req, res) => {
    const { motion, logger } = req.app.locals.services;
    const settings = req.body;
    
    if (!motion) {
      return res.status(503).json({
        error: 'Motion detection service not available',
        code: 'MOTION_SERVICE_UNAVAILABLE',
      });
    }
    
    // Validate settings
    const validSettings = {};
    
    if (settings.sensitivity && ['low', 'medium', 'high'].includes(settings.sensitivity)) {
      validSettings.sensitivity = settings.sensitivity;
    }
    
    if (typeof settings.areaThreshold === 'number' && settings.areaThreshold >= 0 && settings.areaThreshold <= 1) {
      validSettings.areaThreshold = settings.areaThreshold;
    }
    
    if (typeof settings.cooldownPeriod === 'number' && settings.cooldownPeriod >= 0) {
      validSettings.cooldownPeriod = settings.cooldownPeriod;
    }
    
    if (typeof settings.enableAIAnalysis === 'boolean') {
      validSettings.enableAIAnalysis = settings.enableAIAnalysis;
    }
    
    if (Object.keys(validSettings).length === 0) {
      return res.status(400).json({
        error: 'No valid settings provided',
        code: 'INVALID_SETTINGS',
      });
    }
    
    // Update motion detection settings
    motion.updateSettings(validSettings);
    
    logger.info(`Motion detection settings updated by ${req.user.username}:`, validSettings);
    
    res.json({
      message: 'Motion detection settings updated successfully',
      settings: motion.getSettings(),
    });
  })
);

/**
 * POST /api/settings/motion-detection/:cameraId/enable
 * Enable motion detection for specific camera
 */
router.post('/motion-detection/:cameraId/enable',
  AuthMiddleware.authorize(['operator', 'admin']),
  ValidationMiddleware.validateMotionConfig,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, motion, logger } = req.app.locals.services;
    const { cameraId } = req.params;
    const config = req.body;
    
    // Verify camera exists
    const camera = await db.getCameraById(cameraId);
    
    if (!camera) {
      return res.status(404).json({
        error: 'Camera not found',
        code: 'CAMERA_NOT_FOUND',
      });
    }
    
    if (!motion) {
      return res.status(503).json({
        error: 'Motion detection service not available',
        code: 'MOTION_SERVICE_UNAVAILABLE',
      });
    }
    
    try {
      const detectorConfig = await motion.enableMotionDetection(cameraId, config);
      
      logger.info(`Motion detection enabled for camera '${camera.name}' by ${req.user.username}`);
      
      res.json({
        message: 'Motion detection enabled successfully',
        cameraId,
        config: detectorConfig,
      });
      
    } catch (error) {
      logger.error(`Failed to enable motion detection for camera ${cameraId}:`, error.message);
      
      res.status(500).json({
        error: 'Failed to enable motion detection',
        code: 'MOTION_ENABLE_FAILED',
        details: error.message,
      });
    }
  })
);

/**
 * POST /api/settings/motion-detection/:cameraId/disable
 * Disable motion detection for specific camera
 */
router.post('/motion-detection/:cameraId/disable',
  AuthMiddleware.authorize(['operator', 'admin']),
  ValidationMiddleware.validateCameraId,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, motion, logger } = req.app.locals.services;
    const { cameraId } = req.params;
    
    // Verify camera exists
    const camera = await db.getCameraById(cameraId);
    
    if (!camera) {
      return res.status(404).json({
        error: 'Camera not found',
        code: 'CAMERA_NOT_FOUND',
      });
    }
    
    if (!motion) {
      return res.status(503).json({
        error: 'Motion detection service not available',
        code: 'MOTION_SERVICE_UNAVAILABLE',
      });
    }
    
    try {
      await motion.disableMotionDetection(cameraId);
      
      logger.info(`Motion detection disabled for camera '${camera.name}' by ${req.user.username}`);
      
      res.json({
        message: 'Motion detection disabled successfully',
        cameraId,
      });
      
    } catch (error) {
      logger.error(`Failed to disable motion detection for camera ${cameraId}:`, error.message);
      
      res.status(500).json({
        error: 'Failed to disable motion detection',
        code: 'MOTION_DISABLE_FAILED',
        details: error.message,
      });
    }
  })
);

/**
 * GET /api/settings/system-info
 * Get system information and capabilities
 */
router.get('/system-info',
  AuthMiddleware.authorize(['admin']),
  ErrorHandler.asyncHandler(async (req, res) => {
    const { hikvision, streams, motion, db, cache } = req.app.locals.services;
    
    const systemInfo = {
      version: '2.0.0',
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      platform: process.platform,
      arch: process.arch,
      capabilities: {
        hikvisionAPI: !!hikvision,
        streaming: !!streams,
        motionDetection: !!motion,
        database: !!db,
        cache: !!cache,
      },
      limits: {
        maxCameras: parseInt(process.env.MAX_CAMERAS) || 12,
        maxStreams: parseInt(process.env.MAX_STREAMS) || 12,
      },
    };
    
    // Add service health status
    if (hikvision) {
      try {
        systemInfo.services = {
          hikvision: await hikvision.healthCheck(),
        };
      } catch (error) {
        systemInfo.services = {
          hikvision: {
            status: 'unhealthy',
            error: error.message,
          },
        };
      }
    }
    
    if (db) {
      systemInfo.services = {
        ...systemInfo.services,
        database: await db.healthCheck(),
      };
    }
    
    if (cache) {
      systemInfo.services = {
        ...systemInfo.services,
        cache: await cache.healthCheck(),
      };
    }
    
    res.json({ systemInfo });
  })
);

export default router;