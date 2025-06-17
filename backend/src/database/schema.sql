-- Enhanced Camera Management Schema for JERICHO Security Type C

-- Camera Sources Table
-- Stores different types of camera sources (RTSP, IP, NVR, DVR, HikConnect)
CREATE TABLE IF NOT EXISTS camera_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('rtsp', 'ip', 'nvr', 'dvr', 'hikconnect')),
    ip INET,
    port INTEGER CHECK (port > 0 AND port <= 65535),
    username VARCHAR(255),
    password VARCHAR(255),
    rtsp_url TEXT,
    status VARCHAR(50) DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'connecting', 'error')),
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Camera Channels Table
-- Stores individual camera channels discovered from sources
CREATE TABLE IF NOT EXISTS camera_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES camera_sources(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    channel_number INTEGER NOT NULL,
    rtsp_url TEXT NOT NULL,
    main_stream TEXT,
    sub_stream TEXT,
    enabled BOOLEAN DEFAULT true,
    added_to_display BOOLEAN DEFAULT false,
    resolution VARCHAR(50) DEFAULT '1920x1080',
    fps INTEGER DEFAULT 25,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_id, channel_number)
);

-- Displayed Cameras Table
-- Tracks which cameras are currently displayed on the screen
CREATE TABLE IF NOT EXISTS displayed_cameras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES camera_sources(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES camera_channels(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    rtsp_url TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position > 0),
    screen INTEGER NOT NULL DEFAULT 1 CHECK (screen > 0),
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(position, screen)
);

-- Camera Layouts Table
-- Stores saved camera layouts and configurations
CREATE TABLE IF NOT EXISTS camera_layouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    layout_config JSONB NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Camera Events Table
-- Stores motion detection and other camera events
CREATE TABLE IF NOT EXISTS camera_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    camera_id UUID NOT NULL REFERENCES displayed_cameras(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB,
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('low', 'medium', 'high', 'critical', 'info')),
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Stream Sessions Table
-- Tracks active streaming sessions
CREATE TABLE IF NOT EXISTS stream_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    camera_id UUID NOT NULL REFERENCES displayed_cameras(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL UNIQUE,
    stream_type VARCHAR(50) DEFAULT 'hls' CHECK (stream_type IN ('hls', 'webrtc', 'rtsp')),
    quality VARCHAR(20) DEFAULT 'high' CHECK (quality IN ('low', 'medium', 'high', 'ultra')),
    client_ip INET,
    user_agent TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE
);

-- Indices for performance optimization
CREATE INDEX IF NOT EXISTS idx_camera_sources_type ON camera_sources(type);
CREATE INDEX IF NOT EXISTS idx_camera_sources_status ON camera_sources(status);
CREATE INDEX IF NOT EXISTS idx_camera_channels_source_id ON camera_channels(source_id);
CREATE INDEX IF NOT EXISTS idx_camera_channels_added_to_display ON camera_channels(added_to_display);
CREATE INDEX IF NOT EXISTS idx_displayed_cameras_screen ON displayed_cameras(screen);
CREATE INDEX IF NOT EXISTS idx_displayed_cameras_position ON displayed_cameras(position, screen);
CREATE INDEX IF NOT EXISTS idx_camera_events_camera_id ON camera_events(camera_id);
CREATE INDEX IF NOT EXISTS idx_camera_events_type ON camera_events(event_type);
CREATE INDEX IF NOT EXISTS idx_camera_events_created_at ON camera_events(created_at);
CREATE INDEX IF NOT EXISTS idx_stream_sessions_camera_id ON stream_sessions(camera_id);
CREATE INDEX IF NOT EXISTS idx_stream_sessions_session_id ON stream_sessions(session_id);

-- Update timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_camera_sources_updated_at BEFORE UPDATE ON camera_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_camera_channels_updated_at BEFORE UPDATE ON camera_channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_displayed_cameras_updated_at BEFORE UPDATE ON displayed_cameras
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_camera_layouts_updated_at BEFORE UPDATE ON camera_layouts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default camera layout
INSERT INTO camera_layouts (name, layout_config, is_default) 
VALUES (
    'Default 4-Camera Layout',
    '{
        "layout": 4,
        "screen": 1,
        "autoSave": true,
        "displaySettings": {
            "showLabels": true,
            "showStatus": true,
            "aspectRatio": "16:9"
        }
    }',
    true
) ON CONFLICT DO NOTHING;

-- Sample data for testing (can be removed in production)
INSERT INTO camera_sources (name, type, ip, port, username, status) 
VALUES 
    ('Demo RTSP Camera', 'rtsp', '192.168.1.100', 554, 'admin', 'disconnected'),
    ('Demo NVR System', 'nvr', '192.168.1.200', 80, 'admin', 'disconnected')
ON CONFLICT DO NOTHING;