/**
 * Stream Management Routes
 * Handles RTSP streaming operations and HLS conversion
 */

import express from 'express';
import { AuthMiddleware } from '../middleware/auth.js';
import { ValidationMiddleware } from '../middleware/validation.js';
import { ErrorHandler } from '../middleware/error-handler.js';

const router = express.Router();

/**
 * GET /api/streams
 * Get all active streams
 */
router.get('/',
  ErrorHandler.asyncHandler(async (req, res) => {
    const { streams } = req.app.locals.services;
    
    const allStreams = streams.getAllStreams();
    const stats = streams.getStreamStats();
    
    res.json({
      streams: allStreams,
      stats,
    });
  })
);

/**
 * GET /api/streams/:streamId
 * Get specific stream information
 */
router.get('/:streamId',
  ValidationMiddleware.validateStreamId,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { streams } = req.app.locals.services;
    const streamId = req.params.streamId;
    
    const stream = streams.getStream(streamId);
    
    if (!stream) {
      return res.status(404).json({
        error: 'Stream not found',
        code: 'STREAM_NOT_FOUND',
      });
    }
    
    res.json({ stream });
  })
);

/**
 * POST /api/streams/start
 * Start new stream from camera
 */
router.post('/start',
  AuthMiddleware.requirePermission('manage_streams'),
  ValidationMiddleware.validateStartStream,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, streams, hikvision, logger } = req.app.locals.services;
    const { cameraId, quality = 'medium', rtspUrl } = req.body;
    
    // Get camera details
    const camera = await db.getCameraById(cameraId);
    
    if (!camera) {
      return res.status(404).json({
        error: 'Camera not found',
        code: 'CAMERA_NOT_FOUND',
      });
    }
    
    // Determine RTSP URL
    let streamUrl = rtspUrl || camera.rtsp_url;
    
    // If no RTSP URL provided, try to get it from Hikvision
    if (!streamUrl && camera.hikvision_device_id && hikvision) {
      try {
        streamUrl = await hikvision.getLiveStreamUrl(camera.hikvision_device_id, 'main');
        logger.info(`Generated RTSP URL for camera ${cameraId} from Hikvision`);
      } catch (error) {
        logger.error(`Failed to get RTSP URL for camera ${cameraId}:`, error.message);
        return res.status(400).json({
          error: 'No RTSP URL available for camera',
          code: 'NO_RTSP_URL',
        });
      }
    }
    
    if (!streamUrl) {
      return res.status(400).json({
        error: 'RTSP URL required for streaming',
        code: 'RTSP_URL_REQUIRED',
      });
    }
    
    // Generate unique stream ID
    const streamId = `camera_${cameraId}_${Date.now()}`;
    
    try {
      // Start the stream
      const stream = await streams.startStream(streamId, streamUrl, {
        quality,
        cameraId,
        startedBy: req.user.username,
      });
      
      // Update camera status
      await db.updateCamera(cameraId, { 
        status: 'active',
        last_seen: new Date(),
      });
      
      // Create stream record in database
      await db.query(`
        INSERT INTO streams (id, camera_id, rtsp_url, quality, status, started_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          status = $4,
          started_at = $6,
          updated_at = CURRENT_TIMESTAMP
      `, [
        streamId,
        cameraId,
        streamUrl,
        quality,
        'active',
        new Date(),
        JSON.stringify({ startedBy: req.user.username })
      ]);
      
      logger.info(`Stream started: ${streamId} for camera '${camera.name}' by ${req.user.username}`);
      
      res.status(201).json({
        message: 'Stream started successfully',
        stream: {
          id: streamId,
          cameraId,
          cameraName: camera.name,
          quality,
          playlistUrl: stream.playlistUrl || `/hls/${streamId}/playlist.m3u8`,
          status: stream.status,
          startTime: stream.startTime,
        },
      });
      
    } catch (error) {
      logger.error(`Failed to start stream for camera ${cameraId}:`, error.message);
      
      // Update camera status to error
      await db.updateCamera(cameraId, { status: 'error' });
      
      res.status(500).json({
        error: 'Failed to start stream',
        code: 'STREAM_START_FAILED',
        details: error.message,
      });
    }
  })
);

/**
 * POST /api/streams/:streamId/stop
 * Stop active stream
 */
router.post('/:streamId/stop',
  AuthMiddleware.requirePermission('manage_streams'),
  ValidationMiddleware.validateStreamId,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, streams, logger } = req.app.locals.services;
    const streamId = req.params.streamId;
    
    const stream = streams.getStream(streamId);
    
    if (!stream) {
      return res.status(404).json({
        error: 'Stream not found',
        code: 'STREAM_NOT_FOUND',
      });
    }
    
    try {
      // Stop the stream
      const stopped = await streams.stopStream(streamId);
      
      if (stopped) {
        // Update stream record in database
        await db.query(`
          UPDATE streams 
          SET status = 'inactive', updated_at = CURRENT_TIMESTAMP 
          WHERE id = $1
        `, [streamId]);
        
        logger.info(`Stream stopped: ${streamId} by ${req.user.username}`);
        
        res.json({
          message: 'Stream stopped successfully',
          streamId,
        });
      } else {
        res.status(500).json({
          error: 'Failed to stop stream',
          code: 'STREAM_STOP_FAILED',
        });
      }
      
    } catch (error) {
      logger.error(`Failed to stop stream ${streamId}:`, error.message);
      
      res.status(500).json({
        error: 'Failed to stop stream',
        code: 'STREAM_STOP_FAILED',
        details: error.message,
      });
    }
  })
);

