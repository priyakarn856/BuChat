import React from 'react';
import { useAuth } from '../../contexts/AuthContext';

const AuthDebug = () => {
  const { user, isAuthenticated } = useAuth();
  const token = localStorage.getItem('token');
  
  if (process.env.NODE_ENV !== 'development') {
    return null; // Only show in development
  }
  
  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: '#f0f0f0',
      padding: '10px',
      borderRadius: '5px',
      fontSize: '12px',
      zIndex: 9999,
      maxWidth: '300px',
      border: '1px solid #ccc'
    }}>
      <h4>Auth Debug</h4>
      <p><strong>Authenticated:</strong> {isAuthenticated ? 'Yes' : 'No'}</p>
      <p><strong>User ID:</strong> {user?.userId || 'None'}</p>
      <p><strong>Username:</strong> {user?.username || 'None'}</p>
      <p><strong>Token:</strong> {token ? `${token.substring(0, 20)}...` : 'None'}</p>
      <p><strong>API URL:</strong> {process.env.REACT_APP_API_URL || 'Default'}</p>
    </div>
  );
};

export default AuthDebug;