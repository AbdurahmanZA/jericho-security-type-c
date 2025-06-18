// Camera Grid Component with RTSP Streaming Support
import React, { useState, useEffect } from 'react';
import JSMpegPlayer from './JSMpegPlayer';
import HLSPlayer from './HLSPlayer';
import './CameraGrid.css';

const CameraGrid = () => {
    const [streams, setStreams] = useState({});
    const [streamingMode, setStreamingMode] = useState('jsmpeg'); // 'jsmpeg' or 'hls'
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchStreams();
        
        // Refresh streams every 30 seconds
        const interval = setInterval(fetchStreams, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchStreams = async () => {
        try {
            setError(null);
            const response = await fetch('/api/streams');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const streamsData = await response.json();
            setStreams(streamsData);
            setIsLoading(false);
        } catch (error) {
            console.error('Error fetching streams:', error);
            setError('Failed to fetch streams');
            setIsLoading(false);
        }
    };

    const addTestStream = async () => {
        try {
            const response = await fetch('/api/cameras/test-stream/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    rtspUrl: 'rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mov'
                })
            });

            if (response.ok) {
                fetchStreams();
            } else {
                console.error('Failed to add test stream');
            }
        } catch (error) {
            console.error('Error adding test stream:', error);
        }
    };

    const removeStream = async (streamId) => {
        try {
            const response = await fetch(`/api/cameras/${streamId}/stream`, {
                method: 'DELETE'
            });

            if (response.ok) {
                fetchStreams();
            } else {
                console.error('Failed to remove stream');
            }
        } catch (error) {
            console.error('Error removing stream:', error);
        }
    };

    const renderStream = (streamId, streamInfo) => {
        const commonProps = {
            streamId,
            width: 320,
            height: 240,
            className: 'stream-player'
        };

        if (streamingMode === 'jsmpeg') {
            // Convert localhost to current hostname for WebSocket URL
            const wsUrl = streamInfo.jsmpeg.wsUrl.replace('localhost', window.location.hostname);
            
            return (
                <JSMpegPlayer
                    key={`jsmpeg-${streamId}`}
                    {...commonProps}
                    wsUrl={wsUrl}
                />
            );
        } else {
            // Construct full HLS URL
            const hlsUrl = `${window.location.protocol}//${window.location.host}${streamInfo.hls.playlistUrl}`;
            
            return (
                <HLSPlayer
                    key={`hls-${streamId}`}
                    {...commonProps}
                    hlsUrl={hlsUrl}
                />
            );
        }
    };

    const getStreamStatus = (streamInfo) => {
        const jsmpegStatus = streamInfo.jsmpeg.isRunning;
        const hlsStatus = streamInfo.hls.isRunning;
        
        if (jsmpegStatus && hlsStatus) {
            return { status: 'running', color: '#00ff00', text: '● ACTIVE' };
        } else if (jsmpegStatus || hlsStatus) {
            return { status: 'partial', color: '#ffaa00', text: '◐ PARTIAL' };
        } else {
            return { status: 'stopped', color: '#ff4444', text: '● STOPPED' };
        }
    };

    if (isLoading) {
        return (
            <div className="camera-grid loading">
                <div className="loading-spinner">
                    <div className="spinner"></div>
                    <p>Loading camera streams...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="camera-grid error">
                <div className="error-message">
                    <h3>❌ Error</h3>
                    <p>{error}</p>
                    <button onClick={fetchStreams} className="btn btn-primary">
                        🔄 Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="camera-grid">
            <div className="controls-panel">
                <div className="streaming-controls">
                    <h3>📺 Streaming Mode</h3>
                    <div className="mode-buttons">
                        <button
                            onClick={() => setStreamingMode('jsmpeg')}
                            className={`btn ${streamingMode === 'jsmpeg' ? 'btn-active' : 'btn-secondary'}`}
                        >
                            ⚡ JSMpeg (Low Latency)
                        </button>
                        <button
                            onClick={() => setStreamingMode('hls')}
                            className={`btn ${streamingMode === 'hls' ? 'btn-active' : 'btn-secondary'}`}
                        >
                            🌐 HLS (Universal)
                        </button>
                    </div>
                </div>

                <div className="stream-controls">
                    <h3>🎛️ Stream Controls</h3>
                    <div className="control-buttons">
                        <button onClick={fetchStreams} className="btn btn-primary">
                            🔄 Refresh Streams
                        </button>
                        <button onClick={addTestStream} className="btn btn-success">
                            ➕ Add Test Stream
                        </button>
                    </div>
                </div>

                <div className="stream-info">
                    <h3>📊 Stream Status</h3>
                    <p>Total Streams: <strong>{Object.keys(streams).length}</strong></p>
                    <p>Active Mode: <strong>{streamingMode.toUpperCase()}</strong></p>
                </div>
            </div>

            <div className="streams-container">
                {Object.keys(streams).length === 0 ? (
                    <div className="no-streams">
                        <h3>📹 No Active Streams</h3>
                        <p>Add cameras or start test streams to begin monitoring.</p>
                        <button onClick={addTestStream} className="btn btn-success">
                            ➕ Add Test Stream
                        </button>
                    </div>
                ) : (
                    <div className="streams-grid">
                        {Object.entries(streams).map(([streamId, streamInfo]) => {
                            const status = getStreamStatus(streamInfo);
                            
                            return (
                                <div key={streamId} className="stream-container">
                                    <div className="stream-header">
                                        <h4>📷 {streamId}</h4>
                                        <div className="stream-actions">
                                            <span 
                                                className="status-indicator"
                                                style={{ color: status.color }}
                                            >
                                                {status.text}
                                            </span>
                                            <button
                                                onClick={() => removeStream(streamId)}
                                                className="btn btn-danger btn-sm"
                                                title="Remove Stream"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div className="stream-player-container">
                                        {renderStream(streamId, streamInfo)}
                                    </div>
                                    
                                    <div className="stream-details">
                                        <div className="protocol-status">
                                            <span className={`protocol-indicator ${streamInfo.jsmpeg.isRunning ? 'active' : 'inactive'}`}>
                                                JSMpeg: {streamInfo.jsmpeg.isRunning ? '🟢' : '🔴'}
                                            </span>
                                            <span className={`protocol-indicator ${streamInfo.hls.isRunning ? 'active' : 'inactive'}`}>
                                                HLS: {streamInfo.hls.isRunning ? '🟢' : '🔴'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CameraGrid;