/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Send, Paperclip, Smile, Image as ImageIcon, 
  Video, FileText, X, MoreVertical, Phone, Video as VideoIcon, 
  ArrowLeft, Gift, Sparkles, Mic, Play, Pause, Download, Check, CheckCheck, Loader,
  Trash2, Ban, Copy, MessageSquareOff, UserX, Star, Pin, Share2, CheckSquare, 
  AlertTriangle, CornerUpLeft, Search, ChevronDown, ChevronUp, Timer, Eye, EyeOff, Lock, Archive
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import messagingService from '../../services/messagingService';
import { userService } from '../../services/userService';
import signalProtocol from '../../utils/signalProtocol';
import { postService } from '../../services/postService';
import { useAuth } from '../../contexts/AuthContext';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { toast } from 'react-toastify';
import VoiceRecorder from './VoiceRecorder';
import CallButton from '../calls/CallButton';
import EncryptionBadge from './EncryptionBadge';
import EncryptionVerificationModal from '../security/EncryptionVerificationModal';
import EncryptionVerification from '../../utils/encryptionVerification';
import { ConfirmDialog, AlertDialog, InputDialog } from '../common/CustomDialog';
import './MessageInterface.css';
import './MessageInterface-new-features.css';
import './MessageInterface-settings.css';

// --- Expanded Collections ---
const EMOJIS = [
  "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙",
  "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥",
  "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "😎", "🤓", "🧐", "😕", "😟", "🙁", "☹️",
  "😮", "😯", "😲", "😳", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱",
  "😤", "😡", "😠", "🤬", "👍", "👎", "👊", "✊", "🤛", "🤜", "🤞", "✌️", "🤟", "🤘", "👌", "🤏", "👈", "👉", "👆", "👇",
  "☝️", "✋", "🤚", "🖐️", "🖖", "👋", "🤙", "💪", "🙏", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❤️‍🔥",
  "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "🔥", "💯", "💢", "💥", "💫", "💦", "💨", "🎉", "🎊", "🎈", "🎁", "🏆"
];

// Using Giphy trending GIFs - search will fetch more
const GIFS = Array.from({length: 50}, (_, i) => 
  `https://media.giphy.com/media/${['3o7abKhOpu0NwenH3O','l0MYt5jPR6QX5pnqM','g9582DNuQppxC','XreQmk7ETCak0','111ebonMs90YLu','kyLYXonQYYfwYDIeZl','26u4cqiYI30juCOGY','l0MYGb8Y3dzpbOpsA','3o7TKSjRrfIPjeiVyM','l0HlHJGHe3yAMhdQY','xT5LMB2WiOdjpB7K4o','3o6Zt6KHxJTbXCnSvu','26u4lOMA8JKSnL9Uk','l0HlQ7LRalQqdWfao','3o7TKTDn976rzVgky4','3o7absbD7PbTFQa0c8','l0MYC0LajbaPoEADu','3o7TKwmnDgQb5jemjK','26BRuo6sLetdllPAQ','3o6ZtaO9BZHcOjmErm','l0HlPystfePnAI3G8','26tPnAAJxXTvpLwJy','3o7TKMt1VVNkHV2PaE','l0MYGzh7pUL2SOyty','3o7abKhOpu0NwenH3O','l0MYt5jPR6QX5pnqM','g9582DNuQppxC','XreQmk7ETCak0','111ebonMs90YLu','kyLYXonQYYfwYDIeZl','26u4cqiYI30juCOGY','l0MYGb8Y3dzpbOpsA','3o7TKSjRrfIPjeiVyM','l0HlHJGHe3yAMhdQY','xT5LMB2WiOdjpB7K4o','3o6Zt6KHxJTbXCnSvu','26u4lOMA8JKSnL9Uk','l0HlQ7LRalQqdWfao','3o7TKTDn976rzVgky4','3o7absbD7PbTFQa0c8','l0MYC0LajbaPoEADu','3o7TKwmnDgQb5jemjK','26BRuo6sLetdllPAQ','3o6ZtaO9BZHcOjmErm','l0HlPystfePnAI3G8','26tPnAAJxXTvpLwJy','3o7TKMt1VVNkHV2PaE','l0MYGzh7pUL2SOyty','3o7abKhOpu0NwenH3O','l0MYt5jPR6QX5pnqM'][i % 50]}/giphy.gif`
);

// Using Google Noto Emoji animated stickers - search will fetch more
const STICKERS = ['1f44d','2764_fe0f','1f602','1f525','1f389','1f60d','1f44f','1f44b','1f4af','1f60e','1f973','1f929','1f970','1f618','1f917','1f914','1f62d','1f631','1f60a','1f923','1f60b','1f61c','1f92a','1f644','1f634','1f637','1f912','1f915','1f922','1f92e','1f927','1f975','1f976','1f974','1f635','1f92f','1f920','1f973','1f978','1f60d','1f929','1f970','1f618','1f617','1f61a','1f619','1f972','1f60b','1f61b','1f61c','1f92a','1f61d','1f911','1f917','1f92d','1f92b','1f914','1f910','1f928','1f610','1f611','1f636','1f60f','1f612','1f644','1f62c','1f925','1f60c','1f614','1f62a','1f924','1f634','1f637','1f912','1f915','1f922','1f92e','1f927','1f975','1f976','1f974','1f635','1f92f','1f920','1f973','1f60e','1f913','1f9d0','1f615','1f61f','1f641','2639_fe0f','1f62e','1f62f','1f632','1f633','1f97a','1f626','1f627','1f628','1f630','1f625','1f622','1f62d','1f631','1f616','1f623','1f61e','1f613','1f629','1f62b','1f971','1f624','1f621','1f620','1f92c'].map(code => 
  `https://fonts.gstatic.com/s/e/notoemoji/latest/${code}/512.gif`
);

