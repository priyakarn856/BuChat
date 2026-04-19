/**
 * Enhanced WebSocket Hook
 * Industry-standard WebSocket management with Redux integration
 * Features: Reconnection, heartbeat, typing indicators, presence
 */
import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  setWebSocketStatus,
  updateNetworkQuality,
  addOnlineUser,
  removeOnlineUser,
  setTypingIndicator,
  clearTypingIndicator,
  incrementReconnectAttempts,
  resetReconnectAttempts,
  setLastPingTime
} from '../store/slices/connectionSlice';

// Configuration
const CONFIG = {
  // Heartbeat interval (ms)
  HEARTBEAT_INTERVAL: 25000,
  // Heartbeat timeout - if no pong received (ms)
  HEARTBEAT_TIMEOUT: 35000,
  // Initial reconnect delay (ms)
  RECONNECT_DELAY_INITIAL: 1000,
  // Max reconnect delay (ms)
  RECONNECT_DELAY_MAX: 30000,
  // Reconnect delay multiplier (exponential backoff)
  RECONNECT_DELAY_MULTIPLIER: 1.5,
  // Max reconnect attempts before giving up (0 = unlimited)
  MAX_RECONNECT_ATTEMPTS: 0,
  // Typing indicator timeout (ms)
  TYPING_TIMEOUT: 3000,
};

