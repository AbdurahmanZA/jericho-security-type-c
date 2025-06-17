import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Plus, Edit, Trash2, Users, Shield, Eye, Settings, RefreshCw, AlertTriangle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface User {
  id: number;
  username: string;
  email: string;
  role: 'viewer' | 'operator' | 'admin' | 'superadmin';
  firstName?: string;
  lastName?: string;
  active: boolean;
  lastLogin?: string;
  createdAt: string;
  failedLoginAttempts?: number;
  lockedUntil?: string;
}

interface NewUser {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: 'viewer' | 'operator' | 'admin';
  firstName: string;
  lastName: string;
}

const roleConfig = {
  viewer: {
    label: 'Viewer',
    description: 'Can view cameras and events',
    color: 'bg-blue-500',
    icon: Eye,
    permissions: ['view_cameras', 'view_streams', 'view_events']
  },
  operator: {
    label: 'Operator',
    description: 'Can control cameras and manage streams',
    color: 'bg-green-500',
    icon: Settings,
    permissions: ['view_cameras', 'view_streams', 'view_events', 'control_cameras', 'manage_streams']
  },
  admin: {
    label: 'Administrator',
    description: 'Full system access',
    color: 'bg-purple-500',
    icon: Shield,
    permissions: ['*']
  },
  superadmin: {
    label: 'Super Admin',
    description: 'Complete system control',
    color: 'bg-red-500',
    icon: Shield,
    permissions: ['*']
  }
};

