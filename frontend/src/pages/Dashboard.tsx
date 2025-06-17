import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Camera, Activity, Users, Shield, TrendingUp, AlertTriangle } from 'lucide-react';

export default function Dashboard() {
  const stats = [
    {
      title: 'Active Cameras',
      value: '12',
      description: '2 offline',
      icon: Camera,
      status: 'success'
    },
    {
      title: 'Motion Events',
      value: '47',
      description: 'Last 24 hours',
      icon: Activity,
      status: 'info'
    },
    {
      title: 'Active Users', 
      value: '8',
      description: '3 online now',
      icon: Users,
      status: 'success'
    },
    {
      title: 'Security Alerts',
      value: '3',
      description: '1 critical',
      icon: AlertTriangle,
      status: 'warning'
    }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <TrendingUp className="h-6 w-6" />
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const IconComponent = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <IconComponent className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Events</CardTitle>
            <CardDescription>
              Latest motion detection and security events
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge>Motion</Badge>
              <span className="flex-1 text-sm">Front Door Camera - Motion detected</span>
              <span className="text-xs text-muted-foreground">2 min ago</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="destructive">Alert</Badge>
              <span className="flex-1 text-sm">Parking Lot Camera - Object detection</span>
              <span className="text-xs text-muted-foreground">15 min ago</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary">Info</Badge>
              <span className="flex-1 text-sm">Lobby Camera - Recording started</span>
              <span className="text-xs text-muted-foreground">1 hour ago</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>
              Current system health and performance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Hikvision API</span>
              <Badge className="bg-green-500">Connected</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Database</span>
              <Badge className="bg-green-500">Healthy</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Motion Detection</span>
              <Badge className="bg-green-500">Active</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Streaming Service</span>
              <Badge variant="secondary">Degraded</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}