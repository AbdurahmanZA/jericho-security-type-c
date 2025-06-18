// =============================================================================
// JERICHO SECURITY - PROVEN RTSP STREAMING SOLUTION
// Based on the most popular GitHub projects: node-rtsp-stream & HLS approaches
// =============================================================================

const WebSocket = require('ws');
const { spawn } = require('child_process');
const EventEmitter = require('events');
const express = require('express');
const path = require('path');
const fs = require('fs');

// =============================================================================
// APPROACH 1: JSMpeg + WebSocket Streaming (Most Reliable)
// Based on kyriesent/node-rtsp-stream (battle-tested)
// =============================================================================

class RTSPtoJSMpeg extends EventEmitter {
    constructor(options) {
        super();
        this.name = options.name || 'stream';
        this.rtspUrl = options.rtspUrl;
        this.wsPort = options.wsPort || 9999;
        this.width = options.width;
        this.height = options.height;
        this.ffmpegPath = options.ffmpegPath || 'ffmpeg';
        
        this.stream = null;
        this.wsServer = null;
        this.isRunning = false;
        
        // JSMpeg magic bytes
        this.STREAM_MAGIC_BYTES = "jsmp";
    }

    start() {
        if (this.isRunning) return;
        
        this.startFFmpegStream();
        this.startWebSocketServer();
        this.isRunning = true;
        
        console.log(`🎥 JSMpeg stream "${this.name}" started on ws://localhost:${this.wsPort}`);
    }

    stop() {
        if (!this.isRunning) return;
        
        if (this.wsServer) {
            this.wsServer.close();
        }
        if (this.stream) {
            this.stream.kill('SIGTERM');
        }
        this.isRunning = false;
        
        console.log(`🛑 JSMpeg stream "${this.name}" stopped`);
    }

    startFFmpegStream() {
        // FFmpeg command to convert RTSP to MPEG1 for JSMpeg
        const ffmpegArgs = [
            '-rtsp_transport', 'tcp',
            '-i', this.rtspUrl,
            '-f', 'mpegts',
            '-codec:v', 'mpeg1video',
            '-s', '640x480', // Default resolution
            '-b:v', '1000k',  // Bitrate
            '-r', '25',       // Frame rate
            '-'
        ];

        this.stream = spawn(this.ffmpegPath, ffmpegArgs, {
            detached: false,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        this.stream.stdout.on('data', (data) => {
            this.emit('streamData', data);
        });

        this.stream.stderr.on('data', (data) => {
            const output = data.toString();
            
            // Extract video dimensions
            const sizeMatch = output.match(/(\d+)x(\d+)/);
            if (sizeMatch && !this.width && !this.height) {
                this.width = parseInt(sizeMatch[1]);
                this.height = parseInt(sizeMatch[2]);
            }
            
            // Log FFmpeg output for debugging
            if (output.includes('frame=')) {
                // Stream is working
            } else {
                console.log(`FFmpeg [${this.name}]:`, output.trim());
            }
        });

        this.stream.on('exit', (code, signal) => {
            console.log(`❌ FFmpeg stream "${this.name}" exited with code ${code}, signal ${signal}`);
            this.emit('streamExit', code, signal);
            
            // Auto-restart on unexpected exit
            if (code !== 0 && this.isRunning) {
                console.log(`🔄 Restarting stream "${this.name}" in 5 seconds...`);
                setTimeout(() => {
                    if (this.isRunning) {
                        this.startFFmpegStream();
                    }
                }, 5000);
            }
        });
    }

    startWebSocketServer() {
        this.wsServer = new WebSocket.Server({ port: this.wsPort });

        this.wsServer.on('connection', (socket, request) => {
            console.log(`🔌 New client connected to "${this.name}" (${this.wsServer.clients.size} total)`);
            
            // Send stream header to new client
            this.sendStreamHeader(socket);
            
            socket.on('close', () => {
                console.log(`🔌 Client disconnected from "${this.name}" (${this.wsServer.clients.size} total)`);
            });

            socket.on('error', (error) => {
                console.error(`WebSocket error for "${this.name}":`, error);
            });
        });

        // Broadcast stream data to all connected clients
        this.on('streamData', (data) => {
            this.broadcast(data);
        });
    }

    sendStreamHeader(socket) {
        // Send magic bytes and video dimensions to client
        // Format: magic[4] + width[2] + height[2] = 8 bytes total
        const header = Buffer.alloc(8);
        header.write(this.STREAM_MAGIC_BYTES, 0, 4);
        header.writeUInt16BE(this.width || 640, 4);
        header.writeUInt16BE(this.height || 480, 6);
        
        socket.send(header, { binary: true });
    }

    broadcast(data) {
        if (!this.wsServer) return;
        
        this.wsServer.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data, { binary: true });
            }
        });
    }
}

