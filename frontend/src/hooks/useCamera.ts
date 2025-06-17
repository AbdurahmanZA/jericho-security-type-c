import { useState, useEffect, useCallback } from 'react';

// Types for camera management
export interface CameraSource {
  id: string;
  name: string;
  type: 'rtsp' | 'ip' | 'nvr' | 'dvr' | 'hikconnect';
  ip?: string;
  port?: number;
  username?: string;
  password?: string;
  rtspUrl?: string;
  channels?: CameraChannel[];
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  enabled: boolean;
}

export interface CameraChannel {
  id: string;
  name: string;
  channelNumber: number;
  rtspUrl: string;
  mainStream: string;
  subStream: string;
  enabled: boolean;
  addedToDisplay: boolean;
  resolution: string;
  fps: number;
}

export interface DisplayedCamera {
  id: string;
  sourceId: string;
  channelId: string;
  name: string;
  rtspUrl: string;
  position: number;
  screen: number;
  isActive: boolean;
}

export interface CameraLayout {
  id: string;
  name: string;
  layoutConfig: {
    layout: number;
    screen: number;
    autoSave: boolean;
    displaySettings: {
      showLabels: boolean;
      showStatus: boolean;
      aspectRatio: string;
    };
  };
  isDefault: boolean;
}

// Custom hook for camera management
export const useCamera = () => {
  const [cameraSources, setCameraSources] = useState<CameraSource[]>([]);
  const [displayedCameras, setDisplayedCameras] = useState<DisplayedCamera[]>([]);
  const [currentLayout, setCurrentLayout] = useState(4);
  const [currentScreen, setCurrentScreen] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load camera sources from API
  const loadCameraSources = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/cameras/sources');
      if (response.ok) {
        const sources = await response.json();
        setCameraSources(sources);
      } else {
        throw new Error('Failed to load camera sources');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load displayed cameras from API
  const loadDisplayedCameras = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/cameras/display');
      if (response.ok) {
        const cameras = await response.json();
        setDisplayedCameras(cameras);
      } else {
        throw new Error('Failed to load displayed cameras');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Add camera source
  const addCameraSource = useCallback(async (sourceData: Omit<CameraSource, 'id' | 'channels' | 'status' | 'enabled'>) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/cameras/sources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sourceData),
      });

      if (response.ok) {
        await loadCameraSources(); // Refresh sources
        return true;
      } else {
        throw new Error('Failed to add camera source');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [loadCameraSources]);

  // Discover camera channels
  const discoverChannels = useCallback(async (sourceData: {
    type: string;
    ip?: string;
    port?: number;
    username?: string;
    password?: string;
  }) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/cameras/discover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sourceData),
      });

      if (response.ok) {
        const channels = await response.json();
        return channels;
      } else {
        throw new Error('Failed to discover channels');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Add camera to display
  const addCameraToDisplay = useCallback(async (displayData: {
    sourceId: string;
    channelId: string;
    name: string;
    rtspUrl: string;
    position: number;
    screen: number;
  }) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/cameras/display', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(displayData),
      });

      if (response.ok) {
        await loadDisplayedCameras(); // Refresh displayed cameras
        await loadCameraSources(); // Refresh sources to update channel status
        return true;
      } else {
        throw new Error('Failed to add camera to display');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [loadDisplayedCameras, loadCameraSources]);

  // Remove camera from display
  const removeCameraFromDisplay = useCallback(async (cameraId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/cameras/display/${cameraId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadDisplayedCameras(); // Refresh displayed cameras
        await loadCameraSources(); // Refresh sources to update channel status
        return true;
      } else {
        throw new Error('Failed to remove camera from display');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [loadDisplayedCameras, loadCameraSources]);

  // Start camera stream
  const startCameraStream = useCallback(async (cameraId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/cameras/${cameraId}/start`, {
        method: 'POST',
      });

      if (response.ok) {
        await loadDisplayedCameras(); // Refresh to get updated status
        return true;
      } else {
        throw new Error('Failed to start camera stream');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [loadDisplayedCameras]);

  // Stop camera stream
  const stopCameraStream = useCallback(async (cameraId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/cameras/${cameraId}/stop`, {
        method: 'POST',
      });

      if (response.ok) {
        await loadDisplayedCameras(); // Refresh to get updated status
        return true;
      } else {
        throw new Error('Failed to stop camera stream');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [loadDisplayedCameras]);

  // Save camera layout
  const saveCameraLayout = useCallback(async (layoutName: string, makeDefault: boolean = false) => {
    const layoutConfig = {
      layout: currentLayout,
      screen: currentScreen,
      autoSave: true,
      displaySettings: {
        showLabels: true,
        showStatus: true,
        aspectRatio: '16:9'
      }
    };

    try {
      const response = await fetch('/api/layouts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: layoutName,
          layoutConfig,
          isDefault: makeDefault
        }),
      });

      if (response.ok) {
        return true;
      } else {
        throw new Error('Failed to save layout');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return false;
    }
  }, [currentLayout, currentScreen]);

  // Initialize data loading
  useEffect(() => {
    loadCameraSources();
    loadDisplayedCameras();
  }, [loadCameraSources, loadDisplayedCameras]);

  // Calculate camera grid layout
  const getCameraGridConfig = useCallback(() => {
    const screenCameras = displayedCameras.filter(c => c.screen === currentScreen);
    const totalSlots = currentLayout;
    const filledSlots = screenCameras.length;
    const emptySlots = Math.max(0, totalSlots - filledSlots);

    return {
      totalSlots,
      filledSlots,
      emptySlots,
      cameras: screenCameras,
      gridClass: {
        1: 'grid-cols-1',
        2: 'grid-cols-2',
        4: 'grid-cols-2 grid-rows-2',
        6: 'grid-cols-3 grid-rows-2',
        9: 'grid-cols-3 grid-rows-3',
        12: 'grid-cols-4 grid-rows-3'
      }[currentLayout] || 'grid-cols-2 grid-rows-2'
    };
  }, [displayedCameras, currentScreen, currentLayout]);

  return {
    // State
    cameraSources,
    displayedCameras,
    currentLayout,
    currentScreen,
    isLoading,
    error,
    
    // Actions
    setCurrentLayout,
    setCurrentScreen,
    addCameraSource,
    discoverChannels,
    addCameraToDisplay,
    removeCameraFromDisplay,
    startCameraStream,
    stopCameraStream,
    saveCameraLayout,
    
    // Utilities
    getCameraGridConfig,
    loadCameraSources,
    loadDisplayedCameras,
    
    // Clear error
    clearError: () => setError(null)
  };
};

export default useCamera;