export function UserManagement() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  
  const [newUser, setNewUser] = useState<NewUser>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'viewer',
    firstName: '',
    lastName: ''
  });

  const [editUser, setEditUser] = useState<Partial<User>>({});
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    loadUsers();
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data.user);
      }
    } catch (error) {
      console.error('Failed to load current user:', error);
    }
  };

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      
      // Note: This endpoint doesn't exist in the backend yet, we'll need to create it
      // For now, we'll mock some users or create the endpoint
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      } else if (response.status === 404) {
        // Endpoint doesn't exist yet, show empty state
        setUsers([]);
      }
    } catch (error) {
      console.error('Failed to load users:', error);
      // For development, show empty state
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  const createUser = async () => {
    if (newUser.password !== newUser.confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "Passwords do not match",
        variant: "destructive"
      });
      return;
    }

    if (newUser.password.length < 8) {
      toast({
        title: "Weak Password",
        description: "Password must be at least 8 characters long",
        variant: "destructive"
      });
      return;
    }

    setIsCreating(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: newUser.username,
          email: newUser.email,
          password: newUser.password,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(prev => [...prev, data.user]);
        setShowCreateDialog(false);
        setNewUser({
          username: '',
          email: '',
          password: '',
          confirmPassword: '',
          role: 'viewer',
          firstName: '',
          lastName: ''
        });
        
        toast({
          title: "User Created",
          description: `User ${newUser.username} has been created successfully`,
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create user');
      }
    } catch (error: any) {
      toast({
        title: "Creation Failed",
        description: error.message || 'Failed to create user',
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };

  const updateUser = async () => {
    if (!editingUser) return;

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(editUser)
      });
      
      if (response.ok) {
        const data = await response.json();
        setUsers(prev => prev.map(user => 
          user.id === editingUser.id ? { ...user, ...data.user } : user
        ));
        setShowEditDialog(false);
        setEditingUser(null);
        setEditUser({});
        
        toast({
          title: "User Updated",
          description: "User has been updated successfully",
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update user');
      }
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: error.message || 'Failed to update user',
        variant: "destructive"
      });
    }
  };

  const deleteUser = async (userId: number) => {
    if (currentUser?.id === userId) {
      toast({
        title: "Cannot Delete",
        description: "You cannot delete your own account",
        variant: "destructive"
      });
      return;
    }

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        setUsers(prev => prev.filter(user => user.id !== userId));
        toast({
          title: "User Deleted",
          description: "User has been deleted successfully",
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete user');
      }
    } catch (error: any) {
      toast({
        title: "Deletion Failed",
        description: error.message || 'Failed to delete user',
        variant: "destructive"
      });
    }
  };

  const toggleUserStatus = async (userId: number, active: boolean) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ active })
      });
      
      if (response.ok) {
        setUsers(prev => prev.map(user => 
          user.id === userId ? { ...user, active } : user
        ));
        toast({
          title: active ? "User Activated" : "User Deactivated",
          description: `User has been ${active ? 'activated' : 'deactivated'} successfully`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: 'Failed to update user status',
        variant: "destructive"
      });
    }
  };

  const getRoleBadge = (role: string) => {
    const config = roleConfig[role as keyof typeof roleConfig];
    if (!config) return null;
    
    const IconComponent = config.icon;
    
    return (
      <Badge variant="secondary" className={`${config.color} text-white`}>
        <IconComponent className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const formatLastLogin = (lastLogin?: string) => {
    if (!lastLogin) return 'Never';
    const date = new Date(lastLogin);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const canManageUser = (user: User) => {
    if (!currentUser) return false;
    if (currentUser.role === 'superadmin') return true;
    if (currentUser.role === 'admin' && user.role !== 'superadmin') return true;
    return false;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>Manage system users and their permissions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            <span>Loading users...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* User Management Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                User Management
              </CardTitle>
              <CardDescription>
                Manage system users, roles, and permissions
              </CardDescription>
            </div>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create New User</DialogTitle>
                  <DialogDescription>
                    Add a new user to the JERICHO Security system
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        value={newUser.firstName}
                        onChange={(e) => setNewUser(prev => ({ ...prev, firstName: e.target.value }))}
                        placeholder="John"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        value={newUser.lastName}
                        onChange={(e) => setNewUser(prev => ({ ...prev, lastName: e.target.value }))}
                        placeholder="Doe"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={newUser.username}
                      onChange={(e) => setNewUser(prev => ({ ...prev, username: e.target.value }))}
                      placeholder="johndoe"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="john@example.com"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select value={newUser.role} onValueChange={(value: 'viewer' | 'operator' | 'admin') => 
                      setNewUser(prev => ({ ...prev, role: value }))
                    }>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer - View only access</SelectItem>
                        <SelectItem value="operator">Operator - Camera control</SelectItem>
                        {currentUser?.role === 'superadmin' && (
                          <SelectItem value="admin">Administrator - Full access</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="••••••••"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={newUser.confirmPassword}
                      onChange={(e) => setNewUser(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      placeholder="••••••••"
                    />
                  </div>
                  
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={createUser} disabled={isCreating}>
                      {isCreating ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      Create User
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No users found. The user management endpoint may not be implemented yet.
                <br />
                <span className="text-xs mt-2 block">Note: This feature requires backend API implementation for user listing.</span>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {user.firstName && user.lastName 
                              ? `${user.firstName} ${user.lastName}` 
                              : user.username}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {user.email}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getRoleBadge(user.role)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.active ? "default" : "secondary"}>
                          {user.active ? 'Active' : 'Inactive'}
                        </Badge>
                        {user.lockedUntil && new Date(user.lockedUntil) > new Date() && (
                          <Badge variant="destructive" className="ml-2">Locked</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatLastLogin(user.lastLogin)}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canManageUser(user) && (
                              <>
                                <DropdownMenuItem onClick={() => {
                                  setEditingUser(user);
                                  setEditUser({
                                    firstName: user.firstName,
                                    lastName: user.lastName,
                                    email: user.email,
                                    role: user.role
                                  });
                                  setShowEditDialog(true);
                                }}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => toggleUserStatus(user.id, !user.active)}>
                                  {user.active ? 'Deactivate' : 'Activate'}
                                </DropdownMenuItem>
                                {currentUser?.id !== user.id && (
                                  <DropdownMenuItem 
                                    className="text-red-600"
                                    onClick={() => deleteUser(user.id)}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role Permissions Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Role Permissions</CardTitle>
          <CardDescription>
            Understanding user roles and their capabilities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(roleConfig).filter(([role]) => role !== 'superadmin').map(([role, config]) => {
              const IconComponent = config.icon;
              return (
                <div key={role} className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <IconComponent className="h-4 w-4" />
                    <span className="font-medium">{config.label}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{config.description}</p>
                  <div className="space-y-1">
                    {config.permissions.slice(0, 3).map((permission) => (
                      <div key={permission} className="text-xs bg-muted px-2 py-1 rounded">
                        {permission === '*' ? 'All permissions' : permission.replace('_', ' ')}
                      </div>
                    ))}
                    {config.permissions.length > 3 && (
                      <div className="text-xs text-muted-foreground">+{config.permissions.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information and permissions
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editFirstName">First Name</Label>
                  <Input
                    id="editFirstName"
                    value={editUser.firstName || ''}
                    onChange={(e) => setEditUser(prev => ({ ...prev, firstName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editLastName">Last Name</Label>
                  <Input
                    id="editLastName"
                    value={editUser.lastName || ''}
                    onChange={(e) => setEditUser(prev => ({ ...prev, lastName: e.target.value }))}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="editEmail">Email</Label>
                <Input
                  id="editEmail"
                  type="email"
                  value={editUser.email || ''}
                  onChange={(e) => setEditUser(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="editRole">Role</Label>
                <Select 
                  value={editUser.role || editingUser.role} 
                  onValueChange={(value) => setEditUser(prev => ({ ...prev, role: value as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">Viewer</SelectItem>
                    <SelectItem value="operator">Operator</SelectItem>
                    {currentUser?.role === 'superadmin' && (
                      <SelectItem value="admin">Administrator</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={updateUser}>
                  Update User
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}