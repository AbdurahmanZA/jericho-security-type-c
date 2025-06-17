import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  Camera, 
  Monitor, 
  Wifi, 
  WifiOff, 
  Globe, 
  Server, 
  Cloud, 
  Settings, 
  Save,
  Trash2,
  Play,
  Square,
  MoreHorizontal,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react';

// API Configuration
const API_BASE_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000';

// API Helper Functions
const api = {
  async get(endpoint: string) {
    const response = await fetch(`${API_BASE_URL}/api${endpoint}`);
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    return response.json();
  },

  async post(endpoint: string, data: any) {
    const response = await fetch(`${API_BASE_URL}/api${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    return response.json();
  },

  async delete(endpoint: string) {
    const response = await fetch(`${API_BASE_URL}/api${endpoint}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    return response.json();
  }
};

// Types
interface CameraSource {
  id: string;
  name: string;
  type: 'rtsp' | 'ip' | 'nvr' | 'dvr' | 'hikconnect';
  ip?: string;
  port?: number;
  username?: string;
  password?: string;
  rtsp_url?: string;
  channels?: CameraChannel[];
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  enabled: boolean;
}

interface CameraChannel {
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

interface DisplayedCamera {
  id: string;
  source_id: string;
  channel_id: string;
  name: string;
  rtsp_url: string;
  position: number;
  screen: number;
  is_active: boolean;
  source_name?: string;
  source_type?: string;
}

const EnhancedCameraSystem: React.FC = () => {
  const { toast } = useToast();
  
  // State
  const [cameraSources, setCameraSources] = useState<CameraSource[]>([]);
  const [displayedCameras, setDisplayedCameras] = useState<DisplayedCamera[]>([]);
  const [currentLayout, setCurrentLayout] = useState(4);
  const [currentScreen, setCurrentScreen] = useState(1);
  const [addCameraOpen, setAddCameraOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<CameraSource | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [newCameraData, setNewCameraData] = useState({
    name: '',
    type: 'rtsp' as const,
    ip: '',
    port: 80,
    username: '',
    password: '',
    rtspUrl: ''
  });

  // Load data from backend on component mount
  useEffect(() => {
    loadCameraData();
  }, []);

  const loadCameraData = async () => {
    try {
      setIsLoading(true);
      const [sourcesResponse, displayResponse] = await Promise.all([
        api.get('/cameras/sources'),
        api.get('/cameras/display')
      ]);

      setCameraSources(sourcesResponse);
      setDisplayedCameras(displayResponse);

      // Load saved layout from localStorage (for UI state)
      const savedLayout = localStorage.getItem('jericho-camera-layout');
      if (savedLayout) {
        setCurrentLayout(parseInt(savedLayout));
      }
    } catch (error) {
      console.error('Failed to load camera data:', error);
      toast({
        title: "Error",
        description: "Failed to load camera data from server.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfiguration = async () => {
    try {
      // Save layout to localStorage (UI state)
      localStorage.setItem('jericho-camera-layout', currentLayout.toString());
      
      toast({
        title: "Layout Saved",
        description: "Camera layout configuration has been saved.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save configuration.",
        variant: "destructive"
      });
    }
  };

  const addCameraSource = async () => {
    if (!newCameraData.name.trim()) {
      toast({
        title: "Error",
        description: "Please enter a camera name.",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsDiscovering(true);

      // Add camera source to backend
      const sourceData = {
        name: newCameraData.name,
        type: newCameraData.type,
        ip: newCameraData.ip || null,
        port: newCameraData.port || null,
        username: newCameraData.username || null,
        password: newCameraData.password || null,
        rtspUrl: newCameraData.rtspUrl || null
      };

      const response = await api.post('/cameras/sources', sourceData);
      
      // Auto-discover channels for multi-channel sources
      if (['nvr', 'dvr', 'hikconnect'].includes(newCameraData.type)) {
        await discoverChannels(sourceData);
      }

      // Reload data from backend
      await loadCameraData();

      setAddCameraOpen(false);
      resetNewCameraData();

      toast({
        title: "Camera Source Added",
        description: `${newCameraData.name} has been added successfully.`,
      });
    } catch (error) {
      console.error('Failed to add camera source:', error);
      toast({
        title: "Error",
        description: "Failed to add camera source.",
        variant: "destructive"
      });
    } finally {
      setIsDiscovering(false);
    }
  };

  const discoverChannels = async (sourceData: any) => {
    try {
      const discoveryData = {
        type: sourceData.type,
        ip: sourceData.ip,
        port: sourceData.port,
        username: sourceData.username,
        password: sourceData.password
      };

      const discoveredChannels = await api.post('/cameras/discover', discoveryData);
      
      toast({
        title: "Channels Discovered",
        description: `Found ${discoveredChannels.length} cameras.`,
      });

      return discoveredChannels;
    } catch (error) {
      console.error('Channel discovery failed:', error);
      toast({
        title: "Discovery Warning",
        description: "Using mock data for channel discovery.",
        variant: "default"
      });
    }
  };

  const resetNewCameraData = () => {
    setNewCameraData({
      name: '',
      type: 'rtsp',
      ip: '',
      port: 80,
      username: '',
      password: '',
      rtspUrl: ''
    });
  };

  const addChannelToDisplay = async (source: CameraSource, channel: CameraChannel) => {
    try {
      const maxPosition = Math.max(0, ...displayedCameras.map(c => c.position));
      const camerasPerScreen = currentLayout;
      const screen = Math.floor(maxPosition / camerasPerScreen) + 1;
      
      const displayData = {
        sourceId: source.id,
        channelId: channel.id,
        name: `${source.name} - ${channel.name}`,
        rtspUrl: channel.rtspUrl,
        position: maxPosition + 1,
        screen
      };

      await api.post('/cameras/display', displayData);
      
      // Reload data from backend
      await loadCameraData();

      toast({
        title: "Camera Added",
        description: `${channel.name} has been added to the display.`,
      });
    } catch (error) {
      console.error('Failed to add camera to display:', error);
      toast({
        title: "Error",
        description: "Failed to add camera to display.",
        variant: "destructive"
      });
    }
  };

  const removeFromDisplay = async (displayedCamera: DisplayedCamera) => {
    try {
      await api.delete(`/cameras/display/${displayedCamera.id}`);
      
      // Reload data from backend
      await loadCameraData();

      toast({
        title: "Camera Removed",
        description: "Camera has been removed from display.",
      });
    } catch (error) {
      console.error('Failed to remove camera:', error);
      toast({
        title: "Error",
        description: "Failed to remove camera from display.",
        variant: "destructive"
      });
    }
  };

  const startStream = async (camera: DisplayedCamera) => {
    try {
      await api.post(`/cameras/${camera.id}/start`, {});
      
      // Update local state
      setDisplayedCameras(prev => prev.map(c => 
        c.id === camera.id ? { ...c, is_active: true } : c
      ));

      toast({
        title: "Stream Started",
        description: `${camera.name} is now streaming.`,
      });
    } catch (error) {
      console.error('Failed to start stream:', error);
      toast({
        title: "Error",
        description: "Failed to start camera stream.",
        variant: "destructive"
      });
    }
  };

  const stopStream = async (camera: DisplayedCamera) => {
    try {
      await api.post(`/cameras/${camera.id}/stop`, {});
      
      // Update local state
      setDisplayedCameras(prev => prev.map(c => 
        c.id === camera.id ? { ...c, is_active: false } : c
      ));

      toast({
        title: "Stream Stopped",
        description: `${camera.name} stream has been stopped.`,
      });
    } catch (error) {
      console.error('Failed to stop stream:', error);
      toast({
        title: "Error",
        description: "Failed to stop camera stream.",
        variant: "destructive"
      });
    }
  };

  const renderCameraGrid = () => {
    const screenCameras = displayedCameras.filter(c => c.screen === currentScreen);
    const gridClass = `grid gap-2 ${
      currentLayout === 1 ? 'grid-cols-1' :
      currentLayout === 2 ? 'grid-cols-2' :
      currentLayout === 4 ? 'grid-cols-2 grid-rows-2' :
      currentLayout === 6 ? 'grid-cols-3 grid-rows-2' :
      currentLayout === 9 ? 'grid-cols-3 grid-rows-3' :
      'grid-cols-4 grid-rows-3'
    }`;

    if (isLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
            <h3 className="text-lg font-medium mb-2">Loading Cameras</h3>
            <p className="text-sm">Please wait while we load your camera configuration...</p>
          </div>
        </div>
      );
    }

    if (screenCameras.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Camera className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">No Cameras Added</h3>
            <p className="text-sm mb-4">Add cameras to start monitoring</p>
            <Button 
              onClick={() => setAddCameraOpen(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Camera
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className={`flex-1 p-4 ${gridClass}`}>
        {Array.from({ length: currentLayout }, (_, i) => {
          const camera = screenCameras[i];
          return (
            <div key={i} className="aspect-video bg-gray-900 rounded-lg border border-gray-700 relative overflow-hidden">
              {camera ? (
                <>
                  <div className="absolute inset-0 bg-black flex items-center justify-center">
                    <div className="text-center text-white">
                      <Monitor className="w-8 h-8 mx-auto mb-2 opacity-75" />
                      <div className="text-sm font-medium">{camera.name}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {camera.is_active ? 'Streaming' : 'Ready to stream'}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {camera.source_type?.toUpperCase()} • Position {camera.position}
                      </div>
                    </div>
                  </div>
                  
                  <div className="absolute top-2 left-2">
                    <Badge variant={camera.is_active ? "default" : "secondary"} className="text-xs">
                      {camera.is_active ? 'LIVE' : 'READY'}
                    </Badge>
                  </div>
                  
                  <div className="absolute top-2 right-2 flex gap-1">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-6 w-6 p-0"
                      onClick={() => camera.is_active ? stopStream(camera) : startStream(camera)}
                    >
                      {camera.is_active ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-6 w-6 p-0"
                      onClick={() => removeFromDisplay(camera)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <Camera className="w-6 h-6 mx-auto mb-1 opacity-50" />
                    <div className="text-xs">Empty Slot {i + 1}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderAddCameraDialog = () => (
    <Dialog open={addCameraOpen} onOpenChange={setAddCameraOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Camera
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Camera Source</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="type" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="type">Type</TabsTrigger>
            <TabsTrigger value="connection">Connection</TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
          </TabsList>
          
          <TabsContent value="type" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { id: 'rtsp', name: 'RTSP URL', icon: Globe, desc: 'Direct RTSP stream URL' },
                { id: 'ip', name: 'IP Camera', icon: Camera, desc: 'Network camera (HTTP/ONVIF)' },
                { id: 'nvr', name: 'NVR System', icon: Server, desc: 'Network Video Recorder' },
                { id: 'dvr', name: 'DVR System', icon: Monitor, desc: 'Digital Video Recorder' },
                { id: 'hikconnect', name: 'HikConnect', icon: Cloud, desc: 'Hikvision cloud service' }
              ].slice(0, 5).map(type => (
                <Card 
                  key={type.id}
                  className={`cursor-pointer transition-colors ${
                    newCameraData.type === type.id ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                  onClick={() => setNewCameraData(prev => ({ ...prev, type: type.id as any }))}
                >
                  <CardContent className="p-4 text-center">
                    <type.icon className="w-8 h-8 mx-auto mb-2" />
                    <h3 className="font-medium mb-1">{type.name}</h3>
                    <p className="text-xs text-muted-foreground">{type.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="connection" className="space-y-4">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Camera/System Name</label>
                <Input
                  value={newCameraData.name}
                  onChange={(e) => setNewCameraData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter a descriptive name"
                />
              </div>
              
              {newCameraData.type === 'rtsp' && (
                <div>
                  <label className="text-sm font-medium">RTSP URL</label>
                  <Input
                    value={newCameraData.rtspUrl}
                    onChange={(e) => setNewCameraData(prev => ({ ...prev, rtspUrl: e.target.value }))}
                    placeholder="rtsp://username:password@192.168.1.100:554/stream"
                  />
                </div>
              )}
              
              {['ip', 'nvr', 'dvr', 'hikconnect'].includes(newCameraData.type) && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">IP Address</label>
                      <Input
                        value={newCameraData.ip}
                        onChange={(e) => setNewCameraData(prev => ({ ...prev, ip: e.target.value }))}
                        placeholder="192.168.1.100"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Port</label>
                      <Input
                        type="number"
                        value={newCameraData.port}
                        onChange={(e) => setNewCameraData(prev => ({ ...prev, port: parseInt(e.target.value) || 80 }))}
                        placeholder="80"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Username</label>
                      <Input
                        value={newCameraData.username}
                        onChange={(e) => setNewCameraData(prev => ({ ...prev, username: e.target.value }))}
                        placeholder="admin"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Password</label>
                      <Input
                        type="password"
                        value={newCameraData.password}
                        onChange={(e) => setNewCameraData(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="password"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
            
            <Button 
              onClick={addCameraSource} 
              className="w-full"
              disabled={isDiscovering}
            >
              {isDiscovering ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding Camera...
                </>
              ) : (
                'Add Camera Source'
              )}
            </Button>
          </TabsContent>
          
          <TabsContent value="review" className="space-y-4">
            <div className="text-sm space-y-2">
              <div><strong>Name:</strong> {newCameraData.name || 'Not set'}</div>
              <div><strong>Type:</strong> {newCameraData.type.toUpperCase()}</div>
              {newCameraData.ip && <div><strong>IP:</strong> {newCameraData.ip}:{newCameraData.port}</div>}
              {newCameraData.rtspUrl && <div><strong>RTSP URL:</strong> {newCameraData.rtspUrl}</div>}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );

  const renderSourceManagement = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Camera Sources</h3>
        {renderAddCameraDialog()}
      </div>
      
      <div className="space-y-3">
        {cameraSources.map(source => (
          <Card key={source.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {source.type === 'rtsp' && <Globe className="w-4 h-4" />}
                    {source.type === 'ip' && <Camera className="w-4 h-4" />}
                    {source.type === 'nvr' && <Server className="w-4 h-4" />}
                    {source.type === 'dvr' && <Monitor className="w-4 h-4" />}
                    {source.type === 'hikconnect' && <Cloud className="w-4 h-4" />}
                    <span className="font-medium">{source.name}</span>
                  </div>
                  <Badge variant={source.status === 'connected' ? 'default' : 'secondary'}>
                    {source.status}
                  </Badge>
                </div>
                
                <div className="flex items-center gap-2">
                  {source.channels && source.channels.length > 0 && (
                    <Badge variant="outline">
                      {source.channels.filter(c => c.addedToDisplay).length}/{source.channels.length} added
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedSource(selectedSource?.id === source.id ? null : source)}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              {selectedSource?.id === source.id && source.channels && (
                <div className="mt-4 pt-4 border-t border-border">
                  <h4 className="font-medium mb-3">Available Cameras</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {source.channels.map(channel => (
                      <div key={channel.id} className="flex items-center justify-between p-2 rounded border border-border">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={channel.addedToDisplay}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                addChannelToDisplay(source, channel);
                              } else {
                                const displayedCamera = displayedCameras.find(
                                  c => c.channel_id === channel.id
                                );
                                if (displayedCamera) {
                                  removeFromDisplay(displayedCamera);
                                }
                              }
                            }}
                          />
                          <div>
                            <div className="font-medium text-sm">{channel.name}</div>
                            <div className="text-xs text-muted-foreground">
                              Channel {channel.channelNumber} • {channel.resolution} • {channel.fps}fps
                            </div>
                          </div>
                        </div>
                        
                        {channel.addedToDisplay && (
                          <Badge variant="outline">Added</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        
        {cameraSources.length === 0 && !isLoading && (
          <Card>
            <CardContent className="p-8 text-center">
              <Camera className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="font-medium mb-2">No Camera Sources</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add your first camera source to get started
              </p>
              {renderAddCameraDialog()}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="bg-card border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold">JERICHO Security Cameras</h1>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {displayedCameras.length} cameras
              </Badge>
              <Badge variant="outline">
                Screen {currentScreen}
              </Badge>
              <Badge variant={isLoading ? "secondary" : "default"}>
                {isLoading ? 'Loading...' : 'Connected'}
              </Badge>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Layout Controls */}
            <div className="flex items-center gap-1">
              {[1, 2, 4, 6, 9, 12].map(layout => (
                <Button
                  key={layout}
                  size="sm"
                  variant={currentLayout === layout ? "default" : "outline"}
                  onClick={() => setCurrentLayout(layout)}
                  className="w-8 h-8 p-0"
                >
                  {layout}
                </Button>
              ))}
            </div>
            
            <Separator orientation="vertical" className="h-6" />
            
            {/* Save Layout Button */}
            <Button 
              size="sm" 
              variant="outline"
              onClick={saveConfiguration}
              className="flex items-center gap-2"
              disabled={isLoading}
            >
              <Save className="w-4 h-4" />
              Save Layout
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            {/* Screen Navigation */}
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={currentScreen === 1 ? "default" : "outline"}
                onClick={() => setCurrentScreen(1)}
              >
                Screen 1
              </Button>
              <Button
                size="sm"
                variant={currentScreen === 2 ? "default" : "outline"}
                onClick={() => setCurrentScreen(2)}
              >
                Screen 2
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex-1 flex">
        {/* Camera Display Area */}
        <div className="flex-1 flex flex-col">
          {renderCameraGrid()}
        </div>
        
        {/* Right Sidebar - Camera Management */}
        <div className="w-80 bg-card border-l border-border overflow-y-auto">
          <div className="p-4">
            {renderSourceManagement()}
          </div>
        </div>
      </div>
      
      {isDiscovering && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Discovering cameras...</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default EnhancedCameraSystem;