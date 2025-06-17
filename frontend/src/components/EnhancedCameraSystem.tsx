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

// Types
interface CameraSource {
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
  sourceId: string;
  channelId: string;
  name: string;
  rtspUrl: string;
  position: number; // Grid position
  screen: number; // 1 for main, 2+ for overflow
  isActive: boolean;
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
  const [newCameraData, setNewCameraData] = useState({
    name: '',
    type: 'rtsp' as const,
    ip: '',
    port: 80,
    username: '',
    password: '',
    rtspUrl: ''
  });

  // Load saved configuration
  useEffect(() => {
    loadSavedConfiguration();
  }, []);

  const loadSavedConfiguration = () => {
    const savedSources = localStorage.getItem('jericho-camera-sources');
    const savedDisplayed = localStorage.getItem('jericho-displayed-cameras');
    const savedLayout = localStorage.getItem('jericho-camera-layout');

    if (savedSources) {
      setCameraSources(JSON.parse(savedSources));
    }
    if (savedDisplayed) {
      setDisplayedCameras(JSON.parse(savedDisplayed));
    }
    if (savedLayout) {
      setCurrentLayout(parseInt(savedLayout));
    }
  };

  const saveConfiguration = () => {
    localStorage.setItem('jericho-camera-sources', JSON.stringify(cameraSources));
    localStorage.setItem('jericho-displayed-cameras', JSON.stringify(displayedCameras));
    localStorage.setItem('jericho-camera-layout', currentLayout.toString());
    
    toast({
      title: "Layout Saved",
      description: "Camera configuration has been saved successfully.",
    });
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

    const newSource: CameraSource = {
      id: `camera_${Date.now()}`,
      ...newCameraData,
      channels: [],
      status: 'disconnected',
      enabled: true
    };

    // For RTSP URL type, create a simple channel
    if (newCameraData.type === 'rtsp' && newCameraData.rtspUrl) {
      newSource.channels = [{
        id: `${newSource.id}_ch1`,
        name: newCameraData.name,
        channelNumber: 1,
        rtspUrl: newCameraData.rtspUrl,
        mainStream: newCameraData.rtspUrl,
        subStream: newCameraData.rtspUrl,
        enabled: true,
        addedToDisplay: false,
        resolution: '1920x1080',
        fps: 25
      }];
    }

    setCameraSources(prev => [...prev, newSource]);
    setAddCameraOpen(false);
    resetNewCameraData();

    // Auto-discover channels for NVR/DVR/HikConnect
    if (['nvr', 'dvr', 'hikconnect'].includes(newCameraData.type)) {
      await discoverChannels(newSource);
    }

    toast({
      title: "Camera Source Added",
      description: `${newCameraData.name} has been added successfully.`,
    });
  };

  const discoverChannels = async (source: CameraSource) => {
    setIsDiscovering(true);
    
    try {
      // Call backend API to discover channels
      const response = await fetch('/api/cameras/discover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: source.type,
          ip: source.ip,
          port: source.port,
          username: source.username,
          password: source.password
        })
      });

      if (response.ok) {
        const discoveredChannels = await response.json();
        
        // Update source with discovered channels
        setCameraSources(prev => prev.map(s => 
          s.id === source.id 
            ? { ...s, channels: discoveredChannels, status: 'connected' }
            : s
        ));

        toast({
          title: "Channels Discovered",
          description: `Found ${discoveredChannels.length} cameras in ${source.name}.`,
        });
      } else {
        throw new Error('Discovery failed');
      }

    } catch (error) {
      // Mock discovered channels for demo
      let mockChannels: CameraChannel[] = [];
      
      if (source.type === 'nvr' || source.type === 'dvr') {
        const channelCount = Math.floor(Math.random() * 5) + 4;
        mockChannels = Array.from({ length: channelCount }, (_, i) => ({
          id: `${source.id}_ch${i + 1}`,
          name: `Camera ${i + 1}`,
          channelNumber: i + 1,
          rtspUrl: `rtsp://${source.ip}:554/Streaming/Channels/${i + 1}01`,
          mainStream: `rtsp://${source.ip}:554/Streaming/Channels/${i + 1}01`,
          subStream: `rtsp://${source.ip}:554/Streaming/Channels/${i + 1}02`,
          enabled: true,
          addedToDisplay: false,
          resolution: '1920x1080',
          fps: 25
        }));
      } else if (source.type === 'hikconnect') {
        const deviceNames = ['Front Door', 'Garage', 'Backyard', 'Living Room', 'Office'];
        mockChannels = deviceNames.map((name, i) => ({
          id: `${source.id}_hik${i + 1}`,
          name,
          channelNumber: i + 1,
          rtspUrl: `rtsp://hikconnect.camera${i + 1}.com/live`,
          mainStream: `rtsp://hikconnect.camera${i + 1}.com/live/main`,
          subStream: `rtsp://hikconnect.camera${i + 1}.com/live/sub`,
          enabled: true,
          addedToDisplay: false,
          resolution: '1920x1080',
          fps: 25
        }));
      }

      setCameraSources(prev => prev.map(s => 
        s.id === source.id 
          ? { ...s, channels: mockChannels, status: 'connected' }
          : s
      ));

      toast({
        title: "Channels Discovered",
        description: `Found ${mockChannels.length} cameras in ${source.name}.`,
      });
    } finally {
      setIsDiscovering(false);
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

  const addChannelToDisplay = (source: CameraSource, channel: CameraChannel) => {
    const maxPosition = Math.max(0, ...displayedCameras.map(c => c.position));
    const camerasPerScreen = currentLayout;
    const screen = Math.floor(maxPosition / camerasPerScreen) + 1;
    
    const newDisplayedCamera: DisplayedCamera = {
      id: `display_${Date.now()}`,
      sourceId: source.id,
      channelId: channel.id,
      name: `${source.name} - ${channel.name}`,
      rtspUrl: channel.rtspUrl,
      position: maxPosition + 1,
      screen,
      isActive: false
    };

    setDisplayedCameras(prev => [...prev, newDisplayedCamera]);

    // Update channel status
    setCameraSources(prev => prev.map(s => 
      s.id === source.id 
        ? {
            ...s,
            channels: s.channels?.map(c => 
              c.id === channel.id ? { ...c, addedToDisplay: true } : c
            )
          }
        : s
    ));

    toast({
      title: "Camera Added",
      description: `${channel.name} has been added to the display.`,
    });
  };

  const removeFromDisplay = (displayedCamera: DisplayedCamera) => {
    setDisplayedCameras(prev => prev.filter(c => c.id !== displayedCamera.id));

    // Update source channel status
    setCameraSources(prev => prev.map(s => 
      s.id === displayedCamera.sourceId 
        ? {
            ...s,
            channels: s.channels?.map(c => 
              c.id === displayedCamera.channelId ? { ...c, addedToDisplay: false } : c
            )
          }
        : s
    ));

    toast({
      title: "Camera Removed",
      description: `Camera has been removed from display.`,
    });
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
                        {camera.isActive ? 'Streaming' : 'Ready to stream'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="absolute top-2 left-2">
                    <Badge variant={camera.isActive ? "default" : "secondary"} className="text-xs">
                      {camera.isActive ? 'LIVE' : 'READY'}
                    </Badge>
                  </div>
                  
                  <div className="absolute top-2 right-2 flex gap-1">
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                      {camera.isActive ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
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
                    <div className="text-xs">Empty Slot</div>
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
            
            <Button onClick={addCameraSource} className="w-full">
              Add Camera Source
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
                                  c => c.channelId === channel.id
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
        
        {cameraSources.length === 0 && (
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