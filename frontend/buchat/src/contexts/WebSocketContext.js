import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import signalProtocol from '../utils/signalProtocol';
import messagingService from '../services/messagingService';

const WebSocketContext = createContext(null);

export const useWebSocket = () => useContext(WebSocketContext);

export const WebSocketProvider = ({ children }) => {
  const { user, token } = useAuth();
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const listenersRef = useRef([]);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);

  const connect = useCallback(() => {
    if (!user || !token) {
      console.warn('WebSocket: Cannot connect - missing user or token');
      return;
    }
    
    const wsUrl = process.env.REACT_APP_WEBSOCKET_URL;
    if (!wsUrl) {
      console.warn('WebSocket URL not configured');
      return;
    }

    // Close existing connection if any
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch (e) {
        console.warn('Error closing existing WebSocket:', e);
      }
    }

    console.log('🔌 Connecting to WebSocket:', wsUrl);
    console.log('🔑 Token (first 20 chars):', token?.substring(0, 20) + '...');
    console.log('👤 User ID:', user?.userId);

    try {
      const socket = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('✅ WebSocket connected successfully');
        setIsConnected(true);
        
        // Set user as online
        messagingService.setOnlineStatus(true).catch(console.error);
        
        // Start heartbeat - ping every 25 seconds (before 30s timeout)
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
        }
        heartbeatIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            console.log('💓 Sending heartbeat ping');
            socket.send(JSON.stringify({ action: 'ping' }));
            // Maintain online status with heartbeat
            messagingService.setOnlineStatus(true).catch(() => {});
          }
        }, 25000);
      };

      socket.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          // Real-time Decryption Logic
          // Handles both "Dual Payload" and Legacy formats
          if (data.type === 'new_message' && data.message?.encrypted) {
            const msg = data.message;
            const isDual = msg.encryptedData?.scheme === 'dual';

            console.log('📩 WebSocket received message:', {
              messageId: msg.messageId,
              senderId: msg.senderId,
              isDual,
              recipientDataBodyLength: msg.encryptedData?.recipientData?.body?.length || 0,
              myUserId: user?.userId
            });

            try {
              // Ensure encryption is ready
              await signalProtocol.initialize();

              if (msg.senderId === user?.userId) {
                // CASE 1: This is MY message (echoed back via WS)
                // We use our Self-Key (AES) to decrypt it
                console.log('📤 Decrypting my own message (self-key)');
                if (isDual && msg.encryptedData.senderData) {
                   msg.decryptedContent = await messagingService.decryptForSelf(msg.encryptedData.senderData);
                   
                   // Cache my own message too (for consistency when navigating back)
                   try {
                     await messagingService.saveDecryptedMessage(
                       msg.messageId,
                       msg.conversationId,
                       msg.decryptedContent,
                       msg.createdAt
                     );
                     console.log('💾 Cached own message:', msg.messageId);
                   } catch (cacheErr) {
                     console.warn('Failed to cache own message:', cacheErr);
                   }
                } else {
                   // Legacy format or missing sender data
                   msg.decryptedContent = '[Encrypted - Sent from another device]';
                }
              } else {
                // CASE 2: Incoming message from someone else
                // Use Signal Protocol (Recipient Key)
                console.log('📥 Decrypting incoming message (Signal Protocol)');
                let signalData = msg.encryptedData;
                
                // If dual payload, grab the specific recipient part
                if (isDual && msg.encryptedData.recipientData) {
                  signalData = msg.encryptedData.recipientData;
                }

                // Check for corrupted message (empty body)
                if (!signalData?.body || signalData.body === '') {
                  console.warn('⚠️ WebSocket: Message has empty encrypted body:', {
                    signalDataType: signalData?.type,
                    signalDataBody: signalData?.body
                  });
                  msg.decryptedContent = '[Message corrupted]';
                } else {
                  console.log('🔓 Attempting Signal decryption:', {
                    type: signalData.type,
                    bodyLength: signalData.body?.length
                  });
                  msg.decryptedContent = await signalProtocol.decryptMessage(
                    msg.senderId,
                    signalData
                  );
                  console.log('✅ WebSocket decryption successful');
                  
                  // CRITICAL: Save decrypted content to cache immediately
                  // This prevents double decryption when user navigates to chat later
                  // Signal keys are consumed on first decryption, so we must cache the result
                  try {
                    await messagingService.saveDecryptedMessage(
                      msg.messageId,
                      msg.conversationId,
                      msg.decryptedContent,
                      msg.createdAt
                    );
                    console.log('💾 Cached decrypted message:', msg.messageId);
                  } catch (cacheErr) {
                    console.warn('Failed to cache decrypted message:', cacheErr);
                  }
                  
                  // Mark message as delivered (recipient received it)
                  // This triggers the double tick on sender's side
                  messagingService.markMessageDelivered(msg.messageId).catch(err => {
                    console.debug('Failed to mark message as delivered:', err);
                  });
                }
              }
            } catch (e) {
              console.error('WebSocket Decryption failed:', e);
              // Provide better error messages based on error type
              if (e.sessionHealed) {
                // Session was healed - future messages will work, but this one needs resend
                msg.decryptedContent = '🔄 [Encryption keys updated - ask sender to resend this message]';
                msg.requiresResend = true;
              } else if (e.message?.includes('expired key') || e.message?.includes('old key')) {
                msg.decryptedContent = '⏱️ [Message expired - encryption key no longer available]';
              } else if (e.message?.includes('Recipient has not set up encryption')) {
                msg.decryptedContent = '🔐 [Recipient needs to set up encryption]';
              } else {
                msg.decryptedContent = '❌ [Unable to decrypt - please refresh and try again]';
              }
            }
          }

          // Notify all listeners
          console.log('📣 Broadcasting to', listenersRef.current.length, 'listeners:', {
            type: data.type,
            hasMessage: !!data.message,
            conversationId: data.message?.conversationId
          });
          
          listenersRef.current.forEach((listener, index) => {
            try {
              listener(data);
            } catch (error) {
              console.error('Listener', index, 'error:', error);
            }
          });
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      socket.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        setIsConnected(false);
        
        // Set user as offline
        messagingService.setOnlineStatus(false).catch(() => {});
        
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        
        // Only reconnect if it wasn't a clean close and user is still logged in
        if (!event.wasClean && user && token) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('🔄 Attempting to reconnect...');
            connect();
          }, 3000);
        }
      };

      socket.onerror = (error) => {
        console.error('❌ WebSocket error:', {
          type: error.type,
          message: error.message || 'Connection failed',
          target: error.target?.url?.substring(0, 50)
        });
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
    }
  }, [user, token]);

  useEffect(() => {
    connect();

    // Handle page unload to set offline status
    const handleBeforeUnload = () => {
      messagingService.setOnlineStatus(false).catch(() => {});
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Handle visibility change (tab hidden = idle, not offline)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden, still online but could reduce heartbeat frequency
      } else {
        // Tab is visible again, ensure online status
        messagingService.setOnlineStatus(true).catch(() => {});
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      // Set offline on unmount
      messagingService.setOnlineStatus(false).catch(() => {});
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  const addListener = useCallback((listener) => {
    listenersRef.current.push(listener);
  }, []);

  const removeListener = useCallback((listener) => {
    listenersRef.current = listenersRef.current.filter(l => l !== listener);
  }, []);

  const sendMessage = useCallback((message) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, message not sent');
    }
  }, []);

  const value = {
    isConnected,
    sendMessage,
    addListener,
    removeListener,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};