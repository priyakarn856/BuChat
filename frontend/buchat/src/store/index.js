/**
 * Redux Toolkit Store Configuration
 * Industry-standard state management for BuChat
 */
import { configureStore } from '@reduxjs/toolkit';
import messagesReducer from './slices/messagesSlice';
import callsReducer from './slices/callsSlice';
import settingsReducer from './slices/settingsSlice';
import uiReducer from './slices/uiSlice';
import connectionReducer from './slices/connectionSlice';

// Middleware for performance monitoring in development
const performanceMiddleware = (store) => (next) => (action) => {
  if (process.env.NODE_ENV === 'development') {
    const start = performance.now();
    const result = next(action);
    const end = performance.now();
    
    if (end - start > 16) { // Warn if action takes more than 16ms (1 frame)
      console.warn(`[Redux] Slow action: ${action.type} took ${(end - start).toFixed(2)}ms`);
    }
    return result;
  }
  return next(action);
};

// Debounce middleware for high-frequency updates
const debounceMiddleware = (store) => (next) => {
  const pending = new Map();
  
  return (action) => {
    // Debounce specific high-frequency actions
    const debounceActions = ['messages/updateTyping', 'connection/updateOnlineStatus'];
    
    if (debounceActions.includes(action.type)) {
      if (pending.has(action.type)) {
        clearTimeout(pending.get(action.type));
      }
      
      pending.set(action.type, setTimeout(() => {
        pending.delete(action.type);
        next(action);
      }, 50));
      
      return;
    }
    
    return next(action);
  };
};

export const store = configureStore({
  reducer: {
    messages: messagesReducer,
    calls: callsReducer,
    settings: settingsReducer,
    ui: uiReducer,
    connection: connectionReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore non-serializable values in specific paths
        ignoredActions: ['calls/setLocalStream', 'calls/setRemoteStream'],
        ignoredPaths: ['calls.localStream', 'calls.remoteStream'],
      },
      immutableCheck: process.env.NODE_ENV === 'development',
    }).concat(performanceMiddleware, debounceMiddleware),
  devTools: process.env.NODE_ENV !== 'production',
});

// Persist critical settings to localStorage
store.subscribe(() => {
  const state = store.getState();
  try {
    const settingsToPersist = {
      videoQuality: state.settings.videoQuality,
      audioSettings: state.settings.audioSettings,
      theme: state.settings.theme,
      notifications: state.settings.notifications,
    };
    localStorage.setItem('buchat_settings', JSON.stringify(settingsToPersist));
  } catch (err) {
    console.warn('Failed to persist settings:', err);
  }
});

export default store;
