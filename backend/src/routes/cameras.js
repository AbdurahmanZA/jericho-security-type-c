/**
 * Camera Management Routes
 * Handles camera CRUD operations and integration with Hikvision API
 */

import express from 'express';
import { AuthMiddleware } from '../middleware/auth.js';
import { ValidationMiddleware } from '../middleware/validation.js';
import { ErrorHandler } from '../middleware/error-handler.js';

const router = express.Router();

/**
 * GET /api/cameras
 * Get all cameras with optional filtering
 */
router.get('/',
  AuthMiddleware.userRateLimit(200, 15), // Higher limit for camera list
  ValidationMiddleware.validatePagination,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, cache, logger } = req.app.locals.services;
    const { status, location, page = 1, limit = 50 } = req.query;
    
    const cacheKey = `cameras:list:${JSON.stringify(req.query)}`;
    
    // Check cache first
    let cameras = await cache.get(cacheKey);
    
    if (!cameras) {
      // Get cameras from database
      cameras = await db.getCameras({ status, location });
      
      // Cache for 2 minutes
      await cache.set(cacheKey, cameras, 120);
    }
    
    // Apply pagination
    const offset = (page - 1) * limit;
    const paginatedCameras = cameras.slice(offset, offset + parseInt(limit));
    
    res.json({
      cameras: paginatedCameras,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: cameras.length,
        totalPages: Math.ceil(cameras.length / limit),
      },
    });
  })
);

/**
 * GET /api/cameras/:id
 * Get camera by ID
 */
router.get('/:id',
  ValidationMiddleware.validateCameraId,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, cache } = req.app.locals.services;
    const cameraId = req.params.id;
    
    // Check cache first
    let camera = await cache.getCamera(cameraId);
    
    if (!camera) {
      camera = await db.getCameraById(cameraId);
      
      if (!camera) {
        return res.status(404).json({
          error: 'Camera not found',
          code: 'CAMERA_NOT_FOUND',
        });
      }
      
      // Cache for 5 minutes
      await cache.setCamera(cameraId, camera);
    }
    
    res.json({ camera });
  })
);

/**
 * POST /api/cameras
 * Create new camera
 */
router.post('/',
  AuthMiddleware.authorize(['operator', 'admin']),
  ValidationMiddleware.validateCreateCamera,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, cache, hikvision, logger } = req.app.locals.services;
    const cameraData = req.body;
    
    // If Hikvision device ID is provided, validate it
    if (cameraData.hikvisionDeviceId && hikvision) {
      try {
        const device = await hikvision.getDeviceDetails(cameraData.hikvisionDeviceId);
        
        // Auto-populate camera details from Hikvision device
        if (device && device.data) {
          cameraData.model = device.data.model;
          cameraData.serialNumber = device.data.serialNumber;
          cameraData.firmwareVersion = device.data.firmwareVersion;
          
          // Generate RTSP URL if not provided
          if (!cameraData.rtspUrl) {
            try {
              cameraData.rtspUrl = await hikvision.getLiveStreamUrl(cameraData.hikvisionDeviceId);
            } catch (streamError) {
              logger.warn(`Could not get RTSP URL for device ${cameraData.hikvisionDeviceId}:`, streamError.message);
            }
          }
        }
      } catch (error) {
        logger.warn(`Failed to validate Hikvision device ${cameraData.hikvisionDeviceId}:`, error.message);
        return res.status(400).json({
          error: 'Invalid Hikvision device ID',
          code: 'INVALID_HIKVISION_DEVICE',
          details: error.message,
        });
      }
    }
    
    // Create camera in database
    const camera = await db.createCamera(cameraData);
    
    // Clear camera list cache
    await cache.clearPattern('cameras:list:*');
    
    // Log audit event
    await db.query(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, new_values, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      req.user.id,
      'CREATE',
      'camera',
      camera.id.toString(),
      JSON.stringify(camera),
      req.ip
    ]);
    
    logger.info(`Camera '${camera.name}' created by ${req.user.username}`);
    
    res.status(201).json({
      message: 'Camera created successfully',
      camera,
    });
  })
);

/**
 * PUT /api/cameras/:id
 * Update camera
 */