const MessageInterface = ({ conversation, recipientId, recipientUsername, recipientDisplayName, recipientAvatar, onBack, onMessageSent, isMobile, onStartCall, isFloatingChat = false }) => {
  const { user } = useAuth();
  const { isConnected, addListener, removeListener, sendMessage: wsSendMessage } = useWebSocket();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [files, setFiles] = useState([]);
  const [showPicker, setShowPicker] = useState(null);
  const [gifSearchQuery, setGifSearchQuery] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [stickerResults, setStickerResults] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [recipientTyping, setRecipientTyping] = useState(false);
  const [recipientOnline, setRecipientOnline] = useState(false);
  const [lastSeen, setLastSeen] = useState(null);
  const [audioPlaying, setAudioPlaying] = useState(null);
  const [viewingMedia, setViewingMedia] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [recipientInfo, setRecipientInfo] = useState({
    displayName: recipientDisplayName,
    username: recipientUsername,
    avatar: recipientAvatar
  });
  const [contextMenu, setContextMenu] = useState(null); // { messageId, x, y }
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null); // For message-specific 3-dots menu
  const [isBlocked, setIsBlocked] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState(new Set());
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [conversationSearchQuery, setConversationSearchQuery] = useState('');
  const [showBackgroundPicker, setShowBackgroundPicker] = useState(false);
  const [chatBackground, setChatBackground] = useState(localStorage.getItem('chatBackground') || 'default');
  const [hoveredMessage, setHoveredMessage] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ show: false, title: '', message: '', onConfirm: null, danger: false });
  const [alertDialog, setAlertDialog] = useState({ show: false, title: '', message: '', type: 'info' });
  const [starredMessages, setStarredMessages] = useState(new Set());
  const [pinnedMessages, setPinnedMessages] = useState(new Set());
  const [pinnedMessagesList, setPinnedMessagesList] = useState([]); // For pinned bar at top
  const [showPinnedBar, setShowPinnedBar] = useState(true);
  const [replyingTo, setReplyingTo] = useState(null); // { messageId, content, senderId, senderName }
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [forwardSearchQuery, setForwardSearchQuery] = useState('');
  const [showRecentConversations, setShowRecentConversations] = useState(true);
  const [selectedForwardRecipients, setSelectedForwardRecipients] = useState(new Set());
  const [showEncryptionVerification, setShowEncryptionVerification] = useState(false);
  const [currentPinnedIndex, setCurrentPinnedIndex] = useState(0);
  const [readReceiptsEnabled, setReadReceiptsEnabled] = useState(true);
  const [selfDestructTimer, setSelfDestructTimer] = useState(0); // 0 = off
  const [showSelfDestructDialog, setShowSelfDestructDialog] = useState(false);
  const [emojiScrollPos, setEmojiScrollPos] = useState({ canScrollLeft: false, canScrollRight: true });
  const [showMessageSecurityCode, setShowMessageSecurityCode] = useState(null); // messageId to show security code for
  const [isArchived, setIsArchived] = useState(false);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioRefs = useRef({});
  const typingTimeoutRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const pendingMessageIds = useRef(new Set()); // Track messages being sent to prevent duplicates
  
  // Update recipient info when props change
  useEffect(() => {
    setRecipientInfo({
      displayName: recipientDisplayName || recipientUsername,
      username: recipientUsername,
      avatar: recipientAvatar
    });
    
    // Fetch user online status and last seen
    const fetchUserStatus = async () => {
      try {
        const userData = await userService.getUserById(recipientId);
        if (userData) {
          // Only set online if explicitly true AND recently active (within 5 minutes)
          const isActuallyOnline = userData.isOnline === true;
          const hasRecentActivity = userData.lastSeen && 
            (new Date() - new Date(userData.lastSeen)) < 300000; // 5 minutes
          
          setRecipientOnline(isActuallyOnline && hasRecentActivity);
          
          // Always update last seen if available
          if (userData.lastSeen) {
            setLastSeen(userData.lastSeen);
          }
        } else {
          // User not found or offline
          setRecipientOnline(false);
        }
      } catch (error) {
        console.error('Error fetching user status:', error);
        setRecipientOnline(false);
      }
    };
    
    if (recipientId) {
      fetchUserStatus();
      // Poll every 30 seconds for status updates
      const statusInterval = setInterval(fetchUserStatus, 30000);
      return () => clearInterval(statusInterval);
    }
  }, [recipientDisplayName, recipientUsername, recipientAvatar, recipientId, conversation?.conversationId]);

  // Check if recipient is blocked
  useEffect(() => {
    const checkBlockStatus = async () => {
      if (recipientUsername) {
        const blocked = await messagingService.isUserBlocked(recipientUsername);
        setIsBlocked(blocked);
      }
    };
    checkBlockStatus();
  }, [recipientUsername]);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('Notification permission:', permission);
      });
    }
  }, []);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Don't close if clicking inside the menu or the button
      if (!e.target.closest('.header-menu-wrapper') && !e.target.closest('.message-dropdown-menu')) {
        setShowHeaderMenu(false);
        setSelectedMessage(null);
      }
      
      // Close emoji picker if clicking outside
      if (!e.target.closest('.emoji-reaction-tray') && !e.target.closest('.quick-emoji-btn')) {
        setShowEmojiPicker(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);
  
  useEffect(() => {
    const conversationId = conversation?.conversationId;
    
    const handleWebSocketEvent = async (data) => {
      console.log('📨 MessageInterface received WebSocket data:', {
        type: data.type || data.action,
        hasMessage: !!data.message,
        messageConversationId: data.message?.conversationId,
        currentConversationId: conversationId
      });

      // Handle typing indicator via WebSocket (real-time)
      if ((data.type === 'typing' || data.action === 'typing') && data.conversationId === conversationId) {
        console.log('⌨️ Received typing indicator:', data);
        // Only show typing from the other user
        if (data.userId !== user?.userId) {
          setRecipientTyping(data.isTyping !== false);
          // Auto-clear typing indicator after 5 seconds
          if (data.isTyping !== false) {
            setTimeout(() => setRecipientTyping(false), 5000);
          }
        }
        return;
      }

      // Handle online/presence updates
      if ((data.type === 'presence' || data.action === 'presence') && data.conversationId === conversationId) {
        console.log('🟢 Received presence update:', data);
        if (data.onlineUsers && data.onlineUsers.includes(conversation?.recipientId)) {
          setRecipientOnline(true);
        } else if (data.userId === conversation?.recipientId) {
          setRecipientOnline(data.isOnline !== false);
        }
        return;
      }
      
      // Handle read receipts - update tick marks in real-time
      if (data.type === 'message_read' && data.conversationId === conversationId) {
        console.log('✅ Received read receipt for message:', data.messageId);
        setMessages(prev => prev.map(msg => 
          msg.messageId === data.messageId 
            ? { ...msg, status: 'read', readAt: data.readAt }
            : msg
        ));
        return;
      }

      // Handle delivery receipts - update tick marks in real-time
      if (data.type === 'message_delivered' && data.conversationId === conversationId) {
        console.log('✅ Received delivery receipt for message:', data.messageId);
        setMessages(prev => prev.map(msg => 
          msg.messageId === data.messageId 
            ? { ...msg, status: 'delivered', deliveredAt: data.deliveredAt }
            : msg
        ));
        return;
      }

      // Handle message deletion - remove from local state
      if (data.type === 'message_deleted' && data.conversationId === conversationId) {
        console.log('🗑️ Received message deletion:', data.messageId);
        setMessages(prev => prev.filter(msg => msg.messageId !== data.messageId));
        return;
      }
      
      // Handle reaction events in real-time (Telegram-style)
      if ((data.type === 'reaction_added' || data.type === 'reaction_removed') && data.conversationId === conversationId) {
        console.log('❤️ Received reaction event:', data);
        const { messageId, userId, emoji, username, displayName } = data;
        
        setMessages(prev => prev.map(m => {
          if (m.messageId === messageId) {
            let reactions = m.reactions || [];
            
            if (data.type === 'reaction_added') {
              // Remove any existing reaction from this user
              reactions = reactions.filter(r => r.userId !== userId);
              // Add new reaction with animation flag
              reactions.push({
                userId,
                username,
                displayName,
                emoji,
                timestamp: new Date().toISOString()
              });
              return { ...m, reactions, _reactionAnimation: messageId };
            } else {
              // Remove reaction
              reactions = reactions.filter(r => r.userId !== userId);
              return { ...m, reactions };
            }
          }
          return m;
        }));
        
        // Remove animation flag after animation completes
        setTimeout(() => {
          setMessages(prev => prev.map(m => {
            if (m.messageId === messageId) {
              const { _reactionAnimation, ...rest } = m;
              return rest;
            }
            return m;
          }));
        }, 600);
        
        return;
      }
      
      if (data.type === 'new_message' && data.message) {
        let msg = { ...data.message };
        // Check if this message belongs to the current conversation
        if (msg.conversationId === conversationId) {
          console.log('✅ Message belongs to current conversation, processing...');
          
          // IMPORTANT: Check if already decrypted by WebSocketContext (avoid double decryption)
          // Signal Protocol consumes keys on decryption, so we can't decrypt twice
          if (msg.decryptedContent && !msg.decryptedContent.startsWith('[')) {
            console.log('✅ Message already decrypted by WebSocketContext, using existing content');
            // Cache the decrypted plaintext
            await messagingService.saveDecryptedMessage(
              msg.messageId,
              msg.conversationId,
              msg.decryptedContent,
              msg.createdAt
            );
          } else if (msg.encrypted && msg.encryptedData && !msg.decryptedContent) {
            // Only decrypt if not already decrypted
            try {
              const isDual = msg.encryptedData.scheme === 'dual';
              
              if (msg.senderId === user?.userId) {
                // Outgoing message - decrypt with self key
                if (isDual && msg.encryptedData.senderData) {
                  msg.decryptedContent = await messagingService.decryptForSelf(msg.encryptedData.senderData);
                } else {
                  msg.decryptedContent = '[Sent Encrypted Message]';
                }
              } else {
                // Incoming message - decrypt with Signal
                let signalData = msg.encryptedData;
                if (isDual && msg.encryptedData.recipientData) {
                  signalData = msg.encryptedData.recipientData;
                }
                
                if (signalData?.body) {
                  msg.decryptedContent = await signalProtocol.decryptMessage(msg.senderId, signalData);
                } else {
                  msg.decryptedContent = '[Message corrupted]';
                }
              }

              // Cache the decrypted plaintext (like Telegram/WhatsApp)
              if (msg.decryptedContent && !msg.decryptedContent.startsWith('[')) {
                await messagingService.saveDecryptedMessage(
                  msg.messageId,
                  msg.conversationId,
                  msg.decryptedContent,
                  msg.createdAt
                );
              }
            } catch (e) {
              console.error('WebSocket message decryption error:', e);
              msg.decryptedContent = e.message?.includes('expired') 
                ? '[Message expired - encryption key no longer available]'
                : '[Unable to decrypt]';
            }
          } else if (!msg.encrypted) {
            msg.decryptedContent = msg.content || '';
          }
          
          setMessages(prev => {
            // Check if this message is still pending (optimistic message waiting for server response)
            const pendingMessage = prev.find(m => m._isPending && m.senderId === user?.userId);
            if (pendingMessage && msg.senderId === user?.userId) {
              console.log('⏭️ Optimistic message still pending, skipping WebSocket duplicate:', msg.messageId);
              return prev;
            }
            
            const exists = prev.find(m => m.messageId === msg.messageId);
            console.log('🔍 Duplicate check:', {
              messageId: msg.messageId,
              exists: !!exists,
              isPending: !!pendingMessage,
              currentCount: prev.length
            });
            
            if (!exists) {
              console.log('📝 Adding new message to messages array:', msg.messageId);
              const updated = [...prev, msg];
              // Force scroll to bottom after state update
              setTimeout(() => scrollToBottom(), 50);
              
              // Show browser notification for incoming messages
              if (msg.senderId !== user?.userId && 'Notification' in window && Notification.permission === 'granted') {
                const senderName = conversation?.recipient?.username || 'Someone';
                const messageText = msg.decryptedContent?.substring(0, 50) || 'New message';
                
                // Show notification if tab is not focused or user is on different page
                if (document.hidden || window.location.pathname !== '/messages') {
                  new Notification(`${senderName}`, {
                    body: messageText,
                    icon: '/logo192.png',
                    badge: '/logo192.png',
                    tag: msg.messageId,
                    requireInteraction: false
                  });
                }
              }
              
              return updated;
            }
            console.log('⏭️ Message already exists, skipping duplicate:', msg.messageId);
            return prev;
          });
          
          // Mark conversation and message as read (triggers green tick for sender)
          messagingService.markConversationRead(conversationId);
          if (msg.senderId !== user?.userId) {
            messagingService.markMessageRead(msg.messageId, true).catch(() => {});
          }
          
          // Trigger onMessageSent callback if provided
          if (onMessageSent) {
            onMessageSent();
          }
        } else {
          console.log('⏭️ Message is for different conversation, ignoring');
        }
      }
    };
    
    // Always add listener when we have a conversationId
    if (conversationId) {
      console.log('🔗 Adding WebSocket listener for conversation:', conversationId);
      addListener(handleWebSocketEvent);
      
      // Subscribe to this conversation for typing and presence events
      wsSendMessage({ action: 'subscribe', conversationId });
    }
    
    return () => {
      // Always remove the listener on cleanup
      console.log('🔓 Removing WebSocket listener for conversation:', conversationId);
      removeListener(handleWebSocketEvent);
      
      // Unsubscribe from conversation
      if (conversationId) {
        wsSendMessage({ action: 'unsubscribe', conversationId });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.conversationId, addListener, removeListener, wsSendMessage, user?.userId]);

  // --- Initialization & Real-time Polling ---
  const loadMessagesRef = useRef(false);
  const currentConversationRef = useRef(null);
  
  useEffect(() => {
    // Only clear messages when conversation ID actually changes
    const conversationChanged = currentConversationRef.current !== conversation?.conversationId;
    
    if (conversationChanged) {
      console.log('🔄 Conversation changed, clearing messages');
      setMessages([]);
      lastMessageIdRef.current = null;
      currentConversationRef.current = conversation?.conversationId;
      loadMessagesRef.current = false;
    }
    
    if ((conversation?.conversationId || recipientId) && !loadMessagesRef.current) {
      loadMessagesRef.current = true;
      loadMessages();
      startPolling();
      messagingService.setOnlineStatus(true);
      
      // Check if user is blocked
      if (recipientId) {
        messagingService.isUserBlocked(recipientId).then(blocked => {
          setIsBlocked(blocked);
        }).catch(err => {
          console.error('Failed to check block status:', err);
        });
      }
      
      // Load read receipt preference
      if (conversation?.conversationId) {
        messagingService.getReadReceiptPreference(conversation.conversationId).then(enabled => {
          setReadReceiptsEnabled(enabled);
        }).catch(err => {
          console.error('Failed to load read receipt preference:', err);
        });
        
        // Load self-destruct timer
        messagingService.getSelfDestructTimer(conversation.conversationId).then(data => {
          setSelfDestructTimer(data.timer || 0);
        }).catch(err => {
          console.error('Failed to load self-destruct timer:', err);
        });
        
        // Load archive status
        messagingService.isConversationArchived(conversation.conversationId).then(archived => {
          setIsArchived(archived);
        }).catch(err => {
          console.error('Failed to load archive status:', err);
        });
      }
    }
    
    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation?.conversationId, recipientId]);

  const loadMessages = async () => {
    try {
      setLoading(true);
      if (conversation?.conversationId) {
        const res = await messagingService.getConversationMessages(conversation.conversationId, { limit: 50 });
        const loadedMessages = res.messages || [];
        setMessages(loadedMessages);
        
        // Set starred and pinned from API response
        const starredSet = new Set();
        const pinnedSet = new Set();
        loadedMessages.forEach(msg => {
          if (msg.starred) starredSet.add(msg.messageId);
          if (msg.pinned) pinnedSet.add(msg.messageId);
        });
        setStarredMessages(starredSet);
        setPinnedMessages(pinnedSet);
        
        // Set pinned messages list for the pinned bar
        if (res.pinnedMessages && res.pinnedMessages.length > 0) {
          setPinnedMessagesList(res.pinnedMessages);
        } else {
          setPinnedMessagesList(loadedMessages.filter(m => m.pinned));
        }
        
        if (loadedMessages.length > 0) {
          lastMessageIdRef.current = loadedMessages[loadedMessages.length - 1].messageId;
          await messagingService.markConversationRead(conversation.conversationId);
          
          // Mark all unread messages from other users as delivered first, then read
          const undeliveredFromOthers = res.messages.filter(
            msg => msg.senderId !== user?.userId && msg.status === 'sent' && !msg.deliveredAt
          );
          
          // Mark as delivered (fires delivery receipt to sender)
          for (const msg of undeliveredFromOthers) {
            try {
              await messagingService.markMessageDelivered(msg.messageId);
            } catch (e) {
              console.error('Failed to mark delivered:', e);
            }
          }
          
          // Mark all unread messages from other users as read (for proper tick marks)
          const unreadFromOthers = res.messages.filter(
            msg => msg.senderId !== user?.userId && msg.status !== 'read' && !msg.readAt
          );
          if (unreadFromOthers.length > 0) {
            // Mark ALL unread messages (WhatsApp pattern - opening chat marks all as read)
            console.log(`📖 Marking ${unreadFromOthers.length} messages as read`);
            unreadFromOthers.forEach(msg => {
              messagingService.markMessageRead(msg.messageId, true).catch(() => {});
            });
          }
        }
      }
      scrollToBottom();
    } catch (e) {
      // Load messages error
    } finally {
      setLoading(false);
    }
  };

  const startPolling = () => {
    stopPolling();
    if (!conversation?.conversationId) return;
    
    pollIntervalRef.current = setInterval(async () => {
      if (conversation?.conversationId && recipientId) {
        try {
          const [typingUsers, onlineStatus] = await Promise.all([
            messagingService.getTypingUsers(conversation.conversationId),
            messagingService.getOnlineStatus(recipientId)
          ]);
          
          const recipientIsTyping = Array.isArray(typingUsers) && typingUsers.some(uid => {
            const id = typeof uid === 'string' ? uid : uid?.userId;
            return id && id !== user.userId;
          });
          
          setRecipientTyping(recipientIsTyping);
          setRecipientOnline(onlineStatus === true);
        } catch (e) {
          console.error('Poll status error:', e);
        }
      }
    }, 3000);
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  // Typing indicator - Send via WebSocket for real-time
  const handleTyping = useCallback(() => {
    if (!conversation?.conversationId) return;
    
    if (!isTyping) {
      setIsTyping(true);
      // Send typing via WebSocket for instant delivery
      wsSendMessage({ 
        action: 'typing', 
        conversationId: conversation.conversationId, 
        isTyping: true 
      });
      // Also update via REST API as fallback
      messagingService.setTypingIndicator(conversation.conversationId, true).catch(e => 
        console.debug('Set typing error:', e)
      );
    }
    
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      if (conversation?.conversationId) {
        // Send typing stopped via WebSocket
        wsSendMessage({ 
          action: 'typing', 
          conversationId: conversation.conversationId, 
          isTyping: false 
        });
        messagingService.setTypingIndicator(conversation.conversationId, false).catch(e => 
          console.debug('Clear typing error:', e)
        );
      }
    }, 2000);
  }, [isTyping, conversation, wsSendMessage]);

  // --- Handlers ---
  const handleResend = async (failedMessage) => {
    const targetId = recipientId || conversation?.recipientId;
    if (!targetId) return;

    // Update message status to sending
    setMessages(prev => prev.map(m => 
      m.messageId === failedMessage.messageId ? { ...m, status: 'sending' } : m
    ));

    try {
      const response = await messagingService.resendMessage(failedMessage, targetId);
      
      // Replace failed message with successful one
      setMessages(prev => prev.map(m => 
        m.messageId === failedMessage.messageId ? response.message : m
      ));
      
      toast.success('Message resent successfully');
    } catch (error) {
      console.error('Resend failed:', error);
      
      // Revert to error status
      setMessages(prev => prev.map(m => 
        m.messageId === failedMessage.messageId ? { ...m, status: 'error' } : m
      ));
      
      toast.error('Failed to resend message');
    }
  };

  const handleDeleteMessage = async (messageId, deleteForEveryone = false) => {
    try {
      // Call the API to delete the message
      await messagingService.deleteMessage(messageId, deleteForEveryone);
      
      // Remove from local state
      setMessages(prev => prev.filter(m => m.messageId !== messageId));
      toast.success(deleteForEveryone ? 'Message deleted for everyone' : 'Message deleted for you');
      setContextMenu(null);
    } catch (error) {
      console.error('Delete message error:', error);
      toast.error('Failed to delete message');
    }
  };

  const handleClearChat = async () => {
    if (!window.confirm('Are you sure you want to clear this chat? This action cannot be undone.')) {
      return;
    }
    
    try {
      // Call the API to clear conversation
      await messagingService.clearConversation(conversation.conversationId);
      
      // Clear messages from local state
      setMessages([]);
      toast.success('Chat cleared successfully');
      setShowHeaderMenu(false);
    } catch (error) {
      console.error('Clear chat error:', error);
      toast.error('Failed to clear chat');
    }
  };

  const handleBlockUser = async () => {
    if (!window.confirm(`Are you sure you want to ${isBlocked ? 'unblock' : 'block'} ${recipientUsername}?${isBlocked ? '' : ' They will no longer be able to send you messages.'}`)) {
      return;
    }
    
    try {
      if (isBlocked) {
        // Unblock user
        await messagingService.unblockUser(recipientId, recipientUsername);
        toast.success(`${recipientUsername} has been unblocked`);
        setIsBlocked(false);
      } else {
        // Block user
        await messagingService.blockUser(recipientId, recipientUsername);
        toast.success(`${recipientUsername} has been blocked`);
        setIsBlocked(true);
      }
      
      setShowHeaderMenu(false);
      
      // Optionally navigate back to conversation list
      // navigate('/messages');
    } catch (error) {
      console.error('Block/Unblock user error:', error);
      toast.error(`Failed to ${isBlocked ? 'unblock' : 'block'} user`);
    }
  };

  const handleToggleReadReceipts = async () => {
    if (!conversation?.conversationId) return;
    
    try {
      const newValue = !readReceiptsEnabled;
      await messagingService.setReadReceiptPreference(conversation.conversationId, newValue);
      setReadReceiptsEnabled(newValue);
      toast.success(`Read receipts ${newValue ? 'enabled' : 'disabled'}`);
      setShowHeaderMenu(false);
    } catch (error) {
      console.error('Toggle read receipts error:', error);
      toast.error('Failed to update read receipt setting');
    }
  };

  const handleSetSelfDestruct = async (timer) => {
    if (!conversation?.conversationId) return;
    
    try {
      await messagingService.setSelfDestructTimer(conversation.conversationId, timer);
      setSelfDestructTimer(timer);
      
      if (timer === 0) {
        toast.success('Self-destruct timer disabled');
      } else {
        const timeStr = timer < 60 ? `${timer} seconds` : 
                       timer < 3600 ? `${timer / 60} minutes` :
                       timer < 86400 ? `${timer / 3600} hours` :
                       `${timer / 86400} days`;
        toast.success(`Messages will auto-delete after ${timeStr}`);
      }
      
      setShowSelfDestructDialog(false);
      setShowHeaderMenu(false);
    } catch (error) {
      console.error('Set self-destruct error:', error);
      toast.error('Failed to set self-destruct timer');
    }
  };

  const handleToggleArchive = async () => {
    if (!conversation?.conversationId) return;
    
    try {
      if (isArchived) {
        // Unarchive
        await messagingService.unarchiveConversation(conversation.conversationId);
        setIsArchived(false);
        toast.success('Conversation unarchived');
      } else {
        // Archive
        await messagingService.archiveConversation(conversation.conversationId);
        setIsArchived(true);
        toast.success('Conversation archived');
        
        // Optionally navigate back to conversation list
        if (onBack) {
          setTimeout(() => onBack(), 500);
        }
      }
      
      setShowHeaderMenu(false);
    } catch (error) {
      console.error('Archive/unarchive error:', error);
      toast.error(`Failed to ${isArchived ? 'unarchive' : 'archive'} conversation`);
    }
  };

  // Selection mode handlers
  const handleToggleSelection = (messageId) => {
    const newSelected = new Set(selectedMessages);
    if (newSelected.has(messageId)) {
      newSelected.delete(messageId);
    } else {
      newSelected.add(messageId);
    }
    setSelectedMessages(newSelected);
    
    // Exit selection mode if no messages selected
    if (newSelected.size === 0) {
      setSelectionMode(false);
    }
  };

  const handleSelectAll = () => {
    const allIds = new Set(messages.map(m => m.messageId));
    setSelectedMessages(allIds);
  };

  const handleCancelSelection = () => {
    setSelectedMessages(new Set());
    setSelectionMode(false);
  };

  const handleDeleteSelected = async (deleteForEveryone = false) => {
    if (!window.confirm(`Delete ${selectedMessages.size} message(s)?`)) {
      return;
    }

    try {
      for (const messageId of selectedMessages) {
        await messagingService.deleteMessage(messageId, deleteForEveryone);
      }
      toast.success(`${selectedMessages.size} message(s) deleted`);
      handleCancelSelection();
    } catch (error) {
      console.error('Delete selected error:', error);
      toast.error('Failed to delete messages');
    }
  };

  const handleCopySelected = () => {
    const selectedMsgs = messages.filter(m => selectedMessages.has(m.messageId));
    const text = selectedMsgs.map(m => {
      const sender = m.senderId === user.userId ? 'You' : recipientInfo.displayName;
      return `[${new Date(m.createdAt).toLocaleString()}] ${sender}: ${m.text || '[Media]'}`;
    }).join('\n');
    
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Messages copied to clipboard');
      handleCancelSelection();
    }).catch(() => {
      toast.error('Failed to copy messages');
    });
  };

  const handleForwardSelected = () => {
    // TODO: Implement forward dialog
    toast.info('Forward feature coming soon');
    // For now, just cancel selection
    // handleCancelSelection();
  };

  const handleStarSelected = async () => {
    // TODO: Implement star messages endpoint
    toast.info('Star feature coming soon');
    // handleCancelSelection();
  };

  const handleMessageContextMenu = (e, msg) => {
    e.preventDefault();
    const isMe = msg.senderId === user.userId;
    setContextMenu({
      messageId: msg.messageId,
      x: e.clientX,
      y: e.clientY,
      isMe,
      canDeleteForEveryone: isMe && (Date.now() - new Date(msg.createdAt).getTime() < 3600000) // 1 hour
    });
  };

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  // Per-message action handlers
  const handleReplyToMessage = (messageId) => {
    const msg = messages.find(m => m.messageId === messageId);
    if (msg) {
      // Set reply context - will show preview bar and include in sent message
      setReplyingTo({
        messageId: msg.messageId,
        content: msg.decryptedContent || msg.content || '[Media]',
        senderId: msg.senderId,
        senderName: msg.senderId === user?.userId ? 'You' : (recipientInfo.displayName || recipientInfo.username || 'Unknown')
      });
      setSelectedMessage(null);
      // Focus the input
      document.querySelector('.message-input')?.focus();
    }
  };
  
  const cancelReply = () => {
    setReplyingTo(null);
  };

  const handleStarMessage = async (messageId) => {
    try {
      const msg = messages.find(m => m.messageId === messageId);
      const isStarred = msg?.starred || starredMessages.has(messageId);
      if (isStarred) {
        await messagingService.unstarMessage(messageId);
        setStarredMessages(prev => {
          const newSet = new Set(prev);
          newSet.delete(messageId);
          return newSet;
        });
        setMessages(prev => prev.map(m => m.messageId === messageId ? {...m, starred: false} : m));
        toast.success('Message unstarred');
      } else {
        await messagingService.starMessage(messageId);
        setStarredMessages(prev => new Set(prev).add(messageId));
        setMessages(prev => prev.map(m => m.messageId === messageId ? {...m, starred: true} : m));
        toast.success('Message starred');
      }
      setSelectedMessage(null);
    } catch (error) {
      console.error('Star message error:', error);
      toast.error('Failed to star message');
    }
  };

  const handlePinMessage = async (messageId) => {
    try {
      const msg = messages.find(m => m.messageId === messageId);
      const isPinned = msg?.pinned || pinnedMessages.has(messageId);
      const senderName = msg?.senderId === user?.userId ? 'You' : (recipientInfo.displayName || recipientInfo.username);
      
      if (isPinned) {
        await messagingService.unpinMessage(messageId, conversation?.conversationId);
        setPinnedMessages(prev => {
          const newSet = new Set(prev);
          newSet.delete(messageId);
          return newSet;
        });
        setMessages(prev => prev.map(m => m.messageId === messageId ? {...m, pinned: false} : m));
        setPinnedMessagesList(prev => prev.filter(m => m.messageId !== messageId));
        toast.success('Message unpinned');
      } else {
        await messagingService.pinMessage(messageId, conversation?.conversationId);
        setPinnedMessages(prev => new Set(prev).add(messageId));
        const updatedMsg = {...msg, pinned: true};
        setMessages(prev => prev.map(m => m.messageId === messageId ? updatedMsg : m));
        setPinnedMessagesList(prev => [...prev, updatedMsg]);
        setShowPinnedBar(true);
        
        // Add system message for pin event
        const systemMsg = {
          messageId: `pin-${messageId}-${Date.now()}`,
          conversationId: conversation?.conversationId,
          messageType: 'system',
          content: `${senderName} pinned a message`,
          decryptedContent: `${senderName} pinned a message`,
          senderId: 'system',
          createdAt: new Date().toISOString(),
          timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, systemMsg]);
        
        toast.success('Message pinned');
      }
      setSelectedMessage(null);
    } catch (error) {
      console.error('Pin message error:', error);
      toast.error('Failed to pin message');
    }
  };

  const handleForwardMessage = async (messageId) => {
    // Show forward modal instead of prompt
    const msg = messages.find(m => m.messageId === messageId);
    if (msg) {
      setForwardingMessage({
        messageId: msg.messageId,
        content: msg.decryptedContent || msg.content || '[Media]'
      });
      setShowForwardModal(true);
    }
    setSelectedMessage(null);
  };
  
  const confirmForward = async (recipientUsernames) => {
    if (!forwardingMessage || ((!recipientUsernames || recipientUsernames.length === 0) && selectedForwardRecipients.size === 0)) {
      toast.error('Please select at least one recipient');
      return;
    }
    
    const recipients = recipientUsernames || Array.from(selectedForwardRecipients);
    
    try {
      await messagingService.forwardMessages([forwardingMessage.messageId], recipients);
      toast.success(`Message forwarded to ${recipients.length} recipient(s)`);
      setShowForwardModal(false);
      setForwardingMessage(null);
      setSelectedForwardRecipients(new Set());
      setForwardSearchQuery('');
    } catch (error) {
      console.error('Forward message error:', error);
      toast.error('Failed to forward message');
    }
  };
  
  const cancelForward = () => {
    setShowForwardModal(false);
    setForwardingMessage(null);
    setSelectedForwardRecipients(new Set());
    setForwardSearchQuery('');
  };

  const handleSelectMessage = (messageId) => {
    setSelectionMode(true);
    setSelectedMessages(new Set([messageId]));
    setSelectedMessage(null);
  };

  const handleReportMessage = async (messageId) => {
    const reason = prompt('Please provide a reason for reporting this message:');
    if (!reason) return;
    
    try {
      await messagingService.reportMessage(messageId, reason, '');
      toast.success('Message reported. Thank you for helping keep our community safe.');
      setSelectedMessage(null);
    } catch (error) {
      console.error('Report message error:', error);
      toast.error('Failed to report message');
    }
  };

  const handleAddReaction = async (messageId, emoji) => {
    try {
      // Optimistically update UI first (instant feedback)
      setMessages(prev => prev.map(m => {
        if (m.messageId === messageId) {
          const reactions = m.reactions || [];
          const existing = reactions.find(r => r.userId === user.userId);
          if (existing) {
            existing.emoji = emoji;
            existing.timestamp = new Date().toISOString();
          } else {
            reactions.push({ 
              userId: user.userId,
              username: user.username,
              displayName: user.displayName,
              emoji, 
              timestamp: new Date().toISOString() 
            });
          }
          return { ...m, reactions, _reactionAnimation: messageId };
        }
        return m;
      }));
      
      setShowEmojiPicker(null);
      
      // Then sync with server
      await messagingService.addReaction(messageId, emoji);
      
      // Remove animation flag after animation completes
      setTimeout(() => {
        setMessages(prev => prev.map(m => {
          if (m.messageId === messageId) {
            const { _reactionAnimation, ...rest } = m;
            return rest;
          }
          return m;
        }));
      }, 600);
    } catch (error) {
      console.error('Add reaction error:', error);
      toast.error('Failed to add reaction');
      // Revert on error
      setMessages(prev => prev.map(m => {
        if (m.messageId === messageId) {
          const reactions = (m.reactions || []).filter(r => r.userId !== user.userId);
          return { ...m, reactions };
        }
        return m;
      }));
    }
  };

  const handleRemoveReaction = async (messageId) => {
    // Capture previous state before try block
    const previousReactions = messages.find(m => m.messageId === messageId)?.reactions;
    
    try {
      // Optimistically update UI first
      setMessages(prev => prev.map(m => {
        if (m.messageId === messageId) {
          const reactions = (m.reactions || []).filter(r => r.userId !== user.userId);
          return { ...m, reactions };
        }
        return m;
      }));
      
      // Then sync with server
      await messagingService.removeReaction(messageId);
    } catch (error) {
      console.error('Remove reaction error:', error);
      toast.error('Failed to remove reaction');
      // Revert on error
      setMessages(prev => prev.map(m => {
        if (m.messageId === messageId) {
          return { ...m, reactions: previousReactions };
        }
        return m;
      }));
    }
  };

  const handleSearchMessages = () => {
    setShowSearchBar(!showSearchBar);
    setShowHeaderMenu(false);
    if (showSearchBar) {
      setConversationSearchQuery('');
    }
  };

  const handleChangeBackground = (background) => {
    setChatBackground(background);
    localStorage.setItem('chatBackground', background);
    setShowBackgroundPicker(false);
    toast.success('Background updated');
  };

  const handleSend = async () => {
    if ((!inputText.trim() && files.length === 0) || uploading) return;

    // Check if user is blocked
    const targetId = recipientId || conversation?.recipientId;
    if (isBlocked) {
      const recipientUsername = conversation?.recipientName || conversation?.username || 'this user';
      toast.error(`You have blocked ${recipientUsername}. Unblock them to send messages.`, {
        action: {
          label: 'Unblock',
          onClick: () => handleBlockUser()
        }
      });
      return;
    }

    // Check if recipient has encryption keys
    if (targetId) {
      const hasKeys = await messagingService.hasEncryptionKeys(targetId);
      if (!hasKeys) {
        toast.error('This user hasn\'t enabled encryption yet. Please try again later.');
        return;
      }
    }

    const tempId = `temp_${Date.now()}`;
    const messageText = inputText.trim();
    const messageFiles = [...files];
    
    setInputText('');
    setFiles([]);
    setShowPicker(null);
    setIsTyping(false);
    if (conversation?.conversationId) {
      messagingService.setTypingIndicator(conversation.conversationId, false);
    }

    // Optimistic UI update
    const optimisticMessage = {
      messageId: tempId,
      senderId: user.userId,
      content: messageText,
      decryptedContent: messageText,
      media: messageFiles.map(f => ({ 
        type: f.messageType || f.type, 
        messageType: f.messageType,
        url: URL.createObjectURL(f),
        name: f.name,
        size: f.size,
        duration: f.voiceDuration || null,
        waveform: f.voiceWaveform || null
      })),
      decryptedMedia: messageFiles.map(f => ({ 
        type: f.messageType || f.type,
        messageType: f.messageType,
        url: URL.createObjectURL(f),
        name: f.name,
        size: f.size,
        duration: f.voiceDuration || null,
        waveform: f.voiceWaveform || null
      })),
      encrypted: true,
      createdAt: new Date().toISOString(),
      status: 'sending',
      _isPending: true // Mark as pending to track it
    };

    setMessages(prev => [...prev, optimisticMessage]);
    scrollToBottom();

    try {
      // Upload media
      let uploadedMedia = [];
      if (messageFiles.length > 0) {
        setUploading(true);
        uploadedMedia = await Promise.all(
          messageFiles.map(async (f) => {
            try {
              const uploaded = await messagingService.uploadMedia(f);
              // Preserve messageType for stickers/gifs/voice
              if (f.messageType) {
                uploaded.type = f.messageType;
                uploaded.messageType = f.messageType;
              }
              // Preserve voice metadata
              if (f.voiceDuration) uploaded.duration = f.voiceDuration;
              if (f.voiceWaveform) uploaded.waveform = f.voiceWaveform;
              return uploaded;
            } catch (err) {
              toast.error(`Failed to upload ${f.name}`);
              return null;
            }
          })
        );
        uploadedMedia = uploadedMedia.filter(Boolean);
        setUploading(false);
      }

      // Determine message type
      let messageType = 'text';
      if (uploadedMedia.length > 0) {
        const firstMedia = uploadedMedia[0];
        messageType = firstMedia.messageType || firstMedia.type || 'document';
      }

      // Send message
      const targetId = recipientId || conversation?.recipientId;
      const response = await messagingService.sendMessage(targetId, messageText, {
        media: uploadedMedia,
        messageType,
        replyTo: replyingTo?.messageId || null
      });

      // Track this messageId to prevent WebSocket duplicate
      pendingMessageIds.current.add(response.message.messageId);
      
      // Clear reply context after sending
      if (replyingTo) {
        setReplyingTo(null);
      }

      // Replace optimistic message with real one
      setMessages(prev => {
        console.log('🔄 Replacing optimistic message:', {
          tempId,
          realId: response.message.messageId,
          beforeCount: prev.length
        });
        const updated = prev.map(m => {
          if (m.messageId === tempId) {
            // Remove _isPending flag from server response
            const { _isPending, ...cleanMessage } = response.message;
            return cleanMessage;
          }
          return m;
        });
        console.log('✅ After replacement:', { count: updated.length });
        return updated;
      });
      
      lastMessageIdRef.current = response.message.messageId;
      
      // Update conversation ID and restart polling if this was a new conversation
      if (!conversation?.conversationId && response.conversationId) {
        conversation.conversationId = response.conversationId;
        // Restart polling now that we have a conversationId
        startPolling();
      }
      
      // Notify parent with conversationId to refresh conversation list immediately
      if (onMessageSent) onMessageSent(response.conversationId || conversation?.conversationId);
    } catch (error) {
      toast.error('Failed to send message');
      setMessages(prev => prev.map(m => 
        m.messageId === tempId ? { ...m, status: 'error' } : m
      ));
    }
  };

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files);
    const maxSize = 10 * 1024 * 1024; // 10MB
    const validFiles = selected.filter(f => {
      if (f.size > maxSize) {
        toast.error(`${f.name} is too large (max 10MB)`);
        return false;
      }
      return true;
    });
    setFiles(prev => [...prev, ...validFiles]);
  };

  // Search GIFs and Stickers
  useEffect(() => {
    if (!showPicker) {
      setGifSearchQuery('');
      setGifResults([]);
      setStickerResults([]);
      return;
    }

    const searchMedia = async () => {
      if (showPicker === 'gif') {
        if (gifSearchQuery) {
          try {
            const response = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=QOv3F4aOSrirMxcuPHQAEcN5Z3Z9lBPq&q=${gifSearchQuery}&limit=50`);
            const data = await response.json();
            setGifResults(data.data?.map(g => g.images.fixed_height.url) || []);
          } catch (e) {
            setGifResults([]);
          }
        } else {
          setGifResults([]);
        }
      }
      
      if (showPicker === 'sticker') {
        if (gifSearchQuery) {
          try {
            const response = await fetch(`https://tenor.googleapis.com/v2/search?q=${gifSearchQuery}&key=AIzaSyCMUZU87UMBTbdzHPiTJLNjAL7xItS99dY&limit=50&media_filter=sticker`);
            const data = await response.json();
            setStickerResults(data.results?.map(s => s.media_formats.gif.url) || []);
          } catch (e) {
            setStickerResults([]);
          }
        } else {
          setStickerResults([]);
        }
      }
    };
    
    const timer = setTimeout(searchMedia, 300);
    return () => clearTimeout(timer);
  }, [gifSearchQuery, showPicker]);

  const handleAudioPlay = (id, url) => {
    // Stop others
    Object.values(audioRefs.current).forEach(audio => {
      if (audio && audio.src !== url) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    const currentAudio = audioRefs.current[id];
    if (currentAudio) {
      // Check if audio source is valid
      if (!currentAudio.src || currentAudio.src === window.location.href) {
        console.error('Audio source not set properly:', url);
        return;
      }
      
      if (currentAudio.paused) {
        currentAudio.play().catch(err => {
          console.error('Audio playback failed:', err);
          setAudioPlaying(null);
        });
        setAudioPlaying(id);
      } else {
        currentAudio.pause();
        setAudioPlaying(null);
      }
    }
  };

  // --- Render Media Helpers ---
  const renderMediaBubble = (media, msg, index) => {
    const type = media.type || media.mimeType || media.messageType;
    const isMe = msg.senderId === user.userId;
    
    // Status indicator component for media
    const MediaStatus = () => (
      <div className="media-status-overlay">
        <span className="media-timestamp">
          {new Date(msg.createdAt || msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
        </span>
        {isMe && (
          <span className={`read-receipt ${msg.status || 'sent'}`}>
            {msg.status === 'sending' ? <Loader size={12} className="spin" /> :
             msg.status === 'error' ? <X size={12} /> :
             msg.readAt ? <CheckCheck size={12} className="read-tick" /> :
             msg.deliveredAt || msg.status === 'delivered' ? <CheckCheck size={12} className="delivered-tick" /> :
             <Check size={12} className="sent-tick" />}
          </span>
        )}
      </div>
    );
    
    // Stickers
    if (type === 'sticker') {
      return (
        <div key={index} className="media-bubble sticker">
          <img src={media.url} alt="sticker" loading="lazy" />
          <MediaStatus />
        </div>
      );
    }
    
    // GIFs
    if (type === 'gif' || type.includes('gif')) {
      return (
        <div key={index} className="media-bubble gif">
          <img src={media.url} alt="gif" loading="lazy" />
          <MediaStatus />
        </div>
      );
    }
    
    // Images
    if (type.startsWith('image')) {
      return (
        <div key={index} className="media-bubble image clickable" onClick={() => setViewingMedia({ ...media, type: 'image' })}>
          <img src={media.url} alt="attachment" loading="lazy" />
          <MediaStatus />
        </div>
      );
    }

    if (type.startsWith('video')) {
      return (
        <div 
          key={index} 
          className="media-bubble video clickable"
          onClick={() => setViewingMedia({ ...media, type: 'video' })}
        >
          <video src={media.url} controls onClick={(e) => e.stopPropagation()} />
          <div className="video-overlay">
            <Play size={48} className="play-icon" />
          </div>
          <MediaStatus />
        </div>
      );
    }

    // Audio & Voice Messages
    if (type.startsWith('audio') || type === 'voice') {
      const msgId = msg.messageId || msg.id;
      const isPlaying = audioPlaying === `${msgId}-${index}`;
      const isVoice = type === 'voice';
      const waveform = media.waveform || [];
      const duration = media.duration || 0;
      
      const formatDuration = (secs) => {
        const mins = Math.floor(secs / 60);
        const seconds = Math.floor(secs % 60);
        return `${mins}:${seconds.toString().padStart(2, '0')}`;
      };
      
      return (
        <div 
          key={index} 
          className={`media-bubble audio-card ${isVoice ? 'voice' : ''} clickable`}
          onClick={() => setViewingMedia({ ...media, type: 'audio', name: isVoice ? 'Voice Message' : media.name })}
        >
          <button 
            className={`audio-play-btn ${isPlaying ? 'playing' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              handleAudioPlay(`${msgId}-${index}`, media.url);
            }}
          >
            {isPlaying ? <Pause size={16} fill="currentColor"/> : (isVoice ? <Mic size={16} /> : <Play size={16} fill="currentColor" />)}
          </button>
          <div className="audio-waveform">
            {waveform.length > 0 ? waveform.map((level, i) => {
              const height = 8 + (level * 24);
              return (
                <div 
                  key={i}
                  className={`wave-bar ${isPlaying ? 'anim' : ''}`}
                  style={{ height: `${height}px` }}
                />
              );
            }) : (
              <>
                <div className={`wave-bar ${isPlaying ? 'anim' : ''}`} />
                <div className={`wave-bar ${isPlaying ? 'anim' : ''}`} />
                <div className={`wave-bar ${isPlaying ? 'anim' : ''}`} />
                <div className={`wave-bar ${isPlaying ? 'anim' : ''}`} />
              </>
            )}
          </div>
          <audio 
            ref={el => audioRefs.current[`${msgId}-${index}`] = el}
            src={media.url} 
            onEnded={() => setAudioPlaying(null)}
            onError={(e) => {
              console.error('Audio load error:', e.target.error, 'URL:', media.url);
              setAudioPlaying(null);
            }}
            preload="metadata"
            hidden 
          />
          <div className="audio-meta">
            <span className="audio-duration">{duration > 0 ? formatDuration(duration) : '0:00'}</span>
            {!isMe && (
              <span className="audio-timestamp">
                {new Date(msg.createdAt || msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </span>
            )}
          </div>
          {isMe && (
            <div className="audio-status">
              <span className="audio-timestamp">
                {new Date(msg.createdAt || msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </span>
              <span className={`read-receipt ${msg.status || 'sent'}`}>
                {msg.status === 'sending' ? <Loader size={10} className="spin" /> :
                 msg.status === 'error' ? <X size={10} /> :
                 msg.readAt ? <CheckCheck size={10} className="read-tick" /> :
                 msg.deliveredAt || msg.status === 'delivered' ? <CheckCheck size={10} className="delivered-tick" /> :
                 <Check size={10} className="sent-tick" />}
              </span>
            </div>
          )}
        </div>
      );
    }

    // Documents - clickable to view inline
    const isPDF = type.includes('pdf') || media.name?.endsWith('.pdf') || media.url?.includes('.pdf');
    const isDoc = type.includes('document') || ['doc', 'docx', 'txt'].some(ext => media.name?.endsWith(ext));
    
    // Extract filename from URL if name is missing
    const fileName = media.name || media.url?.split('/').pop()?.split('?')[0] || 'Document';
    const fileSize = media.size || 0;
    
    return (
      <div 
        key={index} 
        className="media-bubble doc-card clickable"
        onClick={() => setViewingMedia({ ...media, name: fileName, type: isPDF ? 'pdf' : isDoc ? 'doc' : 'file' })}
      >
        <div className="doc-icon">
          <FileText size={24} />
        </div>
        <div className="doc-info">
          <span className="doc-name">{fileName}</span>
          <span className="doc-size">{(fileSize / 1024).toFixed(1)} KB</span>
        </div>
        <div className="doc-actions">
          <button 
            className="doc-view-btn"
            onClick={(e) => {
              e.stopPropagation();
              setViewingMedia({ ...media, type: isPDF ? 'pdf' : isDoc ? 'doc' : 'file' });
            }}
            title="View"
          >
            👁️
          </button>
          <a 
            href={media.url} 
            download={fileName}
            onClick={(e) => e.stopPropagation()}
            className="doc-download-btn"
            title="Download"
          >
            <Download size={16} />
          </a>
        </div>
        {isMe && (
          <div className="doc-status">
            <span className={`read-receipt ${msg.status || 'sent'}`}>
              {msg.status === 'sending' ? <Loader size={10} className="spin" /> :
               msg.status === 'error' ? <X size={10} /> :
               msg.readAt ? <CheckCheck size={10} className="read-tick" /> :
               msg.deliveredAt || msg.status === 'delivered' ? <CheckCheck size={10} className="delivered-tick" /> :
               <Check size={10} className="sent-tick" />}
            </span>
          </div>
        )}
      </div>
    );
  };

  // Helper to check if message is emoji-only
  const isEmojiOnly = (text) => {
    if (!text || text.trim().length === 0) return false;
    const emojiRegex = /^[\p{Emoji}\s]+$/u;
    return emojiRegex.test(text.trim()) && text.trim().length <= 10;
  };

  // Helper to parse and render call log messages (like WhatsApp/Telegram)
  const parseCallLog = (content) => {
    try {
      if (typeof content === 'string' && content.startsWith('{')) {
        return JSON.parse(content);
      }
    } catch {
      return null;
    }
    return null;
  };

  const formatCallDuration = (seconds) => {
    if (!seconds || seconds <= 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return `0:${secs.toString().padStart(2, '0')}`;
  };

  // Format last seen time like WhatsApp/Telegram
  const formatLastSeen = (timestamp) => {
    if (!timestamp) return '';
    const now = new Date();
    const lastSeenDate = new Date(timestamp);
    const diffMs = now - lastSeenDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return lastSeenDate.toLocaleDateString();
  };

  const renderCallLogMessage = (msg, callLog, isMe) => {
    const { callType, duration, status, isOutgoing } = callLog;
    const isVoice = callType === 'voice' || callType === 'audio';
    const isMissed = status === 'missed' || status === 'rejected' || duration <= 0;
    const wasOutgoing = isMe ? isOutgoing : !isOutgoing;
    
    let icon, label;
    if (isMissed) {
      if (wasOutgoing) {
        icon = '📵';
        label = isVoice ? 'Outgoing voice call' : 'Outgoing video call';
      } else {
        icon = '📵';
        label = isVoice ? 'Missed voice call' : 'Missed video call';
      }
    } else {
      if (wasOutgoing) {
        icon = isVoice ? '📞' : '📹';
        label = isVoice ? 'Outgoing voice call' : 'Outgoing video call';
      } else {
        icon = isVoice ? '📞' : '📹';
        label = isVoice ? 'Incoming voice call' : 'Incoming video call';
      }
    }
    
    // Position call log on sender/receiver side like regular messages
    return (
      <div className={`call-log-bubble ${isMissed ? 'missed' : 'completed'} ${isMe ? 'sent' : 'received'}`}>
        <div className="call-log-icon">{icon}</div>
        <div className="call-log-info">
          <span className="call-log-label">{label}</span>
          {!isMissed && duration > 0 && (
            <span className="call-log-duration">{formatCallDuration(duration)}</span>
          )}
        </div>
        <div className="call-log-time">
          {new Date(msg.createdAt || msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
        </div>
      </div>
    );
  };

  return (
    <div className="chat-interface">
      
      {/* --- Header --- */}
      {!isFloatingChat && (
        <>
          <div className="chat-header glass-panel">
            <div className="header-left" onClick={() => window.location.href = `/profile/${recipientUsername}`} style={{ cursor: 'pointer' }}>
              {isMobile && (
                <button className="back-btn" onClick={(e) => { e.stopPropagation(); onBack(); }}>
                  <ArrowLeft size={20} />
                </button>
              )}
              <div className="chat-avatar-wrapper">
                {recipientInfo.avatar ? <img src={recipientInfo.avatar} alt="" /> : <div className="avatar-fallback">{recipientInfo.displayName?.[0]}</div>}
                {recipientOnline && <div className="online-status active" />}
              </div>
              <div className="chat-user-details">
                <h3>{recipientInfo.displayName}</h3>
                <span className="status-text">
                  {recipientTyping ? (
                    <span className="typing-indicator">typing...</span>
                  ) : recipientOnline ? (
                    <span className="online-indicator">online</span>
                  ) : lastSeen ? (
                    <span className="last-seen">last seen {formatLastSeen(lastSeen)}</span>
                  ) : (
                    'tap here for contact info'
                  )}
                </span>
              </div>
            </div>
            
            <div className="header-actions">
              <button className="action-icon" onClick={handleSearchMessages} title="Search">
                <Search size={20} />
              </button>
              <CallButton type="audio" onClick={() => onStartCall?.('audio')} />
              <CallButton type="video" onClick={() => onStartCall?.('video')} />
              <div className="header-menu-wrapper">
                <button className="action-icon" onClick={() => setShowHeaderMenu(!showHeaderMenu)}>
                  <MoreVertical size={20} />
                </button>
                <AnimatePresence>
                  {showHeaderMenu && (
                    <motion.div
                      className="header-dropdown-menu"
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button className="menu-item" onClick={() => { setShowBackgroundPicker(!showBackgroundPicker); setShowHeaderMenu(false); }}>
                        <ImageIcon size={16} />
                        <span>Change background</span>
                      </button>
                      <button className="menu-item" onClick={() => { handleToggleReadReceipts(); }}>
                        {readReceiptsEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
                        <span>{readReceiptsEnabled ? 'Disable' : 'Enable'} read receipts</span>
                      </button>
                      <button className="menu-item" onClick={() => { setShowSelfDestructDialog(true); setShowHeaderMenu(false); }}>
                        <Timer size={16} />
                        <span>Self-destruct timer {selfDestructTimer > 0 ? '✓' : ''}</span>
                      </button>
                      <button className="menu-item" onClick={() => { handleClearChat(); setShowHeaderMenu(false); }}>
                        <Trash2 size={16} />
                        <span>Clear chat</span>
                      </button>
                      <button className="menu-item" onClick={() => { navigator.clipboard.writeText(recipientUsername); toast.success('Username copied'); setShowHeaderMenu(false); }}>
                        <Copy size={16} />
                        <span>Copy username</span>
                      </button>
                      <button className="menu-item" onClick={() => { handleToggleArchive(); }}>
                        <Archive size={16} />
                        <span>{isArchived ? 'Unarchive' : 'Archive'} conversation</span>
                      </button>
                      <button className="menu-item" onClick={() => { toast.info('Mute notifications coming soon'); setShowHeaderMenu(false); }}>
                        <MessageSquareOff size={16} />
                        <span>Mute notifications</span>
                      </button>
                      <div className="menu-divider" />
                      <button className="menu-item danger" onClick={() => { handleBlockUser(); }}>
                        <UserX size={16} />
                        <span>{isBlocked ? 'Unblock user' : 'Block user'}</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* --- Encryption Badge (Centered below header) --- */}
          <div className="encryption-badge-container">
            <div className="encryption-badge-wrapper" onClick={() => setShowEncryptionVerification(true)}>
              <Lock size={12} />
              <span>End-to-end encrypted</span>
            </div>
          </div>
        </>
      )}

      {/* --- Search Bar --- */}
      <AnimatePresence>
        {showSearchBar && (
          <motion.div
            className="search-bar glass-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <input
              type="text"
              placeholder="Search in conversation..."
              value={conversationSearchQuery}
              onChange={(e) => setConversationSearchQuery(e.target.value)}
              autoFocus
            />
            <button className="close-search" onClick={() => { setShowSearchBar(false); setConversationSearchQuery(''); }}>
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Selection Toolbar --- */}
      <AnimatePresence>
        {selectionMode && (
          <motion.div
            className="selection-toolbar glass-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="toolbar-left">
              <button className="toolbar-btn" onClick={handleCancelSelection}>
                <X size={20} />
              </button>
              <span className="selection-count">{selectedMessages.size} selected</span>
            </div>
            <div className="toolbar-actions">
              <button className="toolbar-btn" onClick={handleForwardSelected} title="Forward">
                <Share2 size={20} />
              </button>
              <button className="toolbar-btn" onClick={handleStarSelected} title="Star">
                <Star size={20} />
              </button>
              <button className="toolbar-btn" onClick={handleCopySelected} title="Copy">
                <Copy size={20} />
              </button>
              <button className="toolbar-btn danger" onClick={() => handleDeleteSelected(false)} title="Delete for me">
                <Trash2 size={20} />
              </button>
              <button className="toolbar-btn" onClick={handleSelectAll} title="Select all">
                <CheckSquare size={20} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Background Picker --- */}
      <AnimatePresence>
        {showBackgroundPicker && (
          <motion.div
            className="background-picker-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowBackgroundPicker(false)}
          >
            <motion.div
              className="background-picker glass-panel"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>Choose Background</h3>
              <div className="background-grid">
                <div 
                  className={`bg-option ${chatBackground === 'default' ? 'active' : ''}`}
                  onClick={() => handleChangeBackground('default')}
                >
                  <div className="bg-preview bg-default"></div>
                  <span>Default</span>
                </div>
                <div 
                  className={`bg-option ${chatBackground === 'dark' ? 'active' : ''}`}
                  onClick={() => handleChangeBackground('dark')}
                >
                  <div className="bg-preview bg-dark"></div>
                  <span>Dark</span>
                </div>
                <div 
                  className={`bg-option ${chatBackground === 'gradient1' ? 'active' : ''}`}
                  onClick={() => handleChangeBackground('gradient1')}
                >
                  <div className="bg-preview bg-gradient1"></div>
                  <span>Gradient 1</span>
                </div>
                <div 
                  className={`bg-option ${chatBackground === 'gradient2' ? 'active' : ''}`}
                  onClick={() => handleChangeBackground('gradient2')}
                >
                  <div className="bg-preview bg-gradient2"></div>
                  <span>Gradient 2</span>
                </div>
                <div 
                  className={`bg-option ${chatBackground === 'pattern' ? 'active' : ''}`}
                  onClick={() => handleChangeBackground('pattern')}
                >
                  <div className="bg-preview bg-pattern"></div>
                  <span>Pattern</span>
                </div>
              </div>
              <button className="close-picker-btn" onClick={() => setShowBackgroundPicker(false)}>
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Pinned Messages Bar (WhatsApp style) --- */}
      <AnimatePresence>
        {pinnedMessagesList.length > 0 && showPinnedBar && (
          <motion.div
            className="pinned-messages-bar glass-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="pinned-bar-content">
              <div className="pinned-icon">
                <Pin size={16} />
              </div>
              <div className="pinned-info">
                <span className="pinned-count">
                  {pinnedMessagesList.length} Pinned Message{pinnedMessagesList.length > 1 ? 's' : ''}
                  {pinnedMessagesList.length > 1 && ` (${currentPinnedIndex + 1}/${pinnedMessagesList.length})`}
                </span>
                <span className="pinned-preview">
                  {pinnedMessagesList[currentPinnedIndex]?.decryptedContent || pinnedMessagesList[currentPinnedIndex]?.content || '[Media]'}
                </span>
              </div>
              
              {/* Navigation controls for multiple pinned messages */}
              {pinnedMessagesList.length > 1 && (
                <div className="pinned-navigation">
                  <button
                    className="pinned-nav-btn"
                    onClick={() => {
                      const newIndex = currentPinnedIndex > 0 ? currentPinnedIndex - 1 : pinnedMessagesList.length - 1;
                      setCurrentPinnedIndex(newIndex);
                      const msgElement = document.getElementById(`msg-${pinnedMessagesList[newIndex]?.messageId}`);
                      if (msgElement) {
                        msgElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        msgElement.classList.add('highlight-message');
                        setTimeout(() => msgElement.classList.remove('highlight-message'), 2000);
                      }
                    }}
                    title="Previous pinned message"
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    className="pinned-nav-btn"
                    onClick={() => {
                      const newIndex = currentPinnedIndex < pinnedMessagesList.length - 1 ? currentPinnedIndex + 1 : 0;
                      setCurrentPinnedIndex(newIndex);
                      const msgElement = document.getElementById(`msg-${pinnedMessagesList[newIndex]?.messageId}`);
                      if (msgElement) {
                        msgElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        msgElement.classList.add('highlight-message');
                        setTimeout(() => msgElement.classList.remove('highlight-message'), 2000);
                      }
                    }}
                    title="Next pinned message"
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              )}
              
              {/* Single message scroll button */}
              {pinnedMessagesList.length === 1 && (
                <button 
                  className="pinned-scroll-btn" 
                  onClick={() => {
                    const msgElement = document.getElementById(`msg-${pinnedMessagesList[0]?.messageId}`);
                    if (msgElement) {
                      msgElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      msgElement.classList.add('highlight-message');
                      setTimeout(() => msgElement.classList.remove('highlight-message'), 2000);
                    }
                  }}
                  title="Go to pinned message"
                >
                  <ChevronDown size={18} />
                </button>
              )}
              
              <button 
                className="pinned-close-btn" 
                onClick={() => setShowPinnedBar(false)}
                title="Hide pinned bar"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Messages --- */}
      <div className={`chat-viewport bg-${chatBackground}`}>
        {loading && messages.length === 0 ? (
          <div className="loading-messages">
            <Loader size={32} className="spin" />
            <p>Loading messages...</p>
          </div>
        ) : messages.length === 0 && !loading ? (
          <div className="empty-chat-prompt">
            <div className="empty-chat-icon">💬</div>
            <h4>Start a conversation</h4>
            <p>Send a message to {recipientDisplayName || recipientUsername}</p>
          </div>
        ) : null}
        {messages
          .filter(msg => {
            if (!conversationSearchQuery) return true;
            const content = msg.decryptedContent || msg.content || '';
            return content.toLowerCase().includes(conversationSearchQuery.toLowerCase());
          })
          .map((msg, idx) => {
          const isMe = msg.senderId === user.userId;
          const content = msg.decryptedContent || msg.content;
          const callLog = msg.messageType === 'call_log' ? parseCallLog(content) : null;
          
          // Render system messages (pin/unpin notifications, etc.)
          if (msg.messageType === 'system' || msg.senderId === 'system') {
            return (
              <motion.div
                key={msg.id || msg.messageId || idx}
                className="message-row system-message-row"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="system-message">
                  <span className="system-message-text">{content}</span>
                </div>
              </motion.div>
            );
          }
          
          // Render call log messages differently
          if (callLog && callLog.type === 'call_log') {
            return (
              <motion.div 
                key={msg.id || idx} 
                className={`message-row call-log-row ${isMe ? 'sent' : 'received'}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {renderCallLogMessage(msg, callLog, isMe)}
              </motion.div>
            );
          }
          
          return (
            <motion.div 
              key={msg.id || idx} 
              id={`msg-${msg.messageId}`}
              className={`message-row ${isMe ? 'sent' : 'received'} ${selectionMode ? 'selection-mode' : ''} ${selectedMessages.has(msg.messageId) ? 'selected' : ''}`}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              data-message-id={msg.messageId}
            >
              {/* Selection Checkbox */}
              {selectionMode && (
                <div className="message-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedMessages.has(msg.messageId)}
                    onChange={() => handleToggleSelection(msg.messageId)}
                  />
                </div>
              )}
              
              {/* Message Options Button */}
              <div className="message-options-wrapper">
                <button 
                  className="message-options-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMessage(selectedMessage === msg.messageId ? null : msg.messageId);
                  }}
                >
                  <MoreVertical size={14} />
                </button>
                
                {/* Enhanced Action Menu */}
                <AnimatePresence>
                  {selectedMessage === msg.messageId && (
                    <motion.div
                      className={`message-dropdown-menu ${isMe ? 'sent' : 'received'}`}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button className="menu-item" onClick={() => handleReplyToMessage(msg.messageId)}>
                        <CornerUpLeft size={14} />
                        <span>Reply</span>
                      </button>
                      <button className="menu-item" onClick={() => handleStarMessage(msg.messageId)}>
                        <Star size={14} fill={msg.starred ? 'currentColor' : 'none'} />
                        <span>{msg.starred ? 'Unstar' : 'Star'}</span>
                      </button>
                      <button className="menu-item" onClick={() => handlePinMessage(msg.messageId)}>
                        <Pin size={14} fill={msg.pinned ? 'currentColor' : 'none'} />
                        <span>{msg.pinned ? 'Unpin' : 'Pin'}</span>
                      </button>
                      <button className="menu-item" onClick={() => handleForwardMessage(msg.messageId)}>
                        <Share2 size={14} />
                        <span>Forward</span>
                      </button>
                      <button className="menu-item" onClick={() => handleSelectMessage(msg.messageId)}>
                        <CheckSquare size={14} />
                        <span>Select</span>
                      </button>
                      <div className="menu-divider"></div>
                      <button className="menu-item" onClick={() => { navigator.clipboard.writeText(content || ''); toast.success('Copied'); setSelectedMessage(null); }}>
                        <Copy size={14} />
                        <span>Copy</span>
                      </button>
                      <button className="menu-item" onClick={() => { setShowMessageSecurityCode(msg.messageId); setSelectedMessage(null); }}>
                        <Lock size={14} />
                        <span>Verify security code</span>
                      </button>
                      <button className="menu-item" onClick={() => { handleDeleteMessage(msg.messageId, false); setSelectedMessage(null); }}>
                        <Trash2 size={14} />
                        <span>Delete for me</span>
                      </button>
                      {isMe && (Date.now() - new Date(msg.createdAt).getTime() < 3600000) && (
                        <button className="menu-item danger" onClick={() => { handleDeleteMessage(msg.messageId, true); setSelectedMessage(null); }}>
                          <Trash2 size={14} />
                          <span>Delete for everyone</span>
                        </button>
                      )}
                      <div className="menu-divider"></div>
                      <button className="menu-item danger" onClick={() => handleReportMessage(msg.messageId)}>
                        <AlertTriangle size={14} />
                        <span>Report</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div 
                  className="message-group"
                  onMouseEnter={() => !selectionMode && setHoveredMessage(msg.messageId)}
                  onMouseLeave={() => setHoveredMessage(null)}
                >
                  {/* Quick Emoji Reaction Button */}
                  {hoveredMessage === msg.messageId && !selectionMode && (
                    <motion.button
                      className={`quick-emoji-btn ${isMe ? 'sent' : 'received'}`}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      onClick={() => setShowEmojiPicker(showEmojiPicker === msg.messageId ? null : msg.messageId)}
                      title="React"
                    >
                      <Smile size={16} />
                    </motion.button>
                  )}
                  
                  {/* Emoji Picker Tray */}
                  <AnimatePresence>
                    {showEmojiPicker === msg.messageId && (
                      <motion.div
                        className={`emoji-reaction-tray ${isMe ? 'sent' : 'received'}`}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {emojiScrollPos.canScrollLeft && (
                          <div className="emoji-scroll-indicator left" />
                        )}
                        {emojiScrollPos.canScrollRight && (
                          <div className="emoji-scroll-indicator right" />
                        )}
                        <div 
                          className="emoji-reaction-scroll"
                          onScroll={(e) => {
                            const el = e.target;
                            setEmojiScrollPos({
                              canScrollLeft: el.scrollLeft > 10,
                              canScrollRight: el.scrollLeft < el.scrollWidth - el.clientWidth - 10
                            });
                          }}
                        >
                          {['❤️', '👍', '😂', '😮', '😢', '🙏', '🔥', '🎉', '😍', '🤔', '👏', '💯', '😊', '😭', '🤗', '😎', '🥰', '😘', '🙌', '✨', '💪', '👌', '🤝', '🎊', '🎈', '⭐', '💖', '🌟'].map(emoji => (
                            <button
                              key={emoji}
                              className="emoji-btn"
                              onClick={() => {
                                handleAddReaction(msg.messageId, emoji);
                                setShowEmojiPicker(null);
                              }}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  {/* Reply Quote Preview - WhatsApp style */}
                  {msg.replyTo && (() => {
                    const repliedMsg = messages.find(m => m.messageId === msg.replyTo);
                    if (!repliedMsg) return null;
                    const repliedContent = repliedMsg.decryptedContent || repliedMsg.content || '[Media]';
                    const repliedSenderName = repliedMsg.senderId === user?.userId ? 'You' : (recipientInfo.displayName || recipientInfo.username || 'Unknown');
                    return (
                      <div 
                        className={`reply-quote ${isMe ? 'sent' : 'received'}`}
                        onClick={() => {
                          // Scroll to the replied message
                          const element = document.querySelector(`[data-message-id="${msg.replyTo}"]`);
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            element.classList.add('highlight-reply');
                            setTimeout(() => element.classList.remove('highlight-reply'), 2000);
                          }
                        }}
                      >
                        <div className="reply-quote-bar"></div>
                        <div className="reply-quote-content">
                          <span className="reply-quote-name">{repliedSenderName}</span>
                          <span className="reply-quote-text">
                            {repliedContent.length > 50 ? repliedContent.substring(0, 50) + '...' : repliedContent}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Media Attachments */}
                  {((msg.decryptedMedia && msg.decryptedMedia.length > 0) || (msg.media && msg.media.length > 0)) && (
                    <div className="media-stack">
                      {(msg.decryptedMedia || msg.media).map((m, i) => renderMediaBubble(m, msg, i))}
                    </div>
                  )}
                  
                  {/* Text Bubble - Don't show if it's a media-only message */}
                  {content && 
                   content !== '' && 
                   content !== '[media]' && 
                   !(content.startsWith('[') && content.endsWith(']') && (msg.decryptedMedia?.length > 0 || msg.media?.length > 0)) && (
                    <div className={`text-bubble ${isEmojiOnly(content) ? 'emoji-only' : ''} ${msg.status === 'error' ? 'error' : ''}`}>
                      {content || 'Message'}
                      <div className="msg-meta">
                        {/* Star/Pin Indicators */}
                        {!isEmojiOnly(content) && (
                          <div className="message-indicators">
                            {msg.starred && (
                              <span className="message-indicator starred" title="Starred">
                                <Star size={12} fill="currentColor" />
                              </span>
                            )}
                            {msg.pinned && (
                              <span className="message-indicator pinned" title="Pinned">
                                <Pin size={12} fill="currentColor" />
                              </span>
                            )}
                          </div>
                        )}
                        <span className="timestamp">
                          {new Date(msg.createdAt || msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                        {isMe && (
                          <span className={`read-receipt ${msg.status || 'sent'}`}>
                            {msg.status === 'sending' ? <Loader size={12} className="spin" /> :
                             msg.status === 'error' ? <X size={14} /> :
                             msg.status === 'read' || msg.readAt ? <CheckCheck size={14} className="read-tick" /> :
                             msg.status === 'delivered' || msg.deliveredAt ? <CheckCheck size={14} className="delivered-tick" /> :
                             <Check size={14} className="sent-tick" />}
                          </span>
                        )}
                      </div>
                      {msg.status === 'error' && isMe && (
                        <button 
                          className="resend-btn"
                          onClick={() => handleResend(msg)}
                          title="Resend message"
                        >
                          🔄 Resend
                        </button>
                      )}
                    </div>
                  )}
                  
                  {/* Message Reactions - WhatsApp/Telegram Style */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <motion.div 
                      className={`message-reactions ${isMe ? 'sent' : 'received'}`}
                      initial={msg._reactionAnimation ? { scale: 0, opacity: 0 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    >
                      {Object.entries(
                        msg.reactions.reduce((acc, r) => {
                          if (!acc[r.emoji]) {
                            acc[r.emoji] = [];
                          }
                          acc[r.emoji].push({
                            userId: r.userId,
                            username: r.username,
                            displayName: r.displayName
                          });
                          return acc;
                        }, {})
                      ).map(([emoji, users]) => {
                        const hasMyReaction = users.some(u => u.userId === user?.userId);
                        const tooltipText = users.map(u => {
                          if (u.userId === user?.userId) return 'You';
                          // Use displayName, username, or fetch from recipientInfo
                          return u.displayName || u.username || recipientInfo?.displayName || recipientInfo?.username || 'Someone';
                        }).join(', ');
                        
                        return (
                          <motion.button
                            key={emoji}
                            className={`reaction-pill ${hasMyReaction ? 'my-reaction' : 'other-reaction'}`}
                            onClick={() => {
                              if (hasMyReaction) {
                                handleRemoveReaction(msg.messageId);
                              } else {
                                handleAddReaction(msg.messageId, emoji);
                              }
                            }}
                            title={tooltipText}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            initial={msg._reactionAnimation ? { scale: 0, rotate: -180 } : false}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                          >
                            <span className="reaction-emoji">{emoji}</span>
                            {users.length > 1 && <span className="reaction-count">{users.length}</span>}
                          </motion.button>
                        );
                      })}
                    </motion.div>
                  )}
                </div>
              </div> {/* close message-options-wrapper */}
            </motion.div>
          );
        })}
        {recipientTyping && (
          <motion.div 
            className="typing-indicator"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="typing-bubble">
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
        
        {/* Media Viewer Modal - Inside viewport */}
        <AnimatePresence>
          {viewingMedia && (
            <>
              <motion.div 
                className="media-viewer-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setViewingMedia(null)}
              />
              <motion.div 
                className="media-viewer-modal"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
              >
                <div className="viewer-header">
                  <span className="viewer-title">{viewingMedia.name || 'Media'}</span>
                  <button className="viewer-close" onClick={() => setViewingMedia(null)}>
                    <X size={24} />
                  </button>
                </div>
                <div className="viewer-content">
                  {viewingMedia.type === 'image' && (
                    <img 
                      src={viewingMedia.url} 
                      alt="Full size"
                      className="image-viewer"
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  {viewingMedia.type === 'pdf' && (
                    <iframe 
                      src={viewingMedia.url} 
                      title="PDF Viewer"
                      className="pdf-viewer"
                    />
                  )}
                  {viewingMedia.type === 'doc' && (
                    <iframe 
                      src={`https://docs.google.com/gview?url=${encodeURIComponent(viewingMedia.url)}&embedded=true`}
                      title="Document Viewer"
                      className="doc-viewer"
                    />
                  )}
                  {viewingMedia.type === 'video' && (
                    <video 
                      src={viewingMedia.url} 
                      controls 
                      autoPlay
                      className="video-viewer"
                    />
                  )}
                  {viewingMedia.type === 'file' && (
                    <div className="file-viewer">
                      <FileText size={64} />
                      <p>Preview not available</p>
                      <a href={viewingMedia.url} download={viewingMedia.name} className="download-link">
                        <Download size={20} /> Download File
                      </a>
                    </div>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* --- Input HUD --- */}
      <div className="chat-input-hud glass-panel">
        
        {/* File Previews */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div 
              className="file-preview-dock"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
            >
              {files.map((f, i) => (
                <motion.div key={i} className="dock-item" layout>
                  <button className="remove-dock-item" onClick={() => setFiles(files.filter((_, idx) => idx !== i))}>
                    <X size={10}/>
                  </button>
                  {f.type.startsWith('image') ? <img src={URL.createObjectURL(f)} alt="" /> : 
                   f.messageType === 'voice' || f.type.startsWith('audio') ? <Mic size={20}/> : 
                   <FileText size={20}/>}
                  <span className="dock-name">{f.name.slice(0,8)}...</span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reply Preview Bar */}
        <AnimatePresence>
          {replyingTo && (
            <motion.div 
              className="reply-preview-bar"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
            >
              <div className="reply-preview-content">
                <CornerUpLeft size={16} className="reply-icon" />
                <div className="reply-info">
                  <span className="reply-to-name">Replying to {replyingTo.senderName}</span>
                  <span className="reply-text-preview">
                    {replyingTo.content?.length > 60 
                      ? replyingTo.content.substring(0, 60) + '...' 
                      : replyingTo.content}
                  </span>
                </div>
              </div>
              <button className="cancel-reply-btn" onClick={cancelReply}>
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="input-bar">
          <div className="input-actions-left">
            <button className="hud-btn" onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={20} />
            </button>
            <input 
              type="file" multiple hidden 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              accept="image/*,video/*,audio/*,.pdf,.doc" 
            />
          </div>

          <div className="input-field-wrapper">
            <input 
              type="text" 
              placeholder="Transmit message..." 
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                handleTyping();
              }}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              disabled={uploading}
            />
            <button 
              className={`emoji-trigger ${showPicker ? 'active' : ''}`} 
              onClick={() => setShowPicker(prev => prev ? null : 'emoji')}
            >
              <Smile size={20} />
            </button>
          </div>

          <div className="input-actions-right">
            {inputText || files.length > 0 ? (
              <motion.button 
                className="send-fab"
                onClick={handleSend}
                disabled={uploading}
                whileHover={{ scale: uploading ? 1 : 1.1 }}
                whileTap={{ scale: uploading ? 1 : 0.9 }}
              >
                {uploading ? <Loader size={18} className="spin" /> : <Send size={18} fill="currentColor" className="send-icon-fill" />}
              </motion.button>
            ) : (
              <button 
                className="hud-btn mic-btn"
                onClick={() => setShowVoiceRecorder(true)}
              >
                <Mic size={20} />
              </button>
            )}
          </div>
        </div>

        {/* --- Media Picker Popover --- */}
        <AnimatePresence>
          {showPicker && (
            <motion.div 
              className="media-picker-hud"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
            >
              <div className="picker-search">
                <input 
                  type="text"
                  placeholder={showPicker === 'emoji' ? 'Type to filter...' : `Search ${showPicker}s...`}
                  value={gifSearchQuery}
                  onChange={(e) => setGifSearchQuery(e.target.value)}
                />
              </div>
              <div className="picker-tabs">
                <button onClick={() => setShowPicker('emoji')} className={showPicker === 'emoji' ? 'active' : ''}>
                  <Smile size={14} /> Emoji
                </button>
                <button onClick={() => setShowPicker('gif')} className={showPicker === 'gif' ? 'active' : ''}>
                  <Gift size={14} /> GIF
                </button>
                <button onClick={() => setShowPicker('sticker')} className={showPicker === 'sticker' ? 'active' : ''}>
                  <Sparkles size={14} /> Sticker
                </button>
              </div>
              
              <div className="picker-content-scroll">
                {showPicker === 'emoji' && (
                  <div className="emoji-grid">
                    {EMOJIS.map((e, i) => (
                      <button key={i} onClick={() => setInputText(prev => prev + e)}>{e}</button>
                    ))}
                  </div>
                )}
                {showPicker === 'gif' && (
                  <div className="gif-grid">
                    {(gifResults.length > 0 ? gifResults : GIFS).map((url, i) => (
                      <img 
                        key={i} src={url} alt="gif" 
                        onClick={async () => {
                          try {
                            const response = await fetch(url);
                            const blob = await response.blob();
                            const file = new File([blob], `gif-${Date.now()}.gif`, { type: 'image/gif' });
                            setFiles(prev => [...prev, Object.assign(file, { messageType: 'gif' })]);
                            setShowPicker(null);
                          } catch (e) {
                            toast.error('Failed to load GIF');
                          }
                        }} 
                      />
                    ))}
                  </div>
                )}
                {showPicker === 'sticker' && (
                  <div className="sticker-grid">
                    {(stickerResults.length > 0 ? stickerResults : STICKERS).map((url, i) => (
                      <img 
                        key={i} src={url} alt="sticker" 
                        onClick={async () => {
                          try {
                            const response = await fetch(url);
                            const blob = await response.blob();
                            const file = new File([blob], `sticker-${Date.now()}.png`, { type: 'image/png' });
                            setFiles(prev => [...prev, Object.assign(file, { messageType: 'sticker' })]);
                            setShowPicker(null);
                          } catch (e) {
                            toast.error('Failed to load sticker');
                          }
                        }} 
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Voice Recorder */}
      <AnimatePresence>
        {showVoiceRecorder && (
          <VoiceRecorder
            onSend={(voiceFile) => {
              setFiles([voiceFile]);
              setShowVoiceRecorder(false);
              setTimeout(() => handleSend(), 100);
            }}
            onCancel={() => setShowVoiceRecorder(false)}
          />
        )}
      </AnimatePresence>

      {/* Media Viewer Modal - Fixed Overlay */}
      <AnimatePresence>
        {viewingMedia && (
          <motion.div 
            className="media-viewer-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setViewingMedia(null)}
          >
            <motion.div 
              className="media-viewer-modal"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="viewer-header">
                <span className="viewer-title">{viewingMedia.name || 'Media'}</span>
                <button className="viewer-close" onClick={() => setViewingMedia(null)}>
                  <X size={24} />
                </button>
              </div>
              <div className="viewer-content" onClick={() => setViewingMedia(null)}>
                {viewingMedia.type === 'image' && (
                  <img 
                    src={viewingMedia.url} 
                    alt="Full size"
                    className="image-viewer"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                {viewingMedia.type === 'pdf' && (
                  <iframe 
                    src={viewingMedia.url} 
                    title="PDF Viewer"
                    className="pdf-viewer"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                {viewingMedia.type === 'doc' && (
                  <iframe 
                    src={`https://docs.google.com/gview?url=${encodeURIComponent(viewingMedia.url)}&embedded=true`}
                    title="Document Viewer"
                    className="doc-viewer"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                {viewingMedia.type === 'video' && (
                  <video 
                    src={viewingMedia.url} 
                    controls 
                    autoPlay
                    className="video-viewer"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                {viewingMedia.type === 'audio' && (
                  <div className="audio-viewer" onClick={(e) => e.stopPropagation()}>
                    <div className="audio-icon-large">
                      <Mic size={80} />
                    </div>
                    <audio 
                      src={viewingMedia.url} 
                      controls 
                      autoPlay
                      className="audio-player-large"
                    />
                  </div>
                )}
                {viewingMedia.type === 'file' && (
                  <div className="file-viewer" onClick={(e) => e.stopPropagation()}>
                    <FileText size={64} />
                    <p>Preview not available</p>
                    <a href={viewingMedia.url} download={viewingMedia.name} className="download-link">
                      <Download size={20} /> Download File
                    </a>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            className="context-menu"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 2000
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.type === 'chat-options' ? (
              <>
                <button className="context-menu-item" onClick={handleClearChat}>
                  <X size={16} />
                  <span>Clear Chat</span>
                </button>
              </>
            ) : (
              <>
                <button
                  className="context-menu-item"
                  onClick={() => handleDeleteMessage(contextMenu.messageId, false)}
                >
                  <X size={16} />
                  <span>Delete for me</span>
                </button>
                {contextMenu.isMe && contextMenu.canDeleteForEveryone && (
                  <button
                    className="context-menu-item delete-for-everyone"
                    onClick={() => handleDeleteMessage(contextMenu.messageId, true)}
                  >
                    <X size={16} />
                    <span>Delete for everyone</span>
                  </button>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Forward Message Modal - Enhanced WhatsApp/Telegram Style */}
      <AnimatePresence>
        {showForwardModal && (
          <motion.div 
            className="forward-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={cancelForward}
          >
            <motion.div 
              className="forward-modal-enhanced"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="forward-modal-header">
                <h3><Share2 size={20} /> Forward Message</h3>
                <button className="close-modal-btn" onClick={cancelForward}>
                  <X size={20} />
                </button>
              </div>
              
              {/* Message Preview */}
              <div className="forward-message-preview">
                <CornerUpLeft size={16} />
                <span>{forwardingMessage?.content?.substring(0, 100)}{forwardingMessage?.content?.length > 100 ? '...' : ''}</span>
              </div>

              {/* Search Box */}
              <div className="forward-search-box">
                <Search size={18} />
                <input 
                  type="text"
                  placeholder="Search conversations..."
                  value={forwardSearchQuery}
                  onChange={(e) => setForwardSearchQuery(e.target.value)}
                  className="forward-search-input"
                />
              </div>

              {/* Selected Recipients Count */}
              {selectedForwardRecipients.size > 0 && (
                <div className="forward-selected-count">
                  {selectedForwardRecipients.size} recipient(s) selected
                </div>
              )}

              {/* Recipients List */}
              <div className="forward-recipients-list">
                {/* Recent Conversations Section */}
                <div className="forward-section">
                  <button 
                    className="forward-section-header"
                    onClick={() => setShowRecentConversations(!showRecentConversations)}
                  >
                    <span>Recent Chats</span>
                    <motion.div
                      animate={{ rotate: showRecentConversations ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      ▼
                    </motion.div>
                  </button>
                  <AnimatePresence>
                    {showRecentConversations && (
                      <motion.div
                        className="forward-section-content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                      >
                        {recipientInfo?.username && recipientInfo.username.toLowerCase().includes(forwardSearchQuery.toLowerCase()) && (
                          <div 
                            className={`forward-recipient-item ${selectedForwardRecipients.has(recipientInfo.username) ? 'selected' : ''}`}
                            onClick={() => {
                              setSelectedForwardRecipients(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(recipientInfo.username)) {
                                  newSet.delete(recipientInfo.username);
                                } else {
                                  newSet.add(recipientInfo.username);
                                }
                                return newSet;
                              });
                            }}
                          >
                            <div className="forward-recipient-avatar">
                              {recipientInfo.displayName?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="forward-recipient-info">
                              <div className="forward-recipient-name">{recipientInfo.displayName || recipientInfo.username}</div>
                              <div className="forward-recipient-username">@{recipientInfo.username}</div>
                            </div>
                            {selectedForwardRecipients.has(recipientInfo.username) && (
                              <div className="forward-recipient-check">
                                <Check size={18} />
                              </div>
                            )}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Manual Input Section */}
                <div className="forward-section">
                  <div className="forward-section-header static">
                    <span>Or enter username manually</span>
                  </div>
                  <div className="forward-manual-input">
                    <input 
                      type="text"
                      placeholder="Enter username and press Enter"
                      className="forward-manual-input-field"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          const username = e.target.value.trim();
                          setSelectedForwardRecipients(prev => new Set(prev).add(username));
                          e.target.value = '';
                        }
                      }}
                    />
                  </div>
                  {selectedForwardRecipients.size > 0 && (
                    <div className="forward-selected-badges">
                      {Array.from(selectedForwardRecipients).map(username => (
                        <div key={username} className="forward-badge">
                          <span>{username}</span>
                          <button 
                            onClick={() => {
                              setSelectedForwardRecipients(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(username);
                                return newSet;
                              });
                            }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="forward-modal-actions">
                <button className="cancel-forward-btn" onClick={cancelForward}>Cancel</button>
                <button 
                  className="confirm-forward-btn"
                  onClick={() => confirmForward(Array.from(selectedForwardRecipients))}
                  disabled={selectedForwardRecipients.size === 0}
                >
                  <Send size={16} /> Forward
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Encryption Verification Modal --- */}
      <EncryptionVerificationModal
        isOpen={showEncryptionVerification}
        onClose={() => setShowEncryptionVerification(false)}
        conversationId={conversation?.conversationId || recipientId}
        otherUserName={recipientInfo.displayName || recipientInfo.username}
        currentUserPublicKey={user?.publicKey}
        otherUserPublicKey={recipientInfo?.publicKey}
      />

      {/* --- Message Security Code Verification Modal --- */}
      {showMessageSecurityCode && (
        <EncryptionVerificationModal
          isOpen={!!showMessageSecurityCode}
          onClose={() => setShowMessageSecurityCode(null)}
          conversationId={conversation?.conversationId || recipientId}
          otherUserName={recipientInfo.displayName || recipientInfo.username}
          currentUserPublicKey={user?.publicKey}
          otherUserPublicKey={recipientInfo?.publicKey}
        />
      )}

      {/* --- Self-Destruct Timer Dialog --- */}
      <AnimatePresence>
        {showSelfDestructDialog && (
          <div className="modal-overlay" onClick={() => setShowSelfDestructDialog(false)}>
            <motion.div
              className="self-destruct-modal"
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <div className="modal-header">
                <h3>Self-Destruct Timer</h3>
                <button className="close-btn" onClick={() => setShowSelfDestructDialog(false)}>
                  <X size={20} />
                </button>
              </div>
              <div className="modal-body">
                <p>Set how long messages stay visible before auto-deleting:</p>
                <div className="timer-options">
                  <button 
                    className={`timer-option ${selfDestructTimer === 0 ? 'active' : ''}`}
                    onClick={() => handleSetSelfDestruct(0)}
                  >
                    <Timer size={18} />
                    <span>Off</span>
                  </button>
                  <button 
                    className={`timer-option ${selfDestructTimer === 10 ? 'active' : ''}`}
                    onClick={() => handleSetSelfDestruct(10)}
                  >
                    <Timer size={18} />
                    <span>10 seconds</span>
                  </button>
                  <button 
                    className={`timer-option ${selfDestructTimer === 30 ? 'active' : ''}`}
                    onClick={() => handleSetSelfDestruct(30)}
                  >
                    <Timer size={18} />
                    <span>30 seconds</span>
                  </button>
                  <button 
                    className={`timer-option ${selfDestructTimer === 60 ? 'active' : ''}`}
                    onClick={() => handleSetSelfDestruct(60)}
                  >
                    <Timer size={18} />
                    <span>1 minute</span>
                  </button>
                  <button 
                    className={`timer-option ${selfDestructTimer === 300 ? 'active' : ''}`}
                    onClick={() => handleSetSelfDestruct(300)}
                  >
                    <Timer size={18} />
                    <span>5 minutes</span>
                  </button>
                  <button 
                    className={`timer-option ${selfDestructTimer === 3600 ? 'active' : ''}`}
                    onClick={() => handleSetSelfDestruct(3600)}
                  >
                    <Timer size={18} />
                    <span>1 hour</span>
                  </button>
                  <button 
                    className={`timer-option ${selfDestructTimer === 86400 ? 'active' : ''}`}
                    onClick={() => handleSetSelfDestruct(86400)}
                  >
                    <Timer size={18} />
                    <span>1 day</span>
                  </button>
                  <button 
                    className={`timer-option ${selfDestructTimer === 604800 ? 'active' : ''}`}
                    onClick={() => handleSetSelfDestruct(604800)}
                  >
                    <Timer size={18} />
                    <span>1 week</span>
                  </button>
                </div>
                <p className="timer-note">
                  {selfDestructTimer === 0 
                    ? 'Messages will not auto-delete' 
                    : 'New messages will auto-delete after the set time'}
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MessageInterface;