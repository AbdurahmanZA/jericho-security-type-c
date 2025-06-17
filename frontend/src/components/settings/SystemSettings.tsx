import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Save, RefreshCw, Monitor, Database, Cpu, HardDrive, Wifi, Shield } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface SystemInfo {
  version: string;
  environment: string;
  nodeVersion: string;
  uptime: number;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  platform: string;
  arch: string;
  capabilities: {
    hikvisionAPI: boolean;
    streaming: boolean;
    motionDetection: boolean;
    database: boolean;
    cache: boolean;
  };
  limits: {
    maxCameras: number;
    maxStreams: number;
  };
  services?: {
    hikvision?: any;
    database?: any;
    cache?: any;
  };
}

interface SystemSettings {
  'system.timezone': string;
  'system.max_cameras': number;
  'system.max_streams': number;
  'streaming.default_quality': string;
  'streaming.hls_segment_duration': number;
  'auth.session_duration': string;
  'auth.max_failed_attempts': number;
  'security.rate_limit_window': number;
  'security.rate_limit_max': number;
  'notifications.webhook_timeout': number;
}

export function SystemSettings() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [settings, setSettings] = useState<SystemSettings>({
    'system.timezone': 'UTC',
    'system.max_cameras': 12,
    'system.max_streams': 12,
    'streaming.default_quality': 'medium',
    'streaming.hls_segment_duration': 6,
    'auth.session_duration': '7d',
    'auth.max_failed_attempts': 5,
    'security.rate_limit_window': 900000,
    'security.rate_limit_max': 100,
    'notifications.webhook_timeout': 5000
  });
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'streaming' | 'security' | 'system'>('general');

  useEffect(() => {
    loadSystemInfo();
    loadSettings();
  }, []);

  const loadSystemInfo = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/settings/system-info', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSystemInfo(data.systemInfo);
      }
    } catch (error) {
      console.error('Failed to load system info:', error);
    }
  };

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/settings', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const loadedSettings = { ...settings };
        
        // Map API settings to our state
        Object.keys(loadedSettings).forEach(key => {
          if (data.settings[key] !== undefined) {
            loadedSettings[key as keyof SystemSettings] = data.settings[key];
          }
        });
        
        setSettings(loadedSettings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      toast({
        title: "Error",
        description: "Failed to load system settings",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSettingChange = (key: keyof SystemSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/settings/bulk', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ settings })
      });
      
      if (response.ok) {
        setHasChanges(false);
        toast({
          title: "Settings Saved",
          description: "System settings have been updated successfully",
        });
        
        // Reload system info to reflect changes
        setTimeout(() => {
          loadSystemInfo();
        }, 1000);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save settings');
      }
    } catch (error: any) {
      toast({
        title: "Save Failed",
        description: error.message || 'Failed to save system settings',
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatBytes = (bytes: number) => {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const getServiceStatus = (service: any) => {
    if (!service) return { status: 'unknown', color: 'bg-gray-500' };
    
    switch (service.status) {
      case 'healthy':
        return { status: 'Healthy', color: 'bg-green-500' };
      case 'unhealthy':
        return { status: 'Unhealthy', color: 'bg-red-500' };
      case 'unavailable':
        return { status: 'Unavailable', color: 'bg-yellow-500' };
      default:
        return { status: 'Unknown', color: 'bg-gray-500' };
    }
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Monitor },
    { id: 'streaming', label: 'Streaming', icon: Wifi },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'system', label: 'System Info', icon: Cpu }
  ];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>System Settings</CardTitle>
          <CardDescription>Configure system-wide settings and preferences</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Loading system settings...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Settings Navigation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            System Settings
          </CardTitle>
          <CardDescription>
            Configure system-wide settings and monitor system health
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Tab Navigation */}
          <div className="flex space-x-1 mb-6 bg-muted p-1 rounded-lg">
            {tabs.map((tab) => {
              const IconComponent = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <IconComponent className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>System Timezone</Label>
                  <Select 
                    value={settings['system.timezone']} 
                    onValueChange={(value) => handleSettingChange('system.timezone', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/New_York">Eastern Time</SelectItem>
                      <SelectItem value="America/Chicago">Central Time</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                      <SelectItem value="Europe/London">London</SelectItem>
                      <SelectItem value="Europe/Paris">Paris</SelectItem>
                      <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                      <SelectItem value="Africa/Johannesburg">Johannesburg</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Maximum Cameras</Label>
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={settings['system.max_cameras']}
                    onChange={(e) => handleSettingChange('system.max_cameras', parseInt(e.target.value))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Session Duration</Label>
                  <Select 
                    value={settings['auth.session_duration']} 
                    onValueChange={(value) => handleSettingChange('auth.session_duration', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">1 Hour</SelectItem>
                      <SelectItem value="8h">8 Hours</SelectItem>
                      <SelectItem value="1d">1 Day</SelectItem>
                      <SelectItem value="7d">7 Days</SelectItem>
                      <SelectItem value="30d">30 Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Max Failed Login Attempts</Label>
                  <Input
                    type="number"
                    min="3"
                    max="20"
                    value={settings['auth.max_failed_attempts']}
                    onChange={(e) => handleSettingChange('auth.max_failed_attempts', parseInt(e.target.value))}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'streaming' && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Default Stream Quality</Label>
                  <Select 
                    value={settings['streaming.default_quality']} 
                    onValueChange={(value) => handleSettingChange('streaming.default_quality', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low (640x480)</SelectItem>
                      <SelectItem value="medium">Medium (1280x720)</SelectItem>
                      <SelectItem value="high">High (1920x1080)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Maximum Concurrent Streams</Label>
                  <Input
                    type="number"
                    min="1"
                    max="25"
                    value={settings['system.max_streams']}
                    onChange={(e) => handleSettingChange('system.max_streams', parseInt(e.target.value))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>HLS Segment Duration (seconds)</Label>
                  <Input
                    type="number"
                    min="2"
                    max="20"
                    value={settings['streaming.hls_segment_duration']}
                    onChange={(e) => handleSettingChange('streaming.hls_segment_duration', parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Lower values reduce latency but increase bandwidth usage
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Rate Limit Window (minutes)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    value={Math.round(settings['security.rate_limit_window'] / 60000)}
                    onChange={(e) => handleSettingChange('security.rate_limit_window', parseInt(e.target.value) * 60000)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Max Requests per Window</Label>
                  <Input
                    type="number"
                    min="10"
                    max="1000"
                    value={settings['security.rate_limit_max']}
                    onChange={(e) => handleSettingChange('security.rate_limit_max', parseInt(e.target.value))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Webhook Timeout (seconds)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    value={Math.round(settings['notifications.webhook_timeout'] / 1000)}
                    onChange={(e) => handleSettingChange('notifications.webhook_timeout', parseInt(e.target.value) * 1000)}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'system' && systemInfo && (
            <div className="space-y-6">
              {/* System Information */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{systemInfo.version}</div>
                  <div className="text-sm text-muted-foreground">Version</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{formatUptime(systemInfo.uptime)}</div>
                  <div className="text-sm text-muted-foreground">Uptime</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{systemInfo.environment}</div>
                  <div className="text-sm text-muted-foreground">Environment</div>
                </div>
              </div>

              {/* Memory Usage */}
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Memory Usage
                </h4>
                <div className="grid gap-2 md:grid-cols-4">
                  <div className="text-sm p-2 bg-muted rounded">
                    <div className="font-medium">RSS: {formatBytes(systemInfo.memoryUsage.rss)}</div>
                  </div>
                  <div className="text-sm p-2 bg-muted rounded">
                    <div className="font-medium">Heap Total: {formatBytes(systemInfo.memoryUsage.heapTotal)}</div>
                  </div>
                  <div className="text-sm p-2 bg-muted rounded">
                    <div className="font-medium">Heap Used: {formatBytes(systemInfo.memoryUsage.heapUsed)}</div>
                  </div>
                  <div className="text-sm p-2 bg-muted rounded">
                    <div className="font-medium">External: {formatBytes(systemInfo.memoryUsage.external)}</div>
                  </div>
                </div>
              </div>

              {/* Service Status */}
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Service Status
                </h4>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {systemInfo.services && Object.entries(systemInfo.services).map(([service, status]) => {
                    const serviceStatus = getServiceStatus(status);
                    return (
                      <div key={service} className="flex items-center justify-between p-2 border rounded">
                        <span className="capitalize">{service}</span>
                        <Badge variant="secondary" className={`${serviceStatus.color} text-white`}>
                          {serviceStatus.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Capabilities */}
              <div className="space-y-2">
                <h4 className="font-medium">System Capabilities</h4>
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(systemInfo.capabilities).map(([capability, enabled]) => (
                    <div key={capability} className="flex items-center justify-between p-2 border rounded">
                      <span className="capitalize">{capability.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <Badge variant={enabled ? "default" : "secondary"}>
                        {enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Save Button */}
          {activeTab !== 'system' && (
            <>
              <Separator />
              <div className="flex justify-end">
                <Button 
                  onClick={saveSettings} 
                  disabled={isSaving || !hasChanges}
                >
                  {isSaving ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Settings
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}