import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
// eslint-disable-next-line no-unused-vars
import { Plus, Search, MessageSquare, ArrowRight, Check, CheckCheck, Archive, ChevronDown, ChevronUp } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import MessageInterface from '../components/Messages/MessageInterface';
import NewMessageModal from '../components/Messages/NewMessageModal';
// eslint-disable-next-line no-unused-vars
import CallInterface from '../components/calls/CallInterface';
import messagingService from '../services/messagingService';
import { userService } from '../services/userService';
import notificationService from '../services/notificationService';
import { callService } from '../services/callService';
import { useAuth } from '../contexts/AuthContext';
import { useCall } from '../contexts/CallContext';
import { toast } from 'react-toastify';
import './Messages.css';

const ConversationItem = ({ conv, otherUser, isActive, isUnread, currentUserId, onClick, formatTime }) => {
  const [isTyping, setIsTyping] = useState(false);
  const [lastMessageStatus, setLastMessageStatus] = useState(null);

  useEffect(() => {
    const checkTyping = async () => {
      if (conv.conversationId) {
        try {
          const typingUsers = await messagingService.getTypingUsers(conv.conversationId);
          setIsTyping(typingUsers.length > 0);
        } catch (e) {
          // Silently fail - typing indicator is non-critical
          setIsTyping(false);
        }
      }
    };

    checkTyping();
    const interval = setInterval(checkTyping, 3000);
    return () => clearInterval(interval);
  }, [conv.conversationId]);

  useEffect(() => {
    const fetchLastMessageStatus = async () => {
      if (conv.lastMessageSenderId === currentUserId && conv.lastMessageId) {
        try {
          const messages = await messagingService.getConversationMessages(conv.conversationId, { limit: 1 });
          if (messages.messages?.[0]) {
            const msg = messages.messages[0];
            setLastMessageStatus({
              status: msg.status,
              readAt: msg.readAt,
              deliveredAt: msg.deliveredAt
            });
          }
        } catch (e) {
          
        }
      }
    };

    fetchLastMessageStatus();
  }, [conv.lastMessageId, conv.lastMessageSenderId, currentUserId, conv.conversationId]);

  const renderStatusIcon = () => {
    if (conv.lastMessageSenderId !== currentUserId) return null;
    
    if (lastMessageStatus?.readAt) {
      return <CheckCheck size={14} className="status-icon read" />;
    }
    if (lastMessageStatus?.deliveredAt || lastMessageStatus?.status === 'delivered') {
      return <CheckCheck size={14} className="status-icon delivered" />;
    }
    return <Check size={14} className="status-icon sent" />;
  };

  return (
    <motion.div
      className={`conversation-item ${isActive ? 'active' : ''} ${isUnread ? 'unread' : ''}`}
      onClick={onClick}
      whileHover={{ x: 4, backgroundColor: "rgba(255,255,255,0.05)" }}
    >
      <div className="conv-avatar">
        {otherUser.avatar ? (
          <img src={otherUser.avatar} alt="" />
        ) : (
          <div className="avatar-fallback">
            {(otherUser.displayName || otherUser.username || '?')[0]}
          </div>
        )}
        {otherUser.isOnline && <div className="online-dot" />}
      </div>
      
      <div className="conv-info">
        <div className="conv-top">
          <span className="conv-name">
            {otherUser.displayName || otherUser.username || 'Unknown'}
          </span>
          <span className="conv-time">
            {formatTime(conv.lastMessageAt)}
          </span>
        </div>
        <div className="conv-bottom">
          {isTyping ? (
            <div className="conv-typing">
              typing
              <div className="conv-typing-dots">
                <span /><span /><span />
              </div>
            </div>
          ) : (
            <p className="conv-preview">
              {conv.lastMessagePreview || 'Start a conversation'}
            </p>
          )}
          <div className="conv-status">
            {renderStatusIcon()}
            {isUnread && conv.unreadCount?.[currentUserId] > 0 && (
              <div className="unread-badge">{conv.unreadCount[currentUserId]}</div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const Messages = () => {
  const { user, isAuthenticated } = useAuth();
  const { activeCall, startCall } = useCall();
  const [searchParams] = useSearchParams();
  
  // State
  const [conversations, setConversations] = useState([]);
  const [archivedConversations, setArchivedConversations] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [userDetails, setUserDetails] = useState({});
  
  // Responsive State
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showSidebar, setShowSidebar] = useState(true);

  useEffect(() => {
    document.title = 'Messages - BuChat';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, follow';
    document.head.appendChild(meta);
    return () => document.head.removeChild(meta);
  }, []);

  // Poll for incoming call notifications
  useEffect(() => {
    if (!isAuthenticated || !user?.userId || activeCall) return;

    let isMounted = true;

    const checkForCalls = async () => {
      if (!isMounted) return;
      
      try {
        const { notifications } = await notificationService.getNotifications(10);
        const callNotification = notifications.find(n => n.type === 'call' && n.status === 'ringing' && !n.read);
        
        if (callNotification && isMounted) {
          // Verify call is still active
          try {
            const callStatus = await callService.getCallStatus(callNotification.callId);
            if (callStatus.status !== 'ringing') return;
          } catch (error) {
            return;
          }
          
          const callerData = await userService.getUserById(callNotification.callerId);
          if (isMounted) {
            startCall({
              callId: callNotification.callId,
              recipientId: callNotification.callerId,
              recipientName: callerData.displayName || callerData.username,
              callType: callNotification.callType,
              isIncoming: true,
              offer: null
            });
          }
        }
      } catch (error) {
        console.error('Error checking for calls:', error);
      }
    };

    checkForCalls();
    const interval = setInterval(checkForCalls, 2000);
    
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.userId, activeCall]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initial Load - Clear cache and fetch fresh data
  useEffect(() => {
    if (isAuthenticated && user?.userId) {
      // Clear messaging service cache for fresh data
      messagingService.localCache.clear();
      loadConversations(false); // Initial load with loading state
      loadArchivedConversations(); // Load archived conversations
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.userId]);

  // Load archived conversations
  const loadArchivedConversations = async () => {
    try {
      const archived = await messagingService.getArchivedConversations();
      if (archived && archived.length > 0) {
        // Fetch user details for archived conversations
        const userIds = new Set();
        archived.forEach(conv => {
          conv.participants?.forEach(p => {
            if (p !== user.userId) userIds.add(p);
          });
        });
        
        if (userIds.size > 0) {
          await fetchUserDetails(Array.from(userIds));
        }
        
        setArchivedConversations(archived);
      }
    } catch (error) {
      console.error('Error loading archived conversations:', error);
    }
  };

  // URL Direct Linking
  useEffect(() => {
    const userId = searchParams.get('user');
    if (userId && user?.userId && userId !== user.userId && !loading) {
      handleDirectMessage(userId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user?.userId, loading]);

  const loadConversations = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await messagingService.getUserConversations(50);
      const convs = Array.isArray(response) ? response : (response.conversations || []);
      
      // Process conversation previews to show decrypted content
      const processedConvs = await Promise.all(convs.map(async (conv) => {
        if (conv.conversationId && conv.lastMessageId) {
          try {
            // Fetch last message to get decrypted preview
            const msgs = await messagingService.getConversationMessages(conv.conversationId, { limit: 1 });
            if (msgs.messages && msgs.messages.length > 0) {
              const lastMsg = msgs.messages[0];
              
              // Create proper preview
              let preview = '';
              if (lastMsg.decryptedMedia && lastMsg.decryptedMedia.length > 0) {
                const mediaType = lastMsg.decryptedMedia[0].type || lastMsg.decryptedMedia[0].messageType;
                if (mediaType === 'sticker') preview = '🎭 Sticker';
                else if (mediaType === 'gif' || mediaType.includes('gif')) preview = 'GIF';
                else if (mediaType?.startsWith('image')) preview = '📷 Photo';
                else if (mediaType?.startsWith('video')) preview = '🎥 Video';
                else if (mediaType?.startsWith('audio') || mediaType === 'voice') preview = '🎤 Voice message';
                else if (mediaType === 'document') preview = '📄 Document';
                else preview = '📎 Attachment';
              } else {
                preview = lastMsg.decryptedContent || lastMsg.content || 'Message';
              }
              
              return { 
                ...conv, 
                lastMessagePreview: preview.length > 40 ? preview.substring(0, 40) + '...' : preview 
              };
            }
          } catch (e) {
            // If decryption fails, keep original preview
          }
        }
        return conv;
      }));
      
      // Always update conversations to ensure fresh data
      setConversations(processedConvs);
      
      // Batch fetch participant details for all conversations
      const userIds = new Set();
      processedConvs.forEach(conv => {
        conv.participants?.forEach(p => {
          if (p !== user.userId) userIds.add(p);
        });
      });
      
      if (userIds.size > 0) {
        await fetchUserDetails(Array.from(userIds));
      }
    } catch (error) {
      if (!silent) {
        
        toast.error('Could not load chats');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchUserDetails = async (userIds) => {
    const details = {};
    await Promise.all(
      userIds.map(async (userId) => {
        try {
          const userData = await userService.getUserById(userId);
          details[userId] = {
            username: userData.username,
            displayName: userData.displayName,
            avatar: userData.avatar,
            isOnline: userData.isOnline || Math.random() > 0.5
          };
        } catch (e) {
          details[userId] = { username: 'Unknown', displayName: 'Unknown User', isOnline: false };
        }
      })
    );
    setUserDetails(prev => ({ ...prev, ...details }));
  };

  // Auto-refresh conversations (WhatsApp-style: aggressive polling)
  useEffect(() => {
    if (!isAuthenticated || !user?.userId) return;
    
    const refreshInterval = setInterval(() => {
      // Clear cache before each poll to ensure fresh data
      messagingService.localCache.delete(`user_conversations_50`);
      loadConversations(true); // Silent refresh to avoid flickering
      loadArchivedConversations(); // Also refresh archived
    }, 3000); // Refresh every 3 seconds for real-time updates
    
    return () => clearInterval(refreshInterval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.userId]);

  const handleDirectMessage = async (userId) => {
    // Check existing conversation
    const existing = conversations.find(c => c.participants?.includes(userId));
    
    if (existing) {
      selectConversation(existing);
    } else {
      // Fetch user details
      let userData;
      try {
        const userResponse = await userService.getUserById(userId);
        userData = userResponse;
        // Cache the user details
        setUserDetails(prev => ({ ...prev, [userId]: userData }));
      } catch (error) {
        
        userData = { username: userId, displayName: 'User', avatar: null };
      }
      
      // Create new conversation object with full user data
      const newConv = {
        conversationId: null,
        participants: [user.userId, userId],
        recipientId: userId,
        recipientUsername: userData.username || userId,
        recipientDisplayName: userData.displayName || userData.username || 'User',
        recipientAvatar: userData.avatar || null,
        lastMessageAt: new Date().toISOString(),
        lastMessagePreview: 'Start a conversation',
        unreadCount: {}
      };
      
      setSelectedConversation(newConv);
      if (isMobile) setShowSidebar(false);
    }
    
    // Clean URL
    if (window.location.search) {
      window.history.replaceState({}, '', '/messages');
    }
  };

  const selectConversation = (conversation) => {
    const otherId = conversation.participants?.find(p => p !== user.userId);
    const otherUser = userDetails[otherId] || {};
    
    setSelectedConversation({
      ...conversation,
      recipientId: otherId,
      recipientUsername: otherUser.username || conversation.recipientUsername,
      recipientDisplayName: otherUser.displayName || conversation.recipientDisplayName,
      recipientAvatar: otherUser.avatar || conversation.recipientAvatar
    });
    
    if (isMobile) setShowSidebar(false);
    
    // Clear unread count immediately in UI (only for existing conversations)
    if (conversation.conversationId) {
      setConversations(prev => prev.map(c => 
        c.conversationId === conversation.conversationId
          ? { ...c, unreadCount: { ...c.unreadCount, [user.userId]: 0 } }
          : c
      ));
    }
  };

  const handleMessageSent = async (newConversationId) => {
    // Update selected conversation with new conversationId
    if (newConversationId && selectedConversation && !selectedConversation.conversationId) {
      setSelectedConversation(prev => ({
        ...prev,
        conversationId: newConversationId
      }));
    }
    
    // Clear cache and force immediate refresh of conversation list
    messagingService.localCache.clear();
    
    // Wait a moment for backend to process
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await loadConversations(false);
  };

  // Time Helper
  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    return d.toLocaleDateString([], {month:'short', day:'numeric'});
  };

  const handleStartCall = (callType) => {
    if (!selectedConversation) return;
    startCall({
      recipientId: selectedConversation.recipientId,
      recipientName: selectedConversation.recipientDisplayName || selectedConversation.recipientUsername,
      callType,
      isIncoming: false
    });
  };

  if (!isAuthenticated) return <div className="auth-lock">Please log in to access messages.</div>;

  // Logic for Mobile View Swapping
  const showList = !isMobile || (isMobile && !selectedConversation);
  const showChat = !isMobile || (isMobile && selectedConversation);

  return (
    <div className="messages-page">
      <div className="messages-container">
        
        {/* Main Glass Card Container */}
        <div className="messages-glass-card">
          <div className="messages-layout">
            
            {/* --- Sidebar List --- */}
            <AnimatePresence mode="wait">
              {(showList || showSidebar) && (
                <motion.aside 
                  className="conversations-sidebar"
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -20, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="sidebar-header">
                    <div className="header-row">
                      <h2>Messages</h2>
                      <button 
                        className="new-chat-btn" 
                        onClick={() => setShowNewMessageModal(true)}
                        title="New Message"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                    
                    <div className="search-bar-glass">
                      <Search size={16} />
                      <input
                        type="text"
                        placeholder="Search comms..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="conversations-list">
                    {loading && conversations.length === 0 ? (
                      <div className="loading-pulse">
                        <div className="spinner-ring" /> Loading conversations...
                      </div>
                    ) : conversations.length === 0 && archivedConversations.length === 0 ? (
                      <div className="empty-state-sidebar">
                        <MessageSquare size={32} />
                        <p>No conversations yet</p>
                        <button className="start-chat-btn" onClick={() => setShowNewMessageModal(true)}>Start Chat</button>
                      </div>
                    ) : (
                      <>
                        {/* Archived Section - WhatsApp/Telegram Style */}
                        {archivedConversations.length > 0 && (
                          <div className="archived-section">
                            <button 
                              className="archived-header"
                              onClick={() => setShowArchived(!showArchived)}
                            >
                              <div className="archived-left">
                                <Archive size={18} />
                                <span>Archived</span>
                                <span className="archived-count">{archivedConversations.length}</span>
                              </div>
                              {showArchived ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                            
                            <AnimatePresence>
                              {showArchived && (
                                <motion.div
                                  className="archived-list"
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  {archivedConversations
                                    .filter(c => {
                                      if (!searchQuery) return true;
                                      const otherId = c.participants?.find(p => p !== user.userId);
                                      const otherUser = userDetails[otherId] || {};
                                      const query = searchQuery.toLowerCase();
                                      return (
                                        (otherUser.username || '').toLowerCase().includes(query) ||
                                        (otherUser.displayName || '').toLowerCase().includes(query)
                                      );
                                    })
                                    .map(conv => {
                                      const otherId = conv.participants?.find(p => p !== user.userId);
                                      const otherUser = userDetails[otherId] || {};
                                      const isActive = selectedConversation?.conversationId === conv.conversationId;
                                      const isUnread = conv.unreadCount?.[user.userId] > 0;

                                      return (
                                        <ConversationItem
                                          key={conv.conversationId}
                                          conv={conv}
                                          otherUser={otherUser}
                                          isActive={isActive}
                                          isUnread={isUnread}
                                          currentUserId={user.userId}
                                          onClick={() => selectConversation(conv)}
                                          formatTime={formatTime}
                                        />
                                      );
                                    })
                                  }
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        {/* Regular Conversations */}
                        {conversations
                          .filter(c => {
                            if (!searchQuery) return true;
                            const otherId = c.participants?.find(p => p !== user.userId);
                            const otherUser = userDetails[otherId] || {};
                            const query = searchQuery.toLowerCase();
                            return (
                              (otherUser.username || '').toLowerCase().includes(query) ||
                              (otherUser.displayName || '').toLowerCase().includes(query) ||
                              (c.lastMessagePreview || '').toLowerCase().includes(query)
                            );
                          })
                          .map(conv => {
                            const otherId = conv.participants?.find(p => p !== user.userId);
                            const otherUser = userDetails[otherId] || {};
                            const isActive = selectedConversation?.conversationId === conv.conversationId;
                            const isUnread = conv.unreadCount?.[user.userId] > 0;

                            return (
                              <ConversationItem
                                key={conv.conversationId}
                                conv={conv}
                                otherUser={otherUser}
                                isActive={isActive}
                                isUnread={isUnread}
                                currentUserId={user.userId}
                                onClick={() => selectConversation(conv)}
                                formatTime={formatTime}
                              />
                            );
                          })
                        }
                      </>
                    )}
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>

            {/* --- Chat Interface --- */}
            <AnimatePresence mode="wait">
              {showChat && (
                <motion.main 
                  className="messages-main"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                >
                  {selectedConversation ? (
                    <MessageInterface
                      conversation={selectedConversation}
                      recipientId={selectedConversation.recipientId}
                      recipientUsername={selectedConversation.recipientUsername}
                      recipientDisplayName={selectedConversation.recipientDisplayName}
                      recipientAvatar={selectedConversation.recipientAvatar}
                      onBack={() => {
                        setSelectedConversation(null);
                        if (isMobile) setShowSidebar(true);
                      }}
                      onMessageSent={handleMessageSent}
                      isMobile={isMobile}
                      onStartCall={handleStartCall}
                    />
                  ) : (
                    <div className="empty-chat-state">
                      <div className="empty-content">
                        <div className="empty-icon-glow">
                          <MessageSquare size={48} />
                        </div>
                        <h3>Select a Signal</h3>
                        <p>Choose a contact from the left to open a secure channel.</p>
                      </div>
                    </div>
                  )}
                </motion.main>
              )}
            </AnimatePresence>

          </div>
        </div>

        <NewMessageModal
          isOpen={showNewMessageModal}
          onClose={() => setShowNewMessageModal(false)}
          onSelectUser={(u) => {
            setShowNewMessageModal(false);
            handleDirectMessage(u.userId);
          }}
        />
      </div>
    </div>
  );
};

export default Messages;
