import React, { useState, useEffect } from 'react';
import CameraGrid from './components/CameraGrid';
import './App.css';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loginData, setLoginData] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState<string>('');

  useEffect(() => {
    // Check if user is already authenticated
    const token = localStorage.getItem('jericho_token');
    if (token) {
      // Verify token with backend
      fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(response => {
        if (response.ok) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('jericho_token');
        }
      })
      .catch(() => {
        localStorage.removeItem('jericho_token');
      })
      .finally(() => {
        setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginData)
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('jericho_token', data.token);
        setIsAuthenticated(true);
      } else {
        const error = await response.json();
        setLoginError(error.message || 'Login failed');
      }
    } catch (error) {
      setLoginError('Network error. Please try again.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('jericho_token');
    setIsAuthenticated(false);
    setLoginData({ username: '', password: '' });
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading JERICHO Security...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>🎥 JERICHO Security</h1>
            <p>Type-C Surveillance System</p>
          </div>
          
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                value={loginData.username}
                onChange={(e) => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                placeholder="Enter username"
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={loginData.password}
                onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                placeholder="Enter password"
                required
              />
            </div>
            
            {loginError && (
              <div className="error-message">
                ❌ {loginError}
              </div>
            )}
            
            <button type="submit" className="login-button">
              🔐 Login
            </button>
          </form>
          
          <div className="login-info">
            <p><strong>Default Credentials:</strong></p>
            <p>Username: <code>admin</code></p>
            <p>Password: <code>admin123!</code></p>
            <p className="warning">⚠️ Change password after first login!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>🎥 JERICHO Security Type-C</h1>
          <div className="header-actions">
            <span className="user-info">👤 Welcome, Admin</span>
            <button onClick={handleLogout} className="logout-button">
              🚪 Logout
            </button>
          </div>
        </div>
      </header>
      
      <main className="app-main">
        <CameraGrid />
      </main>
    </div>
  );
};

export default App;