// =============================================================================
// APPROACH 2: HLS Streaming (Universal Player Support)
// Based on proven HLS streaming patterns
// =============================================================================

class RTSPtoHLS extends EventEmitter {
    constructor(options) {
        super();
        this.name = options.name || 'hls-stream';
        this.rtspUrl = options.rtspUrl;
        this.outputDir = options.outputDir || './hls';
        this.ffmpegPath = options.ffmpegPath || 'ffmpeg';
        this.segmentDuration = options.segmentDuration || 2;
        this.playlistSize = options.playlistSize || 10;
        
        this.stream = null;
        this.isRunning = false;
        
        // Ensure output directory exists
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
    }

    start() {
        if (this.isRunning) return;
        
        this.startFFmpegHLS();
        this.isRunning = true;
        
        console.log(`🎥 HLS stream "${this.name}" started - playlist: ${this.getPlaylistPath()}`);
    }

    stop() {
        if (!this.isRunning) return;
        
        if (this.stream) {
            this.stream.kill('SIGTERM');
        }
        this.isRunning = false;
        
        console.log(`🛑 HLS stream "${this.name}" stopped`);
    }

    getPlaylistPath() {
        return path.join(this.outputDir, `${this.name}.m3u8`);
    }

    startFFmpegHLS() {
        const playlistPath = this.getPlaylistPath();
        const segmentPath = path.join(this.outputDir, `${this.name}_%03d.ts`);

        // FFmpeg command for HLS conversion
        const ffmpegArgs = [
            '-rtsp_transport', 'tcp',
            '-i', this.rtspUrl,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',
            '-c:a', 'aac',
            '-b:v', '1000k',
            '-b:a', '128k',
            '-f', 'hls',
            '-hls_time', this.segmentDuration.toString(),
            '-hls_list_size', this.playlistSize.toString(),
            '-hls_flags', 'delete_segments',
            '-hls_segment_filename', segmentPath,
            playlistPath
        ];

        this.stream = spawn(this.ffmpegPath, ffmpegArgs, {
            detached: false,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        this.stream.stderr.on('data', (data) => {
            const output = data.toString();
            if (output.includes('frame=')) {
                // Stream is working
            } else {
                console.log(`FFmpeg HLS [${this.name}]:`, output.trim());
            }
        });

        this.stream.on('exit', (code, signal) => {
            console.log(`❌ FFmpeg HLS stream "${this.name}" exited with code ${code}, signal ${signal}`);
            this.emit('streamExit', code, signal);
            
            // Auto-restart on unexpected exit
            if (code !== 0 && this.isRunning) {
                console.log(`🔄 Restarting HLS stream "${this.name}" in 5 seconds...`);
                setTimeout(() => {
                    if (this.isRunning) {
                        this.startFFmpegHLS();
                    }
                }, 5000);
            }
        });
    }
}

// =============================================================================
// STREAM MANAGER - Manages multiple RTSP streams
// =============================================================================

class JerichoStreamManager {
    constructor(options = {}) {
        this.streams = new Map();
        this.hlsStreams = new Map();
        this.httpServer = null;
        this.httpPort = options.httpPort || 8080;
        this.baseHLSDir = options.hlsDir || './public/hls';
        
        // Ensure HLS directory exists
        if (!fs.existsSync(this.baseHLSDir)) {
            fs.mkdirSync(this.baseHLSDir, { recursive: true });
        }
    }

    addStream(streamId, rtspUrl, options = {}) {
        // Add JSMpeg stream
        const jsmpegStream = new RTSPtoJSMpeg({
            name: streamId,
            rtspUrl: rtspUrl,
            wsPort: options.wsPort || (9999 + this.streams.size),
            ...options
        });

        // Add HLS stream
        const hlsStream = new RTSPtoHLS({
            name: streamId,
            rtspUrl: rtspUrl,
            outputDir: path.join(this.baseHLSDir, streamId),
            ...options
        });

        this.streams.set(streamId, jsmpegStream);
        this.hlsStreams.set(streamId, hlsStream);

        console.log(`✅ Stream "${streamId}" added with RTSP: ${rtspUrl}`);
    }

    startStream(streamId) {
        const jsmpegStream = this.streams.get(streamId);
        const hlsStream = this.hlsStreams.get(streamId);

        if (jsmpegStream && hlsStream) {
            jsmpegStream.start();
            hlsStream.start();
            return true;
        }
        return false;
    }

    stopStream(streamId) {
        const jsmpegStream = this.streams.get(streamId);
        const hlsStream = this.hlsStreams.get(streamId);

        if (jsmpegStream && hlsStream) {
            jsmpegStream.stop();
            hlsStream.stop();
            return true;
        }
        return false;
    }

    removeStream(streamId) {
        this.stopStream(streamId);
        this.streams.delete(streamId);
        this.hlsStreams.delete(streamId);
        console.log(`🗑️ Stream "${streamId}" removed`);
    }

    startAllStreams() {
        for (const streamId of this.streams.keys()) {
            this.startStream(streamId);
        }
    }

    stopAllStreams() {
        for (const streamId of this.streams.keys()) {
            this.stopStream(streamId);
        }
    }

    getStreamInfo(streamId) {
        const jsmpegStream = this.streams.get(streamId);
        const hlsStream = this.hlsStreams.get(streamId);

        if (!jsmpegStream || !hlsStream) return null;

        return {
            id: streamId,
            jsmpeg: {
                wsUrl: `ws://localhost:${jsmpegStream.wsPort}`,
                isRunning: jsmpegStream.isRunning
            },
            hls: {
                playlistUrl: `/hls/${streamId}/${streamId}.m3u8`,
                isRunning: hlsStream.isRunning
            }
        };
    }

    getAllStreamsInfo() {
        const info = {};
        for (const streamId of this.streams.keys()) {
            info[streamId] = this.getStreamInfo(streamId);
        }
        return info;
    }

    // Start HTTP server for HLS streaming
    startHTTPServer() {
        const app = express();
        
        // Serve HLS files
        app.use('/hls', express.static(this.baseHLSDir));
        
        // API endpoint for stream info
        app.get('/api/streams', (req, res) => {
            res.json(this.getAllStreamsInfo());
        });

        // API endpoint for individual stream info
        app.get('/api/streams/:id', (req, res) => {
            const info = this.getStreamInfo(req.params.id);
            if (info) {
                res.json(info);
            } else {
                res.status(404).json({ error: 'Stream not found' });
            }
        });

        this.httpServer = app.listen(this.httpPort, () => {
            console.log(`🌐 HTTP server started on port ${this.httpPort}`);
            console.log(`📺 HLS streams available at: http://localhost:${this.httpPort}/hls/`);
        });
    }

    stopHTTPServer() {
        if (this.httpServer) {
            this.httpServer.close();
            console.log('🛑 HTTP server stopped');
        }
    }
}

// Export classes for use in other modules
module.exports = {
    RTSPtoJSMpeg,
    RTSPtoHLS,
    JerichoStreamManager
};