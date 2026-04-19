import React, { createContext, useContext, useState, useEffect } from 'react';
import { userService } from '../services/userService';
import messagingService from '../services/messagingService';
import signalProtocol from '../utils/signalProtocol';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load user and token from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    const savedToken = localStorage.getItem('token');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (error) {
        localStorage.removeItem('user');
      }
    }
    if (savedToken) {
      setToken(savedToken);
    }
    setLoading(false);
  }, []);

  // Save user to localStorage whenever it changes
  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
  }, [user]);

  const login = async (username, password) => {
    try {
      const response = await userService.login({ username, password });
      const userData = response.user;
      const authToken = response.token;
      
      // Save token and user FIRST before any authenticated requests
      if (authToken) {
        localStorage.setItem('token', authToken);
        setToken(authToken);
      }
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      
      // Initialize E2E encryption and restore keys from cloud backup
      // Use setTimeout to ensure localStorage is properly set
      setTimeout(async () => {
        try {
          // CRITICAL ORDER FIX:
          // Step 1: Initialize Signal Protocol (just identity, no preKey generation yet)
          await signalProtocol.initialize();
          
          // Step 2: Try to restore from cloud FIRST (gets our old preKeys)
          const restored = await messagingService.restoreEncryptionKeys(password);
          console.log('🔐 Cloud restore result:', restored ? 'restored' : 'no backup found');
          
          // Step 3: Now initialize encryption (generates preKeys only if needed, uploads bundle)
          await messagingService.initializeEncryption();
          
          // Step 4: Backup current keys to cloud (ensures cloud has latest keys)
          await messagingService.backupEncryptionKeys(password);
          
          console.log('✅ E2E encryption fully initialized and synced');
        } catch (err) {
          console.error('Encryption initialization error:', err);
        }
      }, 100);
      
      return userData;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('Invalid username or password');
      }
      if (error.response?.status === 403) {
        const errorData = error.response?.data;
        throw new Error(errorData?.message || 'Please verify your email before logging in');
      }
      throw new Error('Login failed. Please try again.');
    }
  };

  const register = async (userData) => {
    try {
      const response = await userService.register(userData);
      const newUser = response.user;
      const authToken = response.token;
      
      // Save token and user FIRST
      if (authToken) {
        localStorage.setItem('token', authToken);
        setToken(authToken);
      }
      localStorage.setItem('user', JSON.stringify(newUser));
      setUser(newUser);
      
      // Initialize E2E encryption and backup keys to cloud
      setTimeout(async () => {
        try {
          await messagingService.initializeEncryption();
          await messagingService.backupEncryptionKeys(userData.password);
        } catch (err) {
          console.error('Encryption backup error:', err);
        }
      }, 100);
      
      return { user: newUser, message: response.message };
    } catch (error) {
      if (error.response?.status === 409) {
        throw new Error('Username or email already exists');
      }
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error('Failed to register. Please try again.');
    }
  };

  const logout = () => {
    messagingService.cleanup();
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  const updateUser = async (updates) => {
    if (!user) return;
    try {
      await userService.updateUserProfile(user.username, { ...updates, userId: user.userId });
      const response = await userService.getUserProfile(user.username);
      const updatedUser = response.user;
      setUser(updatedUser);
      return updatedUser;
    } catch (error) {
      throw new Error('Failed to update user');
    }
  };

  const googleAuth = async (idToken) => {
    try {
      const response = await userService.googleAuth(idToken);
      const userData = response.user;
      const authToken = response.token;
      
      // Save token and user FIRST
      if (authToken) {
        localStorage.setItem('token', authToken);
        setToken(authToken);
      }
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
      
      // Initialize E2E encryption - derive a secure password for Google users
      // Combine userId + email + a constant to create deterministic but harder-to-guess password
      const backupPassword = `${userData.userId}_${userData.email}_e2e_backup_v1`;
      setTimeout(async () => {
        try {
          await messagingService.initializeEncryption();
          await messagingService.restoreEncryptionKeys(backupPassword);
          await messagingService.backupEncryptionKeys(backupPassword);
        } catch (err) {
          console.error('Encryption initialization error:', err);
        }
      }, 100);
      
      return userData;
    } catch (error) {
      throw new Error('Google Sign-In failed');
    }
  };

  const refreshUser = async (newUsername) => {
    if (!user) return;
    try {
      const usernameToFetch = newUsername || user.username;
      const response = await userService.getUserProfile(usernameToFetch);
      const updatedUser = response.user;
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      return updatedUser;
    } catch (error) {
      // Failed to refresh user
    }
  };

  const value = {
    user,
    token,
    loading,
    login,
    register,
    googleAuth,
    logout,
    updateUser,
    refreshUser,
    setUser,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