router.put('/:id',
  AuthMiddleware.authorize(['operator', 'admin']),
  ValidationMiddleware.validateUpdateCamera,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, cache, logger } = req.app.locals.services;
    const cameraId = req.params.id;
    const updates = req.body;
    
    // Get current camera for audit log
    const currentCamera = await db.getCameraById(cameraId);
    
    if (!currentCamera) {
      return res.status(404).json({
        error: 'Camera not found',
        code: 'CAMERA_NOT_FOUND',
      });
    }
    
    // Update camera
    const updatedCamera = await db.updateCamera(cameraId, updates);
    
    // Clear cache
    await cache.del(`camera:${cameraId}`);
    await cache.clearPattern('cameras:list:*');
    
    // Log audit event
    await db.query(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, new_values, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      req.user.id,
      'UPDATE',
      'camera',
      cameraId,
      JSON.stringify(currentCamera),
      JSON.stringify(updatedCamera),
      req.ip
    ]);
    
    logger.info(`Camera '${updatedCamera.name}' updated by ${req.user.username}`);
    
    res.json({
      message: 'Camera updated successfully',
      camera: updatedCamera,
    });
  })
);

/**
 * DELETE /api/cameras/:id
 * Delete camera
 */
router.delete('/:id',
  AuthMiddleware.authorize(['admin']),
  ValidationMiddleware.validateCameraId,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, cache, streams, logger } = req.app.locals.services;
    const cameraId = req.params.id;
    
    // Get camera for audit log
    const camera = await db.getCameraById(cameraId);
    
    if (!camera) {
      return res.status(404).json({
        error: 'Camera not found',
        code: 'CAMERA_NOT_FOUND',
      });
    }
    
    // Stop any active streams for this camera
    const activeStreams = streams.getAllStreams().filter(stream => 
      stream.id.startsWith(`camera_${cameraId}_`)
    );
    
    for (const stream of activeStreams) {
      try {
        await streams.stopStream(stream.id);
        logger.info(`Stopped stream ${stream.id} for deleted camera ${cameraId}`);
      } catch (error) {
        logger.warn(`Failed to stop stream ${stream.id}:`, error.message);
      }
    }
    
    // Delete camera
    await db.deleteCamera(cameraId);
    
    // Clear cache
    await cache.del(`camera:${cameraId}`);
    await cache.clearPattern('cameras:list:*');
    
    // Log audit event
    await db.query(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      req.user.id,
      'DELETE',
      'camera',
      cameraId,
      JSON.stringify(camera),
      req.ip
    ]);
    
    logger.info(`Camera '${camera.name}' deleted by ${req.user.username}`);
    
    res.json({
      message: 'Camera deleted successfully',
    });
  })
);

/**
 * POST /api/cameras/:id/snapshot
 * Capture snapshot from camera
 */
router.post('/:id/snapshot',
  AuthMiddleware.requirePermission('control_cameras'),
  ValidationMiddleware.validateCameraId,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, hikvision, logger } = req.app.locals.services;
    const cameraId = req.params.id;
    
    const camera = await db.getCameraById(cameraId);
    
    if (!camera) {
      return res.status(404).json({
        error: 'Camera not found',
        code: 'CAMERA_NOT_FOUND',
      });
    }
    
    if (!camera.hikvision_device_id) {
      return res.status(400).json({
        error: 'Camera does not have Hikvision device ID',
        code: 'NO_HIKVISION_DEVICE',
      });
    }
    
    if (!hikvision) {
      return res.status(503).json({
        error: 'Hikvision API not available',
        code: 'HIKVISION_API_UNAVAILABLE',
      });
    }
    
    try {
      const snapshotUrl = await hikvision.captureSnapshot(camera.hikvision_device_id);
      
      // Create event for manual snapshot
      await db.createEvent({
        cameraId: camera.id,
        type: 'manual',
        description: `Manual snapshot captured by ${req.user.username}`,
        confidence: 1.0,
        snapshotUrl,
        metadata: {
          capturedBy: req.user.username,
          capturedAt: new Date().toISOString(),
        },
      });
      
      logger.info(`Snapshot captured for camera '${camera.name}' by ${req.user.username}`);
      
      res.json({
        message: 'Snapshot captured successfully',
        snapshotUrl,
      });
      
    } catch (error) {
      logger.error(`Failed to capture snapshot for camera ${cameraId}:`, error.message);
      
      res.status(500).json({
        error: 'Failed to capture snapshot',
        code: 'SNAPSHOT_FAILED',
        details: error.message,
      });
    }
  })
);

