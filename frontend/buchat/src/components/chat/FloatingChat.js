/* eslint-disable no-unused-vars */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageCircle, X, ChevronDown, Search, ArrowLeft, 
  Plus, Check, CheckCheck 
} from 'lucide-react';
import MessageInterface from '../Messages/MessageInterface';
import messagingService from '../../services/messagingService';
import { userService } from '../../services/userService';
import { useAuth } from '../../contexts/AuthContext';
import { useWebSocket } from '../../contexts/WebSocketContext';
import './FloatingChat.css';

const FloatingChat = ({ isOpen, onClose, onOpen, conversation, onConversationChange }) => {
  const { user } = useAuth();
  const { addListener, removeListener } = useWebSocket();
  const [view, setView] = useState('list'); // 'list' | 'chat'
  const [conversations, setConversations] = useState([]);
  const [userDetails, setUserDetails] = useState({});
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  // Load conversations when opened
  useEffect(() => {
    if (isOpen && user?.userId) {
      loadConversations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.userId]);

  // If external conversation is set, go to chat view
  useEffect(() => {
    if (conversation) {
      setView('chat');
    }
  }, [conversation]);

  // Listen for new messages to update unread count and refresh list
  useEffect(() => {
    const handleWebSocketEvent = (data) => {
      // Handle new messages
      if (data.type === 'new_message' && data.message) {
        const msg = data.message;
        // If not in chat view or different conversation, increment unread
        if (!isOpen || view !== 'chat' || msg.conversationId !== conversation?.conversationId) {
          setUnreadCount(prev => prev + 1);
        }
        // Always refresh conversation list to show latest message
        loadConversations(true);
      }
      
      // Handle read/delivered receipts - update conversation list
      if (data.type === 'message_read' || data.type === 'message_delivered') {
        loadConversations(true);
      }

      // Handle message deletion - refresh conversation list
      if (data.type === 'message_deleted') {
        loadConversations(true);
      }
    };

    if (user?.userId) {
      addListener(handleWebSocketEvent);
    }
    return () => {
      if (user?.userId) {
        removeListener(handleWebSocketEvent);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, view, conversation?.conversationId, user?.userId]);

  const loadConversations = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await messagingService.getUserConversations(20);
      const convs = Array.isArray(response) ? response : (response.conversations || []);
      setConversations(convs);

      // Calculate total unread
      let totalUnread = 0;
      convs.forEach(c => {
        const unread = c.unreadCount?.[user.userId] || 0;
        totalUnread += unread;
      });
      setUnreadCount(totalUnread);

      // Fetch user details
      const userIds = new Set();
      convs.forEach(conv => {
        conv.participants?.forEach(p => {
          if (p !== user.userId) userIds.add(p);
        });
      });

      if (userIds.size > 0) {
        const details = {};
        await Promise.all(
          Array.from(userIds).map(async (userId) => {
            try {
              const userData = await userService.getUserById(userId);
              details[userId] = {
                username: userData.username,
                displayName: userData.displayName,
                avatar: userData.avatar,
                isOnline: userData.isOnline
              };
            } catch (e) {
              details[userId] = { username: 'Unknown', displayName: 'Unknown User', isOnline: false };
            }
          })
        );
        setUserDetails(prev => ({ ...prev, ...details }));
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const selectConversation = (conv) => {
    const otherId = conv.participants?.find(p => p !== user.userId);
    const otherUser = userDetails[otherId] || {};
    
    const fullConversation = {
      ...conv,
      recipientId: otherId,
      recipientUsername: otherUser.username || conv.recipientUsername,
      recipientDisplayName: otherUser.displayName || conv.recipientDisplayName,
      recipientAvatar: otherUser.avatar || conv.recipientAvatar
    };
    
    onConversationChange(fullConversation);
    setView('chat');

    // Clear unread for this conversation
    setConversations(prev => prev.map(c => 
      c.conversationId === conv.conversationId
        ? { ...c, unreadCount: { ...c.unreadCount, [user.userId]: 0 } }
        : c
    ));
  };

  const handleBack = () => {
    setView('list');
    onConversationChange(null);
  };

  const handleClose = () => {
    setView('list');
    onConversationChange(null);
    onClose();
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery) return true;
    const otherId = conv.participants?.find(p => p !== user.userId);
    const otherUser = userDetails[otherId] || {};
    const searchLower = searchQuery.toLowerCase();
    return (
      otherUser.username?.toLowerCase().includes(searchLower) ||
      otherUser.displayName?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            className="floating-chat-button"
            onClick={onOpen}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <MessageCircle size={24} />
            {unreadCount > 0 && (
              <span className="floating-chat-badge">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="floating-chat-panel"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="floating-chat-header">
              {view === 'chat' && (
                <button className="floating-back-btn" onClick={handleBack}>
                  <ArrowLeft size={20} />
                </button>
              )}
              <div className="floating-header-title">
                {view === 'list' ? (
                  <>
                    <MessageCircle size={18} />
                    <span>Messages</span>
                  </>
                ) : (
                  <div className="floating-recipient-info">
                    {conversation?.recipientAvatar ? (
                      <img 
                        src={conversation.recipientAvatar} 
                        alt="" 
                        className="floating-recipient-avatar" 
                      />
                    ) : (
                      <div className="floating-recipient-avatar-fallback">
                        {(conversation?.recipientDisplayName || conversation?.recipientUsername || '?')[0]}
                      </div>
                    )}
                    <span className="floating-recipient-name">
                      {conversation?.recipientDisplayName || conversation?.recipientUsername}
                    </span>
                  </div>
                )}
              </div>
              <div className="floating-header-actions">
                <button className="floating-minimize-btn" onClick={handleClose} title="Minimize">
                  <ChevronDown size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="floating-chat-content">
              {view === 'list' ? (
                <>
                  {/* Search */}
                  <div className="floating-search">
                    <Search size={16} />
                    <input
                      type="text"
                      placeholder="Search conversations..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  {/* Conversation List */}
                  <div className="floating-conversation-list">
                    {loading ? (
                      <div className="floating-loading">Loading...</div>
                    ) : filteredConversations.length === 0 ? (
                      <div className="floating-empty">
                        <MessageCircle size={32} />
                        <p>No conversations yet</p>
                      </div>
                    ) : (
                      filteredConversations.map(conv => {
                        const otherId = conv.participants?.find(p => p !== user.userId);
                        const otherUser = userDetails[otherId] || {};
                        const isUnread = (conv.unreadCount?.[user.userId] || 0) > 0;

                        return (
                          <div
                            key={conv.conversationId}
                            className={`floating-conv-item ${isUnread ? 'unread' : ''}`}
                            onClick={() => selectConversation(conv)}
                          >
                            <div className="floating-conv-avatar">
                              {otherUser.avatar ? (
                                <img src={otherUser.avatar} alt="" />
                              ) : (
                                <div className="avatar-fallback">
                                  {(otherUser.displayName || otherUser.username || '?')[0]}
                                </div>
                              )}
                              {otherUser.isOnline && <div className="online-dot" />}
                            </div>
                            <div className="floating-conv-info">
                              <div className="floating-conv-top">
                                <span className="floating-conv-name">
                                  {otherUser.displayName || otherUser.username}
                                </span>
                                <span className="floating-conv-time">
                                  {formatTime(conv.lastMessageAt)}
                                </span>
                              </div>
                              <div className="floating-conv-bottom">
                                <p className="floating-conv-preview">
                                  {conv.lastMessagePreview || 'Start a conversation'}
                                </p>
                                {isUnread && (
                                  <span className="floating-unread-badge">
                                    {conv.unreadCount[user.userId]}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              ) : (
                <MessageInterface
                  conversation={conversation}
                  recipientId={conversation?.recipientId}
                  recipientUsername={conversation?.recipientUsername}
                  recipientDisplayName={conversation?.recipientDisplayName}
                  recipientAvatar={conversation?.recipientAvatar}
                  onBack={handleBack}
                  isMobile={true}
                  isFloatingChat={true}
                  onMessageSent={() => loadConversations(true)}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default FloatingChat;
