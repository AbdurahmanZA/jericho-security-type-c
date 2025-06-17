import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Eye, EyeOff, TestTube, Save, RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface HikvisionCredentials {
  accessKey: string;
  secretKey: string;
  apiUrl: string;
  timeout: number;
}

interface ConnectionStatus {
  status: 'idle' | 'testing' | 'success' | 'error';
  message?: string;
  lastTested?: string;
}

interface DeviceInfo {
  totalDevices: number;
  onlineDevices: number;
  lastSync?: string;
}

export function HikvisionSettings() {
  const { toast } = useToast();
  const [credentials, setCredentials] = useState<HikvisionCredentials>({
    accessKey: '',
    secretKey: '',
    apiUrl: 'https://openapi.hikvision.com',
    timeout: 30000
  });
  
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({ status: 'idle' });
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Load current settings on component mount
  useEffect(() => {
    loadCurrentSettings();
  }, []);

  const loadCurrentSettings = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/settings', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const settings = data.settings;
        
        setCredentials({
          accessKey: settings['hikvision.accessKey'] || '',
          secretKey: settings['hikvision.secretKey'] || '',
          apiUrl: settings['hikvision.apiUrl'] || 'https://openapi.hikvision.com',
          timeout: settings['hikvision.timeout'] || 30000
        });
        
        // Check if we have valid credentials and get connection status
        if (settings['hikvision.accessKey'] && settings['hikvision.secretKey']) {
          await checkConnectionStatus();
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      toast({
        title: "Error",
        description: "Failed to load current settings",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const checkConnectionStatus = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/settings/system-info', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const hikvisionStatus = data.systemInfo?.services?.hikvision;
        
        if (hikvisionStatus) {
          setConnectionStatus({
            status: hikvisionStatus.status === 'healthy' ? 'success' : 'error',
            message: hikvisionStatus.status === 'healthy' ? 'Connected successfully' : hikvisionStatus.error,
            lastTested: new Date().toISOString()
          });
        }
      }
    } catch (error) {
      console.error('Failed to check connection status:', error);
    }
  };

  const handleInputChange = (field: keyof HikvisionCredentials, value: string | number) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
    
    // Reset connection status when credentials change
    if (field === 'accessKey' || field === 'secretKey') {
      setConnectionStatus({ status: 'idle' });
      setDeviceInfo(null);
    }
  };

  const testConnection = async () => {
    if (!credentials.accessKey || !credentials.secretKey) {
      toast({
        title: "Missing Credentials",
        description: "Please enter both Access Key and Secret Key",
        variant: "destructive"
      });
      return;
    }

    setConnectionStatus({ status: 'testing', message: 'Testing connection...' });
    
    try {
      const token = localStorage.getItem('accessToken');
      
      // First save the credentials temporarily for testing
      const saveResponse = await fetch('/api/settings/bulk', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          settings: {
            'hikvision.accessKey': credentials.accessKey,
            'hikvision.secretKey': credentials.secretKey,
            'hikvision.apiUrl': credentials.apiUrl,
            'hikvision.timeout': credentials.timeout
          }
        })
      });
      
      if (!saveResponse.ok) {
        throw new Error('Failed to save credentials for testing');
      }
      
      // Test device discovery
      const testResponse = await fetch('/api/cameras/discover', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (testResponse.ok) {
        const testData = await testResponse.json();
        const deviceCount = testData.devices?.length || 0;
        
        setConnectionStatus({
          status: 'success',
          message: `Connection successful! Found ${deviceCount} device(s)`,
          lastTested: new Date().toISOString()
        });
        
        setDeviceInfo({
          totalDevices: deviceCount,
          onlineDevices: testData.devices?.filter((d: any) => d.status === 'online').length || 0,
          lastSync: new Date().toISOString()
        });
        
        toast({
          title: "Connection Successful",
          description: `Found ${deviceCount} Hikvision device(s)`,
        });
        
        setHasChanges(false); // Mark as saved after successful test
      } else {
        const errorData = await testResponse.json();
        throw new Error(errorData.details || errorData.error || 'Connection test failed');
      }
      
    } catch (error: any) {
      setConnectionStatus({
        status: 'error',
        message: error.message || 'Connection test failed',
        lastTested: new Date().toISOString()
      });
      
      toast({
        title: "Connection Failed",
        description: error.message || 'Failed to connect to Hikvision platform',
        variant: "destructive"
      });
    }
  };

  const saveSettings = async () => {
    if (!credentials.accessKey || !credentials.secretKey) {
      toast({
        title: "Missing Credentials",
        description: "Please enter both Access Key and Secret Key",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/settings/bulk', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          settings: {
            'hikvision.accessKey': credentials.accessKey,
            'hikvision.secretKey': credentials.secretKey,
            'hikvision.apiUrl': credentials.apiUrl,
            'hikvision.timeout': credentials.timeout
          }
        })
      });
      
      if (response.ok) {
        setHasChanges(false);
        toast({
          title: "Settings Saved",
          description: "Hikvision credentials have been saved successfully",
        });
        
        // Auto-test connection after saving
        setTimeout(() => {
          testConnection();
        }, 1000);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save settings');
      }
      
    } catch (error: any) {
      toast({
        title: "Save Failed",
        description: error.message || 'Failed to save Hikvision settings',
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusIcon = () => {
    switch (connectionStatus.status) {
      case 'testing':
        return <RefreshCw className="h-4 w-4 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = () => {
    switch (connectionStatus.status) {
      case 'testing':
        return <Badge variant="secondary">Testing...</Badge>;
      case 'success':
        return <Badge variant="default" className="bg-green-500">Connected</Badge>;
      case 'error':
        return <Badge variant="destructive">Disconnected</Badge>;
      default:
        return <Badge variant="outline">Not Tested</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Hikvision API Settings</CardTitle>
          <CardDescription>Configure your Hikvision platform credentials</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Loading settings...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                🔑 Hikvision API Settings
                {getStatusIcon()}
              </CardTitle>
              <CardDescription>
                Configure your Hikvision platform credentials for camera management and streaming
              </CardDescription>
            </div>
            {getStatusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Connection Status Alert */}
          {connectionStatus.status !== 'idle' && (
            <Alert className={connectionStatus.status === 'success' ? 'border-green-500' : connectionStatus.status === 'error' ? 'border-red-500' : ''}>
              <div className="flex items-center gap-2">
                {getStatusIcon()}
                <AlertDescription>
                  <strong>
                    {connectionStatus.status === 'success' ? 'Connected' : 
                     connectionStatus.status === 'error' ? 'Connection Failed' : 'Testing'}
                  </strong>
                  {connectionStatus.message && (
                    <div className="mt-1 text-sm">{connectionStatus.message}</div>
                  )}
                  {connectionStatus.lastTested && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Last tested: {new Date(connectionStatus.lastTested).toLocaleString()}
                    </div>
                  )}
                </AlertDescription>
              </div>
            </Alert>
          )}

          {/* Credentials Form */}
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="accessKey">Access Key</Label>
              <Input
                id="accessKey"
                type="text"
                placeholder="Enter your Hikvision Access Key"
                value={credentials.accessKey}
                onChange={(e) => handleInputChange('accessKey', e.target.value)}
                className="font-mono"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="secretKey">Secret Key</Label>
              <div className="relative">
                <Input
                  id="secretKey"
                  type={showSecretKey ? 'text' : 'password'}
                  placeholder="Enter your Hikvision Secret Key"
                  value={credentials.secretKey}
                  onChange={(e) => handleInputChange('secretKey', e.target.value)}
                  className="font-mono pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowSecretKey(!showSecretKey)}
                >
                  {showSecretKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="apiUrl">API URL</Label>
              <Input
                id="apiUrl"
                type="url"
                placeholder="https://openapi.hikvision.com"
                value={credentials.apiUrl}
                onChange={(e) => handleInputChange('apiUrl', e.target.value)}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="timeout">Timeout (ms)</Label>
              <Input
                id="timeout"
                type="number"
                min="5000"
                max="60000"
                step="1000"
                value={credentials.timeout}
                onChange={(e) => handleInputChange('timeout', parseInt(e.target.value) || 30000)}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button 
              onClick={testConnection} 
              variant="outline"
              disabled={connectionStatus.status === 'testing' || !credentials.accessKey || !credentials.secretKey}
            >
              <TestTube className="h-4 w-4 mr-2" />
              Test Connection
            </Button>
            
            <Button 
              onClick={saveSettings}
              disabled={isSaving || !hasChanges || !credentials.accessKey || !credentials.secretKey}
            >
              {isSaving ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Settings
            </Button>
          </div>

          {/* Help Text */}
          <div className="text-sm text-muted-foreground space-y-2">
            <p><strong>How to get your Hikvision credentials:</strong></p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li>Log in to your Hikvision account</li>
              <li>Go to Platform Management → API Management</li>
              <li>Create a new API key or use existing credentials</li>
              <li>Copy the Access Key and Secret Key</li>
              <li>Ensure your API key has camera management permissions</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Device Information Card */}
      {deviceInfo && (
        <Card>
          <CardHeader>
            <CardTitle>Device Information</CardTitle>
            <CardDescription>Connected Hikvision devices</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{deviceInfo.totalDevices}</div>
                <div className="text-sm text-muted-foreground">Total Devices</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold text-green-600">{deviceInfo.onlineDevices}</div>
                <div className="text-sm text-muted-foreground">Online Devices</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold text-orange-600">
                  {deviceInfo.totalDevices - deviceInfo.onlineDevices}
                </div>
                <div className="text-sm text-muted-foreground">Offline Devices</div>
              </div>
            </div>
            {deviceInfo.lastSync && (
              <div className="mt-4 text-xs text-muted-foreground">
                Last synced: {new Date(deviceInfo.lastSync).toLocaleString()}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}