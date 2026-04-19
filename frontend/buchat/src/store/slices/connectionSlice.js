/**
 * Connection Slice - WebSocket and network connection state
 */
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // WebSocket connection
  webSocket: {
    isConnected: false,
    isConnecting: false,
    reconnectAttempts: 0,
    maxReconnectAttempts: 10,
    lastConnected: null,
    lastDisconnected: null,
    error: null,
  },
  
  // Network status
  network: {
    isOnline: navigator.onLine,
    type: null, // '4g', '3g', 'wifi', etc.
    effectiveType: null,
    downlink: null, // Mbps
    rtt: null, // ms
    saveData: false,
  },
  
  // Online status of users
  onlineUsers: {}, // { oderId: { isOnline, lastSeen } }
  
  // Typing indicators
  typingIndicators: {}, // { conversationId: { userId: timestamp } }
  
  // Connection quality
  quality: {
    level: 'good', // 'excellent', 'good', 'fair', 'poor'
    latency: 0,
    jitter: 0,
    packetLoss: 0,
  },
  
  // Sync status
  sync: {
    isSyncing: false,
    lastSynced: null,
    pendingOperations: 0,
  },
};

const connectionSlice = createSlice({
  name: 'connection',
  initialState,
  reducers: {
    // WebSocket connection
    wsConnecting: (state) => {
      state.webSocket.isConnecting = true;
      state.webSocket.error = null;
    },
    
    wsConnected: (state) => {
      state.webSocket.isConnected = true;
      state.webSocket.isConnecting = false;
      state.webSocket.reconnectAttempts = 0;
      state.webSocket.lastConnected = Date.now();
      state.webSocket.error = null;
    },
    
    wsDisconnected: (state, action) => {
      state.webSocket.isConnected = false;
      state.webSocket.isConnecting = false;
      state.webSocket.lastDisconnected = Date.now();
      state.webSocket.error = action.payload?.reason || null;
    },
    
    wsReconnecting: (state) => {
      state.webSocket.isConnecting = true;
      state.webSocket.reconnectAttempts += 1;
    },
    
    wsError: (state, action) => {
      state.webSocket.error = action.payload;
      state.webSocket.isConnecting = false;
    },
    
    resetReconnectAttempts: (state) => {
      state.webSocket.reconnectAttempts = 0;
    },
    
    // Network status
    setNetworkOnline: (state, action) => {
      state.network.isOnline = action.payload;
    },
    
    updateNetworkInfo: (state, action) => {
      state.network = { ...state.network, ...action.payload };
    },
    
    // Online users
    updateOnlineStatus: (state, action) => {
      const { oderId, isOnline, lastSeen } = action.payload;
      state.onlineUsers[oderId] = { isOnline, lastSeen };
    },
    
    setOnlineUsers: (state, action) => {
      // Batch update online users
      action.payload.forEach(({ oderId, isOnline, lastSeen }) => {
        state.onlineUsers[oderId] = { isOnline, lastSeen };
      });
    },
    
    // Typing indicators
    setTyping: (state, action) => {
      const { conversationId, userId, isTyping } = action.payload;
      
      if (!state.typingIndicators[conversationId]) {
        state.typingIndicators[conversationId] = {};
      }
      
      if (isTyping) {
        state.typingIndicators[conversationId][userId] = Date.now();
      } else {
        delete state.typingIndicators[conversationId][userId];
      }
    },
    
    clearStaleTyping: (state) => {
      // Clear typing indicators older than 5 seconds
      const now = Date.now();
      Object.keys(state.typingIndicators).forEach(convId => {
        Object.keys(state.typingIndicators[convId]).forEach(userId => {
          if (now - state.typingIndicators[convId][userId] > 5000) {
            delete state.typingIndicators[convId][userId];
          }
        });
        
        // Clean up empty conversation objects
        if (Object.keys(state.typingIndicators[convId]).length === 0) {
          delete state.typingIndicators[convId];
        }
      });
    },
    
    // Connection quality
    updateQuality: (state, action) => {
      const { latency, jitter, packetLoss } = action.payload;
      
      state.quality.latency = latency || state.quality.latency;
      state.quality.jitter = jitter || state.quality.jitter;
      state.quality.packetLoss = packetLoss || state.quality.packetLoss;
      
      // Calculate quality level
      if (latency < 50 && packetLoss < 0.5) {
        state.quality.level = 'excellent';
      } else if (latency < 100 && packetLoss < 1) {
        state.quality.level = 'good';
      } else if (latency < 200 && packetLoss < 3) {
        state.quality.level = 'fair';
      } else {
        state.quality.level = 'poor';
      }
    },
    
    // Sync status
    startSync: (state) => {
      state.sync.isSyncing = true;
    },
    
    endSync: (state) => {
      state.sync.isSyncing = false;
      state.sync.lastSynced = Date.now();
      state.sync.pendingOperations = 0;
    },
    
    addPendingOperation: (state) => {
      state.sync.pendingOperations += 1;
    },
    
    removePendingOperation: (state) => {
      state.sync.pendingOperations = Math.max(0, state.sync.pendingOperations - 1);
    },
  },
});

export const {
  wsConnecting,
  wsConnected,
  wsDisconnected,
  wsReconnecting,
  wsError,
  resetReconnectAttempts,
  setNetworkOnline,
  updateNetworkInfo,
  updateOnlineStatus,
  setOnlineUsers,
  setTyping,
  clearStaleTyping,
  updateQuality,
  startSync,
  endSync,
  addPendingOperation,
  removePendingOperation,
} = connectionSlice.actions;

export default connectionSlice.reducer;

// Selectors
export const selectWebSocketStatus = (state) => state.connection.webSocket;
export const selectIsConnected = (state) => state.connection.webSocket.isConnected;
export const selectNetworkStatus = (state) => state.connection.network;
export const selectIsOnline = (state) => state.connection.network.isOnline;
export const selectUserOnlineStatus = (oderId) => (state) => 
  state.connection.onlineUsers[oderId] || { isOnline: false, lastSeen: null };
export const selectTypingUsers = (conversationId) => (state) => {
  const typing = state.connection.typingIndicators[conversationId];
  return typing ? Object.keys(typing) : [];
};
export const selectConnectionQuality = (state) => state.connection.quality;
export const selectSyncStatus = (state) => state.connection.sync;
