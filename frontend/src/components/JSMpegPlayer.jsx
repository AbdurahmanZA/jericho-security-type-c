// JSMpeg Player Component for RTSP Streaming
import React, { useEffect, useRef } from 'react';

const JSMpegPlayer = ({ streamId, wsUrl, width = 640, height = 480, className = '' }) => {
    const canvasRef = useRef(null);
    const playerRef = useRef(null);

    useEffect(() => {
        // Load JSMpeg dynamically if not already loaded
        const loadJSMpeg = () => {
            if (window.JSMpeg && canvasRef.current) {
                initializePlayer();
            } else if (!window.JSMpeg) {
                // Load JSMpeg from CDN if not available
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/jsmpeg@0.6.0/dist/jsmpeg.min.js';
                script.onload = () => {
                    if (canvasRef.current) {
                        initializePlayer();
                    }
                };
                document.head.appendChild(script);
            }
        };

        const initializePlayer = () => {
            try {
                playerRef.current = new window.JSMpeg.Player(wsUrl, {
                    canvas: canvasRef.current,
                    autoplay: true,
                    audio: false,
                    loop: true,
                    onPlay: () => {
                        console.log(`🎥 JSMpeg stream ${streamId} started playing`);
                    },
                    onEnded: () => {
                        console.log(`🛑 JSMpeg stream ${streamId} ended`);
                    },
                    onStalled: () => {
                        console.warn(`⚠️ JSMpeg stream ${streamId} stalled`);
                    }
                });
            } catch (error) {
                console.error(`❌ Error initializing JSMpeg player for ${streamId}:`, error);
            }
        };

        loadJSMpeg();

        return () => {
            if (playerRef.current) {
                try {
                    playerRef.current.destroy();
                } catch (error) {
                    console.error('Error destroying JSMpeg player:', error);
                }
            }
        };
    }, [wsUrl, streamId]);

    return (
        <div className={`jsmpeg-player ${className}`}>
            <canvas
                ref={canvasRef}
                width={width}
                height={height}
                style={{
                    maxWidth: '100%',
                    height: 'auto',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    backgroundColor: '#000'
                }}
            />
            <div className="stream-info" style={{ 
                fontSize: '12px', 
                color: '#666', 
                marginTop: '4px',
                textAlign: 'center'
            }}>
                <span>📡 {streamId} | JSMpeg/WebSocket | 
                    <span style={{ color: '#00ff00' }}> ● LIVE</span>
                </span>
            </div>
        </div>
    );
};

export default JSMpegPlayer;