/**
 * POST /api/cameras/:id/ptz
 * PTZ control for camera
 */
router.post('/:id/ptz',
  AuthMiddleware.requirePermission('control_cameras'),
  ValidationMiddleware.validateCameraId,
  ValidationMiddleware.validatePTZControl,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, hikvision, logger } = req.app.locals.services;
    const cameraId = req.params.id;
    const { action, speed, preset } = req.body;
    
    const camera = await db.getCameraById(cameraId);
    
    if (!camera) {
      return res.status(404).json({
        error: 'Camera not found',
        code: 'CAMERA_NOT_FOUND',
      });
    }
    
    if (!camera.hikvision_device_id) {
      return res.status(400).json({
        error: 'Camera does not have Hikvision device ID',
        code: 'NO_HIKVISION_DEVICE',
      });
    }
    
    if (!hikvision) {
      return res.status(503).json({
        error: 'Hikvision API not available',
        code: 'HIKVISION_API_UNAVAILABLE',
      });
    }
    
    try {
      await hikvision.ptzControl(camera.hikvision_device_id, action, {
        speed,
        preset,
      });
      
      logger.info(`PTZ action '${action}' executed on camera '${camera.name}' by ${req.user.username}`);
      
      res.json({
        message: 'PTZ command executed successfully',
        action,
      });
      
    } catch (error) {
      logger.error(`Failed to execute PTZ action for camera ${cameraId}:`, error.message);
      
      res.status(500).json({
        error: 'PTZ command failed',
        code: 'PTZ_FAILED',
        details: error.message,
      });
    }
  })
);

/**
 * GET /api/cameras/:id/status
 * Get camera status and health
 */
router.get('/:id/status',
  ValidationMiddleware.validateCameraId,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, hikvision, cache } = req.app.locals.services;
    const cameraId = req.params.id;
    
    const camera = await db.getCameraById(cameraId);
    
    if (!camera) {
      return res.status(404).json({
        error: 'Camera not found',
        code: 'CAMERA_NOT_FOUND',
      });
    }
    
    const status = {
      id: camera.id,
      name: camera.name,
      status: camera.status,
      lastSeen: camera.last_seen,
      ipAddress: camera.ip_address,
    };
    
    // Get Hikvision device status if available
    if (camera.hikvision_device_id && hikvision) {
      try {
        const deviceStatus = await hikvision.getDeviceStatus(camera.hikvision_device_id);
        status.hikvisionStatus = deviceStatus;
      } catch (error) {
        status.hikvisionStatus = {
          error: error.message,
          available: false,
        };
      }
    }
    
    // Get latest heartbeat
    const heartbeat = await db.query(`
      SELECT status, response_time, checked_at, error_message
      FROM device_heartbeats 
      WHERE camera_id = $1 
      ORDER BY checked_at DESC 
      LIMIT 1
    `, [cameraId]);
    
    if (heartbeat.rows.length > 0) {
      status.heartbeat = heartbeat.rows[0];
    }
    
    res.json({ status });
  })
);

/**
 * POST /api/cameras/discover
 * Discover cameras from Hikvision platform
 */
router.post('/discover',
  AuthMiddleware.authorize(['admin']),
  ErrorHandler.asyncHandler(async (req, res) => {
    const { hikvision, logger } = req.app.locals.services;
    
    if (!hikvision) {
      return res.status(503).json({
        error: 'Hikvision API not available',
        code: 'HIKVISION_API_UNAVAILABLE',
      });
    }
    
    try {
      const devices = await hikvision.getDevices(1, 100);
      
      logger.info(`Discovered ${devices.data?.length || 0} devices from Hikvision platform`);
      
      res.json({
        message: 'Device discovery completed',
        devices: devices.data || [],
        total: devices.total || 0,
      });
      
    } catch (error) {
      logger.error('Failed to discover devices:', error.message);
      
      res.status(500).json({
        error: 'Device discovery failed',
        code: 'DISCOVERY_FAILED',
        details: error.message,
      });
    }
  })
);

export default router;