/**
 * GET /api/streams/:streamId/playlist
 * Get HLS playlist URL for stream
 */
router.get('/:streamId/playlist',
  ValidationMiddleware.validateStreamId,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { streams } = req.app.locals.services;
    const streamId = req.params.streamId;
    
    const stream = streams.getStream(streamId);
    
    if (!stream) {
      return res.status(404).json({
        error: 'Stream not found',
        code: 'STREAM_NOT_FOUND',
      });
    }
    
    if (stream.status !== 'running') {
      return res.status(400).json({
        error: 'Stream is not running',
        code: 'STREAM_NOT_RUNNING',
        status: stream.status,
      });
    }
    
    res.json({
      streamId,
      playlistUrl: stream.playlistUrl,
      status: stream.status,
      uptime: stream.uptime,
    });
  })
);

/**
 * POST /api/streams/:streamId/restart
 * Restart failed stream
 */
router.post('/:streamId/restart',
  AuthMiddleware.requirePermission('manage_streams'),
  ValidationMiddleware.validateStreamId,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, streams, logger } = req.app.locals.services;
    const streamId = req.params.streamId;
    
    const stream = streams.getStream(streamId);
    
    if (!stream) {
      return res.status(404).json({
        error: 'Stream not found',
        code: 'STREAM_NOT_FOUND',
      });
    }
    
    try {
      // Get stream details from database
      const streamRecord = await db.query(
        'SELECT * FROM streams WHERE id = $1',
        [streamId]
      );
      
      if (streamRecord.rows.length === 0) {
        return res.status(404).json({
          error: 'Stream record not found',
          code: 'STREAM_RECORD_NOT_FOUND',
        });
      }
      
      const { camera_id, rtsp_url, quality } = streamRecord.rows[0];
      
      // Stop current stream
      await streams.stopStream(streamId);
      
      // Start new stream with same parameters
      const restartedStream = await streams.startStream(streamId, rtsp_url, {
        quality,
        cameraId: camera_id,
        restartedBy: req.user.username,
      });
      
      // Update stream record
      await db.query(`
        UPDATE streams 
        SET status = 'active', started_at = $1, error_count = error_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [new Date(), streamId]);
      
      logger.info(`Stream restarted: ${streamId} by ${req.user.username}`);
      
      res.json({
        message: 'Stream restarted successfully',
        stream: {
          id: streamId,
          status: restartedStream.status,
          playlistUrl: restartedStream.playlistUrl,
          startTime: restartedStream.startTime,
        },
      });
      
    } catch (error) {
      logger.error(`Failed to restart stream ${streamId}:`, error.message);
      
      res.status(500).json({
        error: 'Failed to restart stream',
        code: 'STREAM_RESTART_FAILED',
        details: error.message,
      });
    }
  })
);

/**
 * GET /api/streams/stats
 * Get streaming statistics
 */
router.get('/stats',
  AuthMiddleware.authorize(['operator', 'admin']),
  ErrorHandler.asyncHandler(async (req, res) => {
    const { streams, db } = req.app.locals.services;
    
    const stats = streams.getStreamStats();
    
    // Get additional database stats
    const dbStats = await db.query(`
      SELECT 
        COUNT(*) as total_streams,
        COUNT(*) FILTER (WHERE status = 'active') as active_db_streams,
        COUNT(*) FILTER (WHERE status = 'error') as error_streams,
        AVG(viewer_count) as avg_viewers,
        SUM(viewer_count) as total_viewers
      FROM streams
      WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
    `);
    
    if (dbStats.rows.length > 0) {
      stats.database = {
        totalStreams24h: parseInt(dbStats.rows[0].total_streams),
        activeDbStreams: parseInt(dbStats.rows[0].active_db_streams),
        errorStreams: parseInt(dbStats.rows[0].error_streams),
        avgViewers: parseFloat(dbStats.rows[0].avg_viewers) || 0,
        totalViewers: parseInt(dbStats.rows[0].total_viewers) || 0,
      };
    }
    
    res.json({ stats });
  })
);

/**
 * POST /api/streams/stop-all
 * Stop all active streams (emergency)
 */
router.post('/stop-all',
  AuthMiddleware.authorize(['admin']),
  ErrorHandler.asyncHandler(async (req, res) => {
    const { streams, db, logger } = req.app.locals.services;
    
    try {
      const activeStreams = streams.getAllStreams();
      const stopPromises = [];
      
      for (const stream of activeStreams) {
        stopPromises.push(streams.stopStream(stream.id));
      }
      
      await Promise.all(stopPromises);
      
      // Update all stream records in database
      await db.query(`
        UPDATE streams 
        SET status = 'inactive', updated_at = CURRENT_TIMESTAMP 
        WHERE status = 'active'
      `);
      
      logger.warn(`All streams stopped by ${req.user.username} (emergency stop)`);
      
      res.json({
        message: 'All streams stopped successfully',
        stoppedCount: activeStreams.length,
      });
      
    } catch (error) {
      logger.error('Failed to stop all streams:', error.message);
      
      res.status(500).json({
        error: 'Failed to stop all streams',
        code: 'STOP_ALL_FAILED',
        details: error.message,
      });
    }
  })
);

export default router;