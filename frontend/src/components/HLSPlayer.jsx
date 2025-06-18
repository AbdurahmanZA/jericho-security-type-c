// HLS Player Component for RTSP Streaming
import React, { useEffect, useRef, useState } from 'react';

const HLSPlayer = ({ streamId, hlsUrl, width = 640, height = 480, className = '' }) => {
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        const video = videoRef.current;
        
        if (!video || !hlsUrl) return;

        setIsLoading(true);
        setHasError(false);

        const loadHLS = () => {
            // Check if HLS is natively supported (Safari)
            if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = hlsUrl;
                video.addEventListener('loadedmetadata', () => setIsLoading(false));
                video.addEventListener('error', () => setHasError(true));
            }
            // Use hls.js for browsers that don't support HLS natively
            else if (window.Hls && window.Hls.isSupported()) {
                initializeHlsJs(video);
            } else {
                // Load HLS.js from CDN if not available
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
                script.onload = () => {
                    if (window.Hls && window.Hls.isSupported()) {
                        initializeHlsJs(video);
                    } else {
                        setHasError(true);
                        console.error('HLS is not supported in this browser');
                    }
                };
                script.onerror = () => {
                    setHasError(true);
                    console.error('Failed to load HLS.js');
                };
                document.head.appendChild(script);
            }
        };

        const initializeHlsJs = (video) => {
            try {
                const hls = new window.Hls({
                    lowLatencyMode: true,
                    backBufferLength: 90,
                    maxBufferLength: 30,
                    maxMaxBufferLength: 600,
                    startLevel: -1,
                    debug: false
                });
                
                hls.loadSource(hlsUrl);
                hls.attachMedia(video);
                
                hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                    console.log(`🎥 HLS stream ${streamId} manifest loaded`);
                    setIsLoading(false);
                });
                
                hls.on(window.Hls.Events.ERROR, (event, data) => {
                    console.error(`❌ HLS error for ${streamId}:`, data);
                    
                    if (data.fatal) {
                        switch (data.type) {
                            case window.Hls.ErrorTypes.NETWORK_ERROR:
                                console.log('Network error - attempting to recover');
                                hls.startLoad();
                                break;
                            case window.Hls.ErrorTypes.MEDIA_ERROR:
                                console.log('Media error - attempting to recover');
                                hls.recoverMediaError();
                                break;
                            default:
                                setHasError(true);
                                hls.destroy();
                                break;
                        }
                    }
                });

                hls.on(window.Hls.Events.FRAG_LOADED, () => {
                    // Fragment loaded successfully
                });
                
                hlsRef.current = hls;
            } catch (error) {
                console.error(`❌ Error initializing HLS player for ${streamId}:`, error);
                setHasError(true);
            }
        };

        loadHLS();

        return () => {
            if (hlsRef.current) {
                try {
                    hlsRef.current.destroy();
                } catch (error) {
                    console.error('Error destroying HLS player:', error);
                }
            }
        };
    }, [hlsUrl, streamId]);

    const handleRetry = () => {
        setHasError(false);
        setIsLoading(true);
        // Trigger re-initialization by updating the component
        window.location.reload();
    };

    if (hasError) {
        return (
            <div className={`hls-player error ${className}`} style={{ 
                width: width, 
                height: height,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #ccc',
                borderRadius: '4px',
                backgroundColor: '#f5f5f5'
            }}>
                <div style={{ color: '#ff4444', fontSize: '16px', marginBottom: '10px' }}>
                    ❌ Stream Error
                </div>
                <div style={{ color: '#666', fontSize: '12px', marginBottom: '10px' }}>
                    Failed to load stream: {streamId}
                </div>
                <button 
                    onClick={handleRetry}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    🔄 Retry
                </button>
            </div>
        );
    }

    return (
        <div className={`hls-player ${className}`}>
            {isLoading && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: '#666',
                    fontSize: '14px'
                }}>
                    🔄 Loading stream...
                </div>
            )}
            <video
                ref={videoRef}
                width={width}
                height={height}
                controls
                autoPlay
                muted
                playsInline
                style={{
                    maxWidth: '100%',
                    height: 'auto',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    backgroundColor: '#000'
                }}
                onLoadedMetadata={() => setIsLoading(false)}
                onError={() => setHasError(true)}
            >
                Your browser does not support the video tag.
            </video>
            <div className="stream-info" style={{ 
                fontSize: '12px', 
                color: '#666', 
                marginTop: '4px',
                textAlign: 'center'
            }}>
                <span>📺 {streamId} | HLS/HTTP | 
                    <span style={{ color: '#00ff00' }}> ● LIVE</span>
                </span>
            </div>
        </div>
    );
};

export default HLSPlayer;