export const useEnhancedWebSocket = (wsUrl, token, userId) => {
  const dispatch = useDispatch();
  const { status, reconnectAttempts } = useSelector(state => state.connection);
  
  const socketRef = useRef(null);
  const heartbeatRef = useRef(null);
  const heartbeatTimeoutRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const typingTimeoutsRef = useRef(new Map());
  const messageQueueRef = useRef([]);
  const listenersRef = useRef([]);
  const reconnectDelayRef = useRef(CONFIG.RECONNECT_DELAY_INITIAL);

  // Calculate reconnect delay with exponential backoff
  const getReconnectDelay = useCallback(() => {
    const delay = reconnectDelayRef.current;
    reconnectDelayRef.current = Math.min(
      delay * CONFIG.RECONNECT_DELAY_MULTIPLIER,
      CONFIG.RECONNECT_DELAY_MAX
    );
    return delay;
  }, []);

  // Reset reconnect delay on successful connection
  const resetReconnectDelay = useCallback(() => {
    reconnectDelayRef.current = CONFIG.RECONNECT_DELAY_INITIAL;
    dispatch(resetReconnectAttempts());
  }, [dispatch]);

  // Send message (queues if not connected)
  const sendMessage = useCallback((message) => {
    const socket = socketRef.current;
    
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return true;
    }
    
    // Queue message for sending when connected
    messageQueueRef.current.push(message);
    console.log('📝 Message queued (socket not ready):', message.action);
    return false;
  }, []);

  // Flush message queue
  const flushMessageQueue = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const queue = messageQueueRef.current;
    messageQueueRef.current = [];
    
    queue.forEach(message => {
      socket.send(JSON.stringify(message));
    });

    if (queue.length > 0) {
      console.log(`📤 Flushed ${queue.length} queued messages`);
    }
  }, []);

  // Start heartbeat
  const startHeartbeat = useCallback(() => {
    stopHeartbeat();

    heartbeatRef.current = setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        dispatch(setLastPingTime(Date.now()));
        sendMessage({ action: 'ping', timestamp: Date.now() });

        // Set timeout for pong response
        heartbeatTimeoutRef.current = setTimeout(() => {
          console.warn('⏰ Heartbeat timeout - no pong received');
          socketRef.current?.close();
        }, CONFIG.HEARTBEAT_TIMEOUT - CONFIG.HEARTBEAT_INTERVAL);
      }
    }, CONFIG.HEARTBEAT_INTERVAL);
  }, [dispatch, sendMessage]);

  // Stop heartbeat
  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.action) {
        case 'pong':
          // Clear heartbeat timeout
          if (heartbeatTimeoutRef.current) {
            clearTimeout(heartbeatTimeoutRef.current);
            heartbeatTimeoutRef.current = null;
          }
          // Calculate latency
          if (data.timestamp) {
            const latency = Date.now() - data.timestamp;
            dispatch(updateNetworkQuality({
              latency,
              isOnline: true
            }));
          }
          break;

        case 'typing':
          if (data.userId && data.conversationId) {
            if (data.isTyping) {
              dispatch(setTypingIndicator({
                conversationId: data.conversationId,
                userId: data.userId
              }));
              
              // Auto-clear typing after timeout
              const key = `${data.conversationId}:${data.userId}`;
              if (typingTimeoutsRef.current.has(key)) {
                clearTimeout(typingTimeoutsRef.current.get(key));
              }
              typingTimeoutsRef.current.set(key, setTimeout(() => {
                dispatch(clearTypingIndicator({
                  conversationId: data.conversationId,
                  userId: data.userId
                }));
              }, CONFIG.TYPING_TIMEOUT));
            } else {
              dispatch(clearTypingIndicator({
                conversationId: data.conversationId,
                userId: data.userId
              }));
            }
          }
          break;

        case 'presence':
          if (data.onlineUsers) {
            data.onlineUsers.forEach(uid => dispatch(addOnlineUser(uid)));
          }
          break;

        case 'user_online':
          if (data.userId) {
            dispatch(addOnlineUser(data.userId));
          }
          break;

        case 'user_offline':
          if (data.userId) {
            dispatch(removeOnlineUser(data.userId));
          }
          break;

        default:
          // Pass to listeners for other message types
          break;
      }

      // Notify all listeners
      listenersRef.current.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error('WebSocket listener error:', error);
        }
      });
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }, [dispatch]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!wsUrl || !token || !userId) {
      console.warn('WebSocket: Missing URL, token, or userId');
      return;
    }

    // Don't reconnect if already connected or connecting
    if (socketRef.current?.readyState === WebSocket.OPEN ||
        socketRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Check max reconnect attempts
    if (CONFIG.MAX_RECONNECT_ATTEMPTS > 0 && 
        reconnectAttempts >= CONFIG.MAX_RECONNECT_ATTEMPTS) {
      console.error('WebSocket: Max reconnect attempts reached');
      dispatch(setWebSocketStatus('failed'));
      return;
    }

    dispatch(setWebSocketStatus('connecting'));
    console.log('🔌 WebSocket connecting...');

    try {
      const socket = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('✅ WebSocket connected');
        dispatch(setWebSocketStatus('connected'));
        resetReconnectDelay();
        startHeartbeat();
        flushMessageQueue();
      };

      socket.onmessage = handleMessage;

      socket.onclose = (event) => {
        console.log(`🔌 WebSocket disconnected (code: ${event.code})`);
        dispatch(setWebSocketStatus('disconnected'));
        stopHeartbeat();

        // Don't reconnect on intentional close (1000) or auth error (4401)
        if (event.code === 1000 || event.code === 4401) {
          return;
        }

        // Schedule reconnect
        const delay = getReconnectDelay();
        console.log(`🔄 Reconnecting in ${delay}ms...`);
        dispatch(incrementReconnectAttempts());
        
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      socket.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };

    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      dispatch(setWebSocketStatus('error'));
    }
  }, [wsUrl, token, userId, dispatch, reconnectAttempts, getReconnectDelay, 
      resetReconnectDelay, startHeartbeat, stopHeartbeat, handleMessage, flushMessageQueue]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    stopHeartbeat();

    if (socketRef.current) {
      socketRef.current.close(1000, 'User disconnected');
      socketRef.current = null;
    }

    dispatch(setWebSocketStatus('disconnected'));
  }, [dispatch, stopHeartbeat]);

  // Subscribe to a conversation
  const subscribe = useCallback((conversationId) => {
    sendMessage({
      action: 'subscribe',
      conversationId
    });
  }, [sendMessage]);

  // Unsubscribe from a conversation
  const unsubscribe = useCallback((conversationId) => {
    sendMessage({
      action: 'unsubscribe',
      conversationId
    });
  }, [sendMessage]);

  // Send typing indicator
  const sendTyping = useCallback((conversationId, isTyping = true) => {
    sendMessage({
      action: 'typing',
      conversationId,
      isTyping
    });
  }, [sendMessage]);

  // Request presence for a conversation
  const requestPresence = useCallback((conversationId) => {
    sendMessage({
      action: 'presence',
      conversationId
    });
  }, [sendMessage]);

  // Add message listener
  const addListener = useCallback((listener) => {
    listenersRef.current.push(listener);
    return () => {
      listenersRef.current = listenersRef.current.filter(l => l !== listener);
    };
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();

    // Handle visibility change
    const handleVisibility = () => {
      if (document.hidden) {
        // Could reduce heartbeat frequency here
      } else {
        // Ensure connected when visible
        if (socketRef.current?.readyState !== WebSocket.OPEN) {
          connect();
        }
      }
    };

    // Handle online/offline
    const handleOnline = () => {
      console.log('🌐 Browser came online');
      connect();
    };

    const handleOffline = () => {
      console.log('🌐 Browser went offline');
      dispatch(updateNetworkQuality({ isOnline: false }));
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      disconnect();
    };
  }, [connect, disconnect, dispatch]);

  return {
    status,
    isConnected: status === 'connected',
    connect,
    disconnect,
    sendMessage,
    subscribe,
    unsubscribe,
    sendTyping,
    requestPresence,
    addListener
  };
};

export default useEnhancedWebSocket;
