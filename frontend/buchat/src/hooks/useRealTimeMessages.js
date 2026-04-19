import { useState, useEffect, useCallback, useRef } from 'react';
import messagingService from '../services/messagingService';
import { useWebSocket } from '../contexts/WebSocketContext';

export const useRealTimeMessages = (conversationId, enabled = true) => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const { isConnected, addListener, removeListener } = useWebSocket();
  const typingTimeoutRef = useRef(null);

  const handleNewMessage = useCallback((message) => {
    if (message.conversationId === conversationId) {
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.messageId));
        if (!existingIds.has(message.messageId)) {
          return [...prev, message];
        }
        return prev;
      });
      messagingService.markConversationRead(conversationId);
    }
  }, [conversationId]);

  useEffect(() => {
    if (enabled && isConnected) {
      addListener(handleNewMessage);
      return () => {
        removeListener(handleNewMessage);
      };
    }
  }, [enabled, isConnected, addListener, removeListener, handleNewMessage]);

  const loadMessages = useCallback(async () => {
    if (!conversationId) return;
    
    try {
      setLoading(true);
      const result = await messagingService.getConversationMessages(conversationId, {
        limit: 50,
        useCache: false
      });
      
      const msgs = result.messages || [];
      setMessages(msgs);
      setHasMore(result.hasMore);
      
      if (msgs.length > 0) {
        await messagingService.markConversationRead(conversationId);
      }
    } catch (error) {
      // Failed to load messages
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const sendTypingIndicator = useCallback((isTyping) => {
    if (!conversationId) return;
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    messagingService.setTypingIndicator(conversationId, isTyping);
    
    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        messagingService.setTypingIndicator(conversationId, false);
      }, 3000);
    }
  }, [conversationId]);

  const addMessage = useCallback((message) => {
    setMessages(prev => {
      const exists = prev.some(m => m.messageId === message.messageId);
      if (exists) return prev;
      return [...prev, message];
    });
  }, []);

  const updateMessage = useCallback((messageId, updates) => {
    setMessages(prev => {
      return prev.map(msg => 
        msg.messageId === messageId ? { ...msg, ...updates } : msg
      );
    });
  }, []);

  const removeMessage = useCallback((messageId) => {
    setMessages(prev => prev.filter(msg => msg.messageId !== messageId));
  }, []);

  const loadMore = useCallback(async () => {
    if (!conversationId || !hasMore || loading) return;
    
    try {
      setLoading(true);
      const oldestMessage = messages[0];
      
      const result = await messagingService.getConversationMessages(conversationId, {
        limit: 25,
        lastKey: oldestMessage?.messageId
      });
      
      setMessages(prev => [...result.messages, ...prev]);
      setHasMore(result.hasMore);
    } catch (error) {
      // Failed to load more messages
    } finally {
      setLoading(false);
    }
  }, [conversationId, hasMore, loading, messages]);

  useEffect(() => {
    if (conversationId && enabled) {
      setMessages([]);
      loadMessages();
    }
  }, [conversationId, enabled, loadMessages]);

  return {
    messages,
    loading,
    hasMore,
    typingUsers,
    loadMessages,
    loadMore,
    addMessage,
    updateMessage,
    removeMessage,
    sendTypingIndicator,
  };
};

export default useRealTimeMessages;
