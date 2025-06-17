import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HikvisionSettings } from '@/components/settings/HikvisionSettings';
import { MotionDetectionSettings } from '@/components/settings/MotionDetectionSettings';
import { UserManagement } from '@/components/settings/UserManagement';
import { SystemSettings } from '@/components/settings/SystemSettings';
import { Key, Activity, Users, Monitor, Cog } from 'lucide-react';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('hikvision');

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Cog className="h-6 w-6" />
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="hikvision" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Hikvision API
          </TabsTrigger>
          <TabsTrigger value="motion" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Motion Detection
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            User Management
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            System
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="hikvision" className="space-y-6">
          <HikvisionSettings />
        </TabsContent>
        
        <TabsContent value="motion" className="space-y-6">
          <MotionDetectionSettings />
        </TabsContent>
        
        <TabsContent value="users" className="space-y-6">
          <UserManagement />
        </TabsContent>
        
        <TabsContent value="system" className="space-y-6">
          <SystemSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}