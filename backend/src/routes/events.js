/**
 * Events Routes
 * Handles security events, alerts, and motion detection events
 */

import express from 'express';
import { AuthMiddleware } from '../middleware/auth.js';
import { ValidationMiddleware } from '../middleware/validation.js';
import { ErrorHandler } from '../middleware/error-handler.js';

const router = express.Router();

/**
 * GET /api/events
 * Get events with filtering and pagination
 */
router.get('/',
  ValidationMiddleware.validateGetEvents,
  ValidationMiddleware.validateDateRangeLogic,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, cache } = req.app.locals.services;
    const {
      cameraId,
      type,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = req.query;
    
    const cacheKey = `events:list:${JSON.stringify(req.query)}`;
    
    // Check cache for recent queries
    let events = await cache.get(cacheKey);
    
    if (!events) {
      events = await db.getEvents({
        cameraId,
        type,
        startDate,
        endDate,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
      
      // Cache for 1 minute
      await cache.set(cacheKey, events, 60);
    }
    
    // Get total count for pagination
    const totalResult = await db.query(`
      SELECT COUNT(*) as total
      FROM events e
      WHERE (
        $1::integer IS NULL OR e.camera_id = $1
      ) AND (
        $2::text IS NULL OR e.type = $2
      ) AND (
        $3::timestamp IS NULL OR e.created_at >= $3
      ) AND (
        $4::timestamp IS NULL OR e.created_at <= $4
      )
    `, [cameraId, type, startDate, endDate]);
    
    const total = parseInt(totalResult.rows[0].total);
    
    res.json({
      events,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total,
        hasMore: offset + events.length < total,
      },
    });
  })
);

/**
 * GET /api/events/:id
 * Get specific event by ID
 */
router.get('/:id',
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, cache } = req.app.locals.services;
    const eventId = req.params.id;
    
    // Check cache first
    let event = await cache.getEvent(eventId);
    
    if (!event) {
      const result = await db.query(`
        SELECT e.*, c.name as camera_name, c.location as camera_location
        FROM events e
        LEFT JOIN cameras c ON e.camera_id = c.id
        WHERE e.id = $1
      `, [eventId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Event not found',
          code: 'EVENT_NOT_FOUND',
        });
      }
      
      event = result.rows[0];
      
      // Cache for 10 minutes
      await cache.setEvent(eventId, event, 600);
    }
    
    res.json({ event });
  })
);

/**
 * POST /api/events
 * Create new event (manual or system-generated)
 */
router.post('/',
  AuthMiddleware.requirePermission('manage_events'),
  ValidationMiddleware.validateCreateEvent,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, cache, logger } = req.app.locals.services;
    const eventData = {
      ...req.body,
      metadata: {
        ...req.body.metadata,
        createdBy: req.user.username,
        createdAt: new Date().toISOString(),
      },
    };
    
    // Verify camera exists
    const camera = await db.getCameraById(eventData.cameraId);
    
    if (!camera) {
      return res.status(404).json({
        error: 'Camera not found',
        code: 'CAMERA_NOT_FOUND',
      });
    }
    
    // Create event
    const event = await db.createEvent(eventData);
    
    // Clear events cache
    await cache.clearPattern('events:list:*');
    
    logger.info(`Event created: ${event.type} for camera '${camera.name}' by ${req.user.username}`);
    
    res.status(201).json({
      message: 'Event created successfully',
      event,
    });
  })
);

/**
 * PUT /api/events/:id/acknowledge
 * Acknowledge an event
 */
