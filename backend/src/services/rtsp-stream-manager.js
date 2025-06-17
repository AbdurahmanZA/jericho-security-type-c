/**
 * RTSP Stream Manager
 * Manages multiple RTSP streams with FFmpeg conversion to HLS
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { EventEmitter } from 'events';

export class RTSPStreamManager extends EventEmitter {
  constructor(config, logger, hikvisionAPI = null) {
    super();
    this.config = config;
    this.logger = logger;
    this.hikvisionAPI = hikvisionAPI;
    
    this.streams = new Map(); // streamId -> stream object
    this.activeConnections = new Map(); // streamId -> Set of websocket clients
    this.reconnectAttempts = new Map(); // streamId -> attempt count
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000; // 5 seconds
    
    // Stream quality presets
    this.qualityPresets = {
      low: {
        video: '-vf scale=640:480 -c:v libx264 -preset fast -crf 28 -maxrate 500k -bufsize 1000k',
        audio: '-c:a aac -b:a 64k',
      },
      medium: {
        video: '-vf scale=1280:720 -c:v libx264 -preset medium -crf 25 -maxrate 1500k -bufsize 3000k',
        audio: '-c:a aac -b:a 128k',
      },
      high: {
        video: '-vf scale=1920:1080 -c:v libx264 -preset slow -crf 22 -maxrate 4000k -bufsize 8000k',
        audio: '-c:a aac -b:a 192k',
      },
    };
  }

  async initialize() {
    // Ensure HLS directory exists
    if (!fs.existsSync(this.config.hlsPath)) {
      fs.mkdirSync(this.config.hlsPath, { recursive: true });
    }
    
    // Clean up old HLS files on startup
    this.cleanupHLSFiles();
    
    // Set up periodic cleanup
    setInterval(() => this.cleanupHLSFiles(), 60000); // Every minute
    
    this.logger.info('✅ RTSP Stream Manager initialized');
  }

  /**
   * Start streaming from an RTSP URL
   */
  async startStream(streamId, rtspUrl, options = {}) {
    try {
      if (this.streams.has(streamId)) {
        this.logger.warn(`Stream ${streamId} is already running`);
        return this.streams.get(streamId);
      }

      if (this.streams.size >= this.config.maxStreams) {
        throw new Error(`Maximum number of streams (${this.config.maxStreams}) reached`);
      }

      const quality = options.quality || this.config.streamQuality || 'medium';
      const preset = this.qualityPresets[quality];
      
      if (!preset) {
        throw new Error(`Invalid quality preset: ${quality}`);
      }

      const hlsDir = path.join(this.config.hlsPath, streamId);
      const hlsPlaylist = path.join(hlsDir, 'playlist.m3u8');
      
      // Create stream directory
      if (!fs.existsSync(hlsDir)) {
        fs.mkdirSync(hlsDir, { recursive: true });
      }

      // FFmpeg command for RTSP to HLS conversion
      const ffmpegArgs = [
        '-i', rtspUrl,
        '-fflags', '+genpts',
        '-avoid_negative_ts', 'make_zero',
        '-use_wallclock_as_timestamps', '1',
        ...preset.video.split(' '),
        ...preset.audio.split(' '),
        '-f', 'hls',
        '-hls_time', '6',
        '-hls_list_size', '10',
        '-hls_flags', 'delete_segments+append_list',
        '-hls_segment_filename', path.join(hlsDir, 'segment_%03d.ts'),
        hlsPlaylist
      ];

      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const stream = {
        id: streamId,
        rtspUrl,
        hlsPlaylist,
        hlsDir,
        process: ffmpegProcess,
        status: 'starting',
        startTime: Date.now(),
        lastFrame: Date.now(),
        quality,
        options,
        stats: {
          frames: 0,
          errors: 0,
          restarts: 0,
        },
      };

      this.streams.set(streamId, stream);
      this.reconnectAttempts.set(streamId, 0);

      // Handle FFmpeg output
      ffmpegProcess.stdout.on('data', (data) => {
        // FFmpeg outputs to stderr, but we'll capture any stdout
        this.logger.debug(`FFmpeg stdout [${streamId}]:`, data.toString());
      });

      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        
        // Parse FFmpeg output for useful information
        if (output.includes('frame=')) {
          stream.lastFrame = Date.now();
          stream.stats.frames++;
          
          // Extract frame info
          const frameMatch = output.match(/frame=\s*(\d+)/);
          if (frameMatch) {
            stream.currentFrame = parseInt(frameMatch[1]);
          }
        }
        
        if (output.includes('error') || output.includes('Error')) {
          stream.stats.errors++;
          this.logger.warn(`FFmpeg error [${streamId}]:`, output);
        }
        
        // Log first few lines to help with debugging
        if (stream.stats.frames < 10) {
          this.logger.debug(`FFmpeg [${streamId}]:`, output);
        }
      });

      ffmpegProcess.on('close', (code) => {
        this.logger.warn(`FFmpeg process [${streamId}] exited with code ${code}`);
        stream.status = 'stopped';
        
        if (code !== 0 && this.streams.has(streamId)) {
          // Attempt to reconnect if not manually stopped
          this.handleStreamError(streamId, `FFmpeg exited with code ${code}`);
        }
      });

      ffmpegProcess.on('error', (error) => {
        this.logger.error(`FFmpeg process error [${streamId}]:`, error);
        this.handleStreamError(streamId, error.message);
      });

      // Wait a moment for the stream to start
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // Check if playlist was created
      if (fs.existsSync(hlsPlaylist)) {
        stream.status = 'running';
        this.logger.info(`📺 Stream ${streamId} started successfully`);
        this.notifyClients(streamId, 'stream_started', { streamId, status: 'running' });
      } else {
        stream.status = 'failed';
        throw new Error('Failed to create HLS playlist');
      }

      return stream;

    } catch (error) {
      this.logger.error(`Failed to start stream ${streamId}:`, error);
      this.streams.delete(streamId);
      throw error;
    }
  }

  /**
   * Stop a running stream
   */
  async stopStream(streamId) {
    const stream = this.streams.get(streamId);
    
    if (!stream) {
      this.logger.warn(`Stream ${streamId} not found`);
      return false;
    }

    try {
      stream.status = 'stopping';
      
      // Kill FFmpeg process
      if (stream.process && !stream.process.killed) {
        stream.process.kill('SIGTERM');
        
        // Force kill after 5 seconds
        setTimeout(() => {
          if (!stream.process.killed) {
            stream.process.kill('SIGKILL');
          }
        }, 5000);
      }

      // Clean up stream files
      if (fs.existsSync(stream.hlsDir)) {
        fs.rmSync(stream.hlsDir, { recursive: true, force: true });
      }

      this.streams.delete(streamId);
      this.reconnectAttempts.delete(streamId);
      this.activeConnections.delete(streamId);
      
      this.logger.info(`🛑 Stream ${streamId} stopped`);
      this.notifyClients(streamId, 'stream_stopped', { streamId, status: 'stopped' });
      
      return true;
      
    } catch (error) {
      this.logger.error(`Error stopping stream ${streamId}:`, error);
      return false;
    }
  }

  /**
   * Get stream information
   */
  getStream(streamId) {
    const stream = this.streams.get(streamId);
    
    if (!stream) {
      return null;
    }

    return {
      id: stream.id,
      status: stream.status,
      quality: stream.quality,
      startTime: stream.startTime,
      lastFrame: stream.lastFrame,
      uptime: Date.now() - stream.startTime,
      playlistUrl: `/hls/${streamId}/playlist.m3u8`,
      stats: stream.stats,
      currentFrame: stream.currentFrame || 0,
    };
  }

  /**
   * Get all active streams
   */
  getAllStreams() {
    const streams = [];
    
    for (const [streamId] of this.streams) {
      streams.push(this.getStream(streamId));
    }
    
    return streams;
  }

  /**
   * Handle stream errors and reconnection
   */
  async handleStreamError(streamId, error) {
    const stream = this.streams.get(streamId);
    
    if (!stream) {
      return;
    }

    const attempts = this.reconnectAttempts.get(streamId) || 0;
    
    if (attempts >= this.maxReconnectAttempts) {
      this.logger.error(`Stream ${streamId} failed permanently after ${attempts} attempts`);
      stream.status = 'failed';
      this.notifyClients(streamId, 'stream_failed', { 
        streamId, 
        error: 'Maximum reconnection attempts reached' 
      });
      return;
    }

    this.reconnectAttempts.set(streamId, attempts + 1);
    stream.status = 'reconnecting';
    stream.stats.restarts++;
    
    this.logger.warn(`Stream ${streamId} error: ${error}. Reconnecting in ${this.reconnectDelay}ms (attempt ${attempts + 1}/${this.maxReconnectAttempts})`);
    
    this.notifyClients(streamId, 'stream_reconnecting', { 
      streamId, 
      attempt: attempts + 1, 
      maxAttempts: this.maxReconnectAttempts 
    });

    setTimeout(async () => {
      try {
        // Stop current stream
        await this.stopStream(streamId);
        
        // Restart with same parameters
        await this.startStream(streamId, stream.rtspUrl, stream.options);
        
        // Reset reconnect attempts on successful restart
        this.reconnectAttempts.set(streamId, 0);
        
      } catch (reconnectError) {
        this.logger.error(`Failed to reconnect stream ${streamId}:`, reconnectError);
        this.handleStreamError(streamId, reconnectError.message);
      }
    }, this.reconnectDelay);
  }

  /**
   * Add WebSocket client for stream updates
   */
  addWebSocketClient(ws, streamId) {
    if (!this.activeConnections.has(streamId)) {
      this.activeConnections.set(streamId, new Set());
    }
    
    this.activeConnections.get(streamId).add(ws);
    
    // Send current stream status
    const stream = this.getStream(streamId);
    if (stream) {
      ws.send(JSON.stringify({
        type: 'stream_status',
        data: stream,
      }));
    }
  }

  /**
   * Remove WebSocket client
   */
  removeWebSocketClient(ws) {
    for (const [streamId, clients] of this.activeConnections) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.activeConnections.delete(streamId);
      }
    }
  }

  /**
   * Notify WebSocket clients about stream events
   */
  notifyClients(streamId, eventType, data) {
    const clients = this.activeConnections.get(streamId);
    
    if (!clients || clients.size === 0) {
      return;
    }

    const message = JSON.stringify({
      type: eventType,
      data,
      timestamp: Date.now(),
    });

    clients.forEach((ws) => {
      try {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(message);
        }
      } catch (error) {
        this.logger.warn('Failed to send WebSocket message:', error);
        clients.delete(ws);
      }
    });
  }

  /**
   * Clean up old HLS files
   */
  cleanupHLSFiles() {
    try {
      if (!fs.existsSync(this.config.hlsPath)) {
        return;
      }

      const streamDirs = fs.readdirSync(this.config.hlsPath);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      streamDirs.forEach((dir) => {
        const streamDir = path.join(this.config.hlsPath, dir);
        
        if (!fs.statSync(streamDir).isDirectory()) {
          return;
        }

        // If stream is not active, clean up old files
        if (!this.streams.has(dir)) {
          const files = fs.readdirSync(streamDir);
          
          files.forEach((file) => {
            const filePath = path.join(streamDir, file);
            const stats = fs.statSync(filePath);
            
            if (now - stats.mtime.getTime() > maxAge) {
              fs.unlinkSync(filePath);
            }
          });
          
          // Remove empty directories
          if (fs.readdirSync(streamDir).length === 0) {
            fs.rmdirSync(streamDir);
          }
        }
      });
      
    } catch (error) {
      this.logger.warn('Error cleaning up HLS files:', error);
    }
  }

  /**
   * Get stream statistics
   */
  getStreamStats() {
    const stats = {
      totalStreams: this.streams.size,
      maxStreams: this.config.maxStreams,
      activeConnections: 0,
      runningStreams: 0,
      failedStreams: 0,
      streams: [],
    };

    for (const [streamId, stream] of this.streams) {
      const streamInfo = this.getStream(streamId);
      stats.streams.push(streamInfo);
      
      if (stream.status === 'running') {
        stats.runningStreams++;
      } else if (stream.status === 'failed') {
        stats.failedStreams++;
      }
      
      const connections = this.activeConnections.get(streamId);
      if (connections) {
        stats.activeConnections += connections.size;
      }
    }

    return stats;
  }

  /**
   * Stop all streams
   */
  async stop() {
    this.logger.info('🛑 Stopping all streams...');
    
    const stopPromises = [];
    for (const [streamId] of this.streams) {
      stopPromises.push(this.stopStream(streamId));
    }
    
    await Promise.all(stopPromises);
    this.logger.info('✅ All streams stopped');
  }
}