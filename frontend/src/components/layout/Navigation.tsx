import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { 
  Home, 
  Camera, 
  Activity, 
  Settings as SettingsIcon, 
  Shield, 
  BarChart3,
  Users,
  Bell
} from 'lucide-react';

const navigationItems = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
  { name: 'Cameras', href: '/cameras', icon: Camera },
  { name: 'Events', href: '/events', icon: Activity },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Users', href: '/users', icon: Users },
  { name: 'Alerts', href: '/alerts', icon: Bell },
  { name: 'Security', href: '/security', icon: Shield },
  { name: 'Settings', href: '/settings', icon: SettingsIcon },
];

export function Navigation() {
  const location = useLocation();

  return (
    <nav className="flex h-16 items-center space-x-4 px-6 border-b">
      <div className="flex items-center space-x-2">
        <Shield className="h-6 w-6 text-blue-600" />
        <span className="text-xl font-bold">JERICHO Security</span>
      </div>
      
      <div className="flex-1" />
      
      <div className="flex items-center space-x-1">
        {navigationItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = location.pathname === item.href;
          
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <IconComponent className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}