router.put('/:id/acknowledge',
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, cache, logger } = req.app.locals.services;
    const eventId = req.params.id;
    
    // Check if event exists
    const eventResult = await db.query(
      'SELECT * FROM events WHERE id = $1',
      [eventId]
    );
    
    if (eventResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Event not found',
        code: 'EVENT_NOT_FOUND',
      });
    }
    
    const event = eventResult.rows[0];
    
    if (event.acknowledged) {
      return res.status(400).json({
        error: 'Event already acknowledged',
        code: 'EVENT_ALREADY_ACKNOWLEDGED',
      });
    }
    
    // Acknowledge event
    const result = await db.query(`
      UPDATE events 
      SET acknowledged = true, acknowledged_by = $1, acknowledged_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [req.user.id, eventId]);
    
    const acknowledgedEvent = result.rows[0];
    
    // Clear cache
    await cache.del(`event:${eventId}`);
    await cache.clearPattern('events:list:*');
    
    logger.info(`Event ${eventId} acknowledged by ${req.user.username}`);
    
    res.json({
      message: 'Event acknowledged successfully',
      event: acknowledgedEvent,
    });
  })
);

/**
 * GET /api/events/stats
 * Get event statistics
 */
router.get('/stats',
  AuthMiddleware.authorize(['operator', 'admin']),
  ValidationMiddleware.validateDateRange,
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, motion } = req.app.locals.services;
    const { startDate, endDate, timeRange = '24h' } = req.query;
    
    // Default date range if not provided
    const now = new Date();
    let start, end;
    
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      // Use timeRange
      switch (timeRange) {
        case '1h':
          start = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }
      end = now;
    }
    
    // Get database statistics
    const dbStats = await db.query(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE type = 'motion_detected') as motion_events,
        COUNT(*) FILTER (WHERE acknowledged = false) as unacknowledged_events,
        COUNT(*) FILTER (WHERE severity = 'high' OR severity = 'critical') as high_severity_events,
        COUNT(DISTINCT camera_id) as cameras_with_events,
        AVG(confidence) as avg_confidence
      FROM events
      WHERE created_at BETWEEN $1 AND $2
    `, [start, end]);
    
    // Get hourly breakdown
    const hourlyStats = await db.query(`
      SELECT 
        EXTRACT(hour FROM created_at) as hour,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE type = 'motion_detected') as motion_count
      FROM events
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY EXTRACT(hour FROM created_at)
      ORDER BY hour
    `, [start, end]);
    
    // Get camera breakdown
    const cameraStats = await db.query(`
      SELECT 
        c.name as camera_name,
        c.id as camera_id,
        COUNT(*) as event_count,
        COUNT(*) FILTER (WHERE e.type = 'motion_detected') as motion_count
      FROM events e
      JOIN cameras c ON e.camera_id = c.id
      WHERE e.created_at BETWEEN $1 AND $2
      GROUP BY c.id, c.name
      ORDER BY event_count DESC
      LIMIT 10
    `, [start, end]);
    
    // Get event type breakdown
    const typeStats = await db.query(`
      SELECT 
        type,
        COUNT(*) as count,
        AVG(confidence) as avg_confidence
      FROM events
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY type
      ORDER BY count DESC
    `, [start, end]);
    
    // Get motion detection statistics from motion service
    const motionStats = motion ? motion.getStatistics(null, timeRange) : null;
    
    const stats = {
      timeRange: {
        start: start.toISOString(),
        end: end.toISOString(),
        duration: timeRange,
      },
      summary: {
        totalEvents: parseInt(dbStats.rows[0].total_events),
        motionEvents: parseInt(dbStats.rows[0].motion_events),
        unacknowledgedEvents: parseInt(dbStats.rows[0].unacknowledged_events),
        highSeverityEvents: parseInt(dbStats.rows[0].high_severity_events),
        camerasWithEvents: parseInt(dbStats.rows[0].cameras_with_events),
        avgConfidence: parseFloat(dbStats.rows[0].avg_confidence) || 0,
      },
      hourlyBreakdown: hourlyStats.rows.map(row => ({
        hour: parseInt(row.hour),
        totalEvents: parseInt(row.count),
        motionEvents: parseInt(row.motion_count),
      })),
      cameraBreakdown: cameraStats.rows.map(row => ({
        cameraId: row.camera_id,
        cameraName: row.camera_name,
        eventCount: parseInt(row.event_count),
        motionCount: parseInt(row.motion_count),
      })),
      typeBreakdown: typeStats.rows.map(row => ({
        type: row.type,
        count: parseInt(row.count),
        avgConfidence: parseFloat(row.avg_confidence) || 0,
      })),
    };
    
    // Add motion detection service stats if available
    if (motionStats) {
      stats.motionDetection = motionStats;
    }
    
    res.json({ stats });
  })
);

/**
 * GET /api/events/recent
 * Get recent events (last 24 hours)
 */
router.get('/recent',
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, cache } = req.app.locals.services;
    const { limit = 20 } = req.query;
    
    const cacheKey = `events:recent:${limit}`;
    
    // Check cache
    let events = await cache.get(cacheKey);
    
    if (!events) {
      events = await db.query(`
        SELECT e.*, c.name as camera_name, c.location as camera_location
        FROM events e
        LEFT JOIN cameras c ON e.camera_id = c.id
        WHERE e.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
        ORDER BY e.created_at DESC
        LIMIT $1
      `, [parseInt(limit)]);
      
      events = events.rows;
      
      // Cache for 30 seconds
      await cache.set(cacheKey, events, 30);
    }
    
    res.json({ events });
  })
);

/**
 * GET /api/events/unacknowledged
 * Get unacknowledged events
 */
router.get('/unacknowledged',
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db } = req.app.locals.services;
    const { limit = 50 } = req.query;
    
    const events = await db.query(`
      SELECT e.*, c.name as camera_name, c.location as camera_location
      FROM events e
      LEFT JOIN cameras c ON e.camera_id = c.id
      WHERE e.acknowledged = false
      ORDER BY e.created_at DESC
      LIMIT $1
    `, [parseInt(limit)]);
    
    res.json({
      events: events.rows,
      count: events.rows.length,
    });
  })
);

/**
 * DELETE /api/events/:id
 * Delete event (admin only)
 */
router.delete('/:id',
  AuthMiddleware.authorize(['admin']),
  ErrorHandler.asyncHandler(async (req, res) => {
    const { db, cache, logger } = req.app.locals.services;
    const eventId = req.params.id;
    
    // Get event for audit log
    const eventResult = await db.query(
      'SELECT * FROM events WHERE id = $1',
      [eventId]
    );
    
    if (eventResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Event not found',
        code: 'EVENT_NOT_FOUND',
      });
    }
    
    const event = eventResult.rows[0];
    
    // Delete event
    await db.query('DELETE FROM events WHERE id = $1', [eventId]);
    
    // Clear cache
    await cache.del(`event:${eventId}`);
    await cache.clearPattern('events:list:*');
    
    // Log audit event
    await db.query(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, old_values, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      req.user.id,
      'DELETE',
      'event',
      eventId,
      JSON.stringify(event),
      req.ip
    ]);
    
    logger.info(`Event ${eventId} deleted by ${req.user.username}`);
    
    res.json({
      message: 'Event deleted successfully',
    });
  })
);

export default router;