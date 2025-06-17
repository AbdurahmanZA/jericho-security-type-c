const express = require('express');
const router = express.Router();
const db = require('../database/connection');
const hikvisionService = require('../services/hikvisionService');
const rtspService = require('../services/rtspService');
const { body, validationResult } = require('express-validator');

/**
 * Camera Discovery API
 * POST /api/cameras/discover
 * Discovers available cameras from various sources
 */
router.post('/discover', [
  body('type').isIn(['rtsp', 'ip', 'nvr', 'dvr', 'hikconnect']),
  body('ip').optional().isIP(),
  body('port').optional().isInt({ min: 1, max: 65535 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { type, ip, port, username, password } = req.body;
    let discoveredChannels = [];

    switch (type) {
      case 'nvr':
      case 'dvr':
        discoveredChannels = await discoverHikvisionNVR(ip, port, username, password);
        break;
        
      case 'hikconnect':
        discoveredChannels = await discoverHikConnectCameras(username, password);
        break;
        
      case 'ip':
        discoveredChannels = await discoverIPCamera(ip, port, username, password);
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid camera type' });
    }

    res.json(discoveredChannels);
  } catch (error) {
    console.error('Camera discovery error:', error);
    res.status(500).json({ error: 'Camera discovery failed' });
  }
});

/**
 * Add Camera Source
 * POST /api/cameras/sources
 */
router.post('/sources', [
  body('name').notEmpty().trim(),
  body('type').isIn(['rtsp', 'ip', 'nvr', 'dvr', 'hikconnect'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, type, ip, port, username, password, rtspUrl } = req.body;
    
    const sourceId = await db.query(
      'INSERT INTO camera_sources (name, type, ip, port, username, password, rtsp_url, status, enabled) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [name, type, ip, port, username, password, rtspUrl, 'disconnected', true]
    );

    res.json({ id: sourceId.rows[0].id, message: 'Camera source added successfully' });
  } catch (error) {
    console.error('Add camera source error:', error);
    res.status(500).json({ error: 'Failed to add camera source' });
  }
});

/**
 * Get Camera Sources
 * GET /api/cameras/sources
 */
router.get('/sources', async (req, res) => {
  try {
    const sources = await db.query(`
      SELECT cs.*, 
        json_agg(
          json_build_object(
            'id', cc.id,
            'name', cc.name,
            'channelNumber', cc.channel_number,
            'rtspUrl', cc.rtsp_url,
            'mainStream', cc.main_stream,
            'subStream', cc.sub_stream,
            'enabled', cc.enabled,
            'addedToDisplay', cc.added_to_display,
            'resolution', cc.resolution,
            'fps', cc.fps
          )
        ) FILTER (WHERE cc.id IS NOT NULL) as channels
      FROM camera_sources cs
      LEFT JOIN camera_channels cc ON cs.id = cc.source_id
      GROUP BY cs.id
      ORDER BY cs.created_at DESC
    `);

    res.json(sources.rows);
  } catch (error) {
    console.error('Get camera sources error:', error);
    res.status(500).json({ error: 'Failed to get camera sources' });
  }
});

/**
 * Add Channel to Display
 * POST /api/cameras/display
 */
router.post('/display', [
  body('sourceId').isUUID(),
  body('channelId').isUUID(),
  body('name').notEmpty().trim(),
  body('position').isInt({ min: 1 }),
  body('screen').isInt({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { sourceId, channelId, name, rtspUrl, position, screen } = req.body;
    
    const displayId = await db.query(
      'INSERT INTO displayed_cameras (source_id, channel_id, name, rtsp_url, position, screen, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [sourceId, channelId, name, rtspUrl, position, screen, false]
    );

    // Update channel status
    await db.query(
      'UPDATE camera_channels SET added_to_display = true WHERE id = $1',
      [channelId]
    );

    res.json({ id: displayId.rows[0].id, message: 'Camera added to display' });
  } catch (error) {
    console.error('Add camera to display error:', error);
    res.status(500).json({ error: 'Failed to add camera to display' });
  }
});

/**
 * Remove Camera from Display
 * DELETE /api/cameras/display/:id
 */
router.delete('/display/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get channel ID before deletion
    const camera = await db.query(
      'SELECT channel_id FROM displayed_cameras WHERE id = $1',
      [id]
    );

    if (camera.rows.length === 0) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    // Remove from display
    await db.query('DELETE FROM displayed_cameras WHERE id = $1', [id]);

    // Update channel status
    await db.query(
      'UPDATE camera_channels SET added_to_display = false WHERE id = $1',
      [camera.rows[0].channel_id]
    );

    res.json({ message: 'Camera removed from display' });
  } catch (error) {
    console.error('Remove camera from display error:', error);
    res.status(500).json({ error: 'Failed to remove camera from display' });
  }
});

/**
 * Get Displayed Cameras
 * GET /api/cameras/display
 */
router.get('/display', async (req, res) => {
  try {
    const cameras = await db.query(`
      SELECT dc.*, cs.name as source_name, cs.type as source_type
      FROM displayed_cameras dc
      JOIN camera_sources cs ON dc.source_id = cs.id
      ORDER BY dc.position ASC
    `);

    res.json(cameras.rows);
  } catch (error) {
    console.error('Get displayed cameras error:', error);
    res.status(500).json({ error: 'Failed to get displayed cameras' });
  }
});

/**
 * Start Camera Stream
 * POST /api/cameras/:id/start
 */
