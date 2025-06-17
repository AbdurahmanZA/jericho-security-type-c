import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Save, RefreshCw, Activity, Camera, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface MotionSettings {
  sensitivity: 'low' | 'medium' | 'high';
  areaThreshold: number;
  cooldownPeriod: number;
  enableAIAnalysis: boolean;
}

interface CameraMotionConfig {
  id: number;
  name: string;
  enabled: boolean;
  sensitivity: 'low' | 'medium' | 'high';
  notifications: {
    webhook: boolean;
    email: boolean;
    websocket: boolean;
  };
}

interface MotionStats {
  totalEvents: number;
  averageConfidence: number;
  hourlyBreakdown: { [hour: number]: number };
  cameraBreakdown: { [cameraId: string]: number };
}

export function MotionDetectionSettings() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<MotionSettings>({
    sensitivity: 'medium',
    areaThreshold: 0.05,
    cooldownPeriod: 5000,
    enableAIAnalysis: false
  });
  
  const [cameraConfigs, setCameraConfigs] = useState<CameraMotionConfig[]>([]);
  const [motionStats, setMotionStats] = useState<MotionStats | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadMotionSettings();
    loadCameraConfigs();
    loadMotionStats();
  }, []);

  const loadMotionSettings = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/settings/motion-detection', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setGlobalSettings(data.settings);
      }
    } catch (error) {
      console.error('Failed to load motion detection settings:', error);
      toast({
        title: "Error",
        description: "Failed to load motion detection settings",
        variant: "destructive"
      });
    }
  };

  const loadCameraConfigs = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/cameras', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const configs = data.cameras.map((camera: any) => ({
          id: camera.id,
          name: camera.name,
          enabled: camera.settings?.motionDetection?.enabled || false,
          sensitivity: camera.settings?.motionDetection?.sensitivity || 'medium',
          notifications: {
            webhook: camera.settings?.motionDetection?.notifications?.webhook || false,
            email: camera.settings?.motionDetection?.notifications?.email || false,
            websocket: camera.settings?.motionDetection?.notifications?.websocket || true
          }
        }));
        setCameraConfigs(configs);
      }
    } catch (error) {
      console.error('Failed to load camera configurations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMotionStats = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/events/stats?timeRange=24h', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setMotionStats({
          totalEvents: data.stats.summary.motionEvents,
          averageConfidence: data.stats.summary.avgConfidence,
          hourlyBreakdown: data.stats.hourlyBreakdown.reduce((acc: any, item: any) => {
            acc[item.hour] = item.motionEvents;
            return acc;
          }, {}),
          cameraBreakdown: data.stats.cameraBreakdown.reduce((acc: any, item: any) => {
            acc[item.cameraId] = item.motionCount;
            return acc;
          }, {})
        });
      }
    } catch (error) {
      console.error('Failed to load motion statistics:', error);
    }
  };

  const handleGlobalSettingChange = (setting: keyof MotionSettings, value: any) => {
    setGlobalSettings(prev => ({ ...prev, [setting]: value }));
    setHasChanges(true);
  };

  const handleCameraConfigChange = (cameraId: number, setting: string, value: any) => {
    setCameraConfigs(prev => 
      prev.map(config => {
        if (config.id === cameraId) {
          if (setting.includes('.')) {
            const [parent, child] = setting.split('.');
            return {
              ...config,
              [parent]: {
                ...config[parent as keyof CameraMotionConfig],
                [child]: value
              }
            };
          } else {
            return { ...config, [setting]: value };
          }
        }
        return config;
      })
    );
    setHasChanges(true);
  };

  const saveGlobalSettings = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/settings/motion-detection', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(globalSettings)
      });
      
      if (response.ok) {
        toast({
          title: "Settings Saved",
          description: "Motion detection settings have been updated",
        });
        setHasChanges(false);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save settings');
      }
    } catch (error: any) {
      toast({
        title: "Save Failed",
        description: error.message || 'Failed to save motion detection settings',
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleCameraMotionDetection = async (cameraId: number, enabled: boolean) => {
    try {
      const token = localStorage.getItem('accessToken');
      const camera = cameraConfigs.find(c => c.id === cameraId);
      
      if (!camera) return;
      
      const endpoint = enabled 
        ? `/api/settings/motion-detection/${cameraId}/enable`
        : `/api/settings/motion-detection/${cameraId}/disable`;
      
      const body = enabled ? {
        enabled: true,
        sensitivity: camera.sensitivity,
        notifications: camera.notifications
      } : null;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        ...(body && { body: JSON.stringify(body) })
      });
      
      if (response.ok) {
        handleCameraConfigChange(cameraId, 'enabled', enabled);
        toast({
          title: enabled ? "Motion Detection Enabled" : "Motion Detection Disabled",
          description: `Motion detection ${enabled ? 'enabled' : 'disabled'} for ${camera.name}`,
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update motion detection');
      }
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: error.message || 'Failed to update motion detection',
        variant: "destructive"
      });
    }
  };

  const getSensitivityColor = (sensitivity: string) => {
    switch (sensitivity) {
      case 'low': return 'bg-green-500';
      case 'medium': return 'bg-yellow-500';
      case 'high': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Motion Detection Settings</CardTitle>
          <CardDescription>Configure motion detection for your cameras</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Loading motion detection settings...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Global Motion Detection Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Global Motion Detection Settings
          </CardTitle>
          <CardDescription>
            Configure default motion detection parameters for all cameras
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Default Sensitivity</Label>
              <Select
                value={globalSettings.sensitivity}
                onValueChange={(value: 'low' | 'medium' | 'high') => 
                  handleGlobalSettingChange('sensitivity', value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low - Less sensitive</SelectItem>
                  <SelectItem value="medium">Medium - Balanced</SelectItem>
                  <SelectItem value="high">High - Very sensitive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Area Threshold: {(globalSettings.areaThreshold * 100).toFixed(1)}%</Label>
              <Slider
                value={[globalSettings.areaThreshold]}
                onValueChange={([value]) => handleGlobalSettingChange('areaThreshold', value)}
                min={0.01}
                max={0.5}
                step={0.01}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Minimum percentage of image that must change to trigger detection
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Cooldown Period: {globalSettings.cooldownPeriod / 1000}s</Label>
              <Slider
                value={[globalSettings.cooldownPeriod]}
                onValueChange={([value]) => handleGlobalSettingChange('cooldownPeriod', value)}
                min={1000}
                max={30000}
                step={1000}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Time between motion detection triggers
              </p>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>AI Analysis (Beta)</Label>
                <p className="text-xs text-muted-foreground">
                  Enhanced object recognition
                </p>
              </div>
              <Switch
                checked={globalSettings.enableAIAnalysis}
                onCheckedChange={(checked) => handleGlobalSettingChange('enableAIAnalysis', checked)}
              />
            </div>
          </div>
          
          <Button 
            onClick={saveGlobalSettings} 
            disabled={isSaving || !hasChanges}
            className="w-full md:w-auto"
          >
            {isSaving ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Global Settings
          </Button>
        </CardContent>
      </Card>

      {/* Per-Camera Motion Detection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Camera Motion Detection
          </CardTitle>
          <CardDescription>
            Configure motion detection for individual cameras
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cameraConfigs.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No cameras found. Add cameras first to configure motion detection.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              {cameraConfigs.map((camera) => (
                <div key={camera.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Camera className="h-4 w-4" />
                        <span className="font-medium">{camera.name}</span>
                      </div>
                      <Badge 
                        variant={camera.enabled ? "default" : "secondary"}
                        className={camera.enabled ? getSensitivityColor(camera.sensitivity) : ''}
                      >
                        {camera.enabled ? (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            {camera.sensitivity.toUpperCase()}
                          </>
                        ) : (
                          'DISABLED'
                        )}
                      </Badge>
                    </div>
                    <Switch
                      checked={camera.enabled}
                      onCheckedChange={(checked) => toggleCameraMotionDetection(camera.id, checked)}
                    />
                  </div>
                  
                  {camera.enabled && (
                    <div className="grid gap-4 md:grid-cols-2 pl-7">
                      <div className="space-y-2">
                        <Label className="text-sm">Sensitivity</Label>
                        <Select
                          value={camera.sensitivity}
                          onValueChange={(value: 'low' | 'medium' | 'high') => 
                            handleCameraConfigChange(camera.id, 'sensitivity', value)
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm">Notifications</Label>
                        <div className="flex gap-3">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={camera.notifications.websocket}
                              onCheckedChange={(checked) => 
                                handleCameraConfigChange(camera.id, 'notifications.websocket', checked)
                              }
                              className="scale-75"
                            />
                            <span className="text-xs">Live</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={camera.notifications.webhook}
                              onCheckedChange={(checked) => 
                                handleCameraConfigChange(camera.id, 'notifications.webhook', checked)
                              }
                              className="scale-75"
                            />
                            <span className="text-xs">Webhook</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={camera.notifications.email}
                              onCheckedChange={(checked) => 
                                handleCameraConfigChange(camera.id, 'notifications.email', checked)
                              }
                              className="scale-75"
                            />
                            <span className="text-xs">Email</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Motion Detection Statistics */}
      {motionStats && (
        <Card>
          <CardHeader>
            <CardTitle>Motion Detection Statistics (24h)</CardTitle>
            <CardDescription>
              Recent motion detection activity and performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{motionStats.totalEvents}</div>
                <div className="text-sm text-muted-foreground">Motion Events</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {(motionStats.averageConfidence * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-muted-foreground">Avg Confidence</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold text-orange-600">
                  {Object.keys(motionStats.cameraBreakdown).length}
                </div>
                <div className="text-sm text-muted-foreground">Active Cameras</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}