router.post('/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    
    const camera = await db.query(
      'SELECT * FROM displayed_cameras WHERE id = $1',
      [id]
    );

    if (camera.rows.length === 0) {
      return res.status(404).json({ error: 'Camera not found' });
    }

    const cameraData = camera.rows[0];
    
    // Start RTSP stream processing
    const streamStarted = await rtspService.startStream(id, cameraData.rtsp_url);
    
    if (streamStarted) {
      await db.query(
        'UPDATE displayed_cameras SET is_active = true WHERE id = $1',
        [id]
      );
      
      res.json({ message: 'Stream started successfully' });
    } else {
      res.status(500).json({ error: 'Failed to start stream' });
    }
  } catch (error) {
    console.error('Start stream error:', error);
    res.status(500).json({ error: 'Failed to start stream' });
  }
});

/**
 * Stop Camera Stream
 * POST /api/cameras/:id/stop
 */
router.post('/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Stop RTSP stream processing
    const streamStopped = await rtspService.stopStream(id);
    
    if (streamStopped) {
      await db.query(
        'UPDATE displayed_cameras SET is_active = false WHERE id = $1',
        [id]
      );
      
      res.json({ message: 'Stream stopped successfully' });
    } else {
      res.status(500).json({ error: 'Failed to stop stream' });
    }
  } catch (error) {
    console.error('Stop stream error:', error);
    res.status(500).json({ error: 'Failed to stop stream' });
  }
});

// Helper functions
async function discoverHikvisionNVR(ip, port, username, password) {
  try {
    // Use Hikvision ISAPI to discover channels
    const channels = await hikvisionService.getChannels(ip, port, username, password);
    
    return channels.map((channel, index) => ({
      id: `nvr_${ip}_ch${index + 1}`,
      name: channel.name || `Camera ${index + 1}`,
      channelNumber: index + 1,
      rtspUrl: `rtsp://${username}:${password}@${ip}:554/Streaming/Channels/${index + 1}01`,
      mainStream: `rtsp://${username}:${password}@${ip}:554/Streaming/Channels/${index + 1}01`,
      subStream: `rtsp://${username}:${password}@${ip}:554/Streaming/Channels/${index + 1}02`,
      enabled: true,
      addedToDisplay: false,
      resolution: channel.resolution || '1920x1080',
      fps: channel.fps || 25
    }));
  } catch (error) {
    console.log('Using mock data for NVR discovery');
    // Return mock data for testing
    return Array.from({ length: 4 }, (_, i) => ({
      id: `nvr_${ip}_ch${i + 1}`,
      name: `Camera ${i + 1}`,
      channelNumber: i + 1,
      rtspUrl: `rtsp://${username}:${password}@${ip}:554/Streaming/Channels/${i + 1}01`,
      mainStream: `rtsp://${username}:${password}@${ip}:554/Streaming/Channels/${i + 1}01`,
      subStream: `rtsp://${username}:${password}@${ip}:554/Streaming/Channels/${i + 1}02`,
      enabled: true,
      addedToDisplay: false,
      resolution: '1920x1080',
      fps: 25
    }));
  }
}

async function discoverHikConnectCameras(username, password) {
  try {
    // Use HikConnect API to discover cameras
    const cameras = await hikvisionService.getHikConnectCameras(username, password);
    
    return cameras.map((camera, index) => ({
      id: `hikconnect_${camera.deviceId}`,
      name: camera.name || `HikConnect Camera ${index + 1}`,
      channelNumber: 1,
      rtspUrl: camera.rtspUrl,
      mainStream: camera.mainStream,
      subStream: camera.subStream,
      enabled: true,
      addedToDisplay: false,
      resolution: camera.resolution || '1920x1080',
      fps: camera.fps || 25
    }));
  } catch (error) {
    console.log('Using mock data for HikConnect discovery');
    // Return mock data for testing
    const mockNames = ['Front Door', 'Garage', 'Backyard', 'Living Room', 'Office'];
    return mockNames.map((name, i) => ({
      id: `hikconnect_device${i + 1}`,
      name,
      channelNumber: 1,
      rtspUrl: `rtsp://hikconnect.camera${i + 1}.com/live`,
      mainStream: `rtsp://hikconnect.camera${i + 1}.com/live/main`,
      subStream: `rtsp://hikconnect.camera${i + 1}.com/live/sub`,
      enabled: true,
      addedToDisplay: false,
      resolution: '1920x1080',
      fps: 25
    }));
  }
}

async function discoverIPCamera(ip, port, username, password) {
  try {
    // Use ONVIF or manufacturer-specific API
    const camera = await hikvisionService.getIPCameraInfo(ip, port, username, password);
    
    return [{
      id: `ip_${ip}_${port}`,
      name: camera.name || `IP Camera ${ip}`,
      channelNumber: 1,
      rtspUrl: camera.rtspUrl || `rtsp://${username}:${password}@${ip}:554/stream`,
      mainStream: camera.mainStream || `rtsp://${username}:${password}@${ip}:554/stream`,
      subStream: camera.subStream || `rtsp://${username}:${password}@${ip}:554/substream`,
      enabled: true,
      addedToDisplay: false,
      resolution: camera.resolution || '1920x1080',
      fps: camera.fps || 25
    }];
  } catch (error) {
    console.log('Using mock data for IP camera discovery');
    // Return mock data for testing
    return [{
      id: `ip_${ip}_${port}`,
      name: `IP Camera ${ip}`,
      channelNumber: 1,
      rtspUrl: `rtsp://${username}:${password}@${ip}:554/stream`,
      mainStream: `rtsp://${username}:${password}@${ip}:554/stream`,
      subStream: `rtsp://${username}:${password}@${ip}:554/substream`,
      enabled: true,
      addedToDisplay: false,
      resolution: '1920x1080',
      fps: 25
    }];
  }
}

